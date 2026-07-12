import {describe, expect, it, vi} from "vitest";
import type {Project, TransportBackendEvent} from "@transport/domain";
import type {NativePhotonSmokeBridge} from "@transport/transport-worker";
import type {TransportProblem} from "@transport/domain/transport/TransportProblem";
import {clearRunSession, runNativeSession, runToySession} from "./runSession";
import {createInitialProject} from "./createInitialProject";

describe("runNativeSession", () => {
    it("returns bridge-unavailable diagnostics and the diagnostics-tab outcome", async () => {
        const initialProject = createInitialProject();
        const project = {
            ...initialProject,
            runConfiguration: {
                ...initialProject.runConfiguration,
                particleTypes: ["photon"] as const,
                histories: 4,
                batchSize: 2,
                seed: 314159,
                backend: "visual-ts" as const,
                visibleHistoryBudget: 4,
            },
        };
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
            (problem: unknown, bridge?: NativePhotonSmokeBridge) => Promise<readonly TransportBackendEvent[]>
        >(async () => events);

        const outcome = await runNativeSession(project, undefined, {
            prepare: () => ({
                ok: true,
                value: {id: "compiled-project-1", settings: {histories: 4, seed: 314159}} as TransportProblem,
                diagnostics: [],
            }),
            runBackend,
        });

        expect(runBackend).toHaveBeenCalledWith({
            id: "compiled-project-1",
            settings: {histories: 4, seed: 314159},
        }, undefined);
        expect(outcome).toEqual({
            backend: "native",
            mode: "run",
            bottomTab: "diagnostics",
            tracks: [],
            diagnostics: [{
                severity: "error",
                message: "native.bridge.unavailable: Native Rust photon backend bridge is not available in this runtime.",
                entityId: undefined,
            }],
        });
    });

    it("maps successful native events to display tracks and diagnostics", async () => {
        const initialProject = createInitialProject();
        const project = {
            ...initialProject,
            runConfiguration: {
                ...initialProject.runConfiguration,
                histories: 1,
                seed: 7,
                backend: "visual-ts" as const,
            },
        };
        const events: readonly TransportBackendEvent[] = [
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
                        materialId: "water-1",
                        entityId: "shield-1",
                        reason: "sampled absorption",
                    }],
                }],
            },
        ];

        const outcome = await runNativeSession(project, undefined, {
            prepare: () => ({
                ok: true,
                value: {id: "compiled-project-1", settings: {histories: 1, seed: 7}} as TransportProblem,
                diagnostics: [],
            }),
            runBackend: async () => events,
        });

        expect(outcome.bottomTab).toBe("run");
        expect(outcome.diagnostics).toEqual([{
            severity: "warning",
            message: "physics_data.simple_coefficients: Simple coefficients were used.",
            entityId: undefined,
        }]);
        expect(outcome.tracks).toEqual([{
            historyId: "h-0",
            events: [{
                historyId: "h-0",
                particleId: "p-0",
                type: "absorb",
                position: {x: 1, y: 2, z: 3},
                direction: {x: 1, y: 0, z: 0},
                energy: 2.5,
                weight: 1,
                time: 0.5,
                materialId: "water-1",
                regionId: "shield-1",
                reason: "sampled absorption",
            }],
        }]);
    });

    it("returns compiler diagnostics without invoking the backend when preparation fails", async () => {
        const project = createInitialProject();
        const prepare = vi.fn(() => ({
            ok: false,
            diagnostics: [{
                level: "error" as const,
                code: "tally.target.missing",
                message: "Tally must define its target.",
                entityId: "tally-1",
            }],
        }));
        const runBackend = vi.fn(async (): Promise<readonly TransportBackendEvent[]> => []);

        const outcome = await runNativeSession(project, undefined, {prepare, runBackend});

        expect(prepare).toHaveBeenCalledWith(project);
        expect(runBackend).not.toHaveBeenCalled();
        expect(outcome).toMatchObject({
            bottomTab: "diagnostics",
            tracks: [],
            diagnostics: [{
                severity: "error",
                message: "tally.target.missing: Tally must define its target.",
                entityId: "tally-1",
            }],
        });
    });
});

describe("run-session outcomes", () => {
    it("preserves toy photon run behavior", () => {
        const project = {
            runConfiguration: {backend: "visual-ts"},
        } as unknown as Project;
        const tracks = [{historyId: "toy-1", events: []}];
        const runToy = vi.fn(() => ({tracks}));

        expect(runToySession(project, {runToy})).toEqual({
            backend: "visual-ts",
            mode: "run",
            bottomTab: "run",
            tracks,
            diagnostics: [],
        });
        expect(runToy).toHaveBeenCalledWith(project, project.runConfiguration);
    });

    it("clears results and returns to the run tab", () => {
        expect(clearRunSession({backend: "native", mode: "run"})).toEqual({
            backend: "native",
            mode: "run",
            bottomTab: "run",
            tracks: [],
            diagnostics: [],
        });
    });
});
