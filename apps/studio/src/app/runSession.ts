import type {
    Diagnostic,
    Project,
    SceneEntity,
    TrackSample,
    TransportBackendDiagnostic,
    TransportBackendEvent,
    TransportTrackSample,
} from "@transport/domain";
import {
    compileEditorScene,
    type CompileDiagnostic,
    type CompileResult,
} from "@transport/domain/compile/CompileEditorScene";
import type {EditorScene} from "@transport/domain/editor/EditorScene";
import type {TransportProblem} from "@transport/domain/transport/TransportProblem";
import {
    runNativePhotonSmokeBackend,
    type NativePhotonSmokeBridge,
} from "@transport/transport-worker";
import {runToyPhotonTransport} from "@transport/transport-visual";

export type RunSessionBottomTab = "run" | "diagnostics";
export type RunSessionMode = "design" | "probe" | "run" | "analyze" | "debug";

export interface RunSessionOutcome {
    readonly backend: Project["runConfiguration"]["backend"];
    readonly mode: RunSessionMode;
    readonly bottomTab: RunSessionBottomTab;
    readonly tracks: readonly TrackSample[];
    readonly diagnostics: readonly Diagnostic[];
}

export interface NativeRunSessionDependencies {
    readonly compile?: (scene: EditorScene) => CompileResult<TransportProblem>;
    readonly runBackend?: (
        problem: TransportProblem,
        bridge?: NativePhotonSmokeBridge,
    ) => Promise<readonly TransportBackendEvent[]>;
}

export interface ToyRunSessionDependencies {
    readonly runToy?: typeof runToyPhotonTransport;
}

export function runToySession(
    project: Project,
    dependencies: ToyRunSessionDependencies = {},
): RunSessionOutcome {
    const result = (dependencies.runToy ?? runToyPhotonTransport)(project, project.runConfiguration);

    return {
        backend: "visual-ts",
        mode: "run",
        bottomTab: "run",
        tracks: result.tracks,
        diagnostics: [],
    };
}

export function clearRunSession(
    current: Pick<RunSessionOutcome, "backend" | "mode">,
): RunSessionOutcome {
    return {
        backend: current.backend,
        mode: current.mode,
        bottomTab: "run",
        tracks: [],
        diagnostics: [],
    };
}

export async function runNativeSession(
    project: Project,
    bridge?: NativePhotonSmokeBridge,
    dependencies: NativeRunSessionDependencies = {},
): Promise<RunSessionOutcome> {
    const compile = dependencies.compile ?? compileEditorScene;
    const runBackend = dependencies.runBackend ?? runNativePhotonSmokeBackend;
    const compileResult = compile(createNativeEditorScene(project));
    const compileDiagnostics = compileResult.diagnostics.map(convertCompileDiagnostic);

    if (!compileResult.ok || !compileResult.value) {
        return nativeOutcome([], compileDiagnostics);
    }

    const events = await runBackend(compileResult.value, bridge);
    const tracks = events.flatMap((event) => event.type === "trackSamples"
        ? event.samples.map(convertTransportTrackSample)
        : []);
    const diagnostics = [...compileDiagnostics, ...collectNativeDiagnostics(events)];

    return nativeOutcome(tracks, diagnostics);
}

function nativeOutcome(
    tracks: readonly TrackSample[],
    diagnostics: readonly Diagnostic[],
): RunSessionOutcome {
    return {
        backend: "native",
        mode: "run",
        bottomTab: diagnostics.some((diagnostic) => diagnostic.severity === "error")
            ? "diagnostics"
            : "run",
        tracks,
        diagnostics,
    };
}

