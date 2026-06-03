use base64::engine::general_purpose;
use base64::Engine;
use sqlx::{Row, SqlitePool};
use std::path::PathBuf;
use tauri::AppHandle;
use tokio::fs;

use crate::time_utils::current_time_iso_string;

#[allow(dead_code)]
async fn load_assets_for_upload(
    pool: &SqlitePool,
    merchant_id: &str,
    limit: i64,
    ready_only: bool,
) -> Result<Vec<super::PendingUploadAsset>, String> {
    let status_clause = if ready_only {
        "a.status = 'ready'"
    } else {
        "a.status = 'pending_upload' AND c.status = 'pending_upload'"
    };
    let join_clause = if ready_only {
        "LEFT JOIN local_asset_cache c ON c.asset_id = a.id"
    } else {
        "INNER JOIN local_asset_cache c ON c.asset_id = a.id"
    };
    let query = format!(
        r#"
        SELECT
          a.id AS asset_id,
          a.merchant_id,
          a.object_key,
          a.original_filename,
          a.content_type,
          a.byte_size,
          a.content_hash,
          a.kind,
          a.width,
          a.height,
          c.local_path
        FROM assets a
        {join_clause}
        WHERE a.merchant_id = ?1
          AND {status_clause}
        ORDER BY a.created_at ASC
        LIMIT ?2
        "#
    );

    let rows = sqlx::query(&query)
        .bind(merchant_id)
        .bind(limit)
        .fetch_all(pool)
        .await
        .map_err(|error| format!("Failed to load assets: {}", error))?;

    let mut assets = Vec::with_capacity(rows.len());
    for row in rows {
        let local_path = row
            .try_get::<Option<String>, _>("local_path")
            .map_err(|error| format!("Failed to read local_path: {}", error))?
            .unwrap_or_default();
        assets.push(super::PendingUploadAsset {
            asset_id: row
                .try_get("asset_id")
                .map_err(|error| format!("Failed to read asset_id: {}", error))?,
            merchant_id: row
                .try_get("merchant_id")
                .map_err(|error| format!("Failed to read merchant_id: {}", error))?,
            object_key: row
                .try_get("object_key")
                .map_err(|error| format!("Failed to read object_key: {}", error))?,
            original_filename: row
                .try_get::<Option<String>, _>("original_filename")
                .map_err(|error| format!("Failed to read original_filename: {}", error))?,
            content_type: row
                .try_get("content_type")
                .map_err(|error| format!("Failed to read content_type: {}", error))?,
            byte_size: row
                .try_get("byte_size")
                .map_err(|error| format!("Failed to read byte_size: {}", error))?,
            content_hash: row
                .try_get("content_hash")
                .map_err(|error| format!("Failed to read content_hash: {}", error))?,
            kind: row
                .try_get("kind")
                .map_err(|error| format!("Failed to read kind: {}", error))?,
            width: row
                .try_get::<Option<i64>, _>("width")
                .map_err(|error| format!("Failed to read width: {}", error))?,
            height: row
                .try_get::<Option<i64>, _>("height")
                .map_err(|error| format!("Failed to read height: {}", error))?,
            local_path,
        });
    }

    Ok(assets)
}

#[allow(dead_code)]
async fn mark_local_asset_cache_ready(
    pool: &SqlitePool,
    asset_id: &str,
    ready_at: &str,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE local_asset_cache SET status = 'ready', last_error = NULL, cached_at = ?2, updated_at = ?2 WHERE asset_id = ?1",
    )
    .bind(asset_id)
    .bind(ready_at)
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to mark local cache ready: {}", error))?;
    Ok(())
}

#[allow(dead_code)]
pub(super) async fn mark_asset_uploading(pool: &SqlitePool, asset_id: &str) -> Result<(), String> {
    sqlx::query(
        "UPDATE local_asset_cache SET status = 'uploading', upload_attempts = upload_attempts + 1, last_error = NULL, updated_at = ?2 WHERE asset_id = ?1",
    )
    .bind(asset_id)
    .bind(current_time_iso_string())
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to mark asset uploading: {}", error))?;
    Ok(())
}

#[allow(dead_code)]
pub(super) async fn mark_asset_upload_failed(
    pool: &SqlitePool,
    asset_id: &str,
    merchant_id: &str,
    error_message: &str,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE local_asset_cache SET status = 'failed', last_error = ?2, updated_at = ?3 WHERE asset_id = ?1",
    )
    .bind(asset_id)
    .bind(error_message)
    .bind(current_time_iso_string())
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to mark asset failed: {}", error))?;
    sqlx::query(
        "UPDATE assets SET status = 'failed', is_synced = 0, updated_at = ?2 WHERE id = ?1",
    )
    .bind(asset_id)
    .bind(current_time_iso_string())
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to mark asset failed: {}", error))?;
    super::insert_sync_outbox(pool, asset_id, "merchant", merchant_id, "assets", "update").await?;
    Ok(())
}

