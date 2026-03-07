# Project Launcher

Project Launcher is a macOS desktop application designed to quickly list, inspect, and launch local development projects straight from your system tray. 

Built with **Tauri v2** and **Rust** on the backend, and **React + TypeScript + Vite** on the frontend. The UI uses Shadcn UI components with an Ayu Dark theme aesthetic.

## Features

- **Quick Access**: Runs in the macOS menu bar as a headless Accessory application. Toggle it instantly to view your projects.
- **Auto-Discovery**: Scans designated root folders to automatically detect:
  - **Node.js Projects** (identified by `package.json`)
  - **.NET Projects** (identified by `.sln` or `.slnx` files)
- **IDE Integration**: Instantly open projects in your preferred IDE:
  - **Cursor** for Node/JS/TS projects.
  - **JetBrains Rider** for .NET solution files.
- **Native Git Integration**: Deep integration with your existing `git` installation:
  - View real-time status (clean, dirty, ahead/behind counts).
  - Perform `git fetch`.
  - Check out branches natively.
  - Open repositories directly in **Tower** (`gittower`).

## Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, `shadcn/ui`, `base-ui`, Zustand.
- **Backend**: Rust, Tauri v2.

## Development

```bash
# Install dependencies
npm install

# Run the Tauri development server (starts both Vite and Rust backends)
npm run tauri dev
```

During development, any changes in `/src` will trigger a Vite HMR update. Any changes in `/src-tauri/src/lib.rs` will automatically recompile the Rust binary.
