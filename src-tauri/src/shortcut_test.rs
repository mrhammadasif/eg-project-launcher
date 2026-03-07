use std::str::FromStr;

fn main() {
    let s = tauri_plugin_global_shortcut::Shortcut::from_str("alt+ctrl+shift+2");
    println!("{:?}", s);
}
