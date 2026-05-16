use super::{PullResult, PushResult};

#[derive(Debug, serde::Serialize)]
pub struct SyncNowResult {
    pub pull: PullResult,
    pub push: PushResult,
    pub purged: usize,
}

pub(super) fn empty_pull_result() -> PullResult {
    PullResult {
        rows_received: 0,
        server_time: String::new(),
    }
}

pub(super) fn empty_push_result() -> PushResult {
    PushResult {
        tables_synced: Vec::new(),
        server_wins_count: 0,
        server_time: String::new(),
    }
}
