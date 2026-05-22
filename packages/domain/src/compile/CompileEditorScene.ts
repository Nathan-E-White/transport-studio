import type {
    EditorBeamSource,
    EditorBox,
    EditorCylinder,
    EditorEntity,
    EditorMaterial,
    EditorScene,
    EditorSource,
    EditorSphere,
    EditorTally
} from "../editor/EditorScene";

import {Vec3} from "@transport/shared";


export type TransportId = string;
export type TransportEntityId = string;
export type TransportMaterialId = string;
export type TransportSourceId = string;
export type TransportTallyId = string;

export type TransportParticleKind = "photon" | "neutron" | "electron";

export interface TransportVec3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export interface TransportProblem {
    readonly id: TransportId;
    readonly name: string;
    readonly geometry: TransportGeometry;
    readonly materials: readonly TransportMaterial[];
    readonly sources: readonly TransportSource[];
    readonly tallies: readonly TransportTally[];
    readonly settings: TransportRunSettings;
}

export interface TransportGeometry {
    readonly entities: readonly TransportGeometryEntity[];
}

export type TransportGeometryEntity = TransportBox | TransportSphere | TransportCylinder;

export interface TransportGeometryEntityBase {
    readonly id: TransportEntityId;
    readonly name: string;
    readonly materialId: TransportMaterialId;
    readonly position: TransportVec3;
    readonly rotation: TransportVec3;
}

export interface TransportBox extends TransportGeometryEntityBase {
    readonly kind: "box";
    readonly size: TransportVec3;
}

export interface TransportSphere extends TransportGeometryEntityBase {
    readonly kind: "sphere";
    readonly radius: number;
}

export interface TransportCylinder extends TransportGeometryEntityBase {
    readonly kind: "cylinder";
    readonly radius: number;
    readonly height: number;
}

export interface TransportMaterial {
    readonly id: TransportMaterialId;
    readonly name: string;
    readonly density: number;
    readonly nuclides: readonly TransportNuclideFraction[];
}

export interface TransportNuclideFraction {
    readonly nuclide: string;
    readonly fraction: number;
}

export type TransportSource = TransportPointSource | TransportBeamSource;

export interface TransportSourceBase {
    readonly id: TransportSourceId;
    readonly name: string;
    readonly particle: TransportParticleKind;
    readonly energyMeV: number;
    readonly strength: number;
}

export interface TransportPointSource extends TransportSourceBase {
    readonly kind: "point-source";
    readonly position: TransportVec3;
}

export interface TransportBeamSource extends TransportSourceBase {
    readonly kind: "beam-source";
    readonly position: TransportVec3;
    readonly direction: TransportVec3;
}

export type TransportTally = TransportCellFluxTally | TransportSurfaceCurrentTally;

export interface TransportTallyBase {
    readonly id: TransportTallyId;
    readonly name: string;
    readonly particle: TransportParticleKind;
    readonly entityId: TransportEntityId;
}

export interface TransportCellFluxTally extends TransportTallyBase {
    readonly kind: "cell-flux";
}

export interface TransportSurfaceCurrentTally extends TransportTallyBase {
    readonly kind: "surface-current";
}

export interface TransportRunSettings {
    readonly histories: number;
    readonly seed: number;
}

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

export function compileEditorScene(scene: EditorScene): CompileResult<TransportProblem> {
    const diagnostics: CompileDiagnostic[] = [];
    const materialIds = new Set(scene.materials.map((material) => material.id));
    const entityIds = new Set(scene.entities.map((entity) => entity.id));

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
    const tallies = scene.tallies.flatMap((tally) => compileTally(tally, entityIds, diagnostics));

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
        value: {
            id: scene.id,
            name: scene.name,
            geometry: {entities},
            materials,
            sources,
            tallies,
            settings: {
                histories: scene.settings.histories,
                seed: scene.settings.seed ?? DEFAULT_SEED,
            },
        },
        diagnostics,
    };
}

function compileMaterial(
    material: EditorMaterial,
    diagnostics: CompileDiagnostic[],
): TransportMaterial[] {
    if (!isFinitePositive(material.density)) {
        diagnostics.push({
            level: "error",
            code: "material.density.invalid",
            message: `Material "${material.name}" must have a positive density before compilation.`,
            entityId: material.id,
        });
        return [];
    }

    if (!material.nuclides || material.nuclides.length === 0) {
        diagnostics.push({
            level: "error",
            code: "material.nuclides.missing",
            message: `Material "${material.name}" must define at least one nuclide fraction.`,
            entityId: material.id,
        });
        return [];
    }

    return [
        {
            id: material.id,
            name: material.name,
            density: material.density,
            nuclides: material.nuclides,
        },
    ];
}

function compileEntity(
    entity: EditorEntity,
    materialIds: ReadonlySet<string>,
    diagnostics: CompileDiagnostic[],
): TransportGeometryEntity[] {
    if (!entity.visible) {
        diagnostics.push({
            level: "info",
            code: "entity.hidden.skipped",
            message: `Hidden entity "${entity.name}" was skipped during transport compilation.`,
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
        {
            id: entity.id,
            name: entity.name,
            kind: "box",
            materialId: entity.materialId!,
            position: toTransportVec3(entity.transform.position),
            rotation: toTransportVec3(entity.transform.rotation),
            size: toTransportVec3(entity.size),
        },
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
        {
            id: entity.id,
            name: entity.name,
            kind: "sphere",
            materialId: entity.materialId!,
            position: toTransportVec3(entity.transform.position),
            rotation: toTransportVec3(entity.transform.rotation),
            radius: entity.radius,
        },
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
        {
            id: entity.id,
            name: entity.name,
            kind: "cylinder",
            materialId: entity.materialId!,
            position: toTransportVec3(entity.transform.position),
            rotation: toTransportVec3(entity.transform.rotation),
            radius: entity.radius,
            height: entity.height,
        },
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
            {
                id: source.id,
                name: source.name,
                kind: "point-source",
                particle: source.particle,
                energyMeV: source.energyMeV,
                strength: source.strength ?? DEFAULT_SOURCE_STRENGTH,
                position: toTransportVec3(source.position),
            },
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
        {
            id: source.id,
            name: source.name,
            kind: "beam-source",
            particle: source.particle,
            energyMeV: source.energyMeV,
            strength: source.strength ?? DEFAULT_SOURCE_STRENGTH,
            position: toTransportVec3(source.position),
            direction: normalizeVec3(source.direction),
        },
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

    return [
        {
            id: tally.id,
            name: tally.name,
            kind: tally.kind,
            particle: tally.particle,
            entityId: tally.entityId,
        },
    ];
}

function addDuplicateDiagnostics(
    diagnostics: CompileDiagnostic[],
    items: readonly { readonly id: string; readonly label: string }[],
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

function toTransportVec3(value: Vec3): TransportVec3 {
    return {x: value.x, y: value.y, z: value.z};
}

function normalizeVec3(value: Vec3): TransportVec3 {
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

function isPositiveInteger(value: number): boolean {
    return Number.isInteger(value) && value > 0;
}
