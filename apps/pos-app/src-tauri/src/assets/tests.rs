use super::cache::{
    asset_cache_file_path_from_root, asset_relative_path, is_deletable_photo_input_path,
    normalize_original_filename,
};
use super::image::{asset_image_preview_from_bytes, fit_within_max_edge, process_image_bytes};
use super::targets::validate_asset_attachment_target;
use super::*;
use crate::time_utils::current_job_id_string;
use ::image::{DynamicImage, ImageBuffer, ImageFormat, ImageReader, Rgb, Rgba};
use std::io::Cursor;
use std::path::{Path, PathBuf};
use zenwebp::DecodeRequest;

fn is_valid_asset_status(status: &str) -> bool {
    matches!(
        status,
        "pending_upload" | "uploading" | "ready" | "pending_download" | "downloading"
    )
}

fn is_valid_pending_product_photo_job_status(status: &str) -> bool {
    matches!(status, "pending" | "processing" | "done" | "failed")
}

fn create_png_bytes(width: u32, height: u32) -> Vec<u8> {
    let mut image = ImageBuffer::new(width, height);
    for (x, y, pixel) in image.enumerate_pixels_mut() {
        *pixel = Rgba([(x % 256) as u8, (y % 256) as u8, 200, 255]);
    }

    let dynamic = DynamicImage::ImageRgba8(image);
    let mut cursor = Cursor::new(Vec::new());
    dynamic
        .write_to(&mut cursor, ImageFormat::Png)
        .expect("png encoding should succeed");
    cursor.into_inner()
}

fn create_exif_oriented_jpeg_bytes(orientation: u16) -> Vec<u8> {
    let image = ImageBuffer::from_fn(2, 1, |x, _| {
        if x == 0 {
            Rgb([255, 0, 0])
        } else {
            Rgb([0, 255, 0])
        }
    });
    let dynamic = DynamicImage::ImageRgb8(image);
    let mut cursor = Cursor::new(Vec::new());
    dynamic
        .write_to(&mut cursor, ImageFormat::Jpeg)
        .expect("jpeg encoding should succeed");

    let jpeg_bytes = cursor.into_inner();
    let exif_segment = build_exif_orientation_segment(orientation);
    let mut oriented = Vec::with_capacity(jpeg_bytes.len() + exif_segment.len());
    oriented.extend_from_slice(&jpeg_bytes[..2]);
    oriented.extend_from_slice(&exif_segment);
    oriented.extend_from_slice(&jpeg_bytes[2..]);
    oriented
}

fn build_exif_orientation_segment(orientation: u16) -> Vec<u8> {
    let mut payload = Vec::with_capacity(32);
    payload.extend_from_slice(b"Exif\0\0");
    payload.extend_from_slice(b"II");
    payload.extend_from_slice(&42u16.to_le_bytes());
    payload.extend_from_slice(&8u32.to_le_bytes());
    payload.extend_from_slice(&1u16.to_le_bytes());
    payload.extend_from_slice(&0x0112u16.to_le_bytes());
    payload.extend_from_slice(&3u16.to_le_bytes());
    payload.extend_from_slice(&1u32.to_le_bytes());
    payload.extend_from_slice(&orientation.to_le_bytes());
    payload.extend_from_slice(&0u16.to_le_bytes());
    payload.extend_from_slice(&0u32.to_le_bytes());

    let mut segment = Vec::with_capacity(payload.len() + 4);
    segment.push(0xFF);
    segment.push(0xE1);
    let length = (payload.len() + 2) as u16;
    segment.extend_from_slice(&length.to_be_bytes());
    segment.extend_from_slice(&payload);
    segment
}

#[test]
fn fit_within_max_edge_preserves_aspect_ratio() {
    assert_eq!(fit_within_max_edge(1600, 1000, 400), (400, 250));
    assert_eq!(fit_within_max_edge(300, 200, 400), (300, 200));
    assert_eq!(fit_within_max_edge(1200, 2400, 400), (200, 400));
}

