use tauri::Manager;
use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct Project {
    name: String,
    project_type: String,
}

fn determine_project_type(path: &std::path::Path) -> String {
    let mut has_package_json = false;
    let mut has_sln = false;

    let dirs_to_check = vec![path.to_path_buf(), path.join("src")];
    
    for dir in dirs_to_check {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if file_type.is_file() {
                        if name == "package.json" {
                            has_package_json = true;
                        } else if name.ends_with(".sln") || name.ends_with(".slnx") {
                            has_sln = true;
                        }
                    } else if file_type.is_dir() && dir == path.join("src") {
                        if let Ok(sub_entries) = std::fs::read_dir(entry.path()) {
                            for sub_entry in sub_entries.flatten() {
                                let sub_name = sub_entry.file_name().to_string_lossy().to_string();
                                if sub_name == "package.json" {
                                    has_package_json = true;
                                } else if sub_name.ends_with(".sln") || sub_name.ends_with(".slnx") {
                                    has_sln = true;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if has_sln {
        "dotnet".to_string()
    } else if has_package_json {
        "node".to_string()
    } else {
        "unknown".to_string()
    }
}

#[tauri::command]
fn get_projects(root_path: String) -> Result<Vec<Project>, String> {
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
                            let project_type = determine_project_type(&entry.path());
                            projects.push(Project { name, project_type });
                        }
                    }
                }
            }
        }
    }

    projects.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(projects)
}

#[tauri::command]
fn quit_app() {
    std::process::exit(0);
}

#[tauri::command]
fn open_project(app: tauri::AppHandle, editor: String, folder_path: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
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

    let _ = std::process::Command::new("open")
        .arg("-a")
        .arg(&final_editor)
        .arg(&open_target)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![get_projects, open_project, quit_app])
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
