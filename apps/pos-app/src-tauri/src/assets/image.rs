use base64::engine::general_purpose;
use base64::Engine;
use exif::{In, Reader as ExifReader, Tag};
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, ImageReader};
use sha2::{Digest, Sha256};
use std::io::Cursor;
use std::path::{Path, PathBuf};
use zenwebp::{EncodeRequest, LossyConfig, PixelLayout};

use super::ProcessedImageResponse;

pub(crate) const MAX_LONG_EDGE: u32 = 400;
pub(crate) const PREVIEW_MAX_LONG_EDGE: u32 = 320;
pub(crate) const ASSET_IMAGE_PREVIEW_MIME_TYPE: &str = "image/jpeg";
const WEBP_QUALITY: f32 = 75.0;
const WEBP_METHOD: u8 = 6;

#[derive(Debug)]
pub(crate) struct AssetImagePreview {
    pub preview_base64: String,
    pub preview_mime_type: String,
}

pub(crate) fn fit_within_max_edge(width: u32, height: u32, max_edge: u32) -> (u32, u32) {
    if width <= max_edge && height <= max_edge {
        return (width, height);
    }

    let longest_side = width.max(height) as f64;
    let scale = max_edge as f64 / longest_side;
    let scaled_width = (width as f64 * scale).round().max(1.0) as u32;
    let scaled_height = (height as f64 * scale).round().max(1.0) as u32;
    (scaled_width, scaled_height)
}

fn decode_image_bytes(data: &[u8], original_filename: &str) -> Result<DynamicImage, String> {
    ImageReader::new(Cursor::new(data))
        .with_guessed_format()
        .map_err(|error| {
            format!(
                "Failed to detect image format for {}: {}",
                original_filename, error
            )
        })?
        .decode()
        .map_err(|error| format!("Failed to decode image {}: {}", original_filename, error))
}

fn read_exif_orientation(data: &[u8]) -> Option<u16> {
    let mut cursor = Cursor::new(data);
    ExifReader::new()
        .read_from_container(&mut cursor)
        .ok()
        .and_then(|exif| {
            exif.get_field(Tag::Orientation, In::PRIMARY)
                .and_then(|field| field.value.get_uint(0))
                .and_then(|value| u16::try_from(value).ok())
        })
}

fn apply_exif_orientation(image: DynamicImage, orientation: Option<u16>) -> DynamicImage {
    let Some(orientation) = orientation else {
        return image;
    };

    let rgba = image.to_rgba8();
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

    DynamicImage::ImageRgba8(transformed)
}

fn decode_oriented_image_bytes(
    data: &[u8],
    original_filename: &str,
) -> Result<DynamicImage, String> {
    let decoded = decode_image_bytes(data, original_filename)?;
    Ok(apply_exif_orientation(decoded, read_exif_orientation(data)))
}

pub(crate) fn process_image_bytes(
    data: &[u8],
    original_filename: &str,
) -> Result<ProcessedImageResponse, String> {
    let decoded = decode_oriented_image_bytes(data, original_filename)?;
    let rgba = decoded.to_rgba8();
    let (source_width, source_height) = rgba.dimensions();
    let (target_width, target_height) =
        fit_within_max_edge(source_width, source_height, MAX_LONG_EDGE);

    let processed = if target_width == source_width && target_height == source_height {
        rgba
    } else {
        image::imageops::resize(&rgba, target_width, target_height, FilterType::Triangle)
    };

    let encoder_config = LossyConfig::new()
        .with_quality(WEBP_QUALITY)
        .with_method(WEBP_METHOD);
    let webp_bytes = EncodeRequest::lossy(
        &encoder_config,
        processed.as_raw(),
        PixelLayout::Rgba8,
        target_width,
        target_height,
    )
    .encode()
    .map_err(|error| format!("Failed to encode {} to WebP: {}", original_filename, error))?;

    let content_hash = {
        let mut hasher = Sha256::new();
        hasher.update(&webp_bytes);
        format!("{:x}", hasher.finalize())
    };

    Ok(ProcessedImageResponse {
        byte_size: webp_bytes.len(),
        content_hash,
        content_type: "image/webp".to_string(),
        data_base64: general_purpose::STANDARD.encode(webp_bytes),
        height: target_height,
        width: target_width,
    })
}

pub(crate) fn asset_image_preview_from_bytes(
    data: &[u8],
    original_filename: &str,
) -> Result<AssetImagePreview, String> {
    let decoded = decode_oriented_image_bytes(data, original_filename)?;
    let rgba = decoded.to_rgba8();
    let (source_width, source_height) = rgba.dimensions();
    let (target_width, target_height) =
        fit_within_max_edge(source_width, source_height, PREVIEW_MAX_LONG_EDGE);

    let processed = if target_width == source_width && target_height == source_height {
        rgba
    } else {
        image::imageops::resize(&rgba, target_width, target_height, FilterType::Triangle)
    };

    let preview_rgb = DynamicImage::ImageRgba8(processed).to_rgb8();
    let mut preview_bytes = Vec::new();
    JpegEncoder::new_with_quality(&mut preview_bytes, 75)
        .encode(
            preview_rgb.as_raw(),
            target_width,
            target_height,
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|error| {
            format!(
                "Failed to encode preview for {}: {}",
                original_filename, error
            )
        })?;

    Ok(AssetImagePreview {
        preview_base64: general_purpose::STANDARD.encode(preview_bytes),
        preview_mime_type: ASSET_IMAGE_PREVIEW_MIME_TYPE.to_string(),
    })
}

pub(crate) fn pending_asset_preview_file_path(
    source_path: &Path,
    job_id: &str,
) -> Result<PathBuf, String> {
    let parent = source_path
        .parent()
        .ok_or_else(|| "Product photo source path has no parent directory".to_string())?;
    Ok(parent.join(format!("pending_preview_{job_id}.jpg")))
}
