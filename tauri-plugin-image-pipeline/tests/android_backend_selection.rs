use tauri_plugin_image_pipeline::processor;

#[test]
fn desktop_backend_selection_stays_rust() {
    assert_eq!(processor::platform_backend_label(), "rust");
}
