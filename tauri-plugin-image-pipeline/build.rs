const COMMANDS: &[&str] = &[
    "enqueue_job",
    "process_pending_jobs",
    "get_completed_jobs",
    "consume_completed_job",
    "reset_stuck_jobs",
    "retry_failed_job",
    "get_failed_jobs",
    "get_pending_preview",
    "get_cached_asset_path",
    "cleanup_orphaned_temp_files",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