#[test]
fn process_image_bytes_resizes_and_encodes_webp() {
    let png_bytes = create_png_bytes(1600, 1000);

    let result =
        process_image_bytes(&png_bytes, "coffee.png").expect("image processing should succeed");

    assert_eq!(result.content_type, "image/webp");
    assert_eq!(result.width, 400);
    assert_eq!(result.height, 250);
    assert_eq!(result.content_hash.len(), 64);
    assert!(!result.data_base64.is_empty());

    let webp_bytes = general_purpose::STANDARD
        .decode(result.data_base64)
        .expect("webp bytes should decode");
    let config = zenwebp::DecodeConfig::default();
    let (decoded_pixels, decoded_width, decoded_height) = DecodeRequest::new(&config, &webp_bytes)
        .decode_rgba()
        .expect("webp bytes should decode");

    assert_eq!(decoded_width, 400);
    assert_eq!(decoded_height, 250);
    assert_eq!(
        decoded_pixels.len(),
        (decoded_width * decoded_height * 4) as usize
    );
}

#[test]
fn process_image_bytes_respects_exif_orientation() {
    let jpeg_bytes = create_exif_oriented_jpeg_bytes(6);

    let result = process_image_bytes(&jpeg_bytes, "rotated-camera.jpg")
        .expect("image processing should succeed");

    assert_eq!(result.width, 1);
    assert_eq!(result.height, 2);
}

#[test]
fn product_photo_preview_resizes_and_encodes_jpeg() {
    let png_bytes = create_png_bytes(1600, 1000);

    let result = asset_image_preview_from_bytes(&png_bytes, "coffee.png")
        .expect("preview generation should succeed");

    assert_eq!(
        result.preview_mime_type,
        super::image::ASSET_IMAGE_PREVIEW_MIME_TYPE
    );
    assert!(!result.preview_base64.is_empty());

    let preview_bytes = general_purpose::STANDARD
        .decode(result.preview_base64)
        .expect("preview bytes should decode");
    let decoded = ImageReader::new(Cursor::new(preview_bytes))
        .with_guessed_format()
        .expect("preview format should be detected")
        .decode()
        .expect("preview should decode");

    assert_eq!(decoded.width(), 320);
    assert_eq!(decoded.height(), 200);
}

#[test]
fn get_cached_asset_path_returns_path_for_existing_asset() {
    tauri::async_runtime::block_on(async {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("sqlite pool should connect");

        sqlx::query(
            r#"
                CREATE TABLE assets (
                    id TEXT PRIMARY KEY,
                    content_type TEXT
                )
                "#,
        )
        .execute(&pool)
        .await
        .expect("assets table should be created");

        sqlx::query(
            r#"
                CREATE TABLE local_asset_cache (
                    asset_id TEXT PRIMARY KEY,
                    local_path TEXT NOT NULL
                )
                "#,
        )
        .execute(&pool)
        .await
        .expect("local_asset_cache table should be created");

        let local_path = std::env::temp_dir().join(format!(
            "sakti-pos-cache-path-test-{}.webp",
            current_job_id_string()
        ));
        std::fs::write(&local_path, b"webp-bytes").expect("cache file should be written");

        sqlx::query("INSERT INTO assets (id, content_type) VALUES ('asset-1', 'image/webp')")
            .execute(&pool)
            .await
            .expect("asset row should be inserted");

        sqlx::query("INSERT INTO local_asset_cache (asset_id, local_path) VALUES ('asset-1', ?1)")
            .bind(local_path.to_string_lossy().as_ref())
            .execute(&pool)
            .await
            .expect("cache row should be inserted");

        let result = cache::get_cached_asset_path("asset-1".to_string(), &pool)
            .await
            .expect("path lookup should succeed")
            .expect("cached asset path should be returned");

        assert_eq!(result.local_path, local_path.to_string_lossy().as_ref());
        assert_eq!(result.content_type, "image/webp");

        std::fs::remove_file(&local_path).expect("cache file should be cleaned up");
    });
}

