import type {
    Diagnostic,
    Project,
    TrackSample,
    TransportBackendDiagnostic,
    TransportBackendEvent,
    TransportRunProvenance,
    TransportRunSummary,
    TransportTallyDelta,
    TransportTrackSample,
} from "@transport/domain";
import type {CompileDiagnostic, CompileResult} from "@transport/domain/compile/CompileTransportProblem";
import type {TransportProblem} from "@transport/domain/transport/TransportProblem";
import {
    runNativePhotonSmokeBackend,
    type NativePhotonSmokeBridge,
} from "@transport/transport-worker";
import {runToyPhotonTransport} from "@transport/transport-visual";

export type RunSessionStatus = "idle" | "compiling" | "running" | "completed" | "failed";
export type RunSessionFreshness = "empty" | "fresh" | "stale";

export interface RunSessionProgress {
    readonly completedHistories: number;
    readonly totalHistories: number;
}

export interface RunSessionState {
    readonly status: RunSessionStatus;
    readonly backend: Project["runConfiguration"]["backend"];
    readonly runId: string | null;
    readonly progress: RunSessionProgress | null;
    readonly diagnostics: readonly Diagnostic[];
    readonly tracks: readonly TrackSample[];
    readonly tallies: readonly TransportTallyDelta[];
    readonly provenance: TransportRunProvenance | null;
    readonly summary: TransportRunSummary | null;
    readonly freshness: RunSessionFreshness;
    readonly sceneRevision: number;
    readonly resultSceneRevision: number | null;
    readonly attemptId: string | null;
}

export type RunSessionAction =
    | {readonly type: "compilation-started"; readonly backend: RunSessionState["backend"]; readonly sceneRevision: number; readonly attemptId: string}
    | {readonly type: "compilation-failed"; readonly diagnostics: readonly Diagnostic[]; readonly sceneRevision: number; readonly attemptId: string}
    | {readonly type: "diagnostics-observed"; readonly diagnostics: readonly Diagnostic[]; readonly sceneRevision: number; readonly attemptId: string}
    | {readonly type: "backend-event"; readonly event: TransportBackendEvent; readonly sceneRevision: number; readonly attemptId: string}
    | {readonly type: "toy-completed"; readonly tracks: readonly TrackSample[]; readonly histories: number; readonly seed: number; readonly problemId: string; readonly sceneRevision: number; readonly attemptId: string}
    | {readonly type: "scene-changed"}
    | {readonly type: "clear"};

export interface NativeRunSessionDependencies {
    readonly runBackend?: (
        problem: TransportProblem,
        bridge?: NativePhotonSmokeBridge,
    ) => Promise<readonly TransportBackendEvent[]>;
}

export interface ToyRunSessionDependencies {
    readonly runToy?: typeof runToyPhotonTransport;
}

export function createRunSession(
    backend: RunSessionState["backend"],
): RunSessionState {
    return {
        status: "idle",
        backend,
        runId: null,
        progress: null,
        diagnostics: [],
        tracks: [],
        tallies: [],
        provenance: null,
        summary: null,
        freshness: "empty",
        sceneRevision: 0,
        resultSceneRevision: null,
        attemptId: null,
    };
}

export function reduceRunSession(
    state: RunSessionState,
    action: RunSessionAction,
): RunSessionState {
    switch (action.type) {
        case "compilation-started":
            if (action.sceneRevision !== state.sceneRevision) return state;
            return {
                ...createRunSession(action.backend),
                status: "compiling",
                sceneRevision: state.sceneRevision,
                attemptId: action.attemptId,
            };
        case "compilation-failed":
            if (!matchesActiveAttempt(state, action) || state.status !== "compiling") return state;
            return {
                ...state,
                status: "failed",
                diagnostics: action.diagnostics,
                freshness: "empty",
            };
        case "diagnostics-observed":
            if (
                !matchesActiveAttempt(state, action)
                || (state.status !== "compiling" && state.status !== "running")
            ) return state;
            return {...state, diagnostics: [...state.diagnostics, ...action.diagnostics]};
        case "backend-event":
            if (
                !matchesActiveAttempt(state, action)
                || (state.status !== "compiling" && state.status !== "running")
            ) return state;
            return reduceBackendEvent(state, action.event);
        case "toy-completed":
            if (!matchesActiveAttempt(state, action) || state.status !== "compiling") return state;
            return {
                ...state,
                status: "completed",
                backend: "visual-ts",
                runId: `toy-${action.seed}`,
                progress: {
                    completedHistories: action.histories,
                    totalHistories: action.histories,
                },
                tracks: action.tracks,
                tallies: [],
                diagnostics: [],
                provenance: {
                    backendId: "visual-ts" as TransportRunProvenance["backendId"],
                    backendVersion: "prototype",
                    problemId: action.problemId as TransportRunProvenance["problemId"],
                    seed: action.seed,
                    dataPolicy: "toy",
                    warnings: [],
                },
                summary: {
                    completedHistories: action.histories,
                    totalHistories: action.histories,
                    sampledTrackCount: action.tracks.length,
                    tallyCount: 0,
                    diagnostics: [],
                },
                freshness: "fresh",
                resultSceneRevision: action.sceneRevision,
            };
        case "scene-changed":
            if (state.status === "compiling" || state.status === "running") {
                return {
                    ...createRunSession(state.backend),
                    sceneRevision: state.sceneRevision + 1,
                    diagnostics: [...state.diagnostics, {
                        severity: "warning",
                        message: "run.scene-changed: Run invalidated because the Editable Scene changed.",
                    }],
                };
            }
            return {
                ...state,
                sceneRevision: state.sceneRevision + 1,
                freshness: state.freshness === "fresh" ? "stale" : state.freshness,
            };
        case "clear":
            return {...createRunSession(state.backend), sceneRevision: state.sceneRevision};
    }
}

