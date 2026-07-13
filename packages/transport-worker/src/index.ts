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
import {
  createNativeExecutionRequest,
  parseNativeExecutionResponse,
  type NativeExecutionRequest,
} from "@transport/native-execution-contract";

export {
  createNativePhotonSmokeFixtureProblem,
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
  readonly runPhotonSmoke: (request: NativeExecutionRequest) => Promise<unknown>;
}

export async function runNativePhotonSmokeBackend(
  problem: TransportProblem,
  runSessionId: string,
  bridge?: NativePhotonSmokeBridge,
): Promise<readonly TransportBackendEvent[]> {
  if (!bridge) {
    return [
      { type: "backendMetadata", metadata: nativeRustPhotonBackendMetadata },
      {
        type: "runFailed",
        runId: runSessionId,
        diagnostic: nativeBridgeUnavailableDiagnostic(problem.id, runSessionId),
      },
    ];
  }

  try {
    const response = parseNativeExecutionResponse(
      await bridge.runPhotonSmoke(createNativeExecutionRequest(runSessionId, problem)),
    );
    return response.events;
  } catch (error) {
    const diagnostic: TransportBackendDiagnostic = {
      level: "error",
      code: "native.adapter.transport_failure",
      message: error instanceof Error ? error.message : "Native adapter transport failed.",
      problemId: problem.id,
      runId: runSessionId,
    };
    return [
      {type: "backendMetadata", metadata: nativeRustPhotonBackendMetadata},
      {type: "runFailed", runId: runSessionId, diagnostic},
    ];
  }
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
