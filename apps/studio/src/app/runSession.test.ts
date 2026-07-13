import {describe, expect, it, vi} from "vitest";
import type {Project, TransportBackendEvent} from "@transport/domain";
import type {NativePhotonSmokeBridge} from "@transport/transport-worker";
import type {TransportProblem} from "@transport/domain/transport/TransportProblem";
import {
    createNativeRunActions,
    createRunSession,
    createToyRunActions,
    reduceRunSession,
    reduceRunSessionActions,
} from "./runSession";

describe("Run Session lifecycle", () => {
    it("owns compilation and clearing transitions", () => {
        const idle = createRunSession("visual-ts");
        const compiling = reduceRunSession(idle, {
            type: "compilation-started",
            backend: "native",
            sceneRevision: 0,
            attemptId: "attempt-1",
        });
        expect(compiling).toMatchObject({status: "compiling", backend: "native"});
        expect(reduceRunSession(compiling, {type: "clear"})).toEqual(createRunSession("native"));
    });

    it("preserves completed results as stale after scene changes", () => {
        const completed = reduceRunSessionActions(createRunSession("visual-ts"), [
            {type: "compilation-started", backend: "visual-ts", sceneRevision: 0, attemptId: "attempt-1"},
            {
                type: "toy-completed",
                tracks: [{historyId: "toy-1", events: []}],
                histories: 10,
                seed: 7,
                problemId: "project-1",
                sceneRevision: 0,
                attemptId: "attempt-1",
            },
        ]);
        const stale = reduceRunSession(completed, {type: "scene-changed"});
        expect(stale.freshness).toBe("stale");
        expect(stale.tracks).toEqual(completed.tracks);
        expect(reduceRunSession(stale, {type: "scene-changed"}).freshness).toBe("stale");
    });

    it("ignores late backend events after scene changes or clearing", () => {
        const compiling = reduceRunSession(createRunSession("native"), {
            type: "compilation-started",
            backend: "native",
            sceneRevision: 0,
            attemptId: "attempt-1",
        });
        const changed = reduceRunSession(compiling, {type: "scene-changed"});
        expect(changed).toMatchObject({status: "idle", attemptId: null, sceneRevision: 1});
        const startedEvent = {
            type: "runStarted",
            runId: "late-run",
            problemId: "problem-1",
            provenance: {
                backendId: "native",
                backendVersion: "1",
                problemId: "problem-1",
                seed: 1,
                dataPolicy: "simple-coefficients",
                warnings: [],
            },
        } as unknown as TransportBackendEvent;
        expect(reduceRunSession(changed, {
            type: "backend-event",
            event: startedEvent,
            sceneRevision: 0,
            attemptId: "attempt-1",
        })).toBe(changed);

        const cleared = reduceRunSession(compiling, {type: "clear"});
        expect(reduceRunSession(cleared, {
            type: "backend-event",
            event: startedEvent,
            sceneRevision: 0,
            attemptId: "attempt-1",
        })).toBe(cleared);
    });

    it("drops artifacts from an in-flight attempt when its scene changes", () => {
        const startedEvent = {
            type: "runStarted",
            runId: "active-run",
            problemId: "problem-1",
            provenance: {
                backendId: "native",
                backendVersion: "1",
                problemId: "problem-1",
                seed: 1,
                dataPolicy: "simple-coefficients",
                warnings: [],
            },
        } as unknown as TransportBackendEvent;
        const running = reduceRunSessionActions(createRunSession("native"), [
            {type: "compilation-started", backend: "native", sceneRevision: 0, attemptId: "attempt-1"},
            {type: "backend-event", event: startedEvent, sceneRevision: 0, attemptId: "attempt-1"},
            {
                type: "backend-event",
                event: {type: "runProgress", runId: "active-run", completedHistories: 1, totalHistories: 10},
                sceneRevision: 0,
                attemptId: "attempt-1",
            },
        ]);

        const changed = reduceRunSession(running, {type: "scene-changed"});

        expect(changed).toMatchObject({
            status: "idle",
            runId: null,
            progress: null,
            tracks: [],
            tallies: [],
            provenance: null,
            summary: null,
            freshness: "empty",
            sceneRevision: 1,
            resultSceneRevision: null,
            attemptId: null,
        });
        expect(changed.diagnostics.at(-1)?.message).toContain("run.scene-changed");
    });

    it("ignores events from a superseded attempt on the same scene", () => {
        const first = reduceRunSession(createRunSession("native"), {
            type: "compilation-started",
            backend: "native",
            sceneRevision: 0,
            attemptId: "attempt-1",
        });
        const second = reduceRunSession(first, {
            type: "compilation-started",
            backend: "native",
            sceneRevision: 0,
            attemptId: "attempt-2",
        });
        const lateFailure: TransportBackendEvent = {
            type: "runFailed",
            diagnostic: {
                level: "error",
                code: "late.failure",
                message: "The superseded run failed late.",
            },
        };
        expect(reduceRunSession(second, {
            type: "backend-event",
            event: lateFailure,
            sceneRevision: 0,
            attemptId: "attempt-1",
        })).toBe(second);
    });
});

