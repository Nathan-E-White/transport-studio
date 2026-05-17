import type { Diagnostic, Project, RunConfiguration, TallyDelta, TrackSample } from "@transport/domain";

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
