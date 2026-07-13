import {describe, expect, it, vi} from "vitest";
import type {Project, TrackSample, TransportBackendEvent} from "@transport/domain";
import type {TransportProblem} from "@transport/domain/transport/TransportProblem";
import {createNativeExecutionAdapter, createToyExecutionAdapter} from "./runExecutionAdapters";

describe("Run Session execution adapters", () => {
    it("presents toy execution as the canonical asynchronous event sequence", async () => {
        const tracks: readonly TrackSample[] = [{historyId: "h-1", events: [{
            historyId: "h-1", particleId: "p-1", type: "absorb",
            position: {x: 1, y: 2, z: 3}, direction: {x: 1, y: 0, z: 0},
            energy: 2.5, weight: 0.75, time: 4, materialId: "m-1" as never, regionId: "g-1" as never, reason: "fixture",
        }]}];
        const adapter = createToyExecutionAdapter(project, {runToy: vi.fn(() => ({tracks}))});
        const events: TransportBackendEvent[] = [];
        for await (const event of adapter.execute({sessionId: "session-1", problem})) events.push(event);

        expect(adapter.metadata).toEqual({
            id: "visual-ts",
            name: "Visual TypeScript Toy Transport",
            version: "prototype",
            capabilities: {
                particles: ["photon"],
                geometry: ["box", "sphere", "cylinder"],
                sources: ["point-source", "beam-source", "isotropic-source"],
                tallies: [],
                lifecycle: ["submit", "start"],
                dataPolicy: "toy",
            },
        });
        expect(events).toEqual([
            {type: "problemAccepted", problemId: "problem-1", diagnostics: []},
            {type: "runStarted", runId: "session-1", problemId: "problem-1", provenance: {
                backendId: "visual-ts", backendVersion: "prototype", problemId: "problem-1",
                seed: 7, dataPolicy: "toy", warnings: [],
            }},
            {type: "runProgress", runId: "session-1", completedHistories: 1, totalHistories: 1},
            {type: "trackSamples", runId: "session-1", samples: [{historyId: "h-1", events: [{
                historyId: "h-1", particleId: "p-1", type: "absorb",
                position: {x: 1, y: 2, z: 3}, direction: {x: 1, y: 0, z: 0},
                energyMeV: 2.5, weight: 0.75, time: 4, materialId: "m-1", entityId: "g-1", reason: "fixture",
            }]}]},
            {type: "runCompleted", runId: "session-1", summary: {
                completedHistories: 1, totalHistories: 1, sampledTrackCount: 1, tallyCount: 0, diagnostics: [],
            }},
        ]);
    });

    it("does not invent an empty track batch", async () => {
        const adapter = createToyExecutionAdapter(project, {runToy: vi.fn(() => ({tracks: []}))});
        const events: TransportBackendEvent[] = [];
        for await (const event of adapter.execute({sessionId: "session-1", problem})) events.push(event);
        expect(events.map((event) => event.type)).toEqual([
            "problemAccepted", "runStarted", "runProgress", "runCompleted",
        ]);
    });

    it("keeps native transport metadata outside the execution stream", async () => {
        const runNative = vi.fn(async (): Promise<readonly TransportBackendEvent[]> => [
            {type: "backendMetadata", metadata: createNativeExecutionAdapter().metadata},
            {type: "runFailed", runId: "session-1", diagnostic: {
                level: "error", code: "native.bridge.unavailable", message: "Unavailable.",
            }},
        ]);
        const adapter = createNativeExecutionAdapter(undefined, {runNative});
        const events: TransportBackendEvent[] = [];
        for await (const event of adapter.execute({sessionId: "session-1", problem})) events.push(event);
        expect(events).toEqual([{type: "runFailed", runId: "session-1", diagnostic: {
            level: "error", code: "native.bridge.unavailable", message: "Unavailable.",
        }}]);
    });
});

const project = {
    runConfiguration: {visibleHistoryBudget: 1},
} as Project;

const problem = {
    id: "problem-1",
    settings: {histories: 1, seed: 7},
} as TransportProblem;
