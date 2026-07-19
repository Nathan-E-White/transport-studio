import type {
    Diagnostic,
    Project,
    TrackSample,
    TransportBackendDiagnostic,
    TransportBackendEvent,
    TransportBackendMetadata,
    TransportRunProvenance,
    TransportRunSummary,
    TransportTallyDelta,
    TransportTrackSample,
} from "@transport/domain";
import {NATIVE_RUST_PHOTON_BACKEND_ID, VISUAL_TS_BACKEND_ID} from "@transport/domain";
import type {TransportProblem} from "@transport/domain/transport/TransportProblem";

export type RunSessionStatus = "prepared" | "running" | "completed" | "failed";
export type RunResultView = "current" | "submitted";
export type RunJournalStatus = "disabled" | "capturing" | "complete" | "incomplete";
export type RunSessionFreshness = "empty" | "fresh" | "stale";
export type RunSessionPhase =
    | "awaiting-acceptance"
    | "accepted"
    | "started"
    | "progress"
    | "tracks"
    | "tallies"
    | "diagnostics"
    | "terminal";

export interface RunSessionDiagnostic extends Diagnostic {
    readonly code: string;
}

export interface RunSessionProgress {
    readonly completedHistories: number;
    readonly totalHistories: number;
}

export interface HeavyAssetReference {
    readonly reference: string;
    readonly fingerprint: string;
}

export interface RunInputRecord {
    readonly recordVersion: "1.0.0";
    readonly problem: TransportProblem;
    readonly exactInputFingerprint: string;
    readonly sourceSceneRevision: number;
    readonly sourceSceneFingerprint: string;
    readonly submittedScene: {
        readonly project: Project;
    };
    readonly heavyAssets: readonly HeavyAssetReference[];
}

export interface RunSessionState {
    readonly id: string;
    readonly status: RunSessionStatus;
    readonly adapterMetadata: TransportBackendMetadata;
    readonly progress: RunSessionProgress | null;
    readonly diagnostics: readonly RunSessionDiagnostic[];
    readonly tracks: readonly TrackSample[];
    readonly tallies: readonly TransportTallyDelta[];
    readonly provenance: TransportRunProvenance | null;
    readonly summary: TransportRunSummary | null;
    readonly terminalFailure: TransportBackendDiagnostic | null;
    readonly input: RunInputRecord;
    readonly journal: {
        readonly status: RunJournalStatus;
        readonly finalSequence: number;
    };
    readonly phase: RunSessionPhase;
}

export interface RunRenderingBlock {
    readonly submittedRevision: number;
    readonly currentRevision: number;
    readonly message: string;
}

export interface RunSessionStoreSnapshot {
    readonly sceneRevision: number;
    readonly sceneFingerprint: string;
    readonly current: RunSessionState | null;
    readonly resultView: RunResultView;
    readonly renderingBlock: RunRenderingBlock | null;
}

export interface RunExecutionAdapter {
    readonly metadata: TransportBackendMetadata;
    readonly execute: (request: {
        readonly sessionId: string;
        readonly problem: TransportProblem;
    }) => AsyncIterable<TransportBackendEvent>;
}

export interface RunEventSink {
    readonly preflight: () => Promise<void>;
    readonly write: (line: string) => Promise<void>;
    readonly close?: () => Promise<void>;
}

export interface StartRunOptions {
    readonly project: Project;
    readonly problem: TransportProblem;
    readonly adapter: RunExecutionAdapter;
    readonly sink?: RunEventSink;
    readonly heavyAssets?: readonly HeavyAssetReference[];
}

export type StartRunResult =
    | {readonly started: true; readonly sessionId: string}
    | {readonly started: false; readonly diagnostic: RunSessionDiagnostic};

export interface RunSessionStore {
    readonly getSnapshot: () => RunSessionStoreSnapshot;
    readonly subscribe: (listener: () => void) => () => void;
    readonly subscribeSelector: <T>(
        selector: (snapshot: RunSessionStoreSnapshot) => T,
        listener: () => void,
        isEqual?: (left: T, right: T) => boolean,
    ) => () => void;
    readonly start: (options: StartRunOptions) => Promise<StartRunResult>;
    readonly updateEditableScene: (project: Project) => Promise<RunSessionStoreSnapshot>;
    readonly setResultView: (view: RunResultView) => RunSessionStoreSnapshot;
    readonly clear: () => RunSessionStoreSnapshot;
}

export interface CreateRunSessionStoreOptions {
    readonly initialProject: Project;
    readonly createSessionId?: () => string;
    readonly now?: () => string;
}

