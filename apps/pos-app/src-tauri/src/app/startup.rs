use tauri::Manager;

pub fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    let result: Result<(), Box<dyn std::error::Error>> =
        tauri::async_runtime::block_on(async move {
            let pool = match crate::db::drizzle_proxy::init_db(&handle).await {
                Ok(pool) => pool,
                Err(error) => {
                    crate::pos_log!(
                        error,
                        "DB",
                        "INIT:FAIL",
                        "Failed to initialize database",
                        "error" => error
                    );
                    return Err(std::io::Error::other(error).into());
                }
            };

            let pool_for_jobs = pool.clone();
            handle.manage(crate::app::state::AppState { db_pool: pool });
            tauri::async_runtime::spawn(async move {
                if let Err(error) =
                    crate::assets::reset_incomplete_pending_asset_processing_jobs(&pool_for_jobs)
                        .await
                {
                    crate::pos_log!(
                        error,
                        "ASSET",
                        "JOB:RESET:FAIL",
                        "Failed to reset incomplete asset jobs",
                        "error" => error
                    );
                }
            });

            Ok(())
        });

    result
}
