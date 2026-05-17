import type { EntityId, RunId, Transform, Vec3 } from "@transport/shared";

export type ParticleType = "photon" | "neutron";

export type EntityKind =
  | "geometry"
  | "material"
  | "source"
  | "tally"
  | "boundary"
  | "annotation"
  | "result-overlay";

export interface EntityBase {
  readonly id: EntityId;
  readonly kind: EntityKind;
  readonly name: string;
  readonly tags: readonly string[];
  readonly visible: boolean;
  readonly locked: boolean;
  readonly transform: Transform;
  readonly metadata?: Record<string, unknown>;
}

export type GeometryPrimitive = "box" | "sphere" | "cylinder" | "plane";

export interface GeometryEntity extends EntityBase {
  readonly kind: "geometry";
  readonly primitive: GeometryPrimitive;
  readonly materialId?: EntityId;
  readonly parameters: Record<string, number>;
}

export interface MaterialEntity extends EntityBase {
  readonly kind: "material";
  readonly color: string;
  readonly attenuationCoefficient: number;
  readonly scatterProbability: number;
  readonly absorptionProbability: number;
  readonly anisotropy: number;
}

export type SourceKind = "pencil-beam" | "point-isotropic";

export interface SourceEntity extends EntityBase {
  readonly kind: "source";
  readonly sourceKind: SourceKind;
  readonly particleType: ParticleType;
  readonly energy: number;
  readonly strength: number;
  readonly direction?: Vec3;
}

export type TallyKind = "voxel-flux" | "surface-crossing" | "detector-hit" | "track-length" | "event-density";

export interface TallyEntity extends EntityBase {
  readonly kind: "tally";
  readonly tallyKind: TallyKind;
  readonly particleTypes: readonly ParticleType[];
  readonly bins?: readonly [number, number, number];
}

export type SceneEntity = GeometryEntity | MaterialEntity | SourceEntity | TallyEntity;

export interface Scene {
  readonly entities: readonly SceneEntity[];
}

export interface RunConfiguration {
  readonly particleTypes: readonly ParticleType[];
  readonly histories: number;
  readonly batchSize: number;
  readonly seed: number;
  readonly backend: "visual-ts" | "web-worker" | "webgpu" | "native";
  readonly visibleHistoryBudget: number;
}

export interface Project {
  readonly id: EntityId;
  readonly name: string;
  readonly scene: Scene;
  readonly runConfiguration: RunConfiguration;
  readonly metadata: {
    readonly appVersion: string;
    readonly physicsModelVersion: string;
    readonly createdAt: string;
    readonly modifiedAt: string;
  };
}

export type ParticleEventType = "birth" | "move" | "boundary-crossing" | "scatter" | "absorb" | "escape" | "detector-hit" | "error-lost";

export interface ParticleEvent {
  readonly historyId: string;
  readonly particleId: string;
  readonly type: ParticleEventType;
  readonly position: Vec3;
  readonly direction: Vec3;
  readonly energy: number;
  readonly weight: number;
  readonly time: number;
  readonly materialId?: EntityId;
  readonly regionId?: EntityId;
  readonly reason?: string;
}

export interface TrackSample {
  readonly historyId: string;
  readonly events: readonly ParticleEvent[];
}

export interface TallyDelta {
  readonly tallyId: EntityId;
  readonly scores: readonly number[];
}

export interface Diagnostic {
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly entityId?: EntityId;
}


// noinspection JSUnusedGlobalSymbols
export interface ResultStore {
  readonly runId: RunId;
  readonly status: "idle" | "running" | "paused" | "completed" | "failed";
  readonly progress: number;
  readonly tracks: readonly TrackSample[];
  readonly diagnostics: readonly Diagnostic[];
}
