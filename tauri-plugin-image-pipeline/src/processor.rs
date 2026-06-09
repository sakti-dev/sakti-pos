//! Image processor: decode, orient, resize, encode to WebP, generate previews.
//!
//! Only compiled on non-Android targets. Android delegates to Kotlin native APIs.

use std::io::Cursor;
use std::path::Path;

use crate::error::PluginError;

#[cfg(not(target_os = "android"))]
pub fn platform_backend_label() -> &'static str {
    "rust"
}

#[cfg(target_os = "android")]
pub fn platform_backend_label() -> &'static str {
    "android"
}

/// Calculate target dimensions to fit within `max_long_edge` without upscaling.
pub fn calculate_target_size(
    original_width: u32,
    original_height: u32,
    max_long_edge: u32,
) -> (u32, u32) {
    if original_width == 0 || original_height == 0 {
        return (0, 0);
    }
    let long_edge = original_width.max(original_height);
    if long_edge <= max_long_edge {
        return (original_width, original_height);
    }
    let ratio = max_long_edge as f64 / long_edge as f64;
    let new_w = (original_width as f64 * ratio).round().max(1.0) as u32;
    let new_h = (original_height as f64 * ratio).round().max(1.0) as u32;
    (new_w, new_h)
}

/// Read EXIF orientation from raw file bytes.
pub fn read_exif_orientation_bytes(data: &[u8]) -> u32 {
    let mut cursor = Cursor::new(data);
    exif::Reader::new()
        .read_from_container(&mut cursor)
        .ok()
        .and_then(|exif| {
            exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY)
                .and_then(|field| field.value.get_uint(0))
        })
        .unwrap_or(1)
        .min(8)
        .max(1)
}

/// Apply EXIF orientation to an image buffer.
pub fn apply_exif_orientation(
    img: image::DynamicImage,
    orientation: u32,
) -> image::DynamicImage {
    let rgba = img.to_rgba8();
    let transformed = match orientation {
        2 => image::imageops::flip_horizontal(&rgba),
        3 => image::imageops::rotate180(&rgba),
        4 => image::imageops::flip_vertical(&rgba),
        5 => image::imageops::rotate90(&image::imageops::flip_horizontal(&rgba)),
        6 => image::imageops::rotate90(&rgba),
        7 => image::imageops::rotate270(&image::imageops::flip_horizontal(&rgba)),
        8 => image::imageops::rotate270(&rgba),
        _ => rgba,
    };
    image::DynamicImage::ImageRgba8(transformed)
}

/// Process an image: decode, orient, resize, encode to WebP.
pub fn process_image(
    source_path: &Path,
    max_long_edge: u32,
) -> Result<(Vec<u8>, u32, u32, String), PluginError> {
    let data = std::fs::read(source_path).map_err(|e| PluginError::Io {
        operation: "read_source",
        path: source_path.to_path_buf(),
        source: e,
    })?;

    let img = image::load_from_memory(&data).map_err(|e| PluginError::Processing {
        job_id: None,
        stage: "decode",
        reason: e.to_string(),
    })?;

    let orientation = read_exif_orientation_bytes(&data);
    let img = apply_exif_orientation(img, orientation);

    let (orig_w, orig_h) = (img.width(), img.height());
    let (target_w, target_h) = calculate_target_size(orig_w, orig_h, max_long_edge);

    let rgba = if target_w != orig_w || target_h != orig_h {
        img.resize_exact(target_w, target_h, image::imageops::FilterType::Triangle)
            .to_rgba8()
    } else {
        img.to_rgba8()
    };

    let encoder_config = zenwebp::LossyConfig::new()
        .with_quality(75.0)
        .with_method(6);
    let webp_bytes = zenwebp::EncodeRequest::lossy(
        &encoder_config,
        rgba.as_raw(),
        zenwebp::PixelLayout::Rgba8,
        target_w,
        target_h,
    )
    .encode()
    .map_err(|e| PluginError::Processing {
        job_id: None,
        stage: "encode",
        reason: e.to_string(),
    })?;

    let hash = hash_bytes(&webp_bytes);
    Ok((webp_bytes, target_w, target_h, hash))
}

/// Generate a preview: decode, orient, resize, encode JPEG.
pub fn generate_preview(
    source_path: &Path,
    preview_max_long_edge: u32,
) -> Result<Vec<u8>, PluginError> {
    let data = std::fs::read(source_path).map_err(|e| PluginError::Io {
        operation: "read_preview_source",
        path: source_path.to_path_buf(),
        source: e,
    })?;

    let img = image::load_from_memory(&data).map_err(|e| PluginError::Processing {
        job_id: None,
        stage: "preview_decode",
        reason: e.to_string(),
    })?;

    let orientation = read_exif_orientation_bytes(&data);
    let img = apply_exif_orientation(img, orientation);

    let (orig_w, orig_h) = (img.width(), img.height());
    let (target_w, target_h) = calculate_target_size(orig_w, orig_h, preview_max_long_edge);

    let img = if target_w != orig_w || target_h != orig_h {
        image::DynamicImage::ImageRgba8(
            img.resize_exact(target_w, target_h, image::imageops::FilterType::Triangle)
                .to_rgba8(),
        )
    } else {
        img
    };

    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, image::ImageFormat::Jpeg)
        .map_err(|e| PluginError::Processing {
            job_id: None,
            stage: "preview_encode",
            reason: e.to_string(),
        })?;

    Ok(buf.into_inner())
}

