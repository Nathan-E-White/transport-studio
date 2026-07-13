import {describe, expect, it, vi} from "vitest";
import type {Project, TransportBackendEvent, TransportBackendMetadata} from "@transport/domain";
import type {TransportProblem} from "@transport/domain/transport/TransportProblem";
import {
    createRunSessionStore,
    selectPresentationProject,
    selectRenderableTallies,
    selectRenderableTracks,
    selectResultView,
    selectRunBackend,
    selectRunDiagnostics,
    selectRunFreshness,
    selectSubmittedProject,
    type RunExecutionAdapter,
    type RunEventSink,
} from "./runSession";

describe("strict external Run Session store", () => {
    it("assigns identity, preserves exact input, and consumes one asynchronous adapter contract", async () => {
        const project = fixtureProject();
        const problem = fixtureProblem();
        const adapter = adapterFrom(canonicalEvents("session-1"));
        const store = createRunSessionStore({
            initialProject: project,
            createSessionId: () => "session-1",
            now: sequenceClock(),
        });

        const result = await store.start({project, problem, adapter});

        expect(result).toEqual({started: true, sessionId: "session-1"});
        expect(adapter.execute).toHaveBeenCalledWith({sessionId: "session-1", problem});
        expect(store.getSnapshot().current).toMatchObject({
            id: "session-1",
            status: "completed",
            progress: {completedHistories: 1, totalHistories: 1},
            summary: {completedHistories: 1, sampledTrackCount: 1, tallyCount: 1},
        });
        expect(store.getSnapshot().current?.journal).toEqual({status: "disabled", finalSequence: 7});
        expect(store.getSnapshot().current?.provenance).toEqual({
            backendId: "fixture-backend", backendVersion: "1", problemId: "problem-1", seed: 7,
            dataPolicy: "toy", warnings: [],
        });
        expect(store.getSnapshot().current?.tracks).toEqual([{historyId: "h-1", events: []}]);
        expect(store.getSnapshot().current?.tallies).toEqual([{tallyId: "t-1", scores: [1]}]);
        const input = store.getSnapshot().current?.input;
        expect(input?.problem).toEqual(problem);
        expect(input?.exactInputFingerprint).toMatch(/^[a-f0-9]{64}$/);
        expect(input?.sourceSceneFingerprint).toMatch(/^[a-f0-9]{64}$/);
        expect(input?.submittedScene.project.scene).toEqual(project.scene);
        expect(input?.heavyAssets).toEqual([]);
        expect(Object.isFrozen(input?.problem)).toBe(true);
        expect(Object.isFrozen(input?.submittedScene.project.scene)).toBe(true);
    });

    it("turns invalid order, mismatched identity, and post-terminal events into protocol violations", async () => {
        for (const events of [
            [started("session-1"), accepted(), completed("session-1")],
            [accepted(), started("other-session"), completed("other-session")],
            [...canonicalEvents("session-1"), progress("session-1")],
            [accepted(), started("session-1"), {type: "runFailed", diagnostic: {
                level: "error", code: "fixture.failure", message: "Missing caller id.",
            }} as TransportBackendEvent],
        ]) {
            const store = createRunSessionStore({
                initialProject: fixtureProject(),
                createSessionId: () => "session-1",
            });
            await store.start({
                project: fixtureProject(),
                problem: fixtureProblem(),
                adapter: adapterFrom(events),
            });
            expect(store.getSnapshot().current).toMatchObject({
                status: "failed",
                terminalFailure: {code: "run.session.protocol_violation"},
            });
        }
    });

    it("stops requesting adapter events after the first protocol violation", async () => {
        const steps: string[] = [];
        const adapter: RunExecutionAdapter = {
            metadata,
            async *execute() {
                steps.push("invalid");
                yield started("session-1");
                steps.push("must-not-run");
                yield accepted();
            },
        };
        const store = createRunSessionStore({initialProject: fixtureProject(), createSessionId: () => "session-1"});
        await store.start({project: fixtureProject(), problem: fixtureProblem(), adapter});
        expect(steps).toEqual(["invalid"]);
        expect(store.getSnapshot().current?.terminalFailure?.code).toBe("run.session.protocol_violation");
        expect(Object.isFrozen(store.getSnapshot().current?.terminalFailure)).toBe(true);
    });

    it("allows repeated middle phases and completion immediately after start", async () => {
        const repeated = [
            accepted(), started("session-1"),
            progress("session-1"), progress("session-1"),
            {type: "trackSamples", runId: "session-1", samples: []} as TransportBackendEvent,
            {type: "trackSamples", runId: "session-1", samples: []} as TransportBackendEvent,
            {type: "tallyDelta", runId: "session-1", delta: {tallyId: "t", scores: []}} as TransportBackendEvent,
            {type: "tallyDelta", runId: "session-1", delta: {tallyId: "t", scores: []}} as TransportBackendEvent,
            {type: "diagnostic", runId: "session-1", diagnostic: {level: "info", code: "one", message: "One."}} as TransportBackendEvent,
            {type: "diagnostic", runId: "session-1", diagnostic: {level: "info", code: "two", message: "Two."}} as TransportBackendEvent,
            completed("session-1"),
        ];
        const repeatedStore = createRunSessionStore({initialProject: fixtureProject(), createSessionId: () => "session-1"});
        await repeatedStore.start({project: fixtureProject(), problem: fixtureProblem(), adapter: adapterFrom(repeated)});
        expect(repeatedStore.getSnapshot().current).toMatchObject({status: "completed", phase: "terminal"});
        expect(repeatedStore.getSnapshot().current?.tallies).toHaveLength(2);
        expect(repeatedStore.getSnapshot().current?.diagnostics.map((item) => item.code)).toEqual(["one", "two"]);

        const emptyStore = createRunSessionStore({initialProject: fixtureProject(), createSessionId: () => "session-1"});
        await emptyStore.start({
            project: fixtureProject(), problem: fixtureProblem(),
            adapter: adapterFrom([accepted(), started("session-1"), completed("session-1")]),
        });
        expect(emptyStore.getSnapshot().current?.status).toBe("completed");
    });

    it("allows a caller-correlated early terminal failure", async () => {
        const store = createRunSessionStore({initialProject: fixtureProject(), createSessionId: () => "session-1"});
        await store.start({project: fixtureProject(), problem: fixtureProblem(), adapter: adapterFrom([{
            type: "runFailed", runId: "session-1", diagnostic: {
                level: "error", code: "native.contract.invalid", message: "Rejected before acceptance.",
            },
        }])});
        expect(store.getSnapshot().current).toMatchObject({
            status: "failed", terminalFailure: {code: "native.contract.invalid"}, phase: "terminal",
        });
    });

    it("rejects an uncompiled problem before allocating or executing a session", async () => {
        const adapter = adapterFrom(canonicalEvents("session-1"));
        const store = createRunSessionStore({initialProject: fixtureProject(), createSessionId: () => "session-1"});

        const result = await store.start({
            project: fixtureProject(),
            problem: {...fixtureProblem(), status: "validated"},
            adapter,
        });

        expect(result).toMatchObject({
            started: false,
            diagnostic: {code: "run.session.problem_not_compiled"},
        });
        expect(adapter.execute).not.toHaveBeenCalled();
        expect(store.getSnapshot().current).toBeNull();
    });

    it("rejects concurrent starts while retaining one current session", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        const slowAdapter: RunExecutionAdapter = {
            metadata,
            async *execute() {
                await gate;
                yield {type: "runFailed", runId: "session-1", diagnostic: {
                    level: "error", code: "fixture.stopped", message: "Stopped.",
                }};
            },
        };
        const store = createRunSessionStore({initialProject: fixtureProject(), createSessionId: () => "session-1"});
        const first = store.start({project: fixtureProject(), problem: fixtureProblem(), adapter: slowAdapter});
        await vi.waitFor(() => expect(store.getSnapshot().current?.status).toBe("prepared"));
        const second = await store.start({project: fixtureProject(), problem: fixtureProblem(), adapter: slowAdapter});
        expect(second).toMatchObject({started: false, diagnostic: {code: "run.session.concurrent_unsupported"}});
        release();
        await first;
    });

    it("does not resurrect an active session after clear releases it", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        const adapter: RunExecutionAdapter = {
            metadata,
            async *execute() {
                yield accepted();
                yield started("session-1");
                await gate;
                yield completed("session-1");
            },
        };
        const store = createRunSessionStore({initialProject: fixtureProject(), createSessionId: () => "session-1"});
        const running = store.start({project: fixtureProject(), problem: fixtureProblem(), adapter});
        await vi.waitFor(() => expect(store.getSnapshot().current?.status).toBe("running"));

        store.clear();
        release();
        await running;

        expect(store.getSnapshot().current).toBeNull();
    });

    it("copies and deeply freezes adapter-owned result values", async () => {
        const provenance = started("session-1").provenance;
        const delta = {tallyId: "t-1", scores: [1]};
        const summary = completed("session-1").summary;
        const events: TransportBackendEvent[] = [
            accepted(),
            {...started("session-1"), provenance},
            {type: "tallyDelta", runId: "session-1", delta},
            {...completed("session-1"), summary},
        ];
        const store = createRunSessionStore({initialProject: fixtureProject(), createSessionId: () => "session-1"});
        await store.start({project: fixtureProject(), problem: fixtureProblem(), adapter: adapterFrom(events)});

        (provenance.warnings as string[]).push("mutated");
        (delta.scores as number[])[0] = 99;
        (summary.diagnostics as unknown as Array<{message: string}>).push({message: "mutated"});

        const current = store.getSnapshot().current!;
        expect(current.provenance?.warnings).toEqual([]);
        expect(current.tallies[0]?.scores).toEqual([1]);
        expect(current.summary?.diagnostics).toEqual([]);
        expect(Object.isFrozen(current.provenance?.warnings)).toBe(true);
        expect(Object.isFrozen(current.tallies[0]?.scores)).toBe(true);
        expect(Object.isFrozen(current.summary?.diagnostics)).toBe(true);
    });

    it("retains a prior completed session when compilation fails outside the store", async () => {
        const store = createRunSessionStore({
            initialProject: fixtureProject(),
            createSessionId: () => "session-1",
        });
        await store.start({
            project: fixtureProject(),
            problem: fixtureProblem(),
            adapter: adapterFrom(canonicalEvents("session-1")),
        });
        const completed = store.getSnapshot().current;

        // A failed compile never calls start: editor diagnostics remain outside Run Session.
        expect(store.getSnapshot().current).toBe(completed);
        expect(store.clear().current).toBeNull();
    });

    it("blocks stale results on the current scene and renders them only with the submitted scene", async () => {
        const project = fixtureProject();
        const store = createRunSessionStore({initialProject: project, createSessionId: () => "session-1"});
        await store.start({project, problem: fixtureProblem(), adapter: adapterFrom(canonicalEvents("session-1"))});

        const changed = {
            ...project,
            name: "Edited after submission",
            scene: {entities: [{id: "new-entity"} as never]},
        };
        await store.updateEditableScene(changed);
        expect(store.getSnapshot().current?.input.sourceSceneRevision).toBe(0);
        expect(store.getSnapshot().sceneRevision).toBe(1);
        expect(selectRenderableTracks(store.getSnapshot())).toEqual([]);
        expect(selectRenderableTallies(store.getSnapshot())).toEqual([]);
        expect(selectPresentationProject(store.getSnapshot(), changed)).toBe(changed);
        expect(store.getSnapshot().renderingBlock).toMatchObject({submittedRevision: 0, currentRevision: 1});

        store.setResultView("submitted");
        expect(selectRenderableTracks(store.getSnapshot())).toHaveLength(1);
        expect(selectRenderableTallies(store.getSnapshot())).toHaveLength(1);
        expect(selectPresentationProject(store.getSnapshot(), changed).name).toBe("Fixture Project");
    });

    it("notifies selectors only when their selected immutable value changes", async () => {
        const store = createRunSessionStore({initialProject: fixtureProject(), createSessionId: () => "session-1"});
        const trackListener = vi.fn();
        const unsubscribe = store.subscribeSelector(selectRenderableTracks, trackListener);

        await store.start({
            project: fixtureProject(),
            problem: fixtureProblem(),
            adapter: adapterFrom([accepted(), started("session-1"), progress("session-1"), completed("session-1")]),
        });

        expect(trackListener).not.toHaveBeenCalled();
        unsubscribe();
    });

    it("preflights requested capture and applies write backpressure without dropping execution events", async () => {
        const execute = vi.fn(async function* () {
            yield accepted();
            yield started("session-1");
            yield progress("session-1");
            yield completed("session-1");
        });
        const preflight = vi.fn(async () => { throw new Error("journal path denied"); });
        const sink: RunEventSink = {preflight, write: vi.fn(async () => undefined)};
        const store = createRunSessionStore({initialProject: fixtureProject(), createSessionId: () => "session-1"});

        const result = await store.start({
            project: fixtureProject(), problem: fixtureProblem(), adapter: {metadata, execute}, sink,
        });

        expect(result).toMatchObject({started: false, diagnostic: {code: "run.journal.preflight_failed"}});
        expect(execute).not.toHaveBeenCalled();
        expect(store.getSnapshot().current).toBeNull();
    });

    it("awaits each sink write before requesting the next adapter event", async () => {
        let releaseEvent!: () => void;
        const blockedEvent = new Promise<void>((resolve) => { releaseEvent = resolve; });
        const adapterSteps: string[] = [];
        const adapter: RunExecutionAdapter = {
            metadata,
            async *execute() {
                adapterSteps.push("accepted");
                yield accepted();
                adapterSteps.push("started");
                yield started("session-1");
                adapterSteps.push("failed");
                yield {type: "runFailed", runId: "session-1", diagnostic: {
                    level: "error", code: "fixture.failure", message: "Done.",
                }};
            },
        };
        const sink: RunEventSink = {
            preflight: async () => undefined,
            write: async (line) => {
                const record = JSON.parse(line);
                if (record.recordType === "event" && record.sequence === 1) await blockedEvent;
            },
        };
        const store = createRunSessionStore({initialProject: fixtureProject(), createSessionId: () => "session-1"});
        const run = store.start({project: fixtureProject(), problem: fixtureProblem(), adapter, sink});
        await vi.waitFor(() => expect(adapterSteps).toEqual(["accepted"]));
        releaseEvent();
        await run;
        expect(adapterSteps).toEqual(["accepted", "started", "failed"]);
    });

    it("marks capture incomplete after a write failure and still completes execution", async () => {
        const writes: string[] = [];
        let writeCount = 0;
        const sink: RunEventSink = {
            preflight: vi.fn(async () => undefined),
            write: vi.fn(async (line) => {
                writeCount += 1;
                if (writeCount === 4) throw new Error("disk full");
                writes.push(line);
            }),
        };
        const store = createRunSessionStore({
            initialProject: fixtureProject(),
            createSessionId: () => "session-1",
            now: sequenceClock(),
        });

        await store.start({
            project: fixtureProject(), problem: fixtureProblem(), adapter: adapterFrom(canonicalEvents("session-1")), sink,
        });

        expect(store.getSnapshot().current).toMatchObject({status: "completed", journal: {status: "incomplete"}});
        expect(store.getSnapshot().current?.diagnostics.some((item) => item.code === "run.journal.write_failed")).toBe(true);
        expect(writes.map((line) => JSON.parse(line).recordType)).toEqual(["runInput", "event", "event"]);
    });

    it("continues execution when the opening journal record cannot be written", async () => {
        let writes = 0;
        const sink: RunEventSink = {
            preflight: async () => undefined,
            write: async () => {
                writes += 1;
                if (writes === 1) throw new Error("opening denied");
            },
        };
        const store = createRunSessionStore({initialProject: fixtureProject(), createSessionId: () => "session-1"});
        await store.start({
            project: fixtureProject(), problem: fixtureProblem(), adapter: adapterFrom(canonicalEvents("session-1")), sink,
        });
        expect(store.getSnapshot().current).toMatchObject({
            status: "completed", journal: {status: "incomplete", finalSequence: 7},
        });
        expect(store.getSnapshot().current?.diagnostics[0]).toMatchObject({
            code: "run.journal.write_failed", message: "run.journal.write_failed: opening denied",
        });
        expect(writes).toBe(1);
    });

    it("writes replayable versioned NDJSON with a terminal integrity record", async () => {
        const writes: string[] = [];
        const sink: RunEventSink = {
            preflight: vi.fn(async () => undefined),
            write: vi.fn(async (line) => { writes.push(line); }),
            close: vi.fn(async () => undefined),
        };
        const store = createRunSessionStore({
            initialProject: fixtureProject(), createSessionId: () => "session-1", now: sequenceClock(),
        });
        await store.start({
            project: fixtureProject(), problem: fixtureProblem(), adapter: adapterFrom(canonicalEvents("session-1")), sink,
        });

        const records = writes.map((line) => JSON.parse(line));
        expect(records.map((record) => record.recordType)).toEqual([
            "runInput", "event", "event", "event", "event", "event", "event", "event", "closing",
        ]);
        expect(records.every((record) => record.journalVersion === "1.0.0")).toBe(true);
        expect(records.slice(1, -1).map((record) => record.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(records.at(-1)).toMatchObject({
            terminalStatus: "completed", sequence: 8, finalSequence: 7,
            counts: {tracks: 1, tallies: 1, diagnostics: 1},
        });
        expect(records.at(-1).integrityDigest).toMatch(/^[a-f0-9]{64}$/);
        expect(sink.close).toHaveBeenCalledTimes(1);
        expect(store.getSnapshot().current?.journal).toEqual({status: "complete", finalSequence: 8});
    });

    it("rejects every invalid lifecycle seam with an actionable protocol diagnostic", async () => {
        const cases: readonly (readonly TransportBackendEvent[])[] = [
            [{type: "backendMetadata", metadata}, ...canonicalEvents("session-1")],
            [accepted(), accepted(), started("session-1"), completed("session-1")],
            [{...accepted(), problemId: "wrong-problem"}, started("session-1"), completed("session-1")],
            [accepted(), {...started("session-1"), problemId: "wrong-problem"}, completed("session-1")],
            [accepted(), progress("session-1"), completed("session-1")],
            [accepted(), started("session-1"), {type: "tallyDelta", runId: "session-1", delta: {tallyId: "t", scores: []}}, progress("session-1"), completed("session-1")],
            [accepted(), completed("session-1")],
        ];
        for (const events of cases) {
            const store = createRunSessionStore({initialProject: fixtureProject(), createSessionId: () => "session-1"});
            await store.start({project: fixtureProject(), problem: fixtureProblem(), adapter: adapterFrom(events)});
            const failure = store.getSnapshot().current?.terminalFailure;
            expect(failure?.code).toBe("run.session.protocol_violation");
            expect(failure?.message).toContain("run.session.protocol_violation:");
        }
    });

    it("fails adapter rejection and unterminated streams without losing their cause", async () => {
        const rejecting: RunExecutionAdapter = {
            metadata,
            execute: async function* () { throw new Error("adapter exploded"); },
        };
        const rejectedStore = createRunSessionStore({initialProject: fixtureProject(), createSessionId: () => "session-1"});
        await rejectedStore.start({project: fixtureProject(), problem: fixtureProblem(), adapter: rejecting});
        expect(rejectedStore.getSnapshot().current).toMatchObject({
            status: "failed",
            terminalFailure: {code: "run.adapter.rejected", message: "run.adapter.rejected: adapter exploded"},
        });

        const unterminatedStore = createRunSessionStore({initialProject: fixtureProject(), createSessionId: () => "session-1"});
        await unterminatedStore.start({
            project: fixtureProject(), problem: fixtureProblem(), adapter: adapterFrom([accepted(), started("session-1")]),
        });
        expect(unterminatedStore.getSnapshot().current?.terminalFailure).toMatchObject({
            code: "run.session.protocol_violation",
            message: "run.session.protocol_violation: Adapter event sequence ended without a terminal event.",
        });
    });

    it("keeps normalized fingerprints stable across property order and sensitive to exact values", async () => {
        const reordered = {
            settings: {seed: 7, histories: 1}, tallies: [], sources: [], materials: [],
            geometry: {regions: [], surfaces: [], entities: []}, status: "compiled", name: "Fixture Problem", id: "problem-1",
        } as TransportProblem;
        const changed = {...fixtureProblem(), settings: {histories: 2, seed: 7}};
        const fingerprints: string[] = [];
        for (const problem of [fixtureProblem(), reordered, changed]) {
            const store = createRunSessionStore({initialProject: fixtureProject(), createSessionId: () => "session-1"});
            await store.start({project: fixtureProject(), problem, adapter: adapterFrom([
                {...accepted(), problemId: problem.id},
                {...started("session-1"), problemId: problem.id, provenance: {...started("session-1").provenance, problemId: problem.id}},
                completed("session-1"),
            ])});
            fingerprints.push(store.getSnapshot().current!.input.exactInputFingerprint);
        }
        expect(fingerprints[0]).toBe(fingerprints[1]);
        expect(fingerprints[2]).not.toBe(fingerprints[0]);
    });

    it("exposes stable selectors and subscriptions across empty, completed, stale, and cleared states", async () => {
        const project = fixtureProject();
        const store = createRunSessionStore({initialProject: project, createSessionId: () => "session-1"});
        const listener = vi.fn();
        const unsubscribe = store.subscribe(listener);
        expect(selectRunBackend(store.getSnapshot())).toBe("visual-ts");
        expect(selectRunFreshness(store.getSnapshot())).toBe("empty");
        expect(selectRunDiagnostics(store.getSnapshot())).toEqual([]);
        expect(selectSubmittedProject(store.getSnapshot())).toBeNull();
        expect(selectResultView(store.getSnapshot())).toBe("current");
        expect(selectRenderableTracks(store.getSnapshot())).toHaveLength(0);
        expect(selectRenderableTallies(store.getSnapshot())).toHaveLength(0);

        await store.start({project, problem: fixtureProblem(), adapter: adapterFrom(canonicalEvents("session-1"))});
        expect(selectRunBackend(store.getSnapshot())).toBe("visual-ts");
        expect(selectRunFreshness(store.getSnapshot())).toBe("fresh");
        expect(selectRunDiagnostics(store.getSnapshot())).toEqual([{
            code: "fixture.info", severity: "info", message: "fixture.info: Fixture.", entityId: undefined,
        }]);
        expect(selectSubmittedProject(store.getSnapshot())).toEqual(project);
        const callsAfterRun = listener.mock.calls.length;
        await store.updateEditableScene(project);
        expect(listener).toHaveBeenCalledTimes(callsAfterRun);
        store.setResultView("current");
        expect(listener).toHaveBeenCalledTimes(callsAfterRun);
        store.clear();
        expect(selectRunFreshness(store.getSnapshot())).toBe("empty");
        expect(listener).toHaveBeenCalledTimes(callsAfterRun + 1);
        unsubscribe();
    });

    it("diagnoses closing-record failure while preserving a completed run", async () => {
        let writes = 0;
        const sink: RunEventSink = {
            preflight: async () => undefined,
            write: async () => {
                writes += 1;
                if (writes === 9) throw new Error("close denied");
            },
        };
        const store = createRunSessionStore({initialProject: fixtureProject(), createSessionId: () => "session-1"});
        await store.start({
            project: fixtureProject(), problem: fixtureProblem(), adapter: adapterFrom(canonicalEvents("session-1")), sink,
        });
        expect(store.getSnapshot().current).toMatchObject({
            status: "completed",
            journal: {status: "incomplete", finalSequence: 7},
        });
        expect(store.getSnapshot().current?.diagnostics.at(-1)).toMatchObject({
            code: "run.journal.write_failed", message: "run.journal.write_failed: close denied",
        });
    });

    it("records heavy asset references and diagnoses sink close failure", async () => {
        const sink: RunEventSink = {
            preflight: async () => undefined,
            write: async () => undefined,
            close: async () => { throw new Error("close hook denied"); },
        };
        const store = createRunSessionStore({initialProject: fixtureProject(), createSessionId: () => "session-1"});
        await store.start({
            project: fixtureProject(),
            problem: fixtureProblem(),
            adapter: adapterFrom(canonicalEvents("session-1")),
            sink,
            heavyAssets: [{reference: "pack://xs/photon", fingerprint: "a".repeat(64)}],
        });
        expect(store.getSnapshot().current?.input.heavyAssets).toEqual([
            {reference: "pack://xs/photon", fingerprint: "a".repeat(64)},
        ]);
        expect(store.getSnapshot().current).toMatchObject({
            status: "completed",
            journal: {status: "incomplete", finalSequence: 8},
        });
        expect(store.getSnapshot().current?.diagnostics.at(-1)?.message).toContain("close hook denied");
    });
});

