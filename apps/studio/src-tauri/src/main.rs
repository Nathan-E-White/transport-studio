fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![transport_studio::run_photon_smoke])
        .run(tauri::generate_context!())
        .expect("failed to run Transport Studio");
}