#[allow(dead_code)]
pub(super) async fn mark_asset_ready(
    pool: &SqlitePool,
    asset_id: &str,
    merchant_id: &str,
) -> Result<(), String> {
    let now = current_time_iso_string();
    mark_local_asset_cache_ready(pool, asset_id, &now).await?;
    sqlx::query("UPDATE assets SET status = 'ready', is_synced = 0, updated_at = ?2 WHERE id = ?1")
        .bind(asset_id)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|error| format!("Failed to mark asset ready: {}", error))?;
    super::insert_sync_outbox(pool, asset_id, "merchant", merchant_id, "assets", "update").await?;
    Ok(())
}

#[allow(dead_code)]
pub(super) async fn mark_reused_asset_ready(
    pool: &SqlitePool,
    asset_id: &str,
    merchant_id: &str,
) -> Result<(), String> {
    let state = super::resolve_reused_asset_ready_state(None);
    let now = current_time_iso_string();
    sqlx::query(
        "UPDATE local_asset_cache SET status = ?2, last_error = NULL, cached_at = ?3, updated_at = ?3 WHERE asset_id = ?1",
    )
    .bind(asset_id)
    .bind(state.cache_status)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to mark local cache ready: {}", error))?;
    sqlx::query("UPDATE assets SET status = ?2, is_synced = ?3, updated_at = ?4 WHERE id = ?1")
        .bind(asset_id)
        .bind(state.asset_status)
        .bind(state.is_synced)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|error| format!("Failed to mark reused asset ready: {}", error))?;
    if state.should_insert_sync_outbox {
        super::insert_sync_outbox(pool, asset_id, "merchant", merchant_id, "assets", "update")
            .await?;
    }
    Ok(())
}

#[allow(dead_code)]
pub(super) async fn load_pending_upload_assets(
    pool: &SqlitePool,
    merchant_id: &str,
    limit: i64,
) -> Result<Vec<super::PendingUploadAsset>, String> {
    load_assets_for_upload(pool, merchant_id, limit, false).await
}

#[allow(dead_code)]
pub(super) async fn load_ready_assets(
    pool: &SqlitePool,
    merchant_id: &str,
    limit: i64,
) -> Result<Vec<super::PendingUploadAsset>, String> {
    load_assets_for_upload(pool, merchant_id, limit, true).await
}

