use serde::{Deserialize, Serialize};
use std::path::Path;
#[cfg(target_os = "android")]
use std::path::PathBuf;
use tauri::{plugin::TauriPlugin, Manager, Runtime};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.sakti_dev.sakti_pos.photo";

#[cfg(not(target_os = "android"))]
const UNSUPPORTED_PLATFORM_ERROR: &str = "Product photo picking is only supported on Android";

#[derive(Debug, Clone, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProductPhotoSource {
    Camera,
    Gallery,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedProductPhoto {
    pub path: String,
    pub original_filename: String,
    pub mime_type: String,
    pub preview_base64: Option<String>,
    pub preview_mime_type: Option<String>,
    pub source: ProductPhotoSource,
}

pub struct ProductPhotoPicker<R: Runtime> {
    #[cfg(target_os = "android")]
    mobile_plugin_handle: tauri::plugin::PluginHandle<R>,
    #[cfg(not(target_os = "android"))]
    _marker: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> ProductPhotoPicker<R> {
    fn pick_photo(&self, source: ProductPhotoSource) -> Result<PickedProductPhoto, String> {
        #[cfg(target_os = "android")]
        {
            return self
                .mobile_plugin_handle
                .run_mobile_plugin("pickPhoto", serde_json::json!({ "source": source }))
                .map_err(|error| {
                    log::info!("[RUST] [PHOTO:TRACE] pick_product_photo:failed {}", error);
                    error.to_string()
                });
        }

        #[cfg(not(target_os = "android"))]
        {
            let _ = source;
            Err(unsupported_platform_error().to_string())
        }
    }
}

#[cfg(target_os = "android")]
pub fn picked_product_photo_from_path(
    path: PathBuf,
    original_filename: String,
    mime_type: String,
    preview_base64: Option<String>,
    preview_mime_type: Option<String>,
    source: ProductPhotoSource,
) -> PickedProductPhoto {
    PickedProductPhoto {
        path: path.to_string_lossy().to_string(),
        original_filename,
        mime_type,
        preview_base64,
        preview_mime_type,
        source,
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("product-photo-picker")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let mobile_plugin_handle =
                    api.register_android_plugin(PLUGIN_IDENTIFIER, "ProductPhotoPlugin")?;
                app.manage(ProductPhotoPicker::<R> {
                    mobile_plugin_handle,
                });
            }

            #[cfg(not(target_os = "android"))]
            {
                let _ = api;
                app.manage(ProductPhotoPicker::<R> {
                    _marker: std::marker::PhantomData,
                });
            }

            Ok(())
        })
        .build()
}

#[cfg(not(target_os = "android"))]
pub fn unsupported_platform_error() -> &'static str {
    UNSUPPORTED_PLATFORM_ERROR
}

#[tauri::command]
pub async fn pick_product_photo<R: Runtime>(
    app: tauri::AppHandle<R>,
    source: ProductPhotoSource,
) -> Result<PickedProductPhoto, String> {
    log::info!("[RUST] [PHOTO:TRACE] pick_product_photo:start source={source:?}");
    if uses_android_fs_picker(&source) {
        let result = crate::android_fs::pick_gallery_to_product_photo_input(&app).await?;
        log::info!(
            "[RUST] [PHOTO:TRACE] pick_product_photo:done source={:?} path={} filename={} mime_type={}",
            result.source, result.path, result.original_filename, result.mime_type
        );
        return Ok(result);
    }

    let result = app.state::<ProductPhotoPicker<R>>().pick_photo(source)?;
    log::info!(
        "[RUST] [PHOTO:TRACE] pick_product_photo:done source={:?} path={} filename={} mime_type={}",
        result.source,
        result.path,
        result.original_filename,
        result.mime_type
    );
    Ok(result)
}

fn uses_android_fs_picker(source: &ProductPhotoSource) -> bool {
    matches!(source, ProductPhotoSource::Gallery)
}

fn is_deletable_temp_photo_path(path: &Path) -> bool {
    path.components()
        .any(|component| component.as_os_str() == "product_photo_inputs")
}

#[cfg(test)]
fn is_stale_picker_temp_path(path: &Path) -> bool {
    path.components()
        .any(|component| component.as_os_str() == "product_photo_transient")
}

#[tauri::command]
pub async fn delete_temp_product_photo(path: String) -> Result<(), String> {
    let path_buf = std::path::PathBuf::from(&path);
    if !is_deletable_temp_photo_path(&path_buf) {
        return Err("Refusing to delete non product photo temp path".to_string());
    }

    match tokio::fs::remove_file(&path_buf).await {
        Ok(()) => {
            log::info!("[RUST] [PHOTO:TRACE] delete_temp_product_photo:done path={path}");
            Ok(())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Failed to delete temp product photo: {}", error)),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use std::path::Path;

    #[test]
    fn product_photo_source_serializes_to_lowercase_for_kotlin() {
        assert_eq!(
            serde_json::to_value(super::ProductPhotoSource::Camera).unwrap(),
            json!("camera")
        );
        assert_eq!(
            serde_json::to_value(super::ProductPhotoSource::Gallery).unwrap(),
            json!("gallery")
        );
    }

    #[test]
    fn desktop_bridge_reports_android_only_support() {
        assert_eq!(
            super::unsupported_platform_error(),
            "Product photo picking is only supported on Android"
        );
    }

    #[test]
    fn temp_photo_delete_guard_only_allows_photo_inputs() {
        assert!(super::is_deletable_temp_photo_path(Path::new(
            "/tmp/product_photo_inputs/photo.jpg"
        )));
        assert!(!super::is_deletable_temp_photo_path(Path::new(
            "/tmp/asset-cache/photo.webp"
        )));
    }

    #[test]
    fn stale_temp_cleanup_never_targets_product_photo_inputs() {
        assert!(!super::is_stale_picker_temp_path(Path::new(
            "/data/user/0/com.sakti_dev.sakti_pos/cache/product_photo_inputs/gallery_123.jpg"
        )));
    }

    #[test]
    fn stale_temp_cleanup_may_target_plugin_private_transient_files() {
        assert!(super::is_stale_picker_temp_path(Path::new(
            "/data/user/0/com.sakti_dev.sakti_pos/cache/product_photo_transient/photo_123.jpg"
        )));
    }

    #[test]
    fn gallery_source_is_routed_to_android_fs() {
        assert!(super::uses_android_fs_picker(
            &super::ProductPhotoSource::Gallery
        ));
        assert!(!super::uses_android_fs_picker(
            &super::ProductPhotoSource::Camera
        ));
    }
}
