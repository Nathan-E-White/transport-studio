import {invoke} from "@tauri-apps/api/core";
import type {NativeExecutionResponse} from "@transport/native-execution-contract";
import type {NativePhotonSmokeBridge} from "@transport/transport-worker";

export const RUN_PHOTON_SMOKE_COMMAND = "run_photon_smoke";

export function createTauriNativePhotonSmokeBridge(): NativePhotonSmokeBridge | undefined {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
        return undefined;
    }

    return {
        runPhotonSmoke: async (request) => {
            return invoke<NativeExecutionResponse>(RUN_PHOTON_SMOKE_COMMAND, {request});
        },
    };
}
