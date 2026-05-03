use crate::domain::app_state::AppState;
use crate::domain::models::{AppSettings, PartialSettings};
use crate::domain::utils::{ensure_data_dir, get_settings_path};
use std::fs;
use tauri::State;

pub(crate) fn get_settings_sync() -> Result<AppSettings, String> {
    let path = get_settings_path();
    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(AppSettings::default())
    }
}

pub(crate) fn save_settings_sync(settings: AppSettings) -> Result<(), String> {
    let dir = ensure_data_dir().map_err(|e| e.to_string())?;
    let path = dir.join("settings.json");
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}

fn persist_settings(settings: &AppSettings) -> Result<(), String> {
    let dir = ensure_data_dir().map_err(|e| e.to_string())?;
    let path = dir.join("settings.json");
    let content = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let settings = state.settings.read().map_err(|e| e.to_string())?;
    Ok(settings.clone())
}

#[tauri::command]
pub async fn get_close_behavior(state: State<'_, AppState>) -> Result<(String, bool), String> {
    let settings = state.settings.read().map_err(|e| e.to_string())?;
    Ok((settings.close_behavior.clone(), settings.first_close_hint_shown))
}

#[tauri::command]
pub async fn set_close_behavior_and_hint(
    close_behavior: String,
    first_close_hint_shown: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let s = {
        let mut settings = state.settings.write().map_err(|e| e.to_string())?;
        settings.close_behavior = close_behavior;
        settings.first_close_hint_shown = first_close_hint_shown;
        settings.clone()
    };
    tokio::task::spawn_blocking(move || persist_settings(&s))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_settings(
    settings: AppSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    {
        let mut cached = state.settings.write().map_err(|e| e.to_string())?;
        *cached = settings.clone();
    }
    tokio::task::spawn_blocking(move || save_settings_sync(settings))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn update_settings(
    partial: PartialSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let s = {
        let mut settings = state.settings.write().map_err(|e| e.to_string())?;

        if let Some(v) = partial.volume { settings.volume = v; }
        if let Some(v) = partial.lyrics_display_mode { settings.lyrics_display_mode = v; }
        if let Some(v) = partial.show_translation { settings.show_translation = v; }
        if let Some(v) = partial.enable_lyrics_blur { settings.enable_lyrics_blur = v; }
        if let Some(v) = partial.last_played_track_id { settings.last_played_track_id = v; }
        if let Some(v) = partial.last_played_position { settings.last_played_position = v; }
        if let Some(v) = partial.last_played_playlist_id { settings.last_played_playlist_id = v; }
        if let Some(v) = partial.repeat_mode { settings.repeat_mode = v; }
        if let Some(v) = partial.shuffle { settings.shuffle = v; }
        if let Some(v) = partial.theme_mode { settings.theme_mode = v; }
        if let Some(v) = partial.close_behavior { settings.close_behavior = v; }
        if let Some(v) = partial.first_close_hint_shown { settings.first_close_hint_shown = v; }
        if let Some(v) = partial.persist_playback { settings.persist_playback = v; }
        if let Some(v) = partial.netease_real_ip { settings.netease_real_ip = v; }
        if let Some(v) = partial.netease_api_base_url { settings.netease_api_base_url = v; }
        if let Some(v) = partial.keyboard_shortcuts { settings.keyboard_shortcuts = Some(v); }

        settings.clone()
    };

    tokio::task::spawn_blocking(move || persist_settings(&s))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_playback_state(
    track_id: Option<String>,
    playlist_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let s = {
        let mut settings = state.settings.write().map_err(|e| e.to_string())?;
        settings.last_played_track_id = track_id;
        settings.last_played_playlist_id = playlist_id;
        settings.clone()
    };

    tokio::task::spawn_blocking(move || persist_settings(&s))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_playback_state(state: State<'_, AppState>) -> Result<(Option<String>, f32, Option<String>), String> {
    let settings = state.settings.read().map_err(|e| e.to_string())?;
    Ok((
        settings.last_played_track_id.clone(),
        settings.last_played_position,
        settings.last_played_playlist_id.clone(),
    ))
}