const EMPTY_TRACKS: readonly TrackSample[] = Object.freeze([]);
const EMPTY_TALLIES: readonly TransportTallyDelta[] = Object.freeze([]);
const EMPTY_DIAGNOSTICS: readonly RunSessionDiagnostic[] = Object.freeze([]);
const JOURNAL_VERSION = "1.0.0" as const;

export function createRunSessionStore(options: CreateRunSessionStoreOptions): RunSessionStore {
    const listeners = new Set<() => void>();
    const createSessionId = options.createSessionId ?? (() => globalThis.crypto.randomUUID());
    const now = options.now ?? (() => new Date().toISOString());
    let sceneCanonical = stableSerialize(options.initialProject.scene);
    let executionActive = false;
    let snapshot: RunSessionStoreSnapshot = Object.freeze({
        sceneRevision: 0,
        sceneFingerprint: "",
        current: null,
        resultView: "current",
        renderingBlock: null,
    });

    function publish(next: RunSessionStoreSnapshot): RunSessionStoreSnapshot {
        if (next === snapshot) return snapshot;
        snapshot = Object.freeze(next);
        for (const listener of listeners) listener();
        return snapshot;
    }

    function publishCurrent(current: RunSessionState | null): RunSessionStoreSnapshot {
        return publish(withRenderingBlock({...snapshot, current}));
    }

    async function start(run: StartRunOptions): Promise<StartRunResult> {
        if (run.problem.status !== "compiled") {
            return {
                started: false,
                diagnostic: diagnostic(
                    "run.session.problem_not_compiled",
                    `Run Session requires a compiled problem; received '${run.problem.status}'.`,
                ),
            };
        }
        if (executionActive) {
            return {
                started: false,
                diagnostic: diagnostic(
                    "run.session.concurrent_unsupported",
                    "A Run Session is already executing; concurrent sessions are outside the current contract.",
                ),
            };
        }
        executionActive = true;
        if (run.sink) {
            try {
                await run.sink.preflight();
            } catch (error) {
                executionActive = false;
                return {
                    started: false,
                    diagnostic: diagnostic(
                        "run.journal.preflight_failed",
                        errorMessage(error, "Run journal preflight failed."),
                    ),
                };
            }
        }

        const sessionId = createSessionId();
        const input = await createRunInputRecord(
            run.problem,
            run.project,
            snapshot.sceneRevision,
            run.heavyAssets ?? [],
        );
        sceneCanonical = stableSerialize(run.project.scene);
        let session: RunSessionState = Object.freeze({
            id: sessionId,
            status: "prepared",
            adapterMetadata: deepFreeze(structuredClone(run.adapter.metadata)),
            progress: null,
            diagnostics: EMPTY_DIAGNOSTICS,
            tracks: EMPTY_TRACKS,
            tallies: EMPTY_TALLIES,
            provenance: null,
            summary: null,
            terminalFailure: null,
            input,
            journal: Object.freeze({status: run.sink ? "capturing" : "disabled", finalSequence: 0}),
            phase: "awaiting-acceptance",
        });
        publish({...snapshot, sceneFingerprint: input.sourceSceneFingerprint, current: session, resultView: "current", renderingBlock: null});
        const publishSession = () => snapshot.current?.id === sessionId
            ? publishCurrent(session)
            : snapshot;

        const journal = createJournal(run.sink, input, sessionId, run.adapter.metadata, now);
        const openingFailure = await journal.open();
        if (openingFailure) {
            session = withJournalFailure(session, openingFailure, journal.sequence());
            publishSession();
        }

        try {
            for await (const event of run.adapter.execute({sessionId, problem: input.problem})) {
                const journalFailure = await journal.event(event);
                if (journalFailure && session.journal.status !== "incomplete") {
                    session = withJournalFailure(session, journalFailure, journal.sequence());
                }
                session = reduceBackendEvent(session, event);
                publishSession();
                if (session.status === "failed" && session.terminalFailure?.code === "run.session.protocol_violation") break;
            }
        } catch (error) {
            session = failSession(session, diagnostic(
                "run.adapter.rejected",
                errorMessage(error, "Run execution adapter rejected."),
            ));
            publishSession();
        }

        if (session.status !== "completed" && session.status !== "failed") {
            session = protocolViolation(session, "Adapter event sequence ended without a terminal event.");
            publishSession();
        }

        const closingFailure = await journal.close(session);
        if (closingFailure && session.journal.status !== "incomplete") {
            session = withJournalFailure(session, closingFailure, journal.sequence());
        } else {
            session = Object.freeze({
                ...session,
                journal: Object.freeze({
                    status: run.sink && session.journal.status !== "incomplete" ? "complete" : session.journal.status,
                    finalSequence: journal.sequence(),
                }),
            });
        }
        publishSession();
        executionActive = false;
        return {started: true, sessionId};
    }

    async function updateEditableScene(project: Project): Promise<RunSessionStoreSnapshot> {
        const nextCanonical = stableSerialize(project.scene);
        if (nextCanonical === sceneCanonical) return snapshot;
        sceneCanonical = nextCanonical;
        const sceneFingerprint = await sha256(nextCanonical);
        return publish(withRenderingBlock({
            ...snapshot,
            sceneRevision: snapshot.sceneRevision + 1,
            sceneFingerprint,
            resultView: "current",
        }));
    }

    return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        subscribeSelector(selector, listener, isEqual = Object.is) {
            let selected = selector(snapshot);
            const notify = () => {
                const next = selector(snapshot);
                if (isEqual(selected, next)) return;
                selected = next;
                listener();
            };
            listeners.add(notify);
            return () => listeners.delete(notify);
        },
        start,
        updateEditableScene,
        setResultView(view) {
            if (view === snapshot.resultView) return snapshot;
            return publish(withRenderingBlock({...snapshot, resultView: view}));
        },
        clear() {
            return publish({...snapshot, current: null, resultView: "current", renderingBlock: null});
        },
    };
}

