import type {
    EditorBeamSource,
    EditorBox,
    EditorCylinder,
    EditorEntity,
    EditorMaterial,
    EditorScene,
    EditorSource,
    EditorSphere,
    EditorTally,
} from "../editor/EditorScene";
import type {
    GeometryEntity,
    MaterialEntity,
    Project,
    SceneEntity,
    SourceEntity,
    TallyEntity,
} from "../index";
import {
    createTransportBox,
    createTransportCylinder,
    createTransportGeometry,
    createTransportSphere,
    type TransportGeometryEntity,
} from "../transport/TransportGeometry";
import {createTransportMaterial, type TransportMaterial} from "../transport/TransportMaterial";
import {
    createBeamSource,
    createPointSource,
    type TransportSource,
} from "../transport/TransportSource";
import {
    createCellFluxTally,
    createTrackLengthTally,
    type TransportTally,
} from "../transport/TransportTally";
import {createTransportProblem, type TransportProblem} from "../transport/TransportProblem";
import type {Vec3} from "@transport/shared";

export interface CompileResult<T> {
    readonly ok: boolean;
    readonly value?: T;
    readonly diagnostics: readonly CompileDiagnostic[];
}

export interface CompileDiagnostic {
    readonly level: "info" | "warning" | "error";
    readonly code: string;
    readonly message: string;
    readonly entityId?: string;
}

const DEFAULT_SEED = 1;
const DEFAULT_SOURCE_STRENGTH = 1;
const COMPILER_VERSION = "transport-domain-compiler-1";

/** Canonical compiler from the authoritative editable Project to an executable problem. */
export function compileTransportProblem(project: Project): CompileResult<TransportProblem> {
    const diagnostics: CompileDiagnostic[] = [];
    const entities = project.scene.entities.flatMap((entity) =>
        entity.kind === "geometry" ? prepareGeometry(entity, diagnostics) : [],
    );
    const materials = project.scene.entities.flatMap((entity) =>
        entity.kind === "material" ? prepareMaterial(entity, diagnostics) : [],
    );
    const sources = project.scene.entities.flatMap((entity) =>
        entity.kind === "source" ? prepareSource(entity, diagnostics) : [],
    );
    const tallies = project.scene.entities.flatMap((entity) =>
        entity.kind === "tally" ? prepareTally(entity, diagnostics) : [],
    );
    const compileResult = compilePreparedScene({
        id: project.id,
        name: project.name,
        entities,
        materials,
        sources,
        tallies,
        settings: {
            histories: project.runConfiguration.histories,
            seed: project.runConfiguration.seed,
        },
    });
    const combinedDiagnostics = [...diagnostics, ...compileResult.diagnostics];

    if (combinedDiagnostics.some((diagnostic) => diagnostic.level === "error") || !compileResult.value) {
        return {ok: false, diagnostics: combinedDiagnostics};
    }

    return {ok: true, value: compileResult.value, diagnostics: combinedDiagnostics};
}

