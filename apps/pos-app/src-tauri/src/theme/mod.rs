use tauri::{plugin::TauriPlugin, Manager, Runtime};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.sakti_dev.sakti_pos.theme";

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
struct SetStatusBarColorArgs {
    color: String,
    is_dark: bool,
}

pub struct ThemeSync<R: Runtime> {
    #[cfg(target_os = "android")]
    mobile_plugin_handle: tauri::plugin::PluginHandle<R>,
    #[cfg(not(target_os = "android"))]
    _marker: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> ThemeSync<R> {
    fn set_status_bar_color(&self, color: String, is_dark: bool) -> Result<(), String> {
        #[cfg(target_os = "android")]
        {
            return self
                .mobile_plugin_handle
                .run_mobile_plugin("setStatusBarBackground", SetStatusBarColorArgs { color, is_dark })
                .map_err(|error| error.to_string());
        }

        #[cfg(not(target_os = "android"))]
        {
            let _ = color;
            let _ = is_dark;
            Ok(())
        }
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("theme-sync")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let mobile_plugin_handle =
                    api.register_android_plugin(PLUGIN_IDENTIFIER, "ThemePlugin")?;
                app.manage(ThemeSync::<R> {
                    mobile_plugin_handle,
                });
            }

            #[cfg(not(target_os = "android"))]
            {
                let _ = api;
                app.manage(ThemeSync::<R> {
                    _marker: std::marker::PhantomData,
                });
            }

            Ok(())
        })
        .build()
}

#[tauri::command]
pub async fn sync_status_bar_color<R: Runtime>(
    app: tauri::AppHandle<R>,
    color: String,
    is_dark: bool,
) -> Result<(), String> {
    app.state::<ThemeSync<R>>().set_status_bar_color(color, is_dark)
}
