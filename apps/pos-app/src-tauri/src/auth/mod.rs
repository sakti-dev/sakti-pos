use serde::Serialize;
use serde::Deserialize;
#[cfg(not(target_os = "android"))]
use std::sync::Mutex;
use tauri::{plugin::TauriPlugin, Manager, Runtime};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.sakti_dev.sakti_pos.auth";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
pub struct SaveAuthTokenArgs {
    pub token: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
struct AuthTokenResponse {
    token: Option<String>,
}

pub struct AuthTokenStore<R: Runtime> {
    #[cfg(target_os = "android")]
    mobile_plugin_handle: tauri::plugin::PluginHandle<R>,
    #[cfg(not(target_os = "android"))]
    token: Mutex<Option<String>>,
    #[cfg(not(target_os = "android"))]
    _marker: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> AuthTokenStore<R> {
    fn save_token(&self, token: String) -> Result<(), String> {
        #[cfg(target_os = "android")]
        {
            return self
                .mobile_plugin_handle
                .run_mobile_plugin("saveToken", SaveAuthTokenArgs { token })
                .map_err(|error| error.to_string());
        }

        #[cfg(not(target_os = "android"))]
        {
            let mut stored_token = self
                .token
                .lock()
                .map_err(|_| "Auth token memory store lock was poisoned".to_string())?;
            *stored_token = Some(token);
            Ok(())
        }
    }

    fn get_token(&self) -> Result<Option<String>, String> {
        #[cfg(target_os = "android")]
        {
            return self
                .mobile_plugin_handle
                .run_mobile_plugin("getToken", serde_json::json!({}))
                .map(|response: AuthTokenResponse| response.token)
                .map_err(|error| error.to_string());
        }

        #[cfg(not(target_os = "android"))]
        {
            let stored_token = self
                .token
                .lock()
                .map_err(|_| "Auth token memory store lock was poisoned".to_string())?;
            Ok(stored_token.clone())
        }
    }

    fn clear_token(&self) -> Result<(), String> {
        #[cfg(target_os = "android")]
        {
            return self
                .mobile_plugin_handle
                .run_mobile_plugin("clearToken", serde_json::json!({}))
                .map_err(|error| error.to_string());
        }

        #[cfg(not(target_os = "android"))]
        {
            let mut stored_token = self
                .token
                .lock()
                .map_err(|_| "Auth token memory store lock was poisoned".to_string())?;
            *stored_token = None;
            Ok(())
        }
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("auth-token")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let mobile_plugin_handle =
                    api.register_android_plugin(PLUGIN_IDENTIFIER, "AuthTokenPlugin")?;
                app.manage(AuthTokenStore::<R> {
                    mobile_plugin_handle,
                });
            }

            #[cfg(not(target_os = "android"))]
            {
                let _ = api;
                app.manage(AuthTokenStore::<R> {
                    token: Mutex::new(None),
                    _marker: std::marker::PhantomData,
                });
            }

            Ok(())
        })
        .build()
}

#[tauri::command]
pub async fn save_auth_token<R: Runtime>(
    app: tauri::AppHandle<R>,
    token: String,
) -> Result<(), String> {
    app.state::<AuthTokenStore<R>>().save_token(token)
}

#[tauri::command]
pub async fn get_auth_token<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<String>, String> {
    app.state::<AuthTokenStore<R>>().get_token()
}

#[tauri::command]
pub async fn clear_auth_token<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    app.state::<AuthTokenStore<R>>().clear_token()
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use std::sync::Mutex;

    #[test]
    fn save_token_args_serialize_for_kotlin_bridge() {
        let args = super::SaveAuthTokenArgs {
            token: "session-1".to_string(),
        };

        assert_eq!(
            serde_json::to_value(args).expect("args should serialize"),
            json!({ "token": "session-1" })
        );
    }

    #[test]
    fn desktop_store_saves_reads_and_clears_token_in_memory() {
        let store = super::AuthTokenStore::<tauri::Wry> {
            token: Mutex::new(None),
            _marker: std::marker::PhantomData,
        };

        store.save_token("session-1".to_string()).unwrap();
        assert_eq!(store.get_token().unwrap(), Some("session-1".to_string()));

        store.clear_token().unwrap();
        assert_eq!(store.get_token().unwrap(), None);
    }
}