function prepareGeometry(
    entity: GeometryEntity,
    diagnostics: CompileDiagnostic[],
): EditorEntity[] {
    if (!isAuthoringEntityIncluded(entity)) {
        addExcludedDiagnostic("Entity", "entity", entity, diagnostics);
        return [];
    }
    if (entity.primitive === "plane") {
        diagnostics.push({
            level: "error",
            code: "entity.geometry.unsupported",
            message: `Geometry entity "${entity.name}" uses unsupported plane geometry.`,
            entityId: entity.id,
        });
        return [];
    }

    const transform = {
        position: entity.transform.position,
        rotation: entity.transform.rotationEuler,
        scale: entity.transform.scale,
    };
    const common = {
        id: entity.id,
        name: entity.name,
        transform,
        materialId: entity.materialId,
        visible: entity.visible,
        includedInCompile: isAuthoringEntityIncluded(entity),
        locked: entity.locked,
        tags: entity.tags,
    };

    switch (entity.primitive) {
        case "box":
            return [{
                ...common,
                kind: "box",
                size: {
                    x: requiredScaledDimension(entity, "width", entity.transform.scale.x, diagnostics),
                    y: requiredScaledDimension(entity, "height", entity.transform.scale.y, diagnostics),
                    z: requiredScaledDimension(entity, "depth", entity.transform.scale.z, diagnostics),
                },
            }];
        case "sphere":
            if (!hasEqualScale(entity.transform.scale.x, entity.transform.scale.y)
                || !hasEqualScale(entity.transform.scale.x, entity.transform.scale.z)) {
                diagnostics.push({
                    level: "error",
                    code: "sphere.scale.unsupported",
                    message: `Sphere "${entity.name}" requires uniform scale before compilation.`,
                    entityId: entity.id,
                });
                return [];
            }
            return [{
                ...common,
                kind: "sphere",
                radius: requiredScaledDimension(entity, "radius", entity.transform.scale.x, diagnostics),
            }];
        case "cylinder":
            if (!hasEqualScale(entity.transform.scale.x, entity.transform.scale.y)) {
                diagnostics.push({
                    level: "error",
                    code: "cylinder.radial-scale.unsupported",
                    message: `Cylinder "${entity.name}" requires equal x and y scale before compilation.`,
                    entityId: entity.id,
                });
                return [];
            }
            return [{
                ...common,
                kind: "cylinder",
                radius: requiredScaledDimension(entity, "radius", entity.transform.scale.x, diagnostics),
                height: requiredScaledDimension(entity, "height", entity.transform.scale.z, diagnostics),
            }];
    }
}

function hasEqualScale(left: number, right: number): boolean {
    return Object.is(left, right);
}

function requiredScaledDimension(
    entity: GeometryEntity,
    parameter: string,
    scale: number,
    diagnostics: CompileDiagnostic[],
): number {
    const value = entity.parameters[parameter];
    if (value === undefined) {
        diagnostics.push({
            level: "error",
            code: "entity.geometry.parameter.missing",
            message: `Geometry entity "${entity.name}" must define ${parameter} before compilation.`,
            entityId: entity.id,
        });
        return Number.NaN;
    }
    return value * scale;
}

function prepareMaterial(
    entity: MaterialEntity,
    diagnostics: CompileDiagnostic[],
): EditorMaterial[] {
    if (!isAuthoringEntityIncluded(entity)) {
        addExcludedDiagnostic("Material", "material", entity, diagnostics);
        return [];
    }

    if (entity.attenuationCoefficient !== 0
        || entity.scatterProbability !== 0
        || entity.absorptionProbability !== 0
        || entity.anisotropy !== 0) {
        diagnostics.push({
            level: "warning",
            code: "material.toy-coefficients.lossy",
            message: `Material "${entity.name}" toy transport coefficients are not part of the compiled material contract and were omitted.`,
            entityId: entity.id,
        });
    }

    return [{
        id: entity.id,
        name: entity.name,
        density: entity.density,
        color: entity.color,
        nuclides: entity.nuclides,
    }];
}

function prepareSource(
    entity: SourceEntity,
    diagnostics: CompileDiagnostic[],
): EditorSource[] {
    if (!isAuthoringEntityIncluded(entity)) {
        addExcludedDiagnostic("Source", "source", entity, diagnostics);
        return [];
    }

    const common = {
        id: entity.id,
        name: entity.name,
        particle: entity.particleType,
        energyMeV: entity.energy,
        strength: entity.strength,
        position: entity.transform.position,
    };
    if (entity.sourceKind === "point-isotropic") {
        return [{...common, kind: "point-source"}];
    }
    if (!entity.direction) {
        diagnostics.push({
            level: "error",
            code: "source.beam.direction.missing",
            message: `Beam source "${entity.name}" must define an authoring direction before compilation.`,
            entityId: entity.id,
        });
        return [];
    }
    return [{...common, kind: "beam-source", direction: entity.direction}];
}

