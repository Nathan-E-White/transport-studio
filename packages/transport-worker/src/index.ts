import {
  nativeRustPhotonBackendMetadata,
  NATIVE_RUST_PHOTON_BACKEND_ID,
  type Diagnostic,
  type Project,
  type RunConfiguration,
  type TallyDelta,
  type TrackSample,
  type TransportBackendDiagnostic,
  type TransportBackendEvent,
  type TransportTallyDelta,
  type TransportTrackSample
} from "@transport/domain";
import type {TransportProblem} from "@transport/domain/transport/TransportProblem";

export {
  createNativePhotonSmokeFixtureProblem,
  createNativePhotonSmokeFixtureScene,
} from "./nativePhotonSmokeFixture";

// noinspection JSUnusedGlobalSymbols
export type WorkerRequest =
  | { readonly type: "loadProblem"; readonly project: Project }
  | { readonly type: "startRun"; readonly config: RunConfiguration }
  | { readonly type: "pauseRun" }
  | { readonly type: "resumeRun" }
  | { readonly type: "cancelRun" };

// noinspection JSUnusedGlobalSymbols
export type WorkerResponse =
  | { readonly type: "problemLoaded"; readonly diagnostics: readonly Diagnostic[] }
  | { readonly type: "runStarted"; readonly runId: string }
  | { readonly type: "batchCompleted"; readonly completedHistories: number; readonly totalHistories: number }
  | { readonly type: "trackSamples"; readonly samples: readonly TrackSample[] }
  | { readonly type: "tallyDelta"; readonly delta: TallyDelta }
  | { readonly type: "runCompleted" }
  | { readonly type: "runFailed"; readonly message: string };

export interface NativePhotonSmokeBridge {
  readonly runPhotonSmoke: (problem: TransportProblem) => Promise<NativePhotonSmokePayload>;
}

export interface NativePhotonSmokePayload {
  readonly runId: string;
  readonly tracks: readonly TransportTrackSample[];
  readonly tallyDeltas: readonly TransportTallyDelta[];
  readonly diagnostics: readonly TransportBackendDiagnostic[];
  readonly completedHistories: number;
  readonly totalHistories: number;
  readonly warnings: readonly string[];
}

export async function runNativePhotonSmokeBackend(
  problem: TransportProblem,
  bridge?: NativePhotonSmokeBridge,
): Promise<readonly TransportBackendEvent[]> {
  const runId = `native-${problem.settings.seed}`;

  if (!bridge) {
    return [
      { type: "backendMetadata", metadata: nativeRustPhotonBackendMetadata },
      {
        type: "runFailed",
        runId,
        diagnostic: nativeBridgeUnavailableDiagnostic(problem.id, runId),
      },
    ];
  }

  const payload = await bridge.runPhotonSmoke(problem);

  return [
    { type: "backendMetadata", metadata: nativeRustPhotonBackendMetadata },
    { type: "problemAccepted", problemId: problem.id, diagnostics: payload.diagnostics },
    {
      type: "runStarted",
      runId: payload.runId,
      problemId: problem.id,
      provenance: {
        backendId: NATIVE_RUST_PHOTON_BACKEND_ID,
        backendVersion: nativeRustPhotonBackendMetadata.version,
        problemId: problem.id,
        seed: problem.settings.seed,
        dataPolicy: "hybrid-warning-mode",
        warnings: payload.warnings,
      },
    },
    {
      type: "runProgress",
      runId: payload.runId,
      completedHistories: payload.completedHistories,
      totalHistories: payload.totalHistories,
    },
    { type: "trackSamples", runId: payload.runId, samples: payload.tracks },
    ...payload.tallyDeltas.map((delta): TransportBackendEvent => ({ type: "tallyDelta", runId: payload.runId, delta })),
    {
      type: "runCompleted",
      runId: payload.runId,
      summary: {
        completedHistories: payload.completedHistories,
        totalHistories: payload.totalHistories,
        sampledTrackCount: payload.tracks.length,
        tallyCount: payload.tallyDeltas.length,
        diagnostics: payload.diagnostics,
      },
    },
  ];
}

function nativeBridgeUnavailableDiagnostic(problemId: string, runId: string): TransportBackendDiagnostic {
  return {
    level: "error",
    code: "native.bridge.unavailable",
    message: "Native Rust photon backend bridge is not available in this runtime.",
    problemId,
    runId,
  };
}
