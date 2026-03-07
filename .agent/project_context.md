# Project Context: Project Launcher

## Overview
This is a macOS desktop application built with Tauri v2. It acts as a global system tray accessory to quickly list, inspect, and launch local development projects.

## Tech Stack
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, app components styled with shadcn/ui and `base-ui`, and Zustand for state management. The UI MUST use an Ayu Dark theme strictly for aesthetic.
- **Backend**: Rust, Tauri v2.

## Key Features & Architecture
- **System Tray / Headless App**: Runs in the macOS menu bar without a dock icon (`ActivationPolicy::Accessory`). Toggled via the tray icon.
- **Project Discovery**: The `get_projects` command scans root directories and determines project types by looking for indicator files:
  - `package.json` -> "Node" project.
  - `.sln` or `.slnx` -> ".NET" project.
- **Git Integration**: Relies on executing system `git` commands natively from Rust (`std::process::Command`):
  - Fetches branch names, ahead/behind counts, and clean/dirty statuses via `--porcelain` and `rev-parse`.
  - Can trigger `git fetch` and retrieve branches.
  - Can launch the external Git GUI "Tower" using the `gittower` CLI or `open -a Tower`.
- **IDE Integration**: The `open_project` command launches:
  - JetBrains Rider for .NET (`.sln`) projects.
  - Cursor for Node/JS/TS projects.

## Commands Reference (src-tauri/src/lib.rs)
- `get_projects(root_path: String)` -> Returns discovered projects.
- `get_project_git_info(path: String)` -> Fetches granular git stats.
- `open_project(editor, folder_path, specific_file)` -> Spawns `open -a <Editor>` processes.
- `git_fetch(path)` -> Triggers `git fetch`.
- `get_git_branches(path)` -> Returns list of local branches.
- `open_in_tower(path)` -> Opens repo in Tower.

## Typical Workflows
- **Frontend Changes**: Run `npm run dev`. Work within `/src`.
- **Backend Changes**: Modifying Tauri commands in `/src-tauri/src/lib.rs`. The dev server will auto-restart the Rust backend if it detects changes.
