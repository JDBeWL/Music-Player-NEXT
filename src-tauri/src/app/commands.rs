// SPDX-License-Identifier: Apache-2.0

use std::fs;
use tauri::Emitter;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn show_window(window: tauri::Window) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn hide_window(window: tauri::Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) -> Result<(), String> {
    crate::app::playback::save_playback_state_on_close(&app);
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub fn player_toggle(app: tauri::AppHandle) -> Result<(), String> {
    let _ = app.emit("player-control", serde_json::json!({ "detail": "toggle" }));
    Ok(())
}

#[tauri::command]
pub fn player_next(app: tauri::AppHandle) -> Result<(), String> {
    let _ = app.emit("player-control", serde_json::json!({ "detail": "next" }));
    Ok(())
}

#[tauri::command]
pub fn player_prev(app: tauri::AppHandle) -> Result<(), String> {
    let _ = app.emit("player-control", serde_json::json!({ "detail": "prev" }));
    Ok(())
}

#[tauri::command]
pub fn player_set_loop(app: tauri::AppHandle, loop_mode: String) -> Result<(), String> {
    let _ = app.emit("player-control", serde_json::json!({ "detail": "loop", "mode": loop_mode }));
    Ok(())
}

#[tauri::command]
pub async fn open_folder_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();

    app.dialog()
        .file()
        .pick_folder(move |folder| {
            if let Some(path) = folder {
                let _ = tx.send(Some(path.to_string()));
            } else {
                let _ = tx.send(None);
            }
        });

    rx.recv().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    tokio::task::spawn_blocking(move || {
        fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn read_dir(path: String) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        let entries = fs::read_dir(&path)
            .map_err(|e| format!("Failed to read directory: {}", e))?;

        let files: Vec<String> = entries
            .filter_map(|entry| {
                entry.ok().and_then(|e| {
                    let path = e.path();
                    if path.is_file() {
                        path.file_name()
                            .map(|n| n.to_string_lossy().to_string())
                    } else {
                        None
                    }
                })
            })
            .collect();

        Ok(files)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn get_file_name(path: String) -> String {
    std::path::PathBuf::from(&path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string())
}