export function selectRenderableTracks(snapshot: RunSessionStoreSnapshot): readonly TrackSample[] {
    if (!snapshot.current) return EMPTY_TRACKS;
    return canRenderResults(snapshot) ? snapshot.current.tracks : EMPTY_TRACKS;
}

export function selectRenderableTallies(snapshot: RunSessionStoreSnapshot): readonly TransportTallyDelta[] {
    if (!snapshot.current) return EMPTY_TALLIES;
    return canRenderResults(snapshot) ? snapshot.current.tallies : EMPTY_TALLIES;
}

export function selectRunDiagnostics(snapshot: RunSessionStoreSnapshot): readonly RunSessionDiagnostic[] {
    return snapshot.current?.diagnostics ?? EMPTY_DIAGNOSTICS;
}

export function selectCurrentRunSession(snapshot: RunSessionStoreSnapshot): RunSessionState | null {
    return snapshot.current;
}

export function selectRunBackend(snapshot: RunSessionStoreSnapshot): Project["runConfiguration"]["backend"] {
    if (!snapshot.current) return "visual-ts";
    switch (snapshot.current.adapterMetadata.id) {
        case VISUAL_TS_BACKEND_ID: return "visual-ts";
        case NATIVE_RUST_PHOTON_BACKEND_ID: return "native";
        case "web-worker": return "web-worker";
        case "webgpu": return "webgpu";
        default: return snapshot.current.input.submittedScene.project.runConfiguration.backend;
    }
}

export function selectRunFreshness(snapshot: RunSessionStoreSnapshot): RunSessionFreshness {
    if (!snapshot.current || snapshot.current.status === "prepared" || snapshot.current.status === "running") return "empty";
    return snapshot.renderingBlock ? "stale" : "fresh";
}

export function selectRenderingBlock(snapshot: RunSessionStoreSnapshot): RunRenderingBlock | null {
    return snapshot.renderingBlock;
}

export function selectResultView(snapshot: RunSessionStoreSnapshot): RunResultView {
    return snapshot.resultView;
}

export function selectSubmittedProject(snapshot: RunSessionStoreSnapshot): Project | null {
    return snapshot.current?.input.submittedScene.project ?? null;
}

export function selectPresentationProject(snapshot: RunSessionStoreSnapshot, current: Project): Project {
    if (snapshot.resultView === "submitted" && snapshot.current && snapshot.renderingBlock) {
        return snapshot.current.input.submittedScene.project;
    }
    return current;
}

async function createRunInputRecord(
    problem: TransportProblem,
    project: Project,
    sourceSceneRevision: number,
    heavyAssets: readonly HeavyAssetReference[],
): Promise<RunInputRecord> {
    const exactProblem = deepFreeze(structuredClone(problem));
    const submittedProject = deepFreeze(structuredClone(project));
    const exactInputFingerprint = await sha256(stableSerialize(exactProblem));
    const sourceSceneFingerprint = await sha256(stableSerialize(submittedProject.scene));
    return deepFreeze({
        recordVersion: "1.0.0" as const,
        problem: exactProblem,
        exactInputFingerprint,
        sourceSceneRevision,
        sourceSceneFingerprint,
        submittedScene: {project: submittedProject},
        heavyAssets: structuredClone(heavyAssets),
    });
}