describe("native Run Session adapter", () => {
    it("carries backend events through progress, tallies, provenance, and completion", async () => {
        const events = [
            {
                type: "problemAccepted",
                problemId: "compiled-project-1",
                diagnostics: [{
                    level: "warning",
                    code: "physics_data.simple_coefficients",
                    message: "Simple coefficients were used.",
                }],
            },
            {
                type: "runStarted",
                runId: "native-7",
                problemId: "compiled-project-1",
                provenance: {
                    backendId: "native-rust-photon-smoke",
                    backendVersion: "1",
                    problemId: "compiled-project-1",
                    seed: 7,
                    dataPolicy: "simple-coefficients",
                    warnings: [],
                },
            },
            {
                type: "runProgress",
                runId: "native-7",
                completedHistories: 1,
                totalHistories: 1,
            },
            {
                type: "trackSamples",
                runId: "native-7",
                samples: [{
                    historyId: "h-0",
                    events: [{
                        historyId: "h-0",
                        particleId: "p-0",
                        type: "absorb",
                        position: {x: 1, y: 2, z: 3},
                        direction: {x: 1, y: 0, z: 0},
                        energyMeV: 2.5,
                        weight: 1,
                        time: 0.5,
                    }],
                }],
            },
            {
                type: "tallyDelta",
                runId: "native-7",
                delta: {tallyId: "tally-1", scores: [2.5]},
            },
            {
                type: "runCompleted",
                runId: "native-7",
                summary: {
                    completedHistories: 1,
                    totalHistories: 1,
                    sampledTrackCount: 1,
                    tallyCount: 1,
                    diagnostics: [],
                },
            },
        ] as unknown as readonly TransportBackendEvent[];

        const actions = await createNativeRunActions(
            successfulCompile(),
            0,
            "attempt-1",
            undefined,
            {runBackend: async () => events},
        );
        const state = reduceRunSessionActions(createRunSession("visual-ts"), [
            {type: "compilation-started", backend: "native", sceneRevision: 0, attemptId: "attempt-1"},
            ...actions,
        ]);

        expect(state).toMatchObject({
            status: "completed",
            backend: "native",
            runId: "native-7",
            freshness: "fresh",
            progress: {completedHistories: 1, totalHistories: 1},
        });
        expect(state.provenance).toMatchObject({backendVersion: "1", seed: 7});
        expect(state.tallies).toEqual([{tallyId: "tally-1", scores: [2.5]}]);
        expect(state.tracks).toHaveLength(1);
        expect(state.diagnostics[0]?.message).toContain("physics_data.simple_coefficients");
    });

    it("keeps compile failures visible and never invokes the backend", async () => {
        const runBackend = vi.fn(async (): Promise<readonly TransportBackendEvent[]> => []);
        const actions = await createNativeRunActions(
            {
                ok: false,
                diagnostics: [{
                    level: "error",
                    code: "tally.target.missing",
                    message: "Tally must define its target.",
                    entityId: "tally-1",
                }],
            },
            0,
            "attempt-1",
            undefined,
            {runBackend},
        );
        const state = reduceRunSessionActions(createRunSession("visual-ts"), [
            {type: "compilation-started", backend: "native", sceneRevision: 0, attemptId: "attempt-1"},
            ...actions,
        ]);

        expect(runBackend).not.toHaveBeenCalled();
        expect(state).toMatchObject({status: "failed", tracks: []});
        expect(state.diagnostics[0]?.message).toContain("tally.target.missing");
    });

    it("represents bridge unavailability as a failed Run Session", async () => {
        const events: readonly TransportBackendEvent[] = [{
            type: "runFailed",
            runId: "native-314159",
            diagnostic: {
                level: "error",
                code: "native.bridge.unavailable",
                message: "Native Rust photon backend bridge is not available in this runtime.",
            },
        }];
        const runBackend = vi.fn<
            (problem: TransportProblem, runSessionId: string, bridge?: NativePhotonSmokeBridge) => Promise<readonly TransportBackendEvent[]>
        >(async () => events);
        const actions = await createNativeRunActions(
            successfulCompile(),
            0,
            "attempt-1",
            undefined,
            {runBackend},
        );
        const state = reduceRunSessionActions(createRunSession("native"), [
            {type: "compilation-started", backend: "native", sceneRevision: 0, attemptId: "attempt-1"},
            ...actions,
        ]);

        expect(state).toMatchObject({
            status: "failed",
            runId: "native-314159",
            freshness: "empty",
        });
        expect(state.diagnostics[0]?.message).toContain("native.bridge.unavailable");
    });

    it("converts an adapter rejection into a failed Run Session", async () => {
        const actions = await createNativeRunActions(
            successfulCompile(),
            0,
            "attempt-1",
            undefined,
            {runBackend: async () => { throw new Error("adapter exploded"); }},
        );
        const state = reduceRunSessionActions(createRunSession("native"), [
            {type: "compilation-started", backend: "native", sceneRevision: 0, attemptId: "attempt-1"},
            ...actions,
        ]);
        expect(state.status).toBe("failed");
        expect(state.diagnostics[0]?.message).toBe("native.adapter.rejected: adapter exploded");
    });
});