const metadata: TransportBackendMetadata = {
    id: "fixture-backend",
    name: "Fixture Backend",
    version: "1",
    capabilities: {
        particles: ["photon"], geometry: ["box"], sources: ["beam-source"], tallies: ["cell-flux"],
        lifecycle: ["submit", "start"], dataPolicy: "toy",
    },
};

function adapterFrom(events: readonly TransportBackendEvent[]): RunExecutionAdapter & {execute: ReturnType<typeof vi.fn>} {
    const execute = vi.fn(async function* () { for (const event of events) yield event; });
    return {metadata, execute};
}

function canonicalEvents(sessionId: string): readonly TransportBackendEvent[] {
    return [
        accepted(), started(sessionId), progress(sessionId),
        {type: "trackSamples", runId: sessionId, samples: [{historyId: "h-1", events: []}]},
        {type: "tallyDelta", runId: sessionId, delta: {tallyId: "t-1", scores: [1]}},
        {type: "diagnostic", runId: sessionId, diagnostic: {level: "info", code: "fixture.info", message: "Fixture."}},
        completed(sessionId),
    ];
}

function accepted(): Extract<TransportBackendEvent, {type: "problemAccepted"}> {
    return {type: "problemAccepted", problemId: "problem-1", diagnostics: []};
}