function createNativeEditorScene(project: Project): EditorScene {
    const materialEntities = project.scene.entities.filter(isIncludedMaterialEntity);
    const geometryEntities = project.scene.entities.filter(isGeometryEntity);
    const includedGeometryEntities = geometryEntities.filter(isIncludedInCompile);
    const sourceEntities = project.scene.entities.filter(isIncludedSourceEntity);
    const tallyEntities = project.scene.entities.filter(isIncludedTallyEntity);
    const defaultTargetEntityId = includedGeometryEntities[0]?.id ?? "";
    const entities = geometryEntities.flatMap<EditorScene["entities"][number]>((entity) => {
        const transform = {
            position: entity.transform.position,
            rotation: entity.transform.rotationEuler,
            scale: entity.transform.scale,
        };

        switch (entity.primitive) {
            case "box":
                return [{
                    id: entity.id,
                    kind: "box" as const,
                    name: entity.name,
                    transform,
                    materialId: entity.materialId,
                    visible: entity.visible,
                    includedInCompile: isIncludedInCompile(entity),
                    locked: entity.locked,
                    tags: entity.tags,
                    size: {
                        x: (entity.parameters.width ?? 1) * entity.transform.scale.x,
                        y: (entity.parameters.height ?? 1) * entity.transform.scale.y,
                        z: (entity.parameters.depth ?? 1) * entity.transform.scale.z,
                    },
                }];
            case "sphere":
                return [{
                    id: entity.id,
                    kind: "sphere" as const,
                    name: entity.name,
                    transform,
                    materialId: entity.materialId,
                    visible: entity.visible,
                    includedInCompile: isIncludedInCompile(entity),
                    locked: entity.locked,
                    tags: entity.tags,
                    radius: (entity.parameters.radius ?? 1) * entity.transform.scale.x,
                }];
            case "cylinder":
                return [{
                    id: entity.id,
                    kind: "cylinder" as const,
                    name: entity.name,
                    transform,
                    materialId: entity.materialId,
                    visible: entity.visible,
                    includedInCompile: isIncludedInCompile(entity),
                    locked: entity.locked,
                    tags: entity.tags,
                    radius: (entity.parameters.radius ?? 1) * entity.transform.scale.x,
                    height: (entity.parameters.height ?? 1) * entity.transform.scale.z,
                }];
            case "plane":
                return [];
        }
    }) as EditorScene["entities"];
    const tallies = tallyEntities.flatMap((entity) => defaultTargetEntityId
        ? [{
            id: entity.id,
            kind: "cell-flux" as const,
            name: entity.name,
            particle: entity.particleTypes[0] ?? "photon",
            entityId: defaultTargetEntityId,
        }]
        : []) as EditorScene["tallies"];

    return {
        id: project.id,
        name: project.name,
        entities,
        materials: materialEntities.map((entity) => ({
            id: entity.id,
            name: entity.name,
            density: Math.max(entity.attenuationCoefficient, 0),
            color: entity.color,
            nuclides: entity.attenuationCoefficient > 0
                ? [{nuclide: "H1", fraction: 1}]
                : [],
        })),
        sources: sourceEntities.map((entity) => entity.sourceKind === "pencil-beam"
            ? {
                id: entity.id,
                kind: "beam-source" as const,
                name: entity.name,
                particle: entity.particleType,
                energyMeV: entity.energy,
                strength: entity.strength,
                position: entity.transform.position,
                direction: entity.direction ?? {x: 1, y: 0, z: 0},
            }
            : {
                id: entity.id,
                kind: "point-source" as const,
                name: entity.name,
                particle: entity.particleType,
                energyMeV: entity.energy,
                strength: entity.strength,
                position: entity.transform.position,
            }),
        tallies,
        settings: {
            histories: project.runConfiguration.histories,
            seed: project.runConfiguration.seed,
        },
    };
}

function isIncludedInCompile(entity: SceneEntity): boolean {
    return entity.includedInCompile !== false;
}

function isGeometryEntity(entity: SceneEntity): entity is Extract<SceneEntity, {readonly kind: "geometry"}> {
    return entity.kind === "geometry";
}

function isIncludedMaterialEntity(entity: SceneEntity): entity is Extract<SceneEntity, {readonly kind: "material"}> {
    return entity.kind === "material" && isIncludedInCompile(entity);
}

function isIncludedSourceEntity(entity: SceneEntity): entity is Extract<SceneEntity, {readonly kind: "source"}> {
    return entity.kind === "source" && isIncludedInCompile(entity);
}

function isIncludedTallyEntity(entity: SceneEntity): entity is Extract<SceneEntity, {readonly kind: "tally"}> {
    return entity.kind === "tally" && isIncludedInCompile(entity);
}

function convertCompileDiagnostic(diagnostic: CompileDiagnostic): Diagnostic {
    return {
        severity: diagnostic.level,
        message: `${diagnostic.code}: ${diagnostic.message}`,
        entityId: diagnostic.entityId as Diagnostic["entityId"],
    };
}

function collectNativeDiagnostics(events: readonly TransportBackendEvent[]): readonly Diagnostic[] {
    return events.flatMap((event) => {
        switch (event.type) {
            case "problemAccepted":
                return event.diagnostics.map(convertBackendDiagnostic);
            case "diagnostic":
            case "runFailed":
                return [convertBackendDiagnostic(event.diagnostic)];
            default:
                return [];
        }
    });
}

function convertBackendDiagnostic(diagnostic: TransportBackendDiagnostic): Diagnostic {
    return {
        severity: diagnostic.level,
        message: `${diagnostic.code}: ${diagnostic.message}`,
        entityId: diagnostic.entityId as Diagnostic["entityId"],
    };
}

function convertTransportTrackSample(sample: TransportTrackSample): TrackSample {
    return {
        historyId: sample.historyId,
        events: sample.events.map((event) => ({
            historyId: event.historyId,
            particleId: event.particleId,
            type: event.type,
            position: event.position,
            direction: event.direction,
            energy: event.energyMeV,
            weight: event.weight,
            time: event.time,
            materialId: event.materialId,
            regionId: event.entityId,
            reason: event.reason,
        })) as TrackSample["events"],
    };
}