#[test]
fn get_cached_asset_path_returns_none_for_missing_file() {
    tauri::async_runtime::block_on(async {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("sqlite pool should connect");

        sqlx::query(
            r#"
                CREATE TABLE assets (
                    id TEXT PRIMARY KEY,
                    content_type TEXT
                )
                "#,
        )
        .execute(&pool)
        .await
        .expect("assets table should be created");

        sqlx::query(
            r#"
                CREATE TABLE local_asset_cache (
                    asset_id TEXT PRIMARY KEY,
                    local_path TEXT NOT NULL
                )
                "#,
        )
        .execute(&pool)
        .await
        .expect("local_asset_cache table should be created");

        sqlx::query("INSERT INTO local_asset_cache (asset_id, local_path) VALUES ('asset-1', '/nonexistent/path.webp')")
                .execute(&pool)
                .await
                .expect("cache row should be inserted");

        let result = cache::get_cached_asset_path("asset-1".to_string(), &pool)
            .await
            .expect("path lookup should succeed");

        assert!(result.is_none());
    });
}

#[test]
fn asset_cache_path_appends_webp_extension() {
    let root = Path::new("/tmp/cache");
    let path = asset_cache_file_path_from_root(root, "merchant-1/assets/asset-1")
        .expect("path should resolve");
    assert_eq!(
        path,
        PathBuf::from("/tmp/cache/merchant-1/assets/asset-1.webp")
    );
}

#[test]
fn asset_cache_path_rejects_traversal() {
    let root = Path::new("/tmp/cache");
    assert!(asset_cache_file_path_from_root(root, "../bad").is_err());
}

#[test]
fn asset_status_validator_accepts_queue_statuses() {
    assert!(is_valid_asset_status("pending_upload"));
    assert!(is_valid_asset_status("uploading"));
    assert!(is_valid_asset_status("ready"));
    assert!(is_valid_asset_status("pending_download"));
    assert!(is_valid_asset_status("downloading"));
    assert!(!is_valid_asset_status("invalid"));
}

#[test]
fn pending_product_photo_job_status_validator_accepts_known_states() {
    assert!(is_valid_pending_product_photo_job_status("pending"));
    assert!(is_valid_pending_product_photo_job_status("processing"));
    assert!(is_valid_pending_product_photo_job_status("done"));
    assert!(is_valid_pending_product_photo_job_status("failed"));
    assert!(!is_valid_pending_product_photo_job_status("invalid"));
}

#[test]
fn supported_asset_attachment_target_accepts_product_image() {
    let target = AssetAttachmentTarget {
        entity_type: "product".to_string(),
        entity_id: "product-1".to_string(),
        field: "image_asset_id".to_string(),
    };

    assert!(validate_asset_attachment_target(&target).is_ok());
}

#[test]
fn supported_asset_attachment_target_metadata_is_centralized() {
    let target = AssetAttachmentTarget {
        entity_type: "product".to_string(),
        entity_id: "product-1".to_string(),
        field: "image_asset_id".to_string(),
    };

    let supported_target =
        super::targets::supported_asset_attachment_target(&target).expect("target is supported");

    assert_eq!(supported_target.asset_kind, "product_photo");
    assert_eq!(supported_target.entity_type, "product");
    assert_eq!(supported_target.field, "image_asset_id");
}

#[test]
fn supported_asset_attachment_target_rejects_unknown_field() {
    let target = AssetAttachmentTarget {
        entity_type: "product".to_string(),
        entity_id: "product-1".to_string(),
        field: "avatar_asset_id".to_string(),
    };

    assert!(validate_asset_attachment_target(&target).is_err());
}

