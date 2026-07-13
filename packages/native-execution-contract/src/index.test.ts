import {describe, expect, it} from "vitest";
import fixture from "../../../fixtures/contracts/native-execution-v2.json";
import {
  createNativeExecutionRequest,
  NATIVE_EXECUTION_CONTRACT_VERSION,
  parseNativeExecutionEvent,
  parseNativeExecutionResponse,
} from "./index";

describe("Native Execution Contract v2", () => {
  it("owns the shared request and complete event conformance corpus", () => {
    expect(createNativeExecutionRequest(fixture.request.runSessionId, fixture.request.problem as never))
      .toEqual(fixture.request);
    expect(fixture.eventExamples.map(parseNativeExecutionEvent)).toEqual(fixture.eventExamples);
    expect(parseNativeExecutionResponse({
      contractVersion: NATIVE_EXECUTION_CONTRACT_VERSION,
      events: fixture.eventExamples.slice(0, 8),
      additiveFutureField: true,
    }).events).toEqual(fixture.eventExamples.slice(0, 8));
    expect(new Set(fixture.eventExamples.map((event) => event.type))).toEqual(new Set([
      "backendMetadata",
      "problemAccepted",
      "runStarted",
      "runProgress",
      "trackSamples",
      "tallyDelta",
      "diagnostic",
      "runCompleted",
      "runFailed",
    ]));
  });

  it("rejects v1, missing session ids, and unknown event kinds", () => {
    expect(() => parseNativeExecutionResponse({...fixture.successResponse, contractVersion: "1.0.0"}))
      .toThrow("Unsupported native execution contract version '1.0.0'; expected '2.0.0'.");
    expect(() => parseNativeExecutionResponse({
      contractVersion: NATIVE_EXECUTION_CONTRACT_VERSION,
      events: [{type: "runCompleted", summary: fixture.eventExamples[7]?.summary}],
    })).toThrow("Unknown or invalid native execution event kind 'runCompleted'.");
    expect(() => parseNativeExecutionResponse({
      contractVersion: NATIVE_EXECUTION_CONTRACT_VERSION,
      events: [{type: "futureEvent", runId: "fixture-session"}],
    })).toThrow("Unknown or invalid native execution event kind 'futureEvent'.");
    expect(() => parseNativeExecutionResponse({contractVersion: NATIVE_EXECUTION_CONTRACT_VERSION}))
      .toThrow("Native execution response events must be an array.");
    expect(() => parseNativeExecutionResponse({
      contractVersion: NATIVE_EXECUTION_CONTRACT_VERSION,
      events: [],
    })).toThrow("Native execution response must contain events.");
    expect(() => parseNativeExecutionResponse(null))
      .toThrow("Unsupported native execution contract version 'missing'; expected '2.0.0'.");
    expect(() => parseNativeExecutionResponse({contractVersion: 2, events: []}))
      .toThrow("Unsupported native execution contract version 'missing'; expected '2.0.0'.");
  });

  it("rejects malformed data inside every canonical event family", () => {
    const events = structuredClone(fixture.eventExamples) as unknown as Record<string, unknown>[];
    const [metadata, accepted, started, progress, tracks, tally, diagnostic, completed, failed] = events;
    const metadataBody = metadata?.metadata as Record<string, unknown>;
    const capabilities = metadataBody.capabilities as Record<string, unknown>;
    const provenance = started?.provenance as Record<string, unknown>;
    const samples = tracks?.samples as Record<string, unknown>[];
    const sampleEvents = samples[0]?.events as Record<string, unknown>[];
    const delta = tally?.delta as Record<string, unknown>;
    const diagnosticBody = diagnostic?.diagnostic as Record<string, unknown>;
    const summary = completed?.summary as Record<string, unknown>;
    const failureDiagnostic = failed?.diagnostic as Record<string, unknown>;
    const malformedEvents: readonly unknown[] = [
      null,
      [],
      {...accepted, runId: undefined},
      {...accepted, problemId: 7},
      {...accepted, diagnostics: "none"},
      {...metadata, metadata: {...metadataBody, name: 7}},
      {...metadata, metadata: {...metadataBody, id: 7}},
      {...metadata, metadata: {...metadataBody, version: 7}},
      {...metadata, metadata: {...metadataBody, capabilities: {...capabilities, particles: ["photon", 7]}}},
      {...metadata, metadata: {...metadataBody, capabilities: {...capabilities, lifecycle: ["cancel"]}}},
      {...metadata, metadata: {...metadataBody, capabilities: {...capabilities, lifecycle: ["submit", "cancel"]}}},
      {...accepted, diagnostics: [{}]},
      {...started, provenance: {...provenance, seed: "1337"}},
      {...started, provenance: {...provenance, dataPolicy: "invented"}},
      {...started, problemId: 7},
      {...started, provenance: {...provenance, backendId: 7}},
      {...started, provenance: {...provenance, backendVersion: 7}},
      {...started, provenance: {...provenance, problemId: 7}},
      {...started, provenance: {...provenance, warnings: ["warning", 7]}},
      {...progress, completedHistories: Number.NaN},
      {...progress, totalHistories: "16"},
      {...tracks, samples: [{...samples[0], events: [{...sampleEvents[0], type: "teleport"}]}]},
      {...tracks, samples: [samples[0], {...samples[0], historyId: 7}]},
      {...tracks, samples: [{...samples[0], historyId: 7}]},
      {...tracks, samples: [{...samples[0], events: [sampleEvents[0], {...sampleEvents[0], particleId: 7}]}]},
      {...tracks, samples: [{...samples[0], events: [{...sampleEvents[0], historyId: 7}]}]},
      {...tracks, samples: [{...samples[0], events: [{...sampleEvents[0], position: {x: "bad", y: 0, z: 0}}]}]},
      {...tally, delta: {...delta, scores: [Number.POSITIVE_INFINITY]}},
      {...tally, delta: {...delta, tallyId: 7}},
      {...tally, delta: {...delta, scores: [1, Number.POSITIVE_INFINITY]}},
      {...diagnostic, diagnostic: {...diagnosticBody, level: "fatal"}},
      {...diagnostic, diagnostic: {...diagnosticBody, message: 42}},
      {...diagnostic, diagnostic: {...diagnosticBody, code: 42}},
      {...completed, summary: {...summary, completedHistories: "16"}},
      {...completed, summary: {...summary, totalHistories: "16"}},
      {...completed, summary: {...summary, sampledTrackCount: "one"}},
      {...completed, summary: {...summary, tallyCount: "one"}},
      {...completed, summary: {...summary, diagnostics: [{}]}},
      {...failed, diagnostic: {...failureDiagnostic, code: 42}},
    ];

    for (const event of malformedEvents) {
      expect(() => parseNativeExecutionEvent(event)).toThrow("Unknown or invalid native execution event kind");
    }
  });

  it("accepts every declared data policy, diagnostic level, and particle event kind", () => {
    const eventExamples = structuredClone(fixture.eventExamples) as unknown as Record<string, unknown>[];
    const started = eventExamples[2] as Record<string, unknown>;
    const provenance = started.provenance as Record<string, unknown>;
    const diagnostic = eventExamples[6] as Record<string, unknown>;
    const diagnosticBody = diagnostic.diagnostic as Record<string, unknown>;
    const tracks = eventExamples[4] as Record<string, unknown>;
    const samples = tracks.samples as Record<string, unknown>[];
    const sampleEvents = samples[0]?.events as Record<string, unknown>[];

    for (const dataPolicy of ["toy", "simple-coefficients", "hybrid-warning-mode", "requires-data-packs"]) {
      expect(parseNativeExecutionEvent({...started, provenance: {...provenance, dataPolicy}}).type)
        .toBe("runStarted");
    }
    for (const level of ["info", "warning", "error"]) {
      expect(parseNativeExecutionEvent({...diagnostic, diagnostic: {...diagnosticBody, level}}).type)
        .toBe("diagnostic");
    }
    for (const type of ["birth", "move", "boundary-crossing", "scatter", "absorb", "escape", "detector-hit", "error-lost"]) {
      expect(parseNativeExecutionEvent({
        ...tracks,
        samples: [{...samples[0], events: [{...sampleEvents[0], type}]}],
      }).type).toBe("trackSamples");
    }
  });

  it("enforces caller identity and one ordered lifecycle", () => {
    const successEvents = fixture.eventExamples.slice(0, 8);
    expect(() => parseNativeExecutionResponse({
      contractVersion: NATIVE_EXECUTION_CONTRACT_VERSION,
      events: successEvents,
    }, "another-session")).toThrow("does not match caller session 'another-session'");
    expect(() => parseNativeExecutionResponse({
      contractVersion: NATIVE_EXECUTION_CONTRACT_VERSION,
      events: [successEvents[0], successEvents[2], successEvents[1], ...successEvents.slice(3)],
    })).toThrow("must begin with metadata, acceptance, and start events");
    for (const events of [
      [successEvents[1], successEvents[0], ...successEvents.slice(2)],
      [successEvents[0], successEvents[2], ...successEvents.slice(2)],
      [successEvents[0], successEvents[1], successEvents[3], ...successEvents.slice(3)],
      [successEvents[0]],
    ]) {
      expect(() => parseNativeExecutionResponse({
        contractVersion: NATIVE_EXECUTION_CONTRACT_VERSION,
        events,
      })).toThrow("must begin with metadata, acceptance, and start events");
    }
    expect(() => parseNativeExecutionResponse({
      contractVersion: NATIVE_EXECUTION_CONTRACT_VERSION,
      events: [...successEvents, fixture.eventExamples[6]],
    })).toThrow("must end with exactly one terminal event");
    expect(() => parseNativeExecutionResponse({
      contractVersion: NATIVE_EXECUTION_CONTRACT_VERSION,
      events: [...successEvents.slice(0, -1), fixture.eventExamples[8], fixture.eventExamples[7]],
    })).toThrow("is out of lifecycle order");
    for (const events of [
      [...successEvents.slice(0, 3), successEvents[4], successEvents[3], ...successEvents.slice(5)],
      [...successEvents.slice(0, 4), successEvents[5], successEvents[4], ...successEvents.slice(6)],
      [...successEvents.slice(0, 5), successEvents[6], successEvents[5], successEvents[7]],
    ]) {
      expect(() => parseNativeExecutionResponse({
        contractVersion: NATIVE_EXECUTION_CONTRACT_VERSION,
        events,
      })).toThrow("is out of lifecycle order");
    }
    expect(parseNativeExecutionResponse({
      contractVersion: NATIVE_EXECUTION_CONTRACT_VERSION,
      events: [...successEvents.slice(0, 4), successEvents[3], ...successEvents.slice(4, 7), successEvents[6], successEvents[7]],
    }).events).toHaveLength(10);
    expect(parseNativeExecutionResponse({
      contractVersion: NATIVE_EXECUTION_CONTRACT_VERSION,
      events: [fixture.eventExamples[8]],
    }, "fixture-session").events).toHaveLength(1);
    expect(() => parseNativeExecutionResponse({
      contractVersion: NATIVE_EXECUTION_CONTRACT_VERSION,
      events: [fixture.eventExamples[7]],
    })).toThrow("must begin with metadata, acceptance, and start events");
  });
});
