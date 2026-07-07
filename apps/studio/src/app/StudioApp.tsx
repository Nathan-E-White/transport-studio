import {useMemo, useState} from "react";
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
} from "@transport/domain/compile/CompileEditorScene";
import type {EditorScene} from "@transport/domain/editor/EditorScene";
import {
    runNativePhotonSmokeBackend,
} from "@transport/transport-worker";
import {runToyPhotonTransport} from "@transport/transport-visual";
import {validateProject} from "@transport/validation";
import {createInitialProject} from "./createInitialProject";
import {createTauriNativePhotonSmokeBridge} from "./nativePhotonSmokeTauriBridge";
import {ProjectTree} from "../components/project-tree/ProjectTree";
import {StyleSelectorBoundary} from "../components/style-selector/StyleSelectorBoundary";
import {InspectorPanel} from "../panels/InspectorPanel";
import {RunPanel} from "../panels/RunPanel";
import {TransportViewport} from "../viewport/TransportViewport";
import {
    addEntity,
    deleteEntity,
    duplicateEntity,
    setEntityLocked,
    setEntityVisible,
    updateEntityMetadata,
} from "./projectMutations";

export type EditorMode = "design" | "probe" | "run" | "analyze" | "debug";
export type BottomTab = "run" | "tallies" | "tracks" | "diagnostics" | "console";

const modes: readonly EditorMode[] = ["design", "probe", "run", "analyze", "debug"];

