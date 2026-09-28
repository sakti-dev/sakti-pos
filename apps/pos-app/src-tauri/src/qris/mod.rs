use serde::{Deserialize, Serialize};
use tauri::{plugin::TauriPlugin, Manager, Runtime};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.sakti_dev.sakti_pos.qris";

#[cfg(not(target_os = "android"))]
const UNSUPPORTED_PLATFORM_ERROR: &str =
    "QRIS payment detection is only supported on Android";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppEntry {
    pub package_name: String,
    pub app_name: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentEvent {
    pub package_name: String,
    pub app_label: String,
    pub amount_rupiah: i64,
    pub raw_text: String,
    pub post_time_millis: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
struct InstalledAppsResponse {
    apps: Vec<AppEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppIconResponse {
    icon_data_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
struct AllowedPackagesResponse {
    packages: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
struct RecentEventsResponse {
    events: Vec<PaymentEvent>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
struct GrantedResponse {
    granted: bool,
}

pub struct QrisBridge<R: Runtime> {
    #[cfg(target_os = "android")]
    mobile_plugin_handle: tauri::plugin::PluginHandle<R>,
    #[cfg(not(target_os = "android"))]
    _marker: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> QrisBridge<R> {
    fn get_installed_apps(&self) -> Result<Vec<AppEntry>, String> {
        #[cfg(target_os = "android")]
        {
            return self
                .mobile_plugin_handle
                .run_mobile_plugin::<InstalledAppsResponse>("getInstalledApps", serde_json::json!({}))
                .map(|response| response.apps)
                .map_err(|error| error.to_string());
        }

        #[cfg(not(target_os = "android"))]
        {
            let _ = self;
            Ok(Vec::new())
        }
    }

    fn set_allowed_packages(&self, packages: Vec<String>) -> Result<(), String> {
        #[cfg(target_os = "android")]
        {
            let packages_json = serde_json::to_string(&packages)
                .map_err(|error| error.to_string())?;
            return self
                .mobile_plugin_handle
                .run_mobile_plugin(
                    "setAllowedPackages",
                    serde_json::json!({ "packagesJson": packages_json }),
                )
                .map(|_: serde_json::Value| ())
                .map_err(|error| error.to_string());
        }

        #[cfg(not(target_os = "android"))]
        {
            let _ = (self, packages);
            Ok(())
        }
    }

    fn get_app_icon(&self, package_name: String) -> Result<Option<String>, String> {
        #[cfg(target_os = "android")]
        {
            return self
                .mobile_plugin_handle
                .run_mobile_plugin::<AppIconResponse>(
                    "getAppIcon",
                    serde_json::json!({ "packageName": package_name }),
                )
                .map(|response| response.icon_data_url)
                .map_err(|error| error.to_string());
        }

        #[cfg(not(target_os = "android"))]
        {
            let _ = (self, package_name);
            Ok(None)
        }
    }

    fn get_allowed_packages(&self) -> Result<Vec<String>, String> {
        #[cfg(target_os = "android")]
        {
            return self
                .mobile_plugin_handle
                .run_mobile_plugin::<AllowedPackagesResponse>("getAllowedPackages", serde_json::json!({}))
                .map(|response| response.packages)
                .map_err(|error| error.to_string());
        }

        #[cfg(not(target_os = "android"))]
        {
            let _ = self;
            Ok(Vec::new())
        }
    }

    fn get_recent_events(&self) -> Result<Vec<PaymentEvent>, String> {
        #[cfg(target_os = "android")]
        {
            return self
                .mobile_plugin_handle
                .run_mobile_plugin::<RecentEventsResponse>("getRecentEvents", serde_json::json!({}))
                .map(|response| response.events)
                .map_err(|error| error.to_string());
        }

        #[cfg(not(target_os = "android"))]
        {
            let _ = self;
            Ok(Vec::new())
        }
    }

    fn is_notification_access_granted(&self) -> Result<bool, String> {
        #[cfg(target_os = "android")]
        {
            return self
                .mobile_plugin_handle
                .run_mobile_plugin::<GrantedResponse>("isNotificationAccessGranted", serde_json::json!({}))
                .map(|response| response.granted)
                .map_err(|error| error.to_string());
        }

        #[cfg(not(target_os = "android"))]
        {
            let _ = self;
            Ok(false)
        }
    }

    fn open_notification_access_settings(&self) -> Result<(), String> {
        #[cfg(target_os = "android")]
        {
            return self
                .mobile_plugin_handle
                .run_mobile_plugin::<serde_json::Value>("openNotificationAccessSettings", serde_json::json!({}))
                .map(|_: serde_json::Value| ())
                .map_err(|error| error.to_string());
        }

        #[cfg(not(target_os = "android"))]
        {
            Err(UNSUPPORTED_PLATFORM_ERROR.to_string())
        }
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("qris-bridge")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let mobile_plugin_handle =
                    api.register_android_plugin(PLUGIN_IDENTIFIER, "QrisBridgePlugin")?;
                app.manage(QrisBridge::<R> {
                    mobile_plugin_handle,
                });
            }

            #[cfg(not(target_os = "android"))]
            {
                let _ = api;
                app.manage(QrisBridge::<R> {
                    _marker: std::marker::PhantomData,
                });
            }

            Ok(())
        })
        .build()
}

#[tauri::command]
pub async fn qris_get_installed_apps<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<AppEntry>, String> {
    app.state::<QrisBridge<R>>().get_installed_apps()
}

#[tauri::command]
pub async fn qris_set_allowed_packages<R: Runtime>(
    app: tauri::AppHandle<R>,
    packages: Vec<String>,
) -> Result<(), String> {
    app.state::<QrisBridge<R>>().set_allowed_packages(packages)
}

#[tauri::command]
pub async fn qris_get_app_icon<R: Runtime>(
    app: tauri::AppHandle<R>,
    package_name: String,
) -> Result<Option<String>, String> {
    app.state::<QrisBridge<R>>().get_app_icon(package_name)
}

#[tauri::command]
pub async fn qris_get_allowed_packages<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<String>, String> {
    app.state::<QrisBridge<R>>().get_allowed_packages()
}

#[tauri::command]
pub async fn qris_get_recent_events<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<PaymentEvent>, String> {
    app.state::<QrisBridge<R>>().get_recent_events()
}

#[tauri::command]
pub async fn qris_is_notification_access_granted<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<bool, String> {
    app.state::<QrisBridge<R>>().is_notification_access_granted()
}

#[tauri::command]
pub async fn qris_open_notification_access_settings<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    app.state::<QrisBridge<R>>().open_notification_access_settings()
}
