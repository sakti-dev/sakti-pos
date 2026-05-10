use serde::{Deserialize, Serialize};
use tauri::{plugin::TauriPlugin, Manager, Runtime};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.sakti_dev.sakti_pos.printer";

#[cfg(not(target_os = "android"))]
const UNSUPPORTED_PLATFORM_ERROR: &str = "Thermal printing is only supported on Android";

#[derive(Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterInfo {
    pub address: String,
    pub name: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintThermalReceiptArgs {
    pub address: String,
    pub formatted_text: String,
}

#[cfg(target_os = "android")]
fn log_printer_error(event: &str, details: Option<&str>) {
    match details {
        Some(details) => eprintln!("[PRINTER] {} {}", event, details),
        None => eprintln!("[PRINTER] {}", event),
    }
}

pub struct ThermalPrinter<R: Runtime> {
    #[cfg(target_os = "android")]
    mobile_plugin_handle: tauri::plugin::PluginHandle<R>,
    #[cfg(not(target_os = "android"))]
    _marker: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> ThermalPrinter<R> {
    fn list_paired_printers(&self) -> Result<Vec<PrinterInfo>, String> {
        #[cfg(target_os = "android")]
        {
            return self
                .mobile_plugin_handle
                .run_mobile_plugin("listPrinters", serde_json::json!({}))
                .map_err(|error| {
                    log_printer_error(
                        "bridge:list_paired_printers:failed",
                        Some(&error.to_string()),
                    );
                    error.to_string()
                });
        }

        #[cfg(not(target_os = "android"))]
        {
            Err(unsupported_platform_error().to_string())
        }
    }

    fn test_printer(&self, address: String) -> Result<(), String> {
        #[cfg(target_os = "android")]
        {
            return self
                .mobile_plugin_handle
                .run_mobile_plugin("testPrint", serde_json::json!({ "address": address }))
                .map_err(|error| {
                    log_printer_error(
                        "bridge:test_printer:failed",
                        Some(&error.to_string()),
                    );
                    error.to_string()
                });
        }

        #[cfg(not(target_os = "android"))]
        {
            let _ = address;
            Err(unsupported_platform_error().to_string())
        }
    }

    fn print_receipt(&self, args: PrintThermalReceiptArgs) -> Result<(), String> {
        #[cfg(target_os = "android")]
        {
            return self
                .mobile_plugin_handle
                .run_mobile_plugin("printReceipt", args)
                .map_err(|error| {
                    log_printer_error(
                        "bridge:print_receipt:failed",
                        Some(&error.to_string()),
                    );
                    error.to_string()
                });
        }

        #[cfg(not(target_os = "android"))]
        {
            let _ = args;
            Err(unsupported_platform_error().to_string())
        }
    }

    fn request_permissions(&self) -> Result<(), String> {
        #[cfg(target_os = "android")]
        {
            return self
                .mobile_plugin_handle
                .run_mobile_plugin("requestBluetoothPermission", serde_json::json!({}))
                .map_err(|error| {
                    log_printer_error(
                        "bridge:request_permission:failed",
                        Some(&error.to_string()),
                    );
                    error.to_string()
                });
        }

        #[cfg(not(target_os = "android"))]
        {
            Err(unsupported_platform_error().to_string())
        }
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("thermal-printer")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let mobile_plugin_handle =
                    api.register_android_plugin(PLUGIN_IDENTIFIER, "ThermalPrinterPlugin")?;
                app.manage(ThermalPrinter::<R> {
                    mobile_plugin_handle,
                });
            }

            #[cfg(not(target_os = "android"))]
            {
                let _ = api;
                app.manage(ThermalPrinter::<R> {
                    _marker: std::marker::PhantomData,
                });
            }

            Ok(())
        })
        .build()
}

#[cfg(not(target_os = "android"))]
pub fn unsupported_platform_error() -> &'static str {
    UNSUPPORTED_PLATFORM_ERROR
}

#[tauri::command]
pub async fn list_paired_thermal_printers<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<PrinterInfo>, String> {
    app.state::<ThermalPrinter<R>>().list_paired_printers()
}

#[tauri::command]
pub async fn test_thermal_printer<R: Runtime>(
    app: tauri::AppHandle<R>,
    address: String,
) -> Result<(), String> {
    app.state::<ThermalPrinter<R>>().test_printer(address)
}

#[tauri::command]
pub async fn print_thermal_receipt<R: Runtime>(
    app: tauri::AppHandle<R>,
    address: String,
    formatted_text: String,
) -> Result<(), String> {
    app.state::<ThermalPrinter<R>>()
        .print_receipt(PrintThermalReceiptArgs {
            address,
            formatted_text,
        })
}

#[tauri::command]
pub async fn request_bluetooth_permission<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    app.state::<ThermalPrinter<R>>().request_permissions()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    #[test]
    fn desktop_bridge_reports_android_only_support() {
        assert_eq!(
            super::unsupported_platform_error(),
            "Thermal printing is only supported on Android"
        );
    }

    #[test]
    fn print_receipt_args_serialize_for_kotlin_bridge() {
        let args = super::PrintThermalReceiptArgs {
            address: "00:11:22:33:44:55".to_string(),
            formatted_text: "[C]<b>SAKTI POS</b>".to_string(),
        };

        assert_eq!(
            serde_json::to_value(args).expect("args should serialize"),
            json!({
                "address": "00:11:22:33:44:55",
                "formattedText": "[C]<b>SAKTI POS</b>",
            })
        );
    }

    #[test]
    fn print_receipt_args_deserialize_from_camel_case() {
        let args: super::PrintThermalReceiptArgs = serde_json::from_value(json!({
            "address": "AA:BB:CC:DD:EE:FF",
            "formattedText": "[L]Test",
        }))
        .expect("args should deserialize");

        assert_eq!(args.address, "AA:BB:CC:DD:EE:FF");
        assert_eq!(args.formatted_text, "[L]Test");
    }
}