export function StudioApp() {

    const [project, setProject] = useState<Project>(() => createInitialProject());
    const [selectedEntityId, setSelectedEntityId] = useState<string | undefined>(project.scene.entities[1]?.id);
    const [tracks, setTracks] = useState<readonly TrackSample[]>([]);
    const [mode, setMode] = useState<EditorMode>("design");
    const [bottomTab, setBottomTab] = useState<BottomTab>("run");
    const [showTracks, setShowTracks] = useState(true);
    const [showTallies, setShowTallies] = useState(true);
    const [showDiagnostics, setShowDiagnostics] = useState(true);
    const [activeBackend, setActiveBackend] = useState<Project["runConfiguration"]["backend"]>(project.runConfiguration.backend);
    const [nativeDiagnostics, setNativeDiagnostics] = useState<readonly Diagnostic[]>([]);

    const diagnostics = useMemo<readonly Diagnostic[]>(() => [
        ...validateProject(project),
        ...nativeDiagnostics,
    ], [project, nativeDiagnostics]);
    const runConfiguration = useMemo(() => ({
        ...project.runConfiguration,
        backend: activeBackend,
    }), [activeBackend, project.runConfiguration]);
    const selectedEntity = project.scene.entities.find((entity) => entity.id === selectedEntityId);
    const sceneStats = useMemo(() => getSceneStats(project.scene.entities), [project]);
    const escapedCount = tracks.filter((track) => track.events.at(-1)?.type === "escape").length;
    const absorbedCount = tracks.filter((track) => track.events.at(-1)?.type === "absorb").length;

    function runDemo() {
        const result = runToyPhotonTransport(project, project.runConfiguration);
        setTracks(result.tracks);
        setNativeDiagnostics([]);
        setActiveBackend("visual-ts");
        setMode("run");
        setBottomTab("run");
    }

    async function runNative() {
        const compileResult = compileEditorScene(createNativeEditorScene(project));
        const compileDiagnostics = compileResult.diagnostics.map(convertCompileDiagnostic);

        if (!compileResult.ok || !compileResult.value) {
            setTracks([]);
            setNativeDiagnostics(compileDiagnostics);
            setActiveBackend("native");
            setMode("run");
            setBottomTab("diagnostics");
            return;
        }

        const problem = compileResult.value;
        const events = await runNativePhotonSmokeBackend(problem, createTauriNativePhotonSmokeBridge());
        const nextTracks = events.flatMap((event) => event.type === "trackSamples"
            ? event.samples.map(convertTransportTrackSample)
            : [],
        );
        const nextDiagnostics = [
            ...compileDiagnostics,
            ...collectNativeDiagnostics(events),
        ];

        setTracks(nextTracks);
        setNativeDiagnostics(nextDiagnostics);
        setActiveBackend("native");
        setMode("run");
        setBottomTab(nextDiagnostics.some((diagnostic) => diagnostic.severity === "error")
            ? "diagnostics"
            : "run",
        );
    }

    function clearResults() {
        setTracks([]);
        setNativeDiagnostics([]);
        setBottomTab("run");
    }

    function createEntity(kind: SceneEntity["kind"]) {
        setProject((current) => {
            const next = addEntity(current, kind);
            const created = next.scene.entities.at(-1);
            setSelectedEntityId(created?.id);
            return next;
        });
    }

    function renameEntity(
        entityId: string,
        patch: { readonly name?: string; readonly description?: string; readonly tags?: readonly string[] },
    ) {
        setProject((current) => updateEntityMetadata(current, entityId, patch));
    }

    function duplicateProjectEntity(entityId: string) {
        setProject((current) => {
            const next = duplicateEntity(current, entityId);
            const duplicated = next.scene.entities.at(-1);
            setSelectedEntityId(duplicated?.id ?? entityId);
            return next;
        });
    }

    function deleteProjectEntity(entityId: string) {
        setProject((current) => deleteEntity(current, entityId));
    }

    function setProjectEntityVisible(entityId: string, visible: boolean) {
        setProject((current) => setEntityVisible(current, entityId, visible));
    }

    function setProjectEntityLocked(entityId: string, locked: boolean) {
        setProject((current) => setEntityLocked(current, entityId, locked));
    }

    return (

        <div className="studio-shell">
            <header className="toolbar">
                <div className="brand-lockup">
                    <div className="brand-mark">τ</div>
                    <div>
                        <div className="brand">Transport Studio</div>
                        <div className="brand-subtitle">visual Monte Carlo workbench</div>
                    </div>
                </div>

                <nav className="mode-switcher" aria-label="Editor modes">
                    {modes.map((candidateMode) => (
                        <button
                            key={candidateMode}
                            className={candidateMode === mode ? "mode-button active" : "mode-button"}
                            onClick={() => setMode(candidateMode)}
                        >
                            {candidateMode}
                        </button>
                    ))}
                </nav>

                <div className="toolbar-actions">
                    <StyleSelectorBoundary/>
                    <button className="primary-button" onClick={runDemo}>▶ Run Toy Photons</button>
                    <button onClick={() => void runNative()}>Run Native Rust</button>
                    <button onClick={clearResults}>Clear</button>
                </div>
            </header>

            <aside className="left-panel">
                <ProjectTree
                    project={project}
                    selectedEntityId={selectedEntityId}
                    diagnostics={diagnostics}
                    stats={sceneStats}
                    onSelect={setSelectedEntityId}
                    onCreateEntity={createEntity}
                    onUpdateEntityMetadata={renameEntity}
                    onDuplicateEntity={duplicateProjectEntity}
                    onDeleteEntity={deleteProjectEntity}
                    onSetEntityVisible={setProjectEntityVisible}
                    onSetEntityLocked={setProjectEntityLocked}
                />
            </aside>

            <main className="viewport-region">
                <TransportViewport
                    project={project}
                    tracks={showTracks ? tracks : []}
                    selectedEntityId={selectedEntityId}
                    onSelect={setSelectedEntityId}
                    showTallies={showTallies}
                    showDiagnostics={showDiagnostics}
                    mode={mode}
                />
                <div className="viewport-hud top-left">
                    <span className="hud-kicker">{mode.toUpperCase()} MODE</span>
                    <strong>{selectedEntity?.name ?? "No entity selected"}</strong>
                    <span>{tracks.length} sampled tracks · {escapedCount} escaped · {absorbedCount} absorbed</span>
                </div>
                <div className="viewport-hud bottom-right">
                    <label><input type="checkbox" checked={showTracks}
                                  onChange={(event) => setShowTracks(event.target.checked)}/> Tracks</label>
                    <label><input type="checkbox" checked={showTallies}
                                  onChange={(event) => setShowTallies(event.target.checked)}/> Tallies</label>
                    <label><input type="checkbox" checked={showDiagnostics}
                                  onChange={(event) => setShowDiagnostics(event.target.checked)}/> Diagnostics</label>
                </div>
            </main>

            <aside className="right-panel">
                <InspectorPanel entity={selectedEntity} diagnostics={diagnostics} tracks={tracks}
                                project={project}/>
            </aside>

            <footer className="bottom-panel">
                <RunPanel
                    config={runConfiguration}
                    diagnostics={diagnostics}
                    tracks={tracks}
                    activeTab={bottomTab}
                    onTabChange={setBottomTab}
                    sceneStats={sceneStats}
                />
            </footer>
        </div>
    );
}

function createNativeEditorScene(project: Project): EditorScene {
    const materialEntities = project.scene.entities.filter((entity) => entity.kind === "material");
    const geometryEntities = project.scene.entities.filter((entity) => entity.kind === "geometry");
    const sourceEntities = project.scene.entities.filter((entity) => entity.kind === "source");
    const tallyEntities = project.scene.entities.filter((entity) => entity.kind === "tally");
    const defaultTargetEntityId = geometryEntities[0]?.id ?? "";
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

function getSceneStats(entities: readonly SceneEntity[]) {
    return {
        geometry: entities.filter((entity) => entity.kind === "geometry").length,
        materials: entities.filter((entity) => entity.kind === "material").length,
        sources: entities.filter((entity) => entity.kind === "source").length,
        tallies: entities.filter((entity) => entity.kind === "tally").length
    };
}
