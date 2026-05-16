use sqlx::SqlitePool;

use super::{AssetAttachmentTarget, PendingAssetProcessingJobRecord};

pub(super) struct SupportedAssetAttachmentTarget {
    pub(super) entity_type: &'static str,
    pub(super) field: &'static str,
    pub(super) asset_kind: &'static str,
}

const SUPPORTED_ASSET_ATTACHMENT_TARGETS: &[SupportedAssetAttachmentTarget] =
    &[SupportedAssetAttachmentTarget {
        entity_type: "product",
        field: "image_asset_id",
        asset_kind: "product_photo",
    }];

fn unsupported_asset_attachment_target_error(entity_type: &str, field: &str) -> String {
    format!("Unsupported asset attachment target {entity_type}.{field}")
}

pub(super) fn supported_asset_attachment_target(
    target: &AssetAttachmentTarget,
) -> Result<&'static SupportedAssetAttachmentTarget, String> {
    SUPPORTED_ASSET_ATTACHMENT_TARGETS
        .iter()
        .find(|supported_target| {
            supported_target.entity_type == target.entity_type
                && supported_target.field == target.field
        })
        .ok_or_else(|| {
            unsupported_asset_attachment_target_error(&target.entity_type, &target.field)
        })
}

pub(super) fn validate_asset_attachment_target(
    target: &AssetAttachmentTarget,
) -> Result<(), String> {
    supported_asset_attachment_target(target).map(|_| ())
}

async fn update_product_image_asset_id(
    pool: &SqlitePool,
    product_id: &str,
    merchant_id: &str,
    asset_id: &str,
) -> Result<(), String> {
    let now = crate::time_utils::current_time_iso_string();
    log::info!(
        "[{}] product_image_link:start product_id={} merchant_id={} asset_id={}",
        super::PHOTO_PIPELINE_LOG_PREFIX,
        product_id,
        merchant_id,
        asset_id
    );
    let result = sqlx::query(
        "UPDATE products SET image_asset_id = ?2, is_synced = 0, updated_at = ?3 WHERE id = ?1 AND merchant_id = ?4 AND deleted_at IS NULL",
    )
    .bind(product_id)
    .bind(asset_id)
    .bind(&now)
    .bind(merchant_id)
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to update product image asset: {}", error))?;

    if result.rows_affected() == 0 {
        log::info!(
            "[{}] product_image_link:not_found product_id={} merchant_id={} asset_id={}",
            super::PHOTO_PIPELINE_LOG_PREFIX,
            product_id,
            merchant_id,
            asset_id
        );
        return Err(format!(
            "Product {} was not found while linking photo asset",
            product_id
        ));
    }

    log::info!(
        "[{}] product_image_link:updated product_id={} merchant_id={} asset_id={} rows_affected={}",
        super::PHOTO_PIPELINE_LOG_PREFIX,
        product_id,
        merchant_id,
        asset_id,
        result.rows_affected()
    );
    super::insert_sync_outbox(
        pool,
        product_id,
        "merchant",
        merchant_id,
        "products",
        "update",
    )
    .await
}

pub(super) async fn resolve_asset_target_merchant_id(
    pool: &SqlitePool,
    target: &AssetAttachmentTarget,
) -> Result<String, String> {
    match supported_asset_attachment_target(target)? {
        SupportedAssetAttachmentTarget {
            entity_type: "product",
            field: "image_asset_id",
            ..
        } => {
            let merchant_id = sqlx::query_scalar::<_, String>(
                "SELECT merchant_id FROM products WHERE id = ?1 AND deleted_at IS NULL",
            )
            .bind(&target.entity_id)
            .fetch_optional(pool)
            .await
            .map_err(|error| format!("Failed to resolve product merchant: {}", error))?;

            merchant_id.ok_or_else(|| {
                format!(
                    "Product {} was not found while enqueueing asset processing",
                    target.entity_id
                )
            })
        }
        supported_target => Err(unsupported_asset_attachment_target_error(
            supported_target.entity_type,
            supported_target.field,
        )),
    }
}

pub(super) async fn link_asset_to_attachment_target(
    pool: &SqlitePool,
    target: &AssetAttachmentTarget,
    merchant_id: &str,
    asset_id: &str,
) -> Result<(), String> {
    match supported_asset_attachment_target(target)? {
        SupportedAssetAttachmentTarget {
            entity_type: "product",
            field: "image_asset_id",
            ..
        } => update_product_image_asset_id(pool, &target.entity_id, merchant_id, asset_id).await,
        supported_target => Err(unsupported_asset_attachment_target_error(
            supported_target.entity_type,
            supported_target.field,
        )),
    }
}

pub(super) fn asset_kind_for_processing_job(
    job: &PendingAssetProcessingJobRecord,
) -> Result<&'static str, String> {
    super::processing_jobs::validate_asset_processing_kind(&job.processing_kind)?;
    let target = AssetAttachmentTarget {
        entity_type: job.entity_type.clone(),
        entity_id: job.entity_id.clone(),
        field: job.attachment_field.clone(),
    };
    supported_asset_attachment_target(&target).map(|supported_target| supported_target.asset_kind)
}
