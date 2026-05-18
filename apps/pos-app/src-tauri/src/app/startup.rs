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

            #[cfg(debug_assertions)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;

                let startup_urls = handle.deep_link().get_current().map_err(|error| {
                    std::io::Error::other(format!("Failed to read startup deep links: {}", error))
                })?;
                if let Some(urls) = startup_urls {
                    let urls = urls
                        .into_iter()
                        .map(|url| url.to_string())
                        .collect::<Vec<_>>();
                    let export_handle = handle.clone();
                    let export_pool = pool_for_jobs.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(error) = crate::db::snapshot::handle_dev_snapshot_export_urls(
                            &export_handle,
                            &export_pool,
                            &urls,
                        )
                        .await
                        {
                            crate::pos_log!(
                                error,
                                "DB",
                                "SNAPSHOT_EXPORT_FAILED",
                                "Failed to export local DB snapshot from startup deep link",
                                "error" => error
                            );
                        }
                    });
                }

                let export_handle = handle.clone();
                let export_pool = pool_for_jobs.clone();
                handle.deep_link().on_open_url(move |event| {
                    let urls = event
                        .urls()
                        .iter()
                        .map(|url| url.to_string())
                        .collect::<Vec<_>>();
                    let export_handle = export_handle.clone();
                    let export_pool = export_pool.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(error) = crate::db::snapshot::handle_dev_snapshot_export_urls(
                            &export_handle,
                            &export_pool,
                            &urls,
                        )
                        .await
                        {
                            crate::pos_log!(
                                error,
                                "DB",
                                "SNAPSHOT_EXPORT_FAILED",
                                "Failed to export local DB snapshot from deep link",
                                "error" => error
                            );
                        }
                    });
                });
            }

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

                if let Err(error) =
                    crate::assets::temp_cleanup::cleanup_orphaned_product_photo_inputs(
                        &handle,
                        &pool_for_jobs,
                    )
                    .await
                {
                    crate::pos_log!(
                        error,
                        "ASSET",
                        "TEMP_CLEANUP:FAIL",
                        "Failed to sweep orphaned product photo inputs",
                        "error" => error
                    );
                }
            });

            Ok(())
        });

    result
}