function prepareTally(
    entity: TallyEntity,
    diagnostics: CompileDiagnostic[],
): EditorTally[] {
    if (!isAuthoringEntityIncluded(entity)) {
        addExcludedDiagnostic("Tally", "tally", entity, diagnostics);
        return [];
    }
    if (!entity.targetEntityId) {
        diagnostics.push({
            level: "error",
            code: "tally.target.missing",
            message: `Tally "${entity.name}" must define its target entity before compilation.`,
            entityId: entity.id,
        });
        return [];
    }
    const particle = entity.particleTypes[0];
    if (!particle) {
        diagnostics.push({
            level: "error",
            code: "tally.particle.missing",
            message: `Tally "${entity.name}" must define a particle before compilation.`,
            entityId: entity.id,
        });
        return [];
    }
    const common = {
        id: entity.id,
        name: entity.name,
        particle,
        entityId: entity.targetEntityId,
    };

    switch (entity.tallyKind) {
        case "track-length":
            return [{...common, kind: "track-length"}];
        case "surface-crossing":
            return [{...common, kind: "surface-current"}];
        case "voxel-flux":
        case "detector-hit":
        case "event-density":
            diagnostics.push({
                level: "error",
                code: "tally.kind.unsupported",
                message: `Tally "${entity.name}" uses unsupported ${entity.tallyKind} semantics.`,
                entityId: entity.id,
            });
            return [];
    }
}

function isAuthoringEntityIncluded(entity: SceneEntity): boolean {
    return entity.includedInCompile !== false;
}

function addExcludedDiagnostic(
    label: string,
    codePrefix: string,
    entity: SceneEntity,
    diagnostics: CompileDiagnostic[],
): void {
    diagnostics.push({
        level: "info",
        code: `${codePrefix}.compile.excluded`,
        message: `${label} "${entity.name}" was excluded from the compiled transport problem.`,
        entityId: entity.id,
    });
}

function compilePreparedScene(scene: EditorScene): CompileResult<TransportProblem> {
    const diagnostics: CompileDiagnostic[] = [];
    const materialIds = new Set(scene.materials.map((material) => material.id));
    const compiledEntityIds = new Set(
        scene.entities
            .filter((entity) => isIncludedInCompile(entity))
            .map((entity) => entity.id),
    );

    addDuplicateDiagnostics(
        diagnostics,
        scene.materials.map((material) => ({id: material.id, label: "material"})),
    );
    addDuplicateDiagnostics(
        diagnostics,
        scene.entities.map((entity) => ({id: entity.id, label: "entity"})),
    );
    addDuplicateDiagnostics(
        diagnostics,
        scene.sources.map((source) => ({id: source.id, label: "source"})),
    );
    addDuplicateDiagnostics(
        diagnostics,
        scene.tallies.map((tally) => ({id: tally.id, label: "tally"})),
    );

    const materials = scene.materials.flatMap((material) => compileMaterial(material, diagnostics));
    const entities = scene.entities.flatMap((entity) =>
        compileEntity(entity, materialIds, diagnostics),
    );
    const sources = scene.sources.flatMap((source) => compileSource(source, diagnostics));
    const tallies = scene.tallies.flatMap((tally) => compileTally(tally, compiledEntityIds, diagnostics));

    if (!isPositiveInteger(scene.settings.histories)) {
        diagnostics.push({
            level: "error",
            code: "settings.histories.invalid",
            message: "Run settings must specify a positive integer number of histories.",
        });
    }

    if (diagnostics.some((diagnostic) => diagnostic.level === "error")) {
        return {ok: false, diagnostics};
    }

    return {
        ok: true,
        value: createTransportProblem({
            id: scene.id,
            name: scene.name,
            status: "compiled",
            geometry: createTransportGeometry({entities}),
            materials,
            sources,
            tallies,
            settings: {
                histories: scene.settings.histories,
                seed: scene.settings.seed ?? DEFAULT_SEED,
                particles: [...new Set(sources.map((source) => source.particle))],
            },
            metadata: {
                sourceSceneId: scene.id,
                compilerVersion: COMPILER_VERSION,
            },
        }),
        diagnostics,
    };
}

function compileMaterial(
    material: EditorMaterial,
    diagnostics: CompileDiagnostic[],
): TransportMaterial[] {
    if (!isFiniteNonNegative(material.density)) {
        diagnostics.push({
            level: "error",
            code: "material.density.invalid",
            message: `Material "${material.name}" must have a finite non-negative density before compilation.`,
            entityId: material.id,
        });
        return [];
    }

    if (material.density > 0 && (!material.nuclides || material.nuclides.length === 0)) {
        diagnostics.push({
            level: "error",
            code: "material.nuclides.missing",
            message: `Non-void material "${material.name}" must define at least one nuclide fraction.`,
            entityId: material.id,
        });
        return [];
    }

    return [
        createTransportMaterial({
            id: material.id,
            name: material.name,
            density: material.density,
            color: material.color,
            nuclides: (material.nuclides ?? []).map((nuclide) => ({
                ...nuclide,
                basis: "atom",
            })),
        }),
    ];
}

