import {describe, expect, it} from "vitest";
import {
  nativeRustPhotonBackendMetadata,
  NATIVE_RUST_PHOTON_BACKEND_ID,
  type TransportBackendDiagnostic,
} from "@transport/domain";
import contractFixture from "../../../fixtures/contracts/native-execution-v1.json";
import {
  createNativeExecutionRequest,
  NATIVE_EXECUTION_CONTRACT_VERSION,
  parseNativeBackendEvents,
  parseNativeExecutionFailure,
  parseNativeExecutionSuccess,
  runNativePhotonSmokeBackend,
  type NativePhotonSmokeBridge,
  type NativePhotonSmokePayload,
} from "./index";
import {createNativePhotonSmokeFixtureProblem} from "./nativePhotonSmokeFixture";

describe("runNativePhotonSmokeBackend", () => {
  it("returns an explicit failure event when no native bridge is available", async () => {
    const events = await runNativePhotonSmokeBackend(createNativePhotonSmokeFixtureProblem());

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({type: "backendMetadata"}),
        expect.objectContaining({
          type: "runFailed",
          diagnostic: expect.objectContaining({code: "native.bridge.unavailable"}),
        }),
      ]),
    );
    expect(events.find((event) => event.type === "runFailed")).toEqual(contractFixture.backendEvents[1]);
  });

  it("constructs the shared versioned request through the production contract seam", () => {
    const wireRequest = JSON.parse(JSON.stringify(createNativeExecutionRequest(createNativePhotonSmokeFixtureProblem())));
    expect(wireRequest).toEqual(contractFixture.request);
  });

  it("parses shared success and event fixtures while ignoring additive fields", () => {
    expect(parseNativeExecutionSuccess({...contractFixture.success, additiveFutureField: true})).toEqual({
      ...contractFixture.success,
      additiveFutureField: true,
    });
    expect(parseNativeBackendEvents(contractFixture.backendEvents)).toEqual(contractFixture.backendEvents);
  });

  it("rejects contract-version mismatches and unknown event kinds explicitly", () => {
    expect(() => parseNativeExecutionSuccess({...contractFixture.success, contractVersion: "0.0.0"}))
      .toThrow(contractFixture.failure.message);
    expect(() => parseNativeBackendEvents([{type: "future-event"}]))
      .toThrow("Unknown native backend event kind 'future-event'.");
    expect(() => parseNativeBackendEvents([{type: "runCompleted"}]))
      .toThrow("Unknown native backend event kind 'runCompleted'.");
    expect(parseNativeExecutionFailure(contractFixture.failure)).toEqual(contractFixture.failure);
  });

  it("emits a complete ordered backend event stream from an injected native bridge", async () => {
    const problem = createNativePhotonSmokeFixtureProblem();
    const bridgePayload: NativePhotonSmokePayload = {
      runId: "native-fixture-run",
      completedHistories: problem.settings.histories,
      totalHistories: problem.settings.histories,
      warnings: ["simple coefficient smoke kernel"],
      diagnostics: [diagnostic("warning", "physics_data.simple_coefficients")],
      tracks: [
        {
          historyId: "h-0",
          events: [
            {
              historyId: "h-0",
              particleId: "p-0",
              type: "birth",
              position: {x: -4, y: 0, z: 0},
              direction: {x: 1, y: 0, z: 0},
              energyMeV: 1,
              weight: 1,
              time: 0,
              reason: "native photon birth",
            },
            {
              historyId: "h-0",
              particleId: "p-0",
              type: "boundary-crossing",
              position: {x: -1, y: 0, z: 0},
              direction: {x: 1, y: 0, z: 0},
              energyMeV: 1,
              weight: 1,
              time: 0,
              materialId: "mat-water",
              entityId: "shield-box",
              reason: "entered supported analytic geometry",
            },
            {
              historyId: "h-0",
              particleId: "p-0",
              type: "absorb",
              position: {x: 0, y: 0, z: 0},
              direction: {x: 1, y: 0, z: 0},
              energyMeV: 1,
              weight: 1,
              time: 0,
              materialId: "mat-water",
              entityId: "shield-box",
              reason: "sampled absorption",
            },
          ],
        },
      ],
      tallyDeltas: [
        {
          tallyId: "shield-track-length",
          scores: [12.5],
        },
      ],
    };
    const bridge: NativePhotonSmokeBridge = {
      runPhotonSmoke: async (request) => {
        expect(request).toEqual({contractVersion: NATIVE_EXECUTION_CONTRACT_VERSION, problem});
        return {contractVersion: NATIVE_EXECUTION_CONTRACT_VERSION, payload: bridgePayload};
      },
    };

    const events = await runNativePhotonSmokeBackend(problem, bridge);

    expect(events.map((event) => event.type)).toEqual([
      "backendMetadata",
      "problemAccepted",
      "runStarted",
      "runProgress",
      "trackSamples",
      "tallyDelta",
      "runCompleted",
    ]);
    expect(events[0]).toEqual({type: "backendMetadata", metadata: nativeRustPhotonBackendMetadata});
    expect(events[1]).toMatchObject({
      type: "problemAccepted",
      problemId: "fixture-photon-shielding",
      diagnostics: bridgePayload.diagnostics,
    });
    expect(events[2]).toMatchObject({
      type: "runStarted",
      runId: "native-fixture-run",
      problemId: "fixture-photon-shielding",
      provenance: {
        backendId: NATIVE_RUST_PHOTON_BACKEND_ID,
        backendVersion: nativeRustPhotonBackendMetadata.version,
        problemId: "fixture-photon-shielding",
        seed: 1337,
        dataPolicy: "hybrid-warning-mode",
        warnings: ["simple coefficient smoke kernel"],
      },
    });
    expect(events[3]).toMatchObject({
      type: "runProgress",
      completedHistories: 16,
      totalHistories: 16,
    });
    expect(events[4]).toMatchObject({
      type: "trackSamples",
      samples: bridgePayload.tracks,
    });
    expect(events[5]).toMatchObject({
      type: "tallyDelta",
      delta: bridgePayload.tallyDeltas[0],
    });
    expect(events[6]).toMatchObject({
      type: "runCompleted",
      summary: {
        completedHistories: 16,
        totalHistories: 16,
        sampledTrackCount: 1,
        tallyCount: 1,
        diagnostics: bridgePayload.diagnostics,
      },
    });
  });

  it("uses the compiled editor-scene fixture as the canonical native MWE input", () => {
    const problem = createNativePhotonSmokeFixtureProblem();

    expect(problem).toMatchObject({
      id: "fixture-photon-shielding",
      status: "compiled",
      metadata: {
        sourceSceneId: "fixture-photon-shielding",
        targetBackendId: NATIVE_RUST_PHOTON_BACKEND_ID,
        tags: ["mwe", "native-photon-smoke"],
      },
      geometry: {
        entities: [
          {
            id: "shield-box",
            kind: "box",
            materialId: "mat-water",
          },
        ],
      },
      materials: [
        {
          id: "mat-water",
          density: 1,
        },
      ],
      sources: [
        {
          id: "beam-1",
          kind: "beam-source",
          particle: "photon",
          direction: {x: 1, y: 0, z: 0},
        },
      ],
      tallies: [
        {
          id: "shield-track-length",
          kind: "cell-flux",
          entityId: "shield-box",
        },
      ],
      settings: {
        histories: 16,
        seed: 1337,
      },
    });
  });
});

function diagnostic(
  level: TransportBackendDiagnostic["level"],
  code: string,
): TransportBackendDiagnostic {
  return {
    level,
    code,
    message: code,
  };
}