function reduceBackendEvent(state: RunSessionState, event: TransportBackendEvent): RunSessionState {
    if (state.status === "completed" || state.status === "failed") {
        return protocolViolation(state, `Event '${event.type}' arrived after a terminal event.`);
    }
    if (event.type !== "backendMetadata" && event.type !== "problemAccepted") {
        const eventSessionId = "runId" in event ? event.runId : undefined;
        if (typeof eventSessionId !== "string") {
            return protocolViolation(state, `Event '${event.type}' did not echo caller session '${state.id}'.`);
        }
        if (eventSessionId !== state.id) {
            return protocolViolation(state, `Event '${event.type}' used session '${eventSessionId}' instead of '${state.id}'.`);
        }
    }
    switch (event.type) {
        case "backendMetadata":
            return protocolViolation(state, "Adapter metadata must be supplied by the adapter, not repeated in its event sequence.");
        case "problemAccepted":
            if (state.phase !== "awaiting-acceptance" || event.problemId !== state.input.problem.id) {
                return protocolViolation(state, "Problem acceptance was missing, duplicated, or referred to another problem.");
            }
            return Object.freeze({...appendDiagnostics(state, event.diagnostics), phase: "accepted"});
        case "runStarted":
            if (state.phase !== "accepted" || event.problemId !== state.input.problem.id) {
                return protocolViolation(state, "Run start must follow acceptance for the submitted problem.");
            }
            return Object.freeze({
                ...state,
                status: "running",
                provenance: deepFreeze(structuredClone(event.provenance)),
                phase: "started",
            });
        case "runProgress":
            return reduceMiddle(state, event, "progress", {
                progress: Object.freeze({completedHistories: event.completedHistories, totalHistories: event.totalHistories}),
            });
        case "trackSamples":
            return reduceMiddle(state, event, "tracks", {
                tracks: deepFreeze([...state.tracks, ...event.samples.map(convertTransportTrackSample)]),
            });
        case "tallyDelta":
            return reduceMiddle(state, event, "tallies", {
                tallies: deepFreeze([...state.tallies, structuredClone(event.delta)]),
            });
        case "diagnostic":
            return reduceMiddle(appendDiagnostics(state, [event.diagnostic]), event, "diagnostics", {});
        case "runCompleted":
            if (state.status !== "running" || phaseRank(state.phase) < phaseRank("started")) {
                return protocolViolation(state, "Completion must follow run start.");
            }
            return Object.freeze({
                ...appendDiagnostics(state, event.summary.diagnostics),
                status: "completed",
                progress: Object.freeze({
                    completedHistories: event.summary.completedHistories,
                    totalHistories: event.summary.totalHistories,
                }),
                summary: deepFreeze(structuredClone(event.summary)),
                phase: "terminal",
            });
        case "runFailed":
            return Object.freeze({
                ...appendDiagnostics(state, [event.diagnostic]),
                status: "failed",
                terminalFailure: deepFreeze(structuredClone(event.diagnostic)),
                phase: "terminal",
            });
    }
}

function reduceMiddle(
    state: RunSessionState,
    event: TransportBackendEvent,
    phase: Exclude<RunSessionPhase, "awaiting-acceptance" | "accepted" | "started" | "terminal">,
    patch: Partial<RunSessionState>,
): RunSessionState {
    if (state.status !== "running" || phaseRank(phase) < phaseRank(state.phase)) {
        return protocolViolation(state, `Event '${event.type}' is out of lifecycle order.`);
    }
    return Object.freeze({...state, ...patch, phase});
}

function protocolViolation(state: RunSessionState, message: string): RunSessionState {
    return failSession(state, diagnostic("run.session.protocol_violation", message));
}

function failSession(state: RunSessionState, failure: RunSessionDiagnostic): RunSessionState {
    const backendFailure: TransportBackendDiagnostic = Object.freeze({
        level: "error",
        code: failure.code,
        message: failure.message,
        runId: state.id,
    });
    return Object.freeze({
        ...state,
        status: "failed",
        diagnostics: Object.freeze([...state.diagnostics, failure]),
        terminalFailure: backendFailure,
        phase: "terminal",
    });
}