describe("toy Run Session adapter", () => {
    it("produces a completed result through the same session state", () => {
        const project = {
            id: "project-1",
            runConfiguration: {
                backend: "visual-ts",
                histories: 4,
                seed: 314159,
                visibleHistoryBudget: 4,
            },
        } as unknown as Project;
        const tracks = [{historyId: "toy-1", events: []}];
        const runToy = vi.fn(() => ({tracks}));

        const actions = createToyRunActions(project, successfulCompile(), 0, "attempt-1", {runToy});
        const state = reduceRunSessionActions(createRunSession("native"), actions);
        expect(state).toMatchObject({
            status: "completed",
            backend: "visual-ts",
            freshness: "fresh",
            tracks,
            provenance: {
                backendVersion: "prototype",
                dataPolicy: "toy",
                problemId: "compiled-project-1",
                seed: 7,
            },
            summary: {completedHistories: 1, sampledTrackCount: 1},
        });
        expect(runToy).toHaveBeenCalledWith(successfulCompile().value, {visibleHistoryBudget: 4});
    });

    it("uses compilation as a shared gate and does not execute invalid projects", () => {
        const project = {
            id: "project-1",
            runConfiguration: {backend: "visual-ts", histories: 4, seed: 1},
        } as unknown as Project;
        const runToy = vi.fn(() => ({tracks: []}));
        const actions = createToyRunActions(project, {
            ok: false,
            diagnostics: [{
                level: "error",
                code: "source.missing",
                message: "A source is required.",
            }],
        }, 0, "attempt-1", {runToy});
        const state = reduceRunSessionActions(createRunSession("visual-ts"), actions);
        expect(runToy).not.toHaveBeenCalled();
        expect(state.status).toBe("failed");
        expect(state.diagnostics[0]?.message).toContain("source.missing");
    });
});

function successfulCompile() {
    return {
        ok: true as const,
        value: {
            id: "compiled-project-1",
            settings: {histories: 1, seed: 7},
        } as TransportProblem,
        diagnostics: [],
    };
}