#[test]
fn asset_relative_path_uses_merchant_prefix() {
    let path = asset_relative_path("merchant-1", "a".repeat(64).as_str());
    assert_eq!(
        path,
        PathBuf::from(
            "merchant-1/assets/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        )
    );
}

#[test]
fn temp_original_path_must_not_be_asset_cache_path() {
    let asset_cache = PathBuf::from("/tmp/app/asset-cache/merchant/assets/hash.webp");
    assert!(!is_deletable_photo_input_path(&asset_cache));

    let photo_input = PathBuf::from("/tmp/app/product_photo_inputs/photo_1.jpg");
    assert!(is_deletable_photo_input_path(&photo_input));
}

#[test]
fn original_filename_falls_back_to_path_file_name() {
    let path = PathBuf::from("/tmp/app/product_photo_inputs/photo_1.jpg");
    assert_eq!(
        normalize_original_filename("", &path),
        "photo_1.jpg".to_string()
    );
    assert_eq!(
        normalize_original_filename("custom.jpg", &path),
        "custom.jpg".to_string()
    );
}

#[test]
fn ready_assets_keep_ready_status_when_reused() {
    assert_eq!(
        resolve_local_asset_persist_state(Some("ready")),
        LocalAssetPersistState {
            asset_status: "ready",
            cache_status: "ready",
            is_synced: 1,
            should_insert_sync_outbox: false,
        }
    );
    assert_eq!(
        resolve_local_asset_persist_state(Some("failed")),
        LocalAssetPersistState {
            asset_status: "pending_upload",
            cache_status: "pending_upload",
            is_synced: 0,
            should_insert_sync_outbox: true,
        }
    );
}

#[test]
fn reused_assets_are_reconciled_ready_when_remote_is_ready() {
    let expected = LocalAssetPersistState {
        asset_status: "ready",
        cache_status: "ready",
        is_synced: 1,
        should_insert_sync_outbox: false,
    };

    assert_eq!(
        resolve_reused_asset_ready_state(Some("pending_upload")),
        expected
    );
    assert_eq!(resolve_reused_asset_ready_state(Some("failed")), expected);
}

#[test]
fn asset_sync_outbox_writes_coalesce_existing_pending_row() {
    tauri::async_runtime::block_on(async {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("sqlite pool should connect");

        sqlx::query(
            r#"
                CREATE TABLE assets (
                    id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    is_synced INTEGER NOT NULL,
                    updated_at TEXT NOT NULL
                )
                "#,
        )
        .execute(&pool)
        .await
        .expect("assets table should be created");

        sqlx::query(
            r#"
                CREATE TABLE local_asset_cache (
                    asset_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    last_error TEXT,
                    cached_at TEXT,
                    updated_at TEXT NOT NULL
                )
                "#,
        )
        .execute(&pool)
        .await
        .expect("local_asset_cache table should be created");

        sqlx::query(
            r#"
                CREATE TABLE sync_outbox (
                    id TEXT PRIMARY KEY,
                    table_name TEXT NOT NULL,
                    row_id TEXT NOT NULL,
                    operation TEXT NOT NULL,
                    scope_type TEXT NOT NULL,
                    scope_id TEXT NOT NULL,
                    changed_at TEXT NOT NULL,
                    synced_at TEXT
                )
                "#,
        )
        .execute(&pool)
        .await
        .expect("sync_outbox table should be created");

        sqlx::query(
            r#"
                CREATE UNIQUE INDEX sync_outbox_pending_row_unique
                ON sync_outbox (table_name, row_id)
                WHERE synced_at IS NULL
                "#,
        )
        .execute(&pool)
        .await
        .expect("pending outbox unique index should be created");

        sqlx::query(
            "INSERT INTO assets (id, status, is_synced, updated_at) VALUES ('asset-1', 'pending_upload', 0, '2026-05-18T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .expect("asset should be inserted");

        sqlx::query(
            "INSERT INTO local_asset_cache (asset_id, status, updated_at) VALUES ('asset-1', 'pending_upload', '2026-05-18T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .expect("cache row should be inserted");

        super::insert_sync_outbox(&pool, "asset-1", "merchant", "merchant-1", "assets", "update")
            .await
            .expect("first outbox write should insert");
        super::local::mark_asset_ready(&pool, "asset-1", "merchant-1")
            .await
            .expect("second outbox write should update existing pending row");

        let pending_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM sync_outbox WHERE table_name = 'assets' AND row_id = 'asset-1' AND synced_at IS NULL",
        )
        .fetch_one(&pool)
        .await
        .expect("pending outbox count should load");

        let asset_status: (String, i64) =
            sqlx::query_as("SELECT status, is_synced FROM assets WHERE id = 'asset-1'")
                .fetch_one(&pool)
                .await
                .expect("asset should load");

        assert_eq!(pending_count, 1);
        assert_eq!(asset_status, ("ready".to_string(), 0));
    });
}
