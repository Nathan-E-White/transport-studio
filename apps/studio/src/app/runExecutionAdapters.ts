import type {
    Project,
    TrackSample,
    TransportBackendEvent,
    TransportBackendMetadata,
    TransportTrackSample,
} from "@transport/domain";
import {
    nativeRustPhotonBackendMetadata,
    VISUAL_TS_BACKEND_ID,
} from "@transport/domain";
import type {TransportProblem} from "@transport/domain/transport/TransportProblem";
import {
    runNativePhotonSmokeBackend,
    type NativePhotonSmokeBridge,
} from "@transport/transport-worker";
import {runToyPhotonTransport} from "@transport/transport-visual";
import type {RunExecutionAdapter} from "./runSession";

export interface ToyExecutionDependencies {
    readonly runToy?: typeof runToyPhotonTransport;
}

export interface NativeExecutionDependencies {
    readonly runNative?: (
        problem: TransportProblem,
        sessionId: string,
        bridge?: NativePhotonSmokeBridge,
    ) => Promise<readonly TransportBackendEvent[]>;
}

export const toyBackendMetadata: TransportBackendMetadata = {
    id: VISUAL_TS_BACKEND_ID,
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
};

export function createToyExecutionAdapter(
    project: Project,
    dependencies: ToyExecutionDependencies = {},
): RunExecutionAdapter {
    return {
        metadata: toyBackendMetadata,
        async *execute({sessionId, problem}) {
            const result = (dependencies.runToy ?? runToyPhotonTransport)(problem, {
                visibleHistoryBudget: project.runConfiguration.visibleHistoryBudget,
            });
            const tracks = result.tracks.map(toTransportTrackSample);
            yield {type: "problemAccepted", problemId: problem.id, diagnostics: []};
            yield {
                type: "runStarted",
                runId: sessionId,
                problemId: problem.id,
                provenance: {
                    backendId: VISUAL_TS_BACKEND_ID,
                    backendVersion: toyBackendMetadata.version,
                    problemId: problem.id,
                    seed: problem.settings.seed,
                    dataPolicy: "toy",
                    warnings: [],
                },
            };
            yield {
                type: "runProgress",
                runId: sessionId,
                completedHistories: problem.settings.histories,
                totalHistories: problem.settings.histories,
            };
            if (tracks.length > 0) yield {type: "trackSamples", runId: sessionId, samples: tracks};
            yield {
                type: "runCompleted",
                runId: sessionId,
                summary: {
                    completedHistories: problem.settings.histories,
                    totalHistories: problem.settings.histories,
                    sampledTrackCount: tracks.length,
                    tallyCount: 0,
                    diagnostics: [],
                },
            };
        },
    };
}

export function createNativeExecutionAdapter(
    bridge?: NativePhotonSmokeBridge,
    dependencies: NativeExecutionDependencies = {},
): RunExecutionAdapter {
    return {
        metadata: nativeRustPhotonBackendMetadata,
        async *execute({sessionId, problem}) {
            const events = await (dependencies.runNative ?? runNativePhotonSmokeBackend)(problem, sessionId, bridge);
            for (const event of events) {
                if (event.type !== "backendMetadata") yield event;
            }
        },
    };
}

function toTransportTrackSample(sample: TrackSample): TransportTrackSample {
    return {
        historyId: sample.historyId,
        events: sample.events.map((event) => ({
            historyId: event.historyId,
            particleId: event.particleId,
            type: event.type,
            position: event.position,
            direction: event.direction,
            energyMeV: event.energy,
            weight: event.weight,
            time: event.time,
            materialId: event.materialId,
            entityId: event.regionId,
            reason: event.reason,
        })),
    };
}
