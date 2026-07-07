import {describe, expect, it} from "vitest";
import {
    assertNeverTransportBackendEvent,
    nativeRustPhotonBackendMetadata,
    NATIVE_RUST_PHOTON_BACKEND_ID,
    type TransportBackendEvent,
} from "./TransportBackendProtocol";

function eventLabel(event: TransportBackendEvent): string {
    switch (event.type) {
        case "backendMetadata":
            return event.metadata.id;
        case "problemAccepted":
            return event.problemId;
        case "runStarted":
            return event.provenance.backendId;
        case "runProgress":
            return `${event.completedHistories}/${event.totalHistories}`;
        case "trackSamples":
            return `${event.samples.length}`;
        case "tallyDelta":
            return event.delta.tallyId;
        case "diagnostic":
            return event.diagnostic.code;
        case "runCompleted":
            return `${event.summary.completedHistories}`;
        case "runFailed":
            return event.diagnostic.code;
        default:
            return assertNeverTransportBackendEvent(event);
    }
}

describe("TransportBackendProtocol", () => {
    it("describes the native Rust photon backend capabilities", () => {
        expect(nativeRustPhotonBackendMetadata).toMatchObject({
            id: NATIVE_RUST_PHOTON_BACKEND_ID,
            capabilities: {
                particles: ["photon"],
                dataPolicy: "hybrid-warning-mode",
            },
        });
    });

    it("keeps backend events exhaustively discriminated", () => {
        expect(
            eventLabel({
                type: "runProgress",
                runId: "run-1",
                completedHistories: 5,
                totalHistories: 10,
            }),
        ).toBe("5/10");
    });
});
