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
        folder_path.clone()
    };

    let mut final_editor = editor;
    let mut open_target = path.clone();

    // Check directory contents for specific project structures
    if let Ok(src_entries) = std::fs::read_dir(std::path::Path::new(&path).join("src")) {
        let mut has_package_json = false;
        let mut sln_file = None;

        for entry in src_entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                let file_name_str = entry.file_name().to_string_lossy().to_string();
                
                // Check direct children of src for package.json or .sln/.slnx
                if file_type.is_file() {
                    if file_name_str == "package.json" {
                        has_package_json = true;
                    } else if file_name_str.ends_with(".sln") || file_name_str.ends_with(".slnx") {
                        sln_file = Some(entry.path());
                    }
                } 
                // Check one level deep inside src for subdirectories
                else if file_type.is_dir() {
                    if let Ok(sub_entries) = std::fs::read_dir(entry.path()) {
                        for sub_entry in sub_entries.flatten() {
                            let sub_name = sub_entry.file_name().to_string_lossy().to_string();
                            if sub_name == "package.json" {
                                has_package_json = true;
                                open_target = entry.path().to_string_lossy().to_string();
                            } else if sub_name.ends_with(".sln") || sub_name.ends_with(".slnx") {
                                sln_file = Some(sub_entry.path());
                            }
                        }
                    }
                }
            }
        }

        if let Some(sln_path) = sln_file {
            final_editor = "Rider".to_string();
            // Open the specific solution file using Rider
            open_target = sln_path.to_string_lossy().to_string();
        } else if has_package_json {
            final_editor = "Cursor".to_string();
        }
    }

    let status = std::process::Command::new("open")
        .arg("-a")
        .arg(&final_editor)
        .arg(&open_target)
        .status()
        .map_err(|e| e.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("Failed to open {} on {}", final_editor, open_target))
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
                        rect,
                        ..
                    } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            if is_visible {
                                let _ = window.hide();
                            } else {
                                if let Ok(window_size) = window.outer_size() {
                                    let (tray_x, tray_y) = match rect.position {
                                        tauri::Position::Physical(p) => (p.x as f64, p.y as f64),
                                        tauri::Position::Logical(p) => (p.x as f64, p.y as f64),
                                    };
                                    let (tray_w, tray_h) = match rect.size {
                                        tauri::Size::Physical(s) => (s.width as f64, s.height as f64),
                                        tauri::Size::Logical(s) => (s.width as f64, s.height as f64),
                                    };
                                    let x = tray_x + (tray_w / 2.0) - (window_size.width as f64 / 2.0);
                                    let y = tray_y + tray_h + 5.0;
                                    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(x as i32, y as i32)));
                                }

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
