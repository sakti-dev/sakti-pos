use std::path::{Path, PathBuf};
#[cfg(target_os = "android")]
use std::time::{SystemTime, UNIX_EPOCH};
#[cfg(target_os = "android")]
use tauri::Manager;

#[allow(dead_code)]
pub const ANDROID_FS_PICKER_MIME_TYPES: [&str; 1] = ["image/*"];
#[cfg(any(not(target_os = "android"), test))]
pub const ANDROID_FS_UNSUPPORTED_ERROR: &str =
    "Android FS gallery picker is only supported on Android";

#[allow(dead_code)]
pub fn extension_for_mime_type(mime_type: &str) -> &'static str {
    match mime_type.to_ascii_lowercase().as_str() {
        "image/png" => "png",
        "image/webp" => "webp",
        "image/heic" => "heic",
        "image/heif" => "heif",
        _ => "jpg",
    }
}

#[allow(dead_code)]
fn safe_source_extension(original_filename: &str) -> Option<String> {
    let extension = original_filename
        .rsplit_once('.')
        .map(|(_, extension)| extension.trim_matches('.').to_ascii_lowercase())?;

    if extension.is_empty()
        || extension.len() > 8
        || !extension
            .chars()
            .all(|character| character.is_ascii_alphanumeric())
    {
        return None;
    }

    Some(extension)
}

#[allow(dead_code)]
pub fn build_product_photo_input_path(
    cache_root: &Path,
    prefix: &str,
    original_filename: &str,
    mime_type: &str,
    timestamp_millis: u128,
) -> PathBuf {
    let extension = safe_source_extension(original_filename)
        .unwrap_or_else(|| extension_for_mime_type(mime_type).to_string());

    cache_root
        .join("product_photo_inputs")
        .join(format!("{prefix}_{timestamp_millis}.{extension}"))
}

#[cfg(target_os = "android")]
fn current_time_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

#[cfg(target_os = "android")]
pub async fn pick_gallery_to_product_photo_input<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<crate::android::photo_picker::PickedProductPhoto, String> {
    use tauri_plugin_android_fs::{AndroidFsExt, VisualMediaTarget};

    let api = app.android_fs_async();
    let file_picker = api.file_picker();
    let visual_media_picker_available = file_picker
        .is_visual_media_picker_available()
        .await
        .unwrap_or(false);
    let picker_strategy = gallery_picker_strategy(visual_media_picker_available);

    log::info!(
        "[RUST] [PHOTO:TRACE] pick_gallery_to_product_photo_input:picker_strategy visual_media_available={} strategy={picker_strategy:?}",
        visual_media_picker_available
    );

    let selected = match picker_strategy {
        GalleryPickerStrategy::VisualMedia => file_picker
            .pick_visual_media(VisualMediaTarget::ImageOnly, true)
            .await
            .map_err(|error| format!("Failed to open gallery picker: {error}"))?,
        GalleryPickerStrategy::FilePicker => file_picker
            .pick_file(None, &ANDROID_FS_PICKER_MIME_TYPES, true)
            .await
            .map_err(|error| format!("Failed to open gallery picker: {error}"))?,
    };

    let Some(uri) = selected else {
        return Err("Gallery operation was cancelled by user".to_string());
    };

    log::info!(
        "[RUST] [PHOTO:TRACE] pick_gallery_to_product_photo_input:selected uri={}",
        uri.uri
    );

    let mime_type = api
        .get_mime_type(&uri)
        .await
        .unwrap_or_else(|_| "image/jpeg".to_string());
    let original_filename = api.get_name_or_last_path_segment(&uri).await;
    let timestamp = current_time_millis();
    let cache_root = app
        .path()
        .app_cache_dir()
        .map_err(|_| "Could not resolve app cache directory".to_string())?;
    let target_path = build_product_photo_input_path(
        &cache_root,
        "gallery",
        &original_filename,
        &mime_type,
        timestamp,
    );

    if let Some(parent) = target_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| format!("Failed to create product photo input directory: {error}"))?;
    }

    let bytes = api
        .read(&uri)
        .await
        .map_err(|error| format!("Failed to read gallery image: {error}"))?;
    tokio::fs::write(&target_path, bytes)
        .await
        .map_err(|error| format!("Failed to stage gallery image: {error}"))?;

    Ok(
        crate::android::photo_picker::picked_product_photo_from_path(
            target_path,
            original_filename,
            mime_type,
            crate::android::photo_picker::ProductPhotoSource::Gallery,
        ),
    )
}

#[cfg(not(target_os = "android"))]
pub async fn pick_gallery_to_product_photo_input<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
) -> Result<crate::android::photo_picker::PickedProductPhoto, String> {
    Err(ANDROID_FS_UNSUPPORTED_ERROR.to_string())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
enum GalleryPickerStrategy {
    VisualMedia,
    FilePicker,
}

#[allow(dead_code)]
fn gallery_picker_strategy(visual_media_picker_available: bool) -> GalleryPickerStrategy {
    if visual_media_picker_available {
        GalleryPickerStrategy::VisualMedia
    } else {
        GalleryPickerStrategy::FilePicker
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    #[test]
    fn android_fs_module_is_available() {
        assert_eq!(super::ANDROID_FS_PICKER_MIME_TYPES, ["image/*"]);
    }

    #[test]
    fn desktop_error_message_is_stable() {
        assert_eq!(
            super::ANDROID_FS_UNSUPPORTED_ERROR,
            "Android FS gallery picker is only supported on Android"
        );
    }

    #[test]
    fn product_photo_input_path_uses_safe_extension() {
        let path = super::build_product_photo_input_path(
            Path::new("/tmp/cache"),
            "gallery",
            "Screenshot 1.PNG",
            "image/png",
            123,
        );

        assert_eq!(
            path,
            Path::new("/tmp/cache/product_photo_inputs/gallery_123.png")
        );
    }

    #[test]
    fn product_photo_input_path_falls_back_to_jpg_for_unknown_mime() {
        let path = super::build_product_photo_input_path(
            Path::new("/tmp/cache"),
            "gallery",
            "unknown",
            "application/octet-stream",
            123,
        );

        assert_eq!(
            path,
            Path::new("/tmp/cache/product_photo_inputs/gallery_123.jpg")
        );
    }

    #[test]
    fn product_photo_input_path_rejects_unsafe_source_extension() {
        let path = super::build_product_photo_input_path(
            Path::new("/tmp/cache"),
            "gallery",
            "bad.jp/g",
            "image/jpeg",
            123,
        );

        assert_eq!(
            path,
            Path::new("/tmp/cache/product_photo_inputs/gallery_123.jpg")
        );
    }

    #[test]
    fn gallery_picker_prefers_visual_media_when_available() {
        assert_eq!(
            super::gallery_picker_strategy(true),
            super::GalleryPickerStrategy::VisualMedia
        );
    }

    #[test]
    fn gallery_picker_falls_back_to_file_picker_when_visual_media_is_unavailable() {
        assert_eq!(
            super::gallery_picker_strategy(false),
            super::GalleryPickerStrategy::FilePicker
        );
    }
}
