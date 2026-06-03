use tauri::{AppHandle, State};

use crate::app::state::AppState;

pub async fn hydrate_missing_assets(
    _app: AppHandle,
    _api_url: String,
    _session_token: String,
    _merchant_id: String,
    _limit: Option<i64>,
    _state: State<'_, AppState>,
) -> Result<usize, String> {
    Err("Asset hydration not available: protobuf removed, waiting for baresync cutover".to_string())
}