function compileEntity(
    entity: EditorEntity,
    materialIds: ReadonlySet<string>,
    diagnostics: CompileDiagnostic[],
): TransportGeometryEntity[] {
    if (!isIncludedInCompile(entity)) {
        diagnostics.push({
            level: "info",
            code: "entity.compile.excluded",
            message: `Entity "${entity.name}" was excluded from the compiled transport problem.`,
            entityId: entity.id,
        });
        return [];
    }

    if (!entity.materialId || !materialIds.has(entity.materialId)) {
        diagnostics.push({
            level: "error",
            code: "entity.material.invalid",
            message: `Entity "${entity.name}" must reference an existing material before compilation.`,
            entityId: entity.id,
        });
        return [];
    }

    if (!isValidVec3(entity.transform.position) || !isValidVec3(entity.transform.rotation)) {
        diagnostics.push({
            level: "error",
            code: "entity.transform.invalid",
            message: `Entity "${entity.name}" has an invalid transform.`,
            entityId: entity.id,
        });
        return [];
    }

    switch (entity.kind) {
        case "box":
            return compileBox(entity, diagnostics);
        case "sphere":
            return compileSphere(entity, diagnostics);
        case "cylinder":
            return compileCylinder(entity, diagnostics);
        case "mesh-import":
            diagnostics.push({
                level: "error",
                code: "entity.mesh.unsupported",
                message: `Imported mesh entity "${entity.name}" is not supported by the first transport compiler.`,
                entityId: entity.id,
            });
            return [];
    }
}

function isIncludedInCompile(entity: EditorEntity): boolean {
    return entity.includedInCompile !== false;
}

function compileBox(entity: EditorBox, diagnostics: CompileDiagnostic[]): TransportGeometryEntity[] {
    if (!isFinitePositive(entity.size.x) || !isFinitePositive(entity.size.y) || !isFinitePositive(entity.size.z)) {
        diagnostics.push({
            level: "error",
            code: "box.size.invalid",
            message: `Box "${entity.name}" must have positive x, y, and z dimensions.`,
            entityId: entity.id,
        });
        return [];
    }

    return [
        createTransportBox({
            id: entity.id,
            name: entity.name,
            materialId: entity.materialId!,
            transform: {
                position: entity.transform.position,
                rotation: entity.transform.rotation,
            },
            size: entity.size,
        }),
    ];
}

function compileSphere(entity: EditorSphere, diagnostics: CompileDiagnostic[]): TransportGeometryEntity[] {
    if (!isFinitePositive(entity.radius)) {
        diagnostics.push({
            level: "error",
            code: "sphere.radius.invalid",
            message: `Sphere "${entity.name}" must have a positive radius.`,
            entityId: entity.id,
        });
        return [];
    }

    return [
        createTransportSphere({
            id: entity.id,
            name: entity.name,
            materialId: entity.materialId!,
            transform: {
                position: entity.transform.position,
                rotation: entity.transform.rotation,
            },
            radius: entity.radius,
        }),
    ];
}

function compileCylinder(
    entity: EditorCylinder,
    diagnostics: CompileDiagnostic[],
): TransportGeometryEntity[] {
    if (!isFinitePositive(entity.radius) || !isFinitePositive(entity.height)) {
        diagnostics.push({
            level: "error",
            code: "cylinder.dimensions.invalid",
            message: `Cylinder "${entity.name}" must have a positive radius and height.`,
            entityId: entity.id,
        });
        return [];
    }

    return [
        createTransportCylinder({
            id: entity.id,
            name: entity.name,
            materialId: entity.materialId!,
            transform: {
                position: entity.transform.position,
                rotation: entity.transform.rotation,
            },
            radius: entity.radius,
            height: entity.height,
        }),
    ];
}

