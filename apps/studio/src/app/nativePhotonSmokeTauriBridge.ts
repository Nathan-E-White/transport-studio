import {invoke} from "@tauri-apps/api/core";
import {
    parseNativeExecutionFailure,
    type NativeExecutionSuccess,
    type NativePhotonSmokeBridge,
} from "@transport/transport-worker";

export const RUN_PHOTON_SMOKE_COMMAND = "run_photon_smoke";

export function createTauriNativePhotonSmokeBridge(): NativePhotonSmokeBridge | undefined {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
        return undefined;
    }

    return {
        runPhotonSmoke: async (request) => {
            try {
                return await invoke<NativeExecutionSuccess>(RUN_PHOTON_SMOKE_COMMAND, {request});
            } catch (failure) {
                throw parseNativeExecutionFailure(failure);
            }
        },
    };
}
