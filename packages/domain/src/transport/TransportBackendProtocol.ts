import type {Vec3} from "@transport/shared";
import type {TransportBackendId, TransportProblem, TransportProblemId, TransportRunId} from "./TransportProblem";
import type {ParticleKind} from "./TransportSource";
import type {TransportTallyId} from "./TransportTally";

export const NATIVE_RUST_PHOTON_BACKEND_ID = "native-rust-photon-smoke" as const;
export const VISUAL_TS_BACKEND_ID = "visual-ts" as const;

export type TransportBackendKind = typeof NATIVE_RUST_PHOTON_BACKEND_ID | typeof VISUAL_TS_BACKEND_ID | string;

export interface TransportBackendMetadata {
    readonly id: TransportBackendId;
    readonly name: string;
    readonly version: string;
    readonly description?: string;
    readonly capabilities: TransportBackendCapabilities;
}

export interface TransportBackendCapabilities {
    readonly particles: readonly ParticleKind[];
    readonly geometry: readonly string[];
    readonly sources: readonly string[];
    readonly tallies: readonly string[];
    readonly lifecycle: readonly TransportBackendLifecycleCapability[];
    readonly dataPolicy: "toy" | "simple-coefficients" | "hybrid-warning-mode" | "requires-data-packs";
}

export type TransportBackendLifecycleCapability = "submit" | "start" | "pause" | "resume" | "cancel";

export type TransportBackendRequest =
    | {readonly type: "discover"}
    | {readonly type: "submitProblem"; readonly problem: TransportProblem}
    | {readonly type: "startRun"; readonly problemId: TransportProblemId; readonly runId: TransportRunId}
    | {readonly type: "pauseRun"; readonly runId: TransportRunId}
    | {readonly type: "resumeRun"; readonly runId: TransportRunId}
    | {readonly type: "cancelRun"; readonly runId: TransportRunId};

export type TransportBackendEvent =
    | {readonly type: "backendMetadata"; readonly metadata: TransportBackendMetadata}
    | {readonly type: "problemAccepted"; readonly problemId: TransportProblemId; readonly diagnostics: readonly TransportBackendDiagnostic[]}
    | {readonly type: "runStarted"; readonly runId: TransportRunId; readonly problemId: TransportProblemId; readonly provenance: TransportRunProvenance}
    | {readonly type: "runProgress"; readonly runId: TransportRunId; readonly completedHistories: number; readonly totalHistories: number}
    | {readonly type: "trackSamples"; readonly runId: TransportRunId; readonly samples: readonly TransportTrackSample[]}
    | {readonly type: "tallyDelta"; readonly runId: TransportRunId; readonly delta: TransportTallyDelta}
    | {readonly type: "diagnostic"; readonly runId?: TransportRunId; readonly diagnostic: TransportBackendDiagnostic}
    | {readonly type: "runCompleted"; readonly runId: TransportRunId; readonly summary: TransportRunSummary}
    | {readonly type: "runFailed"; readonly runId?: TransportRunId; readonly diagnostic: TransportBackendDiagnostic};

export interface TransportRunProvenance {
    readonly backendId: TransportBackendId;
    readonly backendVersion: string;
    readonly problemId: TransportProblemId;
    readonly seed: number;
    readonly dataPolicy: TransportBackendCapabilities["dataPolicy"];
    readonly warnings: readonly string[];
}

export interface TransportRunSummary {
    readonly completedHistories: number;
    readonly totalHistories: number;
    readonly elapsedMilliseconds?: number;
    readonly sampledTrackCount: number;
    readonly tallyCount: number;
    readonly diagnostics: readonly TransportBackendDiagnostic[];
}

export interface TransportBackendDiagnostic {
    readonly level: "info" | "warning" | "error";
    readonly code: string;
    readonly message: string;
    readonly problemId?: TransportProblemId;
    readonly runId?: TransportRunId;
    readonly entityId?: string;
    readonly sourceId?: string;
    readonly tallyId?: string;
}

export type TransportParticleEventType =
    | "birth"
    | "move"
    | "boundary-crossing"
    | "scatter"
    | "absorb"
    | "escape"
    | "detector-hit"
    | "error-lost";

export interface TransportParticleEvent {
    readonly historyId: string;
    readonly particleId: string;
    readonly type: TransportParticleEventType;
    readonly position: Vec3;
    readonly direction: Vec3;
    readonly energyMeV: number;
    readonly weight: number;
    readonly time: number;
    readonly materialId?: string;
    readonly entityId?: string;
    readonly reason?: string;
}

export interface TransportTrackSample {
    readonly historyId: string;
    readonly events: readonly TransportParticleEvent[];
}

export interface TransportTallyDelta {
    readonly tallyId: TransportTallyId;
    readonly scores: readonly number[];
}

export const nativeRustPhotonBackendMetadata: TransportBackendMetadata = {
    id: NATIVE_RUST_PHOTON_BACKEND_ID,
    name: "Native Rust Photon Smoke Kernel",
    version: "0.1.0",
    description: "Deterministic native photon MC smoke backend with hybrid warning-mode material data.",
    capabilities: {
        particles: ["photon"],
        geometry: ["box", "sphere", "cylinder"],
        sources: ["point-source", "beam-source", "isotropic-source"],
        tallies: ["cell-flux", "track-length", "detector-hit"],
        lifecycle: ["submit", "start", "cancel"],
        dataPolicy: "hybrid-warning-mode",
    },
};

export function assertNeverTransportBackendEvent(event: never): never {
    throw new Error(`Unhandled transport backend event: ${JSON.stringify(event)}`);
}
