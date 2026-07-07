import {afterEach, describe, expect, it, vi} from "vitest";
import {createNativePhotonSmokeFixtureProblem} from "@transport/transport-worker";
import {createTauriNativePhotonSmokeBridge, RUN_PHOTON_SMOKE_COMMAND} from "./nativePhotonSmokeTauriBridge";
import {invoke} from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
    invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

describe("createTauriNativePhotonSmokeBridge", () => {
    afterEach(() => {
        invokeMock.mockReset();
        delete (window as Window & {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    });

    it("returns undefined outside the Tauri runtime", () => {
        expect(createTauriNativePhotonSmokeBridge()).toBeUndefined();
    });

    it("invokes the native smoke command with the compiled problem payload", async () => {
        const problem = createNativePhotonSmokeFixtureProblem();
        const payload = {
            runId: "native-fixture-run",
            tracks: [],
            tallyDeltas: [],
            diagnostics: [],
            completedHistories: 16,
            totalHistories: 16,
            warnings: ["simple coefficient smoke kernel"],
        };
        (window as Window & {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = {};
        invokeMock.mockResolvedValue(payload);

        const bridge = createTauriNativePhotonSmokeBridge();

        await expect(bridge?.runPhotonSmoke(problem)).resolves.toBe(payload);
        expect(invokeMock).toHaveBeenCalledWith(RUN_PHOTON_SMOKE_COMMAND, {problem});
    });
});
