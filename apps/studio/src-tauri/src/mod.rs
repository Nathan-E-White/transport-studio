//! Thin Tauri adapter for the runtime-neutral Native Execution Contract.

pub use native_execution_contract::NativeExecutionResponse;
pub use spacetime_physics;
pub use transport_engine;

pub const NATIVE_BACKEND_ID: &str = transport_engine::NATIVE_PHOTON_BACKEND_ID;

pub fn native_backend_metadata() -> transport_engine::BackendMetadata {
    transport_engine::backend_metadata()
}

#[tauri::command]
pub fn run_photon_smoke(request: serde_json::Value) -> NativeExecutionResponse {
    native_execution_contract::execute_native_request(request)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tauri_command_accepts_the_golden_opaque_request_and_returns_v2_events() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../fixtures/contracts/native-execution-v2.json"
        ))
        .expect("shared fixture should be valid JSON");

        let response = serde_json::to_value(run_photon_smoke(fixture["request"].clone()))
            .expect("Tauri response should serialize");

        assert_eq!(response["contractVersion"], "2.0.0");
        assert_eq!(response["events"][0]["type"], "backendMetadata");
        assert_eq!(response["events"][1]["runId"], "fixture-session");
        assert_eq!(
            response["events"].as_array().unwrap().last().unwrap()["type"],
            "runCompleted"
        );
    }
}
