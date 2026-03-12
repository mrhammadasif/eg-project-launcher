use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
struct Project {
    name: String,
    project_type: String,
    path: String,
    has_git: bool,
    git_branch: Option<String>,
    git_status: Option<String>, // "clean", "dirty", "ahead", "behind"
    git_ahead: Option<u32>,
    git_behind: Option<u32>,
    sln_files: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Clone)]
struct ProjectGitInfo {
    has_git: bool,
    git_branch: Option<String>,
    git_status: Option<String>,
    git_ahead: Option<u32>,
    git_behind: Option<u32>,
}

fn determine_project_type(path: &std::path::Path) -> (String, Vec<String>) {
    let mut has_package_json = false;
    let mut sln_files = Vec::new();

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
                            sln_files.push(entry.path().to_string_lossy().to_string());
                        }
                    } else if file_type.is_dir() && dir == path.join("src") {
                        if let Ok(sub_entries) = std::fs::read_dir(entry.path()) {
                            for sub_entry in sub_entries.flatten() {
                                let sub_name = sub_entry.file_name().to_string_lossy().to_string();
                                if sub_name == "package.json" {
                                    has_package_json = true;
                                } else if sub_name.ends_with(".sln") || sub_name.ends_with(".slnx")
                                {
                                    sln_files.push(sub_entry.path().to_string_lossy().to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    sln_files.sort();

    if !sln_files.is_empty() {
        ("dotnet".to_string(), sln_files)
    } else if has_package_json {
        ("node".to_string(), sln_files)
    } else {
        ("unknown".to_string(), sln_files)
    }
}

fn get_git_info(
    path: &std::path::Path,
) -> (
    bool,
    Option<String>,
    Option<String>,
    Option<u32>,
    Option<u32>,
) {
    let git_dir = path.join(".git");
    if !git_dir.exists() {
        return (false, None, None, None, None);
    }

    // Get Branch
    let branch_output = std::process::Command::new("git")
        .current_dir(path)
        .arg("rev-parse")
        .arg("--abbrev-ref")
        .arg("HEAD")
        .output();

    let branch = match branch_output {
        Ok(out) if out.status.success() => {
            let b = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if b.is_empty() {
                None
            } else {
                Some(b)
            }
        }
        _ => None,
    };

    // Get Status (porcelain)
    let status_output = std::process::Command::new("git")
        .current_dir(path)
        .arg("status")
        .arg("--porcelain")
        .arg("--branch")
        .output();

    let mut status_str = "clean".to_string();
    let mut ahead_count = None;
    let mut behind_count = None;

    if let Ok(out) = status_output {
        if out.status.success() {
            let output_str = String::from_utf8_lossy(&out.stdout);
            let lines: Vec<&str> = output_str.lines().collect();

            if lines.len() > 1 {
                status_str = "dirty".to_string();
            } else if let Some(first_line) = lines.first() {
                if first_line.contains("[ahead ") || first_line.contains("[behind ") {
                    status_str = "ahead".to_string(); // Fallback label, but ahead_count and behind_count overrides
                }
            }

            if let Some(first_line) = lines.first() {
                if first_line.starts_with("##") {
                    if let Some(open_bracket) = first_line.find('[') {
                        if let Some(close_bracket) = first_line.rfind(']') {
                            let inner = &first_line[open_bracket + 1..close_bracket];
                            for part in inner.split(',') {
                                let p = part.trim();
                                if p.starts_with("ahead ") {
                                    if let Ok(n) = p[6..].parse() {
                                        ahead_count = Some(n);
                                    }
                                } else if p.starts_with("behind ") {
                                    if let Ok(n) = p[7..].parse() {
                                        behind_count = Some(n);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    (true, branch, Some(status_str), ahead_count, behind_count)
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
                            let project_path = entry.path();
                            let (project_type, sln_files) = determine_project_type(&project_path);

                            projects.push(Project {
                                name,
                                project_type,
                                path: project_path.to_string_lossy().to_string(),
                                has_git: false,
                                git_branch: None,
                                git_status: None,
                                git_ahead: None,
                                git_behind: None,
                                sln_files: if sln_files.is_empty() {
                                    None
                                } else {
                                    Some(sln_files)
                                },
                            });
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
async fn get_project_git_info(path: String) -> Result<ProjectGitInfo, String> {
    let (has_git, git_branch, git_status, git_ahead, git_behind) =
        get_git_info(std::path::Path::new(&path));
    Ok(ProjectGitInfo {
        has_git,
        git_branch,
        git_status,
        git_ahead,
        git_behind,
    })
}

#[tauri::command]
fn quit_app() {
    std::process::exit(0);
}

#[tauri::command]
fn open_project(
    app: tauri::AppHandle,
    editor: String,
    folder_path: String,
    specific_file: Option<String>,
) -> Result<(), String> {
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

    if let Some(specific) = specific_file {
        final_editor = "Rider".to_string();
        open_target = specific;
    } else {
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
                        } else if file_name_str.ends_with(".sln")
                            || file_name_str.ends_with(".slnx")
                        {
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
                                } else if sub_name.ends_with(".sln") || sub_name.ends_with(".slnx")
                                {
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
    }

    let _ = std::process::Command::new("open")
        .arg("-a")
        .arg(&final_editor)
        .arg(&open_target)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn git_fetch(path: String) -> Result<(), String> {
    std::process::Command::new("git")
        .current_dir(path)
        .arg("fetch")
        .arg("--prune")
        .arg("--all")
        .output()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_git_branches(path: String) -> Result<Vec<String>, String> {
    let output = std::process::Command::new("git")
        .current_dir(path)
        .arg("branch")
        .arg("--format=%(refname:short)")
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        let branches_str = String::from_utf8_lossy(&output.stdout);
        let branches = branches_str
            .lines()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        Ok(branches)
    } else {
        Err("Failed to get branches".to_string())
    }
}

#[tauri::command]
async fn open_in_tower(path: String) -> Result<(), String> {
    // Attempt to run `gittower` command, or fallback to native `open -a Tower`
    let status = std::process::Command::new("gittower").arg(&path).status();

    if status.is_err() || !status.unwrap().success() {
        std::process::Command::new("open")
            .arg("-a")
            .arg("Tower")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn open_in_finder(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn open_in_ide(path: String, ide: String) -> Result<(), String> {
    if ide == "Claude Code" {
        let script = format!(
            "tell application \"iTerm\"\n\
             activate\n\
             set newWindow to (create window with default profile)\n\
             tell current session of newWindow\n\
             write text \"cd '{}' && claude\"\n\
             end tell\n\
             end tell",
            path
        );
        std::process::Command::new("osascript")
            .arg("-e")
            .arg(script)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    let app_name = match ide.as_str() {
        "Cursor" => "Cursor",
        "Antigravity" => "Antigravity",
        "VSCode" => "Visual Studio Code",
        _ => &ide
    };

    std::process::Command::new("open")
        .arg("-a")
        .arg(app_name)
        .arg(&path)
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
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Focused(focused) = event {
                if !focused {
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_projects,
            get_project_git_info,
            open_project,
            quit_app,
            git_fetch,
            get_git_branches,
            open_in_tower,
            open_in_finder,
            open_in_ide
        ])
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
                    } = event
                    {
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
                                        tauri::Size::Physical(s) => {
                                            (s.width as f64, s.height as f64)
                                        }
                                        tauri::Size::Logical(s) => {
                                            (s.width as f64, s.height as f64)
                                        }
                                    };
                                    let x =
                                        tray_x + (tray_w / 2.0) - (window_size.width as f64 / 2.0);
                                    let y = tray_y + tray_h + 5.0;
                                    let _ = window.set_position(tauri::Position::Physical(
                                        tauri::PhysicalPosition::new(x as i32, y as i32),
                                    ));
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
