//! Thin Tauri adapter for the runtime-neutral Native Execution Contract.

pub use native_execution_contract::{
    NativeExecutionFailure, NativeExecutionRequest, NativeExecutionSuccess,
};
pub use spacetime_physics;
pub use transport_engine;

pub const NATIVE_BACKEND_ID: &str = transport_engine::NATIVE_PHOTON_BACKEND_ID;

pub fn native_backend_metadata() -> transport_engine::BackendMetadata {
    transport_engine::backend_metadata()
}

#[tauri::command]
pub fn run_photon_smoke(
    request: NativeExecutionRequest,
) -> Result<NativeExecutionSuccess, NativeExecutionFailure> {
    native_execution_contract::execute_native_request(request)
}