pub(super) async fn prepare_local_image_asset_inner(
    app: &AppHandle,
    pool: &SqlitePool,
    input: super::PreparedImageInput,
) -> Result<super::PreparedLocalAssetResponse, String> {
    let data_base64 = input.data_base64;
    let bytes = general_purpose::STANDARD
        .decode(&data_base64)
        .map_err(|error| format!("Failed to decode asset payload: {}", error))?;

    if super::sha256_hex(&bytes) != input.content_hash {
        return Err("Compressed asset hash mismatch".to_string());
    }

    let object_key = super::asset_object_key(&input.merchant_id, &input.content_hash);
    let local_path = match super::write_cached_asset(&app, &object_key, &bytes).await {
        Ok(path) => path,
        Err(error) => return Err(error),
    };
    let now = current_time_iso_string();
    let asset_id = input.content_hash.clone();
    let normalized_original_filename = if input.original_filename.trim().is_empty() {
        None
    } else {
        Some(input.original_filename.clone())
    };
    let existing_status = sqlx::query(
        r#"
        SELECT status
        FROM assets
        WHERE id = ?1
        LIMIT 1
        "#,
    )
    .bind(&asset_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| format!("Failed to inspect existing local asset: {}", error))?
    .map(|row| row.try_get::<String, _>(0))
    .transpose()
    .map_err(|error| format!("Failed to inspect existing local asset: {}", error))?;
    let persist_state = super::resolve_local_asset_persist_state(existing_status.as_deref());

    let asset_result = sqlx::query(
        r#"
        INSERT INTO assets (
          id,
          merchant_id,
          object_key,
          original_filename,
          content_type,
          byte_size,
          content_hash,
          kind,
          width,
          height,
          status,
          created_by_user_id,
          deleted_at,
          is_synced,
          created_at,
          updated_at
        ) VALUES (
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL, NULL, ?12, ?13, ?13
        )
        ON CONFLICT(id) DO UPDATE SET
          merchant_id = excluded.merchant_id,
          object_key = excluded.object_key,
          original_filename = excluded.original_filename,
          content_type = excluded.content_type,
          byte_size = excluded.byte_size,
          content_hash = excluded.content_hash,
          kind = excluded.kind,
          width = excluded.width,
          height = excluded.height,
          status = excluded.status,
          deleted_at = NULL,
          is_synced = excluded.is_synced,
          updated_at = excluded.updated_at
        "#,
    )
    .bind(&asset_id)
    .bind(&input.merchant_id)
    .bind(&object_key)
    .bind(normalized_original_filename.as_deref())
    .bind(&input.content_type)
    .bind(input.byte_size)
    .bind(&input.content_hash)
    .bind(&input.kind)
    .bind(input.width)
    .bind(input.height)
    .bind(persist_state.asset_status)
    .bind(persist_state.is_synced)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to save local asset: {}", error));
    if let Err(error) = asset_result {
        let _ = fs::remove_file(&local_path).await;
        return Err(error);
    }

    let cache_cached_at = if persist_state.cache_status == "ready" {
        Some(now.clone())
    } else {
        None
    };

    let cache_result = sqlx::query(
        r#"
        INSERT INTO local_asset_cache (
          asset_id,
          merchant_id,
          object_key,
          local_path,
          content_hash,
          status,
          upload_attempts,
          download_attempts,
          last_error,
          cached_at,
          created_at,
          updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 0, NULL, ?7, ?8, ?8)
        ON CONFLICT(asset_id) DO UPDATE SET
          merchant_id = excluded.merchant_id,
          object_key = excluded.object_key,
          local_path = excluded.local_path,
          content_hash = excluded.content_hash,
          status = excluded.status,
          last_error = NULL,
          cached_at = excluded.cached_at,
          updated_at = excluded.updated_at
        "#,
    )
    .bind(&asset_id)
    .bind(&input.merchant_id)
    .bind(&object_key)
    .bind(&local_path)
    .bind(&input.content_hash)
    .bind(persist_state.cache_status)
    .bind(cache_cached_at)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to save local asset cache: {}", error));
    if let Err(error) = cache_result {
        let _ = fs::remove_file(&local_path).await;
        return Err(error);
    }

    if persist_state.should_insert_sync_outbox {
        super::insert_sync_outbox(
            pool,
            &asset_id,
            "merchant",
            &input.merchant_id,
            "assets",
            "insert",
        )
        .await?;
    }

    log::info!(
        "[RUST] [PHOTO:TRACE] prepare_local_image_asset:done asset_id={} object_key={} local_path={}",
        asset_id,
        object_key,
        local_path
    );

    let asset = super::PreparedAssetRecord {
        id: asset_id,
        merchant_id: input.merchant_id,
        object_key,
        original_filename: input.original_filename,
        content_type: input.content_type,
        byte_size: input.byte_size,
        content_hash: input.content_hash,
        kind: input.kind,
        width: input.width,
        height: input.height,
        status: persist_state.asset_status.to_string(),
        created_by_user_id: String::new(),
        deleted_at: String::new(),
        created_at: now.clone(),
        updated_at: now,
    };

    Ok(super::PreparedLocalAssetResponse {
        asset,
        data_base64,
        local_path,
    })
}

pub(super) async fn prepare_local_image_asset_from_path_inner(
    app: &AppHandle,
    pool: &SqlitePool,
    merchant_id: String,
    original_filename: String,
    kind: String,
    path: String,
    delete_original: bool,
) -> Result<super::PreparedLocalAssetResponse, String> {
    let path_buf = PathBuf::from(&path);
    log::info!(
        "[RUST] [PHOTO:TRACE] process_image_path:start path={} filename={} kind={}",
        path,
        original_filename,
        kind
    );

    let normalized_filename = super::normalize_original_filename(&original_filename, &path_buf);
    let data = fs::read(&path_buf)
        .await
        .map_err(|error| format!("Failed to read selected image path: {}", error))?;

    let processed = tauri::async_runtime::spawn_blocking({
        let normalized_filename = normalized_filename.clone();
        move || super::process_image_bytes(&data, &normalized_filename)
    })
    .await
    .map_err(|error| format!("Failed to process image path on blocking thread: {}", error))??;

    let result = prepare_local_image_asset_inner(
        app,
        pool,
        super::PreparedImageInput {
            byte_size: processed.byte_size as i64,
            content_hash: processed.content_hash,
            content_type: processed.content_type,
            data_base64: processed.data_base64,
            height: processed.height as i32,
            kind,
            merchant_id,
            original_filename: normalized_filename,
            width: processed.width as i32,
        },
    )
    .await;

    if result.is_ok() && delete_original && super::is_deletable_photo_input_path(&path_buf) {
        match fs::remove_file(&path_buf).await {
            Ok(()) => {
                log::info!("[RUST] [PHOTO:TRACE] process_image_path:delete_original path={path}")
            }
            Err(error) => log::info!(
                "[RUST] [PHOTO:TRACE] process_image_path:delete_original_failed path={} error={}",
                path,
                error
            ),
        }
    }

    if let Ok(response) = &result {
        log::info!(
            "[RUST] [PHOTO:TRACE] process_image_path:done asset_id={} local_path={}",
            response.asset.id,
            response.local_path
        );
    }

    result
}