function appendDiagnostics(
    state: RunSessionState,
    diagnostics: readonly TransportBackendDiagnostic[],
): RunSessionState {
    if (diagnostics.length === 0) return state;
    return Object.freeze({
        ...state,
        diagnostics: Object.freeze([
            ...state.diagnostics,
            ...diagnostics.map((item) => diagnostic(item.code, item.message, item.level, item.entityId)),
        ]),
    });
}

function withJournalFailure(state: RunSessionState, failure: Error, sequence: number): RunSessionState {
    return Object.freeze({
        ...appendDiagnostics(state, [{
            level: "error",
            code: "run.journal.write_failed",
            message: errorMessage(failure, "Run journal write failed."),
        }]),
        journal: Object.freeze({status: "incomplete", finalSequence: sequence}),
    });
}

function createJournal(
    sink: RunEventSink | undefined,
    input: RunInputRecord,
    sessionId: string,
    adapterMetadata: TransportBackendMetadata,
    now: () => string,
) {
    let active = sink !== undefined;
    let sequence = 0;
    const digestLines: string[] = [];

    async function write(record: object): Promise<Error | null> {
        if (!active || !sink) return null;
        const line = `${JSON.stringify(record)}\n`;
        try {
            await sink.write(line);
            digestLines.push(line);
            return null;
        } catch (error) {
            active = false;
            return error instanceof Error ? error : new Error(String(error));
        }
    }

    return {
        sequence: () => sequence,
        open: () => write({
            journalVersion: JOURNAL_VERSION,
            recordType: "runInput",
            sessionId,
            sequence,
            observedAt: now(),
            adapterMetadata,
            input,
        }),
        async event(event: TransportBackendEvent) {
            sequence += 1;
            return write({journalVersion: JOURNAL_VERSION, recordType: "event", sessionId, sequence, observedAt: now(), event});
        },
        async close(state: RunSessionState): Promise<Error | null> {
            if (!active || !sink) return null;
            const integrityDigest = await sha256(digestLines.join(""));
            const failure = await write({
                journalVersion: JOURNAL_VERSION,
                recordType: "closing",
                sessionId,
                sequence: sequence + 1,
                observedAt: now(),
                terminalStatus: state.status,
                counts: {
                    tracks: state.tracks.length,
                    tallies: state.tallies.length,
                    diagnostics: state.diagnostics.length,
                },
                finalSequence: sequence,
                integrityDigest,
            });
            if (!failure) sequence += 1;
            if (sink.close) {
                try {
                    await sink.close();
                } catch (error) {
                    return error instanceof Error ? error : new Error(String(error));
                }
            }
            return failure;
        },
    };
}

function canRenderResults(snapshot: RunSessionStoreSnapshot): boolean {
    return snapshot.current!.input.sourceSceneRevision === snapshot.sceneRevision
        || snapshot.resultView === "submitted";
}

function withRenderingBlock(snapshot: RunSessionStoreSnapshot): RunSessionStoreSnapshot {
    const submitted = snapshot.current?.input.sourceSceneRevision;
    if (submitted === undefined || submitted === snapshot.sceneRevision) {
        return {...snapshot, renderingBlock: null};
    }
    return {
        ...snapshot,
        renderingBlock: Object.freeze({
            submittedRevision: submitted,
            currentRevision: snapshot.sceneRevision,
            message: `Results were submitted from Editable Scene revision ${submitted}; the current revision is ${snapshot.sceneRevision}.`,
        }),
    };
}

function diagnostic(
    code: string,
    message: string,
    severity: RunSessionDiagnostic["severity"] = "error",
    entityId?: string,
): RunSessionDiagnostic {
    return Object.freeze({
        code,
        severity,
        message: message.startsWith(`${code}:`) ? message : `${code}: ${message}`,
        entityId: entityId as Diagnostic["entityId"],
    });
}

function convertTransportTrackSample(sample: TransportTrackSample): TrackSample {
    return deepFreeze({
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
    });
}

const PHASE_ORDER: Readonly<Record<RunSessionPhase, number>> = Object.freeze({
    "awaiting-acceptance": 0,
    accepted: 1,
    started: 2,
    progress: 3,
    tracks: 4,
    tallies: 5,
    diagnostics: 6,
    terminal: 7,
});

function phaseRank(phase: RunSessionPhase): number {
    return PHASE_ORDER[phase];
}

function stableSerialize(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined)
        .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
}

async function sha256(value: string): Promise<string> {
    const bytes = new TextEncoder().encode(value);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function deepFreeze<T>(value: T): T {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    }
    return value;
}

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
}
