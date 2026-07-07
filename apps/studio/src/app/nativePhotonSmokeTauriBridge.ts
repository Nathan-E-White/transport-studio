import {invoke} from "@tauri-apps/api/core";
import type {TransportProblem} from "@transport/domain/transport/TransportProblem";
import type {NativePhotonSmokeBridge, NativePhotonSmokePayload} from "@transport/transport-worker";

export const RUN_PHOTON_SMOKE_COMMAND = "run_photon_smoke";

export function createTauriNativePhotonSmokeBridge(): NativePhotonSmokeBridge | undefined {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
        return undefined;
    }

    return {
        runPhotonSmoke: (problem: TransportProblem) =>
            invoke<NativePhotonSmokePayload>(RUN_PHOTON_SMOKE_COMMAND, {problem}),
    };
}
