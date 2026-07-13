import {afterEach, describe, expect, it, vi} from "vitest";
import {
    createNativeExecutionRequest,
    NATIVE_EXECUTION_CONTRACT_VERSION,
} from "@transport/native-execution-contract";
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
        (window as Window & {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = {};
        const response = {contractVersion: NATIVE_EXECUTION_CONTRACT_VERSION, events: []};
        invokeMock.mockResolvedValue(response);

        const bridge = createTauriNativePhotonSmokeBridge();

        const request = createNativeExecutionRequest("fixture-session", problem);
        await expect(bridge?.runPhotonSmoke(request)).resolves.toBe(response);
        expect(invokeMock).toHaveBeenCalledWith(RUN_PHOTON_SMOKE_COMMAND, {request});
    });

    it("leaves adapter transport rejection for the runtime-neutral worker to convert", async () => {
        const failure = new Error("IPC unavailable");
        (window as Window & {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = {};
        invokeMock.mockRejectedValue(failure);

        const bridge = createTauriNativePhotonSmokeBridge();
        await expect(bridge?.runPhotonSmoke(createNativeExecutionRequest("fixture-session", createNativePhotonSmokeFixtureProblem())))
            .rejects.toEqual(failure);
    });
});
