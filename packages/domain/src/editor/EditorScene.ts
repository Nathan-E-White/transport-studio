import {Vec3} from "@transport/shared";


export type EntityId = string;
export type MaterialId = string;
export type SourceId = string;
export type TallyId = string;

export type ParticleKind = "photon" | "neutron" | "electron";


export interface EditorTransform {
    readonly position: Vec3;
    readonly rotation: Vec3;
    readonly scale: Vec3;
}

export interface EditorScene {
    readonly id: string;
    readonly name: string;
    readonly entities: readonly EditorEntity[];
    readonly materials: readonly EditorMaterial[];
    readonly sources: readonly EditorSource[];
    readonly tallies: readonly EditorTally[];
    readonly settings: EditorRunSettings;
}

export type EditorEntity = EditorBox | EditorSphere | EditorCylinder | EditorMeshImport;

export interface EditorEntityBase {
    readonly id: EntityId;
    readonly name: string;
    readonly transform: EditorTransform;
    readonly materialId?: MaterialId;
    readonly visible: boolean;
    readonly includedInCompile?: boolean;
    readonly locked: boolean;
    readonly tags?: readonly string[];
}

export interface EditorBox extends EditorEntityBase {
    readonly kind: "box";
    readonly size: Vec3;
}

export interface EditorSphere extends EditorEntityBase {
    readonly kind: "sphere";
    readonly radius: number;
}

export interface EditorCylinder extends EditorEntityBase {
    readonly kind: "cylinder";
    readonly radius: number;
    readonly height: number;
}

export interface EditorMeshImport extends EditorEntityBase {
    readonly kind: "mesh-import";
    readonly uri: string;
}

export interface EditorMaterial {
    readonly id: MaterialId;
    readonly name: string;
    readonly density?: number;
    readonly color?: string;
    readonly nuclides?: readonly EditorNuclideFraction[];
}

export interface EditorNuclideFraction {
    readonly nuclide: string;
    readonly fraction: number;
}

export type EditorSource = EditorPointSource | EditorBeamSource;

export interface EditorSourceBase {
    readonly id: SourceId;
    readonly name: string;
    readonly particle: ParticleKind;
    readonly energyMeV: number;
    readonly strength?: number;
}

export interface EditorPointSource extends EditorSourceBase {
    readonly kind: "point-source";
    readonly position: Vec3;
}

export interface EditorBeamSource extends EditorSourceBase {
    readonly kind: "beam-source";
    readonly position: Vec3;
    readonly direction: Vec3;
}

export type EditorTally = EditorCellFluxTally | EditorSurfaceCurrentTally | EditorTrackLengthTally;

export interface EditorTallyBase {
    readonly id: TallyId;
    readonly name: string;
    readonly particle: ParticleKind;
}

export interface EditorCellFluxTally extends EditorTallyBase {
    readonly kind: "cell-flux";
    readonly entityId: EntityId;
}

export interface EditorSurfaceCurrentTally extends EditorTallyBase {
    readonly kind: "surface-current";
    readonly entityId: EntityId;
}

export interface EditorTrackLengthTally extends EditorTallyBase {
    readonly kind: "track-length";
    readonly entityId: EntityId;
}

export interface EditorRunSettings {
    readonly histories: number;
    readonly seed?: number;
}

export function identityTransform(): EditorTransform {
    return {
        position: {x: 0, y: 0, z: 0},
        rotation: {x: 0, y: 0, z: 0},
        scale: {x: 1, y: 1, z: 1},
    };
}


export function makeEmptyEditorScene(id: string, name: string): EditorScene {
    return {
        id,
        name,
        entities: [],
        materials: [],
        sources: [],
        tallies: [],
        settings: {
            histories: 1_000,
        },
    };
}
