import {describe, expect, it} from "vitest";
import fixture from "../../../fixtures/contracts/native-execution-v2.json";
import {runNativePhotonSmokeBackend, type NativePhotonSmokeBridge} from "./index";
import {createNativePhotonSmokeFixtureProblem} from "./nativePhotonSmokeFixture";

describe("native execution v2 adapter", () => {
  it("keeps browser-only bridge unavailability as a terminal canonical diagnostic", async () => {
    const events = await runNativePhotonSmokeBackend(
      createNativePhotonSmokeFixtureProblem(),
      "fixture-session",
    );

    expect(events.map((event) => event.type)).toEqual(["backendMetadata", "runFailed"]);
    expect(events.at(-1)).toEqual(fixture.bridgeUnavailableEvent);
  });

  it("submits the caller-owned session id and returns the validated canonical event stream", async () => {
    const bridge: NativePhotonSmokeBridge = {
      runPhotonSmoke: async (request) => {
        expect(request).toMatchObject({
          contractVersion: fixture.request.contractVersion,
          runSessionId: fixture.request.runSessionId,
          problem: {id: fixture.request.problem.id, settings: {seed: 1337}},
        });
        return {contractVersion: "2.0.0", events: fixture.eventExamples.slice(0, 8)};
      },
    };

    const events = await runNativePhotonSmokeBackend(
      createNativePhotonSmokeFixtureProblem(),
      "fixture-session",
      bridge,
    );

    expect(events).toEqual(fixture.eventExamples.slice(0, 8));
    expect(events.filter((event) => event.type !== "backendMetadata").every((event) =>
      "runId" in event && event.runId === "fixture-session")).toBe(true);
  });

  it("turns bridge transport rejection into a terminal diagnostic event", async () => {
    const events = await runNativePhotonSmokeBackend(
      createNativePhotonSmokeFixtureProblem(),
      "fixture-session",
      {runPhotonSmoke: async () => { throw new Error("IPC unavailable"); }},
    );

    expect(events.map((event) => event.type)).toEqual(["backendMetadata", "diagnostic", "runFailed"]);
    expect(events[1]).toMatchObject({
      type: "diagnostic",
      runId: "fixture-session",
      diagnostic: {code: "native.adapter.transport_failure", message: "IPC unavailable"},
    });
    expect(events.at(-1)).toEqual({
      type: "runFailed",
      runId: "fixture-session",
      diagnostic: {
        level: "error",
        code: "native.adapter.failed",
        message: "Native adapter transport failed; see the preceding diagnostic event.",
        problemId: "fixture-photon-shielding",
        runId: "fixture-session",
      },
    });
    expect(events[0]).toEqual({type: "backendMetadata", metadata: expect.any(Object)});
    const terminal = events.at(-1);
    expect(terminal?.type).toBe("runFailed");
    if (terminal?.type !== "runFailed") throw new Error("Expected terminal runFailed event.");
    expect(terminal.diagnostic.level).toBe("error");
  });

  it("uses a stable diagnostic when the adapter rejects with a non-Error value", async () => {
    const events = await runNativePhotonSmokeBackend(
      createNativePhotonSmokeFixtureProblem(),
      "fixture-session",
      {runPhotonSmoke: async () => Promise.reject("opaque rejection")},
    );

    expect(events.at(-1)).toMatchObject({
      type: "runFailed",
      diagnostic: {code: "native.adapter.failed"},
    });
    expect(events[1]).toMatchObject({
      type: "diagnostic",
      diagnostic: {message: "Native adapter transport failed."},
    });
  });

  it("keeps the shared photon problem as the native minimum working example", () => {
    expect(createNativePhotonSmokeFixtureProblem()).toMatchObject({
      id: "fixture-photon-shielding",
      geometry: {entities: [{kind: "box", materialId: "mat-water"}]},
      sources: [{kind: "beam-source", particle: "photon"}],
      tallies: [{kind: "cell-flux", entityId: "shield-box"}],
      settings: {histories: 16, seed: 1337},
    });
  });
});
