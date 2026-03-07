use tauri::Manager;
use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};

#[tauri::command]
fn get_projects(root_path: String) -> Result<Vec<String>, String> {
    let mut projects = Vec::new();
    let path = if root_path.starts_with("~/") {
        let home = std::env::var("HOME").unwrap_or_else(|_| "".to_string());
        root_path.replacen("~", &home, 1)
    } else {
        root_path
    };

    let entries = std::fs::read_dir(path).map_err(|e| e.to_string())?;

    for entry in entries {
        if let Ok(entry) = entry {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_dir() {
                    if let Ok(name) = entry.file_name().into_string() {
                        if !name.starts_with('.') {
                            projects.push(name);
                        }
                    }
                }
            }
        }
    }

    projects.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    Ok(projects)
}

#[tauri::command]
fn open_project(editor: String, folder_path: String) -> Result<(), String> {
    let path = if folder_path.starts_with("~/") {
        let home = std::env::var("HOME").unwrap_or_else(|_| "".to_string());
        folder_path.replacen("~", &home, 1)
    } else {
        folder_path
    };

    let status = std::process::Command::new("open")
        .arg("-a")
        .arg(editor)
        .arg(&path)
        .status()
        .map_err(|e| e.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("Failed to open editor on {}", path))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![get_projects, open_project])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            if is_visible {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