function compileSource(source: EditorSource, diagnostics: CompileDiagnostic[]): TransportSource[] {
    if (!isFinitePositive(source.energyMeV)) {
        diagnostics.push({
            level: "error",
            code: "source.energy.invalid",
            message: `Source "${source.name}" must have a positive energy in MeV.`,
            entityId: source.id,
        });
        return [];
    }

    if (source.kind === "point-source") {
        if (!isValidVec3(source.position)) {
            diagnostics.push({
                level: "error",
                code: "source.position.invalid",
                message: `Point source "${source.name}" has an invalid position.`,
                entityId: source.id,
            });
            return [];
        }

        return [
            createPointSource({
                id: source.id,
                name: source.name,
                particle: source.particle,
                energyMeV: source.energyMeV,
                strength: source.strength ?? DEFAULT_SOURCE_STRENGTH,
                position: source.position,
            }),
        ];
    }

    return compileBeamSource(source, diagnostics);
}

function compileBeamSource(
    source: EditorBeamSource,
    diagnostics: CompileDiagnostic[],
): TransportSource[] {
    if (!isValidVec3(source.position) || !isValidVec3(source.direction) || vectorMagnitude(source.direction) === 0) {
        diagnostics.push({
            level: "error",
            code: "source.beam.invalid",
            message: `Beam source "${source.name}" must have a valid position and non-zero direction.`,
            entityId: source.id,
        });
        return [];
    }

    return [
        createBeamSource({
            id: source.id,
            name: source.name,
            particle: source.particle,
            energyMeV: source.energyMeV,
            strength: source.strength ?? DEFAULT_SOURCE_STRENGTH,
            position: source.position,
            direction: normalizeVec3(source.direction),
        }),
    ];
}

function compileTally(
    tally: EditorTally,
    entityIds: ReadonlySet<string>,
    diagnostics: CompileDiagnostic[],
): TransportTally[] {
    if (!entityIds.has(tally.entityId)) {
        diagnostics.push({
            level: "error",
            code: "tally.entity.invalid",
            message: `Tally "${tally.name}" must reference an existing entity.`,
            entityId: tally.id,
        });
        return [];
    }

    if (tally.kind === "surface-current") {
        diagnostics.push({
            level: "warning",
            code: "tally.surface-current.entity-target",
            message: `Tally "${tally.name}" was compiled as track-length because editor surface tallies do not yet carry surface ids.`,
            entityId: tally.id,
        });

        return [
            createTrackLengthTally({
                id: tally.id,
                name: tally.name,
                particle: tally.particle,
                entityId: tally.entityId,
            }),
        ];
    }

    if (tally.kind === "track-length") {
        return [
            createTrackLengthTally({
                id: tally.id,
                name: tally.name,
                particle: tally.particle,
                entityId: tally.entityId,
            }),
        ];
    }

    return [
        createCellFluxTally({
            id: tally.id,
            name: tally.name,
            particle: tally.particle,
            entityId: tally.entityId,
        }),
    ];
}

function addDuplicateDiagnostics(
    diagnostics: CompileDiagnostic[],
    items: readonly {readonly id: string; readonly label: string}[],
): void {
    const seen = new Set<string>();
    const reported = new Set<string>();

    for (const item of items) {
        if (!seen.has(item.id)) {
            seen.add(item.id);
            continue;
        }

        if (reported.has(item.id)) {
            continue;
        }

        diagnostics.push({
            level: "error",
            code: `${item.label}.id.duplicate`,
            message: `Duplicate ${item.label} id "${item.id}" found during compilation.`,
            entityId: item.id,
        });
        reported.add(item.id);
    }
}

function normalizeVec3(value: Vec3): Vec3 {
    const magnitude = vectorMagnitude(value);
    return {
        x: value.x / magnitude,
        y: value.y / magnitude,
        z: value.z / magnitude,
    };
}

function vectorMagnitude(value: Vec3): number {
    return Math.sqrt(value.x * value.x + value.y * value.y + value.z * value.z);
}

function isValidVec3(value: Vec3): boolean {
    return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function isFinitePositive(value: number | undefined): value is number {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isFiniteNonNegative(value: number | undefined): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveInteger(value: number): boolean {
    return Number.isInteger(value) && value > 0;
}