/// Hash bytes with SHA-256.
pub fn hash_bytes(data: &[u8]) -> String {
    use sha2::Digest;
    let mut hasher = sha2::Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Sizing ─────────────────────────────────────────────────

    #[test]
    fn sizing_no_upscale() {
        assert_eq!(calculate_target_size(100, 80, 400), (100, 80));
    }

    #[test]
    fn sizing_landscape() {
        assert_eq!(calculate_target_size(800, 600, 400), (400, 300));
    }

    #[test]
    fn sizing_portrait() {
        assert_eq!(calculate_target_size(600, 800, 400), (300, 400));
    }

    #[test]
    fn sizing_square() {
        assert_eq!(calculate_target_size(1000, 1000, 500), (500, 500));
    }

    #[test]
    fn sizing_zero() {
        assert_eq!(calculate_target_size(0, 0, 400), (0, 0));
    }

    #[test]
    fn sizing_at_limit() {
        assert_eq!(calculate_target_size(400, 300, 400), (400, 300));
    }

    // ── Hash ───────────────────────────────────────────────────

    #[test]
    fn hash_deterministic() {
        let h1 = hash_bytes(b"hello world");
        let h2 = hash_bytes(b"hello world");
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 64);
    }

    #[test]
    fn hash_different() {
        assert_ne!(hash_bytes(b"hello"), hash_bytes(b"world"));
    }

    // ── EXIF orientation ───────────────────────────────────────

    #[test]
    fn apply_orientation_identity() {
        let img = image::DynamicImage::new_rgb8(10, 10);
        let result = apply_exif_orientation(img, 1);
        assert_eq!(result.width(), 10);
        assert_eq!(result.height(), 10);
    }

    #[test]
    fn apply_orientation_90() {
        let img = image::DynamicImage::new_rgb8(100, 50);
        let result = apply_exif_orientation(img, 6);
        assert_eq!(result.width(), 50);
        assert_eq!(result.height(), 100);
    }

    #[test]
    fn apply_orientation_180() {
        let img = image::DynamicImage::new_rgb8(100, 50);
        let result = apply_exif_orientation(img, 3);
        assert_eq!(result.width(), 100);
        assert_eq!(result.height(), 50);
    }

    #[test]
    fn apply_orientation_270() {
        let img = image::DynamicImage::new_rgb8(100, 50);
        let result = apply_exif_orientation(img, 8);
        assert_eq!(result.width(), 50);
        assert_eq!(result.height(), 100);
    }

    #[test]
    fn apply_orientation_fliph() {
        let img = image::DynamicImage::new_rgb8(100, 50);
        let result = apply_exif_orientation(img, 2);
        assert_eq!(result.width(), 100);
        assert_eq!(result.height(), 50);
    }

    // ── Image processing ───────────────────────────────────────

    #[test]
    fn process_png_no_upscale() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.png");
        image::DynamicImage::new_rgb8(200, 100).save(&path).unwrap();

        let (_, w, h, hash) = process_image(&path, 400).unwrap();
        assert_eq!((w, h), (200, 100));
        assert_eq!(hash.len(), 64);
    }

    #[test]
    fn process_jpeg_resize() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.jpg");
        image::DynamicImage::new_rgb8(800, 600).save(&path).unwrap();

        let (_, w, h, _) = process_image(&path, 400).unwrap();
        assert_eq!(w, 400);
        assert_eq!(h, 300);
    }

    #[test]
    fn process_small_not_upscaled() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("small.png");
        image::DynamicImage::new_rgb8(50, 30).save(&path).unwrap();

        let (_, w, h, _) = process_image(&path, 400).unwrap();
        assert_eq!((w, h), (50, 30));
    }

    #[test]
    fn preview_large_image() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("large.png");
        image::DynamicImage::new_rgb8(1000, 800).save(&path).unwrap();

        let preview = generate_preview(&path, 320).unwrap();
        let preview_img = image::load_from_memory(&preview).unwrap();
        assert_eq!(preview_img.width(), 320);
        assert_eq!(preview_img.height(), 256);
    }

    #[test]
    fn preview_small_not_upscaled() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("small.png");
        image::DynamicImage::new_rgb8(100, 80).save(&path).unwrap();

        let preview = generate_preview(&path, 320).unwrap();
        let preview_img = image::load_from_memory(&preview).unwrap();
        assert_eq!(preview_img.width(), 100);
        assert_eq!(preview_img.height(), 80);
    }

    #[test]
    fn corrupt_input_returns_error() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("corrupt.jpg");
        std::fs::write(&path, b"NOT A JPEG").unwrap();

        assert!(matches!(
            process_image(&path, 400),
            Err(PluginError::Processing { stage: "decode", .. })
        ));
    }

    #[test]
    fn missing_file_returns_io_error() {
        assert!(matches!(
            process_image(Path::new("/nonexistent/photo.jpg"), 400),
            Err(PluginError::Io { .. })
        ));
    }

    #[test]
    fn same_input_same_hash() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.png");
        image::DynamicImage::new_rgb8(200, 200).save(&path).unwrap();

        let (_, _, _, h1) = process_image(&path, 400).unwrap();
        let (_, _, _, h2) = process_image(&path, 400).unwrap();
        assert_eq!(h1, h2);
    }

    #[test]
    fn all_orientations_produce_valid_output() {
        let img = image::DynamicImage::new_rgb8(200, 100);
        for orientation in 1..=8 {
            let oriented = apply_exif_orientation(img.clone(), orientation);
            let w = oriented.width();
            let h = oriented.height();
            assert!(w > 0 && h > 0, "orientation {orientation} produced zero dimension");
        }
    }
}