export function createToyRunActions(
    project: Project,
    compileResult: CompileResult<TransportProblem>,
    sceneRevision: number,
    attemptId: string,
    dependencies: ToyRunSessionDependencies = {},
): readonly RunSessionAction[] {
    const actions: RunSessionAction[] = [{
        type: "compilation-started",
        backend: "visual-ts",
        sceneRevision,
        attemptId,
    }];
    if (!compileResult.ok || !compileResult.value) {
        return [...actions, {
            type: "compilation-failed",
            diagnostics: compileResult.diagnostics.map(convertCompileDiagnostic),
            sceneRevision,
            attemptId,
        }];
    }
    const result = (dependencies.runToy ?? runToyPhotonTransport)(compileResult.value, {
        visibleHistoryBudget: project.runConfiguration.visibleHistoryBudget,
    });
    return [...actions, {
        type: "toy-completed",
        tracks: result.tracks,
        histories: compileResult.value.settings.histories,
        seed: compileResult.value.settings.seed,
        problemId: compileResult.value.id,
        sceneRevision,
        attemptId,
    }];
}

export async function createNativeRunActions(
    compileResult: CompileResult<TransportProblem>,
    sceneRevision: number,
    attemptId: string,
    bridge?: NativePhotonSmokeBridge,
    dependencies: NativeRunSessionDependencies = {},
): Promise<readonly RunSessionAction[]> {
    const compileDiagnostics = compileResult.diagnostics.map(convertCompileDiagnostic);
    if (!compileResult.ok || !compileResult.value) {
        return [{
            type: "compilation-failed",
            diagnostics: compileDiagnostics,
            sceneRevision,
            attemptId,
        }];
    }

    let events: readonly TransportBackendEvent[];
    try {
        events = await (dependencies.runBackend ?? runNativePhotonSmokeBackend)(
            compileResult.value,
            bridge,
        );
    } catch (error) {
        return [{
            type: "backend-event",
            event: {
                type: "runFailed",
                diagnostic: {
                    level: "error",
                    code: "native.adapter.rejected",
                    message: error instanceof Error ? error.message : "Native backend adapter rejected.",
                },
            },
            sceneRevision,
            attemptId,
        }];
    }
    const compileDiagnosticActions: RunSessionAction[] = compileDiagnostics.length > 0
        ? [{type: "diagnostics-observed", diagnostics: compileDiagnostics, sceneRevision, attemptId}]
        : [];
    return [
        ...compileDiagnosticActions,
        ...events.map((event): RunSessionAction => ({
            type: "backend-event",
            event,
            sceneRevision,
            attemptId,
        })),
    ];
}

export function reduceRunSessionActions(
    initial: RunSessionState,
    actions: readonly RunSessionAction[],
): RunSessionState {
    return actions.reduce(reduceRunSession, initial);
}

function matchesActiveAttempt(
    state: RunSessionState,
    action: {readonly sceneRevision: number; readonly attemptId: string},
): boolean {
    return action.sceneRevision === state.sceneRevision && action.attemptId === state.attemptId;
}

function reduceBackendEvent(
    state: RunSessionState,
    event: TransportBackendEvent,
): RunSessionState {
    switch (event.type) {
        case "backendMetadata":
            return state;
        case "problemAccepted":
            return appendDiagnostics(state, event.diagnostics);
        case "runStarted":
            if (state.status !== "compiling") return state;
            return {
                ...state,
                status: "running",
                runId: event.runId,
                provenance: event.provenance,
            };
        case "runProgress":
            if (state.status !== "running" || event.runId !== state.runId) return state;
            return {
                ...state,
                status: "running",
                progress: {
                    completedHistories: event.completedHistories,
                    totalHistories: event.totalHistories,
                },
            };
        case "trackSamples":
            if (state.status !== "running" || event.runId !== state.runId) return state;
            return {
                ...state,
                status: "running",
                tracks: [...state.tracks, ...event.samples.map(convertTransportTrackSample)],
            };
        case "tallyDelta":
            if (state.status !== "running" || event.runId !== state.runId) return state;
            return {...state, status: "running", tallies: [...state.tallies, event.delta]};
        case "diagnostic":
            return appendDiagnostics(state, [event.diagnostic]);
        case "runCompleted":
            if (
                state.status !== "running"
                || event.runId !== state.runId
                || state.provenance === null
            ) return state;
            return {
                ...appendDiagnostics(state, event.summary.diagnostics),
                status: "completed",
                runId: event.runId,
                progress: {
                    completedHistories: event.summary.completedHistories,
                    totalHistories: event.summary.totalHistories,
                },
                summary: event.summary,
                freshness: "fresh",
                resultSceneRevision: state.sceneRevision,
            };
        case "runFailed": {
            if (event.runId && state.runId && event.runId !== state.runId) return state;
            const failed = appendDiagnostics(state, [event.diagnostic]);
            return {
                ...failed,
                status: "failed",
                runId: event.runId ?? state.runId,
            };
        }
    }
}

function appendDiagnostics(
    state: RunSessionState,
    diagnostics: readonly TransportBackendDiagnostic[],
): RunSessionState {
    const converted = diagnostics.map(convertBackendDiagnostic);
    return {
        ...state,
        diagnostics: [...state.diagnostics, ...converted],
    };
}

function convertCompileDiagnostic(diagnostic: CompileDiagnostic): Diagnostic {
    return {
        severity: diagnostic.level,
        message: `${diagnostic.code}: ${diagnostic.message}`,
        entityId: diagnostic.entityId as Diagnostic["entityId"],
    };
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
