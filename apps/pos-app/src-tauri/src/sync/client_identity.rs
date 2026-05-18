use sqlx::SqlitePool;
use uuid::Uuid;

use crate::time_utils::current_time_iso_string;

const CLIENT_ID_ROW_ID: i64 = 1;

pub(super) async fn ensure_sync_client_identity_table(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS sync_client_identity (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            client_id TEXT NOT NULL,
            created_at TEXT NOT NULL
        )",
    )
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to create sync client identity table: {}", error))?;

    Ok(())
}

pub(super) async fn get_or_create_sync_client_id(pool: &SqlitePool) -> Result<String, String> {
    ensure_sync_client_identity_table(pool).await?;

    if let Some(client_id) =
        sqlx::query_scalar::<_, String>("SELECT client_id FROM sync_client_identity WHERE id = ?1")
            .bind(CLIENT_ID_ROW_ID)
            .fetch_optional(pool)
            .await
            .map_err(|error| format!("Failed to read sync client id: {}", error))?
    {
        return Ok(client_id);
    }

    let client_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT OR IGNORE INTO sync_client_identity (id, client_id, created_at)
         VALUES (?1, ?2, ?3)",
    )
    .bind(CLIENT_ID_ROW_ID)
    .bind(&client_id)
    .bind(current_time_iso_string())
    .execute(pool)
    .await
    .map_err(|error| format!("Failed to create sync client id: {}", error))?;

    sqlx::query_scalar::<_, String>("SELECT client_id FROM sync_client_identity WHERE id = ?1")
        .bind(CLIENT_ID_ROW_ID)
        .fetch_one(pool)
        .await
        .map_err(|error| format!("Failed to load sync client id after create: {}", error))
}
