use tauri::State;

use crate::app::state::AppState;

pub async fn upload_pending_assets(
    _api_url: String,
    _session_token: String,
    _merchant_id: String,
    _limit: Option<i64>,
    _state: State<'_, AppState>,
) -> Result<usize, String> {
    Err("Asset upload not available: protobuf removed, waiting for baresync cutover".to_string())
}