function started(sessionId: string): Extract<TransportBackendEvent, {type: "runStarted"}> {
    return {type: "runStarted", runId: sessionId, problemId: "problem-1", provenance: {
        backendId: "fixture-backend", backendVersion: "1", problemId: "problem-1", seed: 7,
        dataPolicy: "toy", warnings: [],
    }};
}

function progress(sessionId: string): Extract<TransportBackendEvent, {type: "runProgress"}> {
    return {type: "runProgress", runId: sessionId, completedHistories: 1, totalHistories: 1};
}

function completed(sessionId: string): Extract<TransportBackendEvent, {type: "runCompleted"}> {
    return {type: "runCompleted", runId: sessionId, summary: {
        completedHistories: 1, totalHistories: 1, sampledTrackCount: 1, tallyCount: 1, diagnostics: [],
    }};
}

function fixtureProblem(): TransportProblem {
    return {
        id: "problem-1", name: "Fixture Problem", status: "compiled",
        geometry: {entities: [], surfaces: [], regions: []}, materials: [], sources: [], tallies: [],
        settings: {histories: 1, seed: 7},
    };
}

function fixtureProject(): Project {
    return {
        id: "project-1" as Project["id"], name: "Fixture Project", scene: {entities: []},
        runConfiguration: {
            particleTypes: ["photon"], histories: 1, batchSize: 1, seed: 7,
            backend: "visual-ts", visibleHistoryBudget: 1,
        },
        metadata: {appVersion: "test", physicsModelVersion: "test", createdAt: "now", modifiedAt: "now"},
    };
}

function sequenceClock(): () => string {
    let value = 0;
    return () => `2026-07-13T00:00:0${value++}.000Z`;
}
