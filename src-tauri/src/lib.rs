// SPDX-License-Identifier: Apache-2.0

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri_plugin_dialog::DialogExt;
use tauri::{AppHandle, Emitter, Manager};
use std::sync::{Arc, RwLock};
use std::sync::OnceLock;
use rayon::prelude::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use tokio::task;

mod cover_cache;
use cover_cache::get_cover_cache;

mod search_index;
use search_index::SearchIndex;

mod netease;

const SUPPORTED_AUDIO_EXTENSIONS: &[&str] = &["mp3", "wav", "flac", "ogg", "m4a", "aac", "ape", "wma"];

static SEARCH_INDEX: OnceLock<Arc<RwLock<Option<SearchIndex>>>> = OnceLock::new();

fn get_search_index() -> &'static Arc<RwLock<Option<SearchIndex>>> {
    SEARCH_INDEX.get_or_init(|| Arc::new(RwLock::new(None)))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScanProgress {
    pub current: usize,
    pub total: usize,
    pub current_file: String,
    pub phase: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileInfo {
    pub path: String,
    pub mtime: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IncrementalScanResult {
    pub new_tracks: Vec<AudioTrack>,
    pub modified_tracks: Vec<AudioTrack>,
    pub unchanged_count: usize,
    pub removed_count: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AudioTrack {
    pub id: String,
    pub path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: f64,
    #[serde(rename = "format")]
    pub file_format: String,
    #[serde(skip_serializing_if = "Option::is_none", rename = "coverUrl")]
    pub cover_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "coverId")]
    pub cover_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "fileMtime")]
    pub file_mtime: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lrc: Option<String>,
    #[serde(rename = "hasLrc")]
    pub has_lrc: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub track_ids: Vec<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct MusicLibrary {
    pub folders: Vec<String>,
    pub playlists: Vec<Playlist>,
    pub tracks: Vec<AudioTrack>,
    #[serde(default = "default_scan_depth")]
    pub scan_depth: u32,
}

fn default_scan_depth() -> u32 { 3 }

pub(crate) fn get_data_dir() -> PathBuf {
    let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("MercurialPlayerNEXT")
}

fn get_index_dir() -> PathBuf {
    get_data_dir().join("search_index")
}

fn ensure_data_dir() -> std::io::Result<PathBuf> {
    let dir = get_data_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}

fn get_library_path() -> PathBuf {
    get_data_dir().join("library.json")
}

pub(crate) fn get_settings_path() -> PathBuf {
    get_data_dir().join("settings.json")
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    #[serde(default = "default_volume")]
    pub volume: f32,
    #[serde(default = "default_lyrics_display_mode")]
    pub lyrics_display_mode: String,
    #[serde(default)]
    pub show_translation: bool,
    #[serde(default)]
    pub enable_lyrics_blur: bool,
    #[serde(default)]
    pub last_played_track_id: Option<String>,
    #[serde(default)]
    pub last_played_position: f32,
    #[serde(default)]
    pub last_played_playlist_id: Option<String>,
    #[serde(default = "default_repeat_mode")]
    pub repeat_mode: String,
    #[serde(default)]
    pub shuffle: bool,
    #[serde(default = "default_theme_mode")]
    pub theme_mode: String,
    #[serde(default = "default_close_behavior")]
    pub close_behavior: String,
    #[serde(default)]
    pub first_close_hint_shown: bool,
    #[serde(default = "default_persist_playback")]
    pub persist_playback: bool,
    #[serde(default = "default_netease_real_ip")]
    pub netease_real_ip: String,
    #[serde(default = "default_netease_api_base_url")]
    pub netease_api_base_url: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            volume: default_volume(),
            lyrics_display_mode: default_lyrics_display_mode(),
            show_translation: false,
            enable_lyrics_blur: false,
            last_played_track_id: None,
            last_played_position: 0.0,
            last_played_playlist_id: None,
            repeat_mode: default_repeat_mode(),
            shuffle: false,
            theme_mode: default_theme_mode(),
            close_behavior: default_close_behavior(),
            first_close_hint_shown: false,
            persist_playback: default_persist_playback(),
            netease_real_ip: default_netease_real_ip(),
            netease_api_base_url: default_netease_api_base_url(),
        }
    }
}

fn default_volume() -> f32 { 0.5 }
fn default_lyrics_display_mode() -> String { "modern".to_string() }
fn default_repeat_mode() -> String { "all".to_string() }
fn default_theme_mode() -> String { "dark".to_string() }
fn default_close_behavior() -> String { "to_tray".to_string() }
fn default_persist_playback() -> bool { true }
fn default_netease_real_ip() -> String { "116.25.146.177".to_string() }
fn default_netease_api_base_url() -> String { "https://netease-cloud-music-api-two-sandy.vercel.app".to_string() }

#[tauri::command]
async fn get_settings() -> Result<AppSettings, String> {
    tokio::task::spawn_blocking(move || {
        let path = get_settings_path();
        if path.exists() {
            let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            serde_json::from_str(&content).map_err(|e| e.to_string())
        } else {
            Ok(AppSettings::default())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_close_behavior() -> Result<(String, bool), String> {
    let settings = get_settings().await?;
    Ok((settings.close_behavior, settings.first_close_hint_shown))
}

#[tauri::command]
async fn set_close_behavior_and_hint(close_behavior: String, first_close_hint_shown: bool) -> Result<(), String> {
    let mut settings = get_settings().await?;
    settings.close_behavior = close_behavior;
    settings.first_close_hint_shown = first_close_hint_shown;
    save_settings(settings).await
}

#[tauri::command]
async fn save_settings(settings: AppSettings) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let dir = ensure_data_dir().map_err(|e| e.to_string())?;
        let path = dir.join("settings.json");
        let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
        fs::write(&path, content).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Debug, Deserialize)]
pub struct PartialSettings {
    pub volume: Option<f32>,
    pub lyrics_display_mode: Option<String>,
    pub show_translation: Option<bool>,
    pub enable_lyrics_blur: Option<bool>,
    pub last_played_track_id: Option<Option<String>>,
    pub last_played_position: Option<f32>,
    pub last_played_playlist_id: Option<Option<String>>,
    pub repeat_mode: Option<String>,
    pub shuffle: Option<bool>,
    pub theme_mode: Option<String>,
    pub close_behavior: Option<String>,
    pub first_close_hint_shown: Option<bool>,
    pub persist_playback: Option<bool>,
    pub netease_real_ip: Option<String>,
    pub netease_api_base_url: Option<String>,
}

#[tauri::command]
async fn update_settings(partial: PartialSettings) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let dir = ensure_data_dir().map_err(|e| e.to_string())?;
        let path = dir.join("settings.json");

        let mut settings = if path.exists() {
            let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            serde_json::from_str::<AppSettings>(&content).unwrap_or_default()
        } else {
            AppSettings::default()
        };

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

        let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
        fs::write(&path, content).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn ensure_search_index() -> Result<(), String> {
    {
        let guard = get_search_index().read().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Ok(());
        }
    }

    let mut guard = get_search_index().write().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok(());
    }

    let index_path = get_index_dir();
    let search_index = SearchIndex::new(index_path)?;
    *guard = Some(search_index);
    Ok(())
}

fn get_library_sync() -> Result<MusicLibrary, String> {
    let path = get_library_path();
    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(MusicLibrary::default())
    }
}

#[tauri::command]
async fn get_library() -> Result<MusicLibrary, String> {
    tokio::task::spawn_blocking(get_library_sync)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_library(library: MusicLibrary) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let dir = ensure_data_dir().map_err(|e| e.to_string())?;
        let path = dir.join("library.json");
        let content = serde_json::to_string_pretty(&library).map_err(|e| e.to_string())?;
        fs::write(&path, content).map_err(|e| e.to_string())?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| e)?;

    Ok(())
}

#[tauri::command]
async fn rebuild_search_index() -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let library = get_library_sync()?;
        ensure_search_index()?;

        let global_index = get_search_index().read().map_err(|e| e.to_string())?;
        if let Some(index) = global_index.as_ref() {
            index.clear()?;
            index.add_tracks(&library.tracks)?;
        }

        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn add_tracks_to_index(tracks: Vec<AudioTrack>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        ensure_search_index()?;

        let global_index = get_search_index().read().map_err(|e| e.to_string())?;
        if let Some(index) = global_index.as_ref() {
            index.add_tracks(&tracks)?;
        }

        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn add_track_to_index(track: AudioTrack) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        ensure_search_index()?;

        let global_index = get_search_index().read().map_err(|e| e.to_string())?;
        if let Some(index) = global_index.as_ref() {
            index.add_track(&track)?;
            index.commit()?;
        }

        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn remove_track_from_index(track_id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let global_index = get_search_index().read().map_err(|e| e.to_string())?;
        if let Some(index) = global_index.as_ref() {
            index.remove_track(&track_id)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn remove_tracks_from_index(track_ids: Vec<String>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        ensure_search_index()?;

        let global_index = get_search_index().read().map_err(|e| e.to_string())?;
        if let Some(index) = global_index.as_ref() {
            index.remove_tracks(&track_ids)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn clear_search_index() -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        ensure_search_index()?;

        let global_index = get_search_index().read().map_err(|e| e.to_string())?;
        if let Some(index) = global_index.as_ref() {
            index.clear()?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn search_tracks(query: String, limit: Option<usize>) -> Result<Vec<AudioTrack>, String> {
    tokio::task::spawn_blocking(move || {
        ensure_search_index()?;

        let global_index = get_search_index().read().map_err(|e| e.to_string())?;
        if let Some(index) = global_index.as_ref() {
            index.search(&query, limit.unwrap_or(50))
        } else {
            Ok(Vec::new())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn add_folder(folder_path: String) -> Result<(), String> {
    let folder_path_clone = folder_path.clone();
    let library = tokio::task::spawn_blocking(move || {
        let mut lib = get_library_sync().unwrap_or_default();
        if !lib.folders.contains(&folder_path_clone) {
            lib.folders.push(folder_path_clone);
        }
        lib
    })
    .await
    .map_err(|e| e.to_string())?;

    save_library(library).await?;
    Ok(())
}

#[tauri::command]
async fn remove_folder(folder_path: String) -> Result<(), String> {
    let folder_path_clone = folder_path.clone();
    tokio::task::spawn_blocking(move || {
        let lib = get_library_sync().map_err(|e| e.to_string())?;
        let track_ids: Vec<String> = lib.tracks.iter()
            .filter(|t| t.path.starts_with(&folder_path_clone))
            .map(|t| t.id.clone())
            .collect();
        let ids: Vec<String> = lib.tracks.iter()
            .filter(|t| t.path.starts_with(&folder_path_clone))
            .filter_map(|t| t.cover_id.clone())
            .collect();

        ensure_search_index().map_err(|e| e.to_string())?;

        {
            let global_index = get_search_index().read().map_err(|e| e.to_string())?;
            if let Some(index) = global_index.as_ref() {
                index.remove_tracks(&track_ids).map_err(|e| e.to_string())?;
            }
        }

        {
            let mut cache = get_cover_cache().write().map_err(|e| e.to_string())?;
            for cover_id in &ids {
                let _ = cache.remove(cover_id);
            }
        }

        let mut lib = lib;
        lib.folders.retain(|f| f != &folder_path_clone);
        lib.tracks.retain(|t| !t.path.starts_with(&folder_path_clone));
        save_library_sync(&lib)?;

        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| e)?;

    Ok(())
}

fn save_library_sync(library: &MusicLibrary) -> Result<(), String> {
    let dir = get_data_dir();
    let path = dir.join("library.json");
    let content = serde_json::to_string_pretty(library).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn save_playlists(playlists: Vec<Playlist>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let mut lib = get_library_sync().unwrap_or_default();
        lib.playlists = playlists;
        save_library_sync(&lib)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn save_tracks(tracks: Vec<AudioTrack>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let mut lib = get_library_sync().unwrap_or_default();
        lib.tracks = tracks;
        save_library_sync(&lib)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn open_folder_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
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
async fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    tokio::task::spawn_blocking(move || {
        fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn read_dir(path: String) -> Result<Vec<String>, String> {
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
fn get_file_name(path: String) -> String {
    PathBuf::from(&path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string())
}

#[tauri::command]
async fn parse_audio_metadata(path: String) -> Result<AudioTrack, String> {
    tokio::task::spawn_blocking(move || {
        parse_audio_metadata_sync(&path)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn parse_audio_metadata_sync(path: &str) -> Result<AudioTrack, String> {
    use lofty::prelude::*;
    use lofty::file::AudioFile;
    use lofty::tag::Tag;

    let tagged_path = std::path::Path::new(&path);

    let (title, artist, album, duration, cover_url, cover_id_val) = match lofty::read_from_path(tagged_path) {
        Ok(tagged_file) => {
            let props = tagged_file.properties();
            let duration = props.duration().as_secs_f64();

            let tag = tagged_file.primary_tag();

            let title = tag.and_then(|t: &Tag| t.title())
                .map(|s: std::borrow::Cow<str>| s.to_string())
                .unwrap_or_else(|| {
                    tagged_path.file_stem()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_else(|| "Unknown".to_string())
                });

            let artist = tag.and_then(|t: &Tag| t.artist())
                .map(|s: std::borrow::Cow<str>| s.to_string())
                .unwrap_or_else(|| "Unknown Artist".to_string());

            let album = tag.and_then(|t: &Tag| t.album())
                .map(|s: std::borrow::Cow<str>| s.to_string())
                .unwrap_or_else(|| "Unknown Album".to_string());

            let mut cover_url: Option<String> = None;
            let mut cover_id_val: Option<String> = None;

            if let Some(tag) = tag {
                if let Some(picture) = tag.pictures().first() {
                    let data = picture.data();
                    let hash = cover_cache::compute_cover_hash(data);

                    if let Ok(ref mut cache) = get_cover_cache().write() {
                        if let Some((existing_id, entry)) = cache.find_by_hash(hash) {
                            let _ = cache.get(&existing_id);
                            cover_url = Some(entry.cover_path);
                            cover_id_val = Some(existing_id);
                        } else {
                            let cid = format!("cover_{}", uuid_simple());
                            if let Ok(entry) = cache.put(cid.clone(), data) {
                                cover_url = Some(entry.cover_path);
                                cover_id_val = Some(cid);
                            }
                        }
                    }
                }
            }

            (title, artist, album, duration, cover_url, cover_id_val)
        }
        Err(_) => {
            let name = tagged_path.file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "Unknown".to_string());
            (name, "Unknown Artist".to_string(), "Unknown Album".to_string(), 0.0, None, None)
        }
    };

    let file_mtime = fs::metadata(&path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs());

    // 检测是否存在歌词文件
    let path_obj = std::path::Path::new(&path);
    let lrc_path = path_obj.with_extension("lrc");
    let ass_path = path_obj.with_extension("ass");
    let has_lrc = lrc_path.exists() || ass_path.exists();

    let file_format = std::path::Path::new(&path)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    Ok(AudioTrack {
        id: track_id_from_path(&path),
        path: path.to_string(),
        title,
        artist,
        album,
        duration,
        file_format,
        cover_url,
        cover_id: cover_id_val,
        file_mtime,
        lrc: None,
        has_lrc,
    })
}

fn uuid_simple() -> String {
    cover_cache::uuid_simple()
}

fn track_id_from_path(path: &str) -> String {
    use std::hash::{Hash, Hasher};
    let canonical = std::path::Path::new(path)
        .canonicalize()
        .ok()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string());
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    canonical.to_lowercase().hash(&mut hasher);
    format!("track_{:016x}", hasher.finish())
}

#[tauri::command]
async fn scan_folder(folder_path: String) -> Result<Vec<AudioTrack>, String> {
    let folder_path = folder_path;

    let result = task::spawn_blocking(move || {
        let mut tracks = Vec::new();

        let entries = fs::read_dir(&folder_path)
            .map_err(|e| format!("Failed to read directory: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    let ext_str = ext.to_string_lossy().to_lowercase();
                    if SUPPORTED_AUDIO_EXTENSIONS.contains(&ext_str.as_str()) {
                        if let Ok(track) = parse_audio_metadata_sync(&path.to_string_lossy()) {
                            tracks.push(track);
                        }
                    }
                }
            }
        }

        tracks.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
        Ok::<Vec<AudioTrack>, String>(tracks)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| e)?;

    Ok(result)
}

#[tauri::command]
fn get_library_path_info() -> Result<String, String> {
    let path = get_library_path();
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
async fn get_files_with_mtime(app: AppHandle, folder_path: String, max_depth: u32) -> Result<Vec<FileInfo>, String> {
    let folder_path = folder_path.clone();

    let _ = app.emit("scan-progress", ScanProgress {
        current: 0,
        total: 0,
        current_file: "正在扫描文件...".to_string(),
        phase: "scanning".to_string(),
    });

    let files: Vec<FileInfo> = tokio::task::spawn_blocking(move || {
        let mut files = Vec::new();

        fn collect_files(
            path: &PathBuf,
            current_depth: u32,
            max_depth: u32,
            files: &mut Vec<FileInfo>,
        ) -> Result<(), String> {
            if current_depth > max_depth {
                return Ok(());
            }

            let entries = fs::read_dir(path)
                .map_err(|e| format!("Failed to read directory: {}", e))?;

            for entry in entries.flatten() {
                let entry_path = entry.path();

                if entry_path.is_dir() {
                    collect_files(&entry_path, current_depth + 1, max_depth, files)?;
                } else if entry_path.is_file() {
                    if let Some(ext) = entry_path.extension() {
                        let ext_str = ext.to_string_lossy().to_lowercase();
                        if SUPPORTED_AUDIO_EXTENSIONS.contains(&ext_str.as_str()) {
                            let mtime = entry.metadata()
                                .ok()
                                .and_then(|m| m.modified().ok())
                                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|d| d.as_secs());
                            if let Some(mtime) = mtime {
                                files.push(FileInfo {
                                    path: entry_path.to_string_lossy().to_string(),
                                    mtime,
                                });
                            }
                        }
                    }
                }
            }

            Ok(())
        }

        let root_path = PathBuf::from(&folder_path);
        let _ = collect_files(&root_path, 0, max_depth, &mut files);
        files
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?;

    let _ = app.emit("scan-progress", ScanProgress {
        current: files.len(),
        total: files.len(),
        current_file: "文件扫描完成".to_string(),
        phase: "complete".to_string(),
    });

    Ok(files)
}

#[tauri::command]
async fn scan_folder_recursive(app: AppHandle, folder_path: String, max_depth: u32) -> Result<Vec<AudioTrack>, String> {
    let folder_path = folder_path.clone();

    let _ = app.emit("scan-progress", ScanProgress {
        current: 0,
        total: 0,
        current_file: "准备扫描...".to_string(),
        phase: "scanning".to_string(),
    });

    let all_files: Vec<PathBuf> = tokio::task::spawn_blocking(move || {
        let mut files = Vec::new();

        fn collect_files(
            path: &PathBuf,
            current_depth: u32,
            max_depth: u32,
            files: &mut Vec<PathBuf>,
        ) -> Result<(), String> {
            if current_depth > max_depth {
                return Ok(());
            }

            let entries = fs::read_dir(path)
                .map_err(|e| format!("Failed to read directory: {}", e))?;

            for entry in entries.flatten() {
                let entry_path = entry.path();

                if entry_path.is_dir() {
                    collect_files(&entry_path, current_depth + 1, max_depth, files)?;
                } else if entry_path.is_file() {
                    if let Some(ext) = entry_path.extension() {
                        let ext_str = ext.to_string_lossy().to_lowercase();
                        if SUPPORTED_AUDIO_EXTENSIONS.contains(&ext_str.as_str()) {
                            files.push(entry_path);
                        }
                    }
                }
            }

            Ok(())
        }

        let root_path = PathBuf::from(&folder_path);
        let _ = collect_files(&root_path, 0, max_depth, &mut files);
        files
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?;

    let total_files = all_files.len();

    if total_files == 0 {
        let _ = app.emit("scan-progress", ScanProgress {
            current: 0,
            total: 0,
            current_file: "没有找到音频文件".to_string(),
            phase: "complete".to_string(),
        });
        return Ok(Vec::new());
    }

    let processed = Arc::new(AtomicUsize::new(0));
    let processed_for_progress = processed.clone();
    let processed_for_iter = processed.clone();
    let app_for_progress = app.clone();

    let progress_handle = std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_millis(200));
            let current = processed_for_progress.load(Ordering::Relaxed);
            let _ = app_for_progress.emit("scan-progress", ScanProgress {
                current,
                total: total_files,
                current_file: format!("{}/{}", current, total_files),
                phase: "scanning".to_string(),
            });
            if current >= total_files {
                break;
            }
        }
    });

    let tracks: Vec<AudioTrack> = all_files
        .par_iter()
        .map(|file_path| {
            let _ = processed_for_iter.fetch_add(1, Ordering::Relaxed);

            parse_audio_metadata_sync(&file_path.to_string_lossy())
                .unwrap_or_else(|_| {
                    let file_mtime = fs::metadata(file_path).ok()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs());
                    AudioTrack {
                        id: track_id_from_path(&file_path.to_string_lossy()),
                        path: file_path.to_string_lossy().to_string(),
                        title: file_path.file_stem()
                            .map(|s| s.to_string_lossy().to_string())
                            .unwrap_or_else(|| "Unknown".to_string()),
                        artist: "Unknown Artist".to_string(),
                        album: "Unknown Album".to_string(),
                        duration: 0.0,
                        file_format: file_path.extension()
                            .map(|e| e.to_string_lossy().to_lowercase())
                            .unwrap_or_default(),
                        cover_url: None,
                        cover_id: None,
                        file_mtime,
                        lrc: None,
                        has_lrc: {
                            let lrc_path = file_path.with_extension("lrc");
                            let ass_path = file_path.with_extension("ass");
                            lrc_path.exists() || ass_path.exists()
                        },
                    }
                })
        })
        .collect();

    let _ = progress_handle.join();

    let _ = app.emit("scan-progress", ScanProgress {
        current: total_files,
        total: total_files,
        current_file: "扫描完成".to_string(),
        phase: "complete".to_string(),
    });

    let mut tracks = tracks;
    tracks.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));

    if let Ok(ref mut cache) = get_cover_cache().write() {
        let _ = cache.flush();
    }

    Ok(tracks)
}

// 批量提取封面
#[tauri::command]
async fn extract_covers_batch(tracks: Vec<AudioTrack>) -> Result<Vec<AudioTrack>, String> {
    tokio::task::spawn_blocking(move || {
        use lofty::prelude::*;

        let tracks_needing_extract: Vec<AudioTrack> = tracks
            .into_iter()
            .filter(|track| {
                if track.cover_url.is_none() {
                    return true;
                }
                if let Some(ref path) = track.cover_url {
                    return !std::path::Path::new(path).exists();
                }
                false
            })
            .collect();

        let extracted: Vec<(AudioTrack, Option<Vec<u8>>, u64)> = tracks_needing_extract
            .into_par_iter()
            .map(|track| {
                let path = std::path::Path::new(&track.path);
                let data = lofty::read_from_path(path)
                    .ok()
                    .and_then(|f| f.primary_tag().map(|t| t.pictures().first().map(|p| p.data().to_vec())))
                    .flatten();
                let hash = data.as_ref().map(|d| cover_cache::compute_cover_hash(d)).unwrap_or(0);
                (track, data, hash)
            })
            .collect();

        let mut hash_to_existing: HashMap<u64, (String, cover_cache::CoverCacheEntry)> = HashMap::new();

        if let Ok(ref cache) = get_cover_cache().read() {
            for (_, _, hash) in &extracted {
                if *hash != 0 && !hash_to_existing.contains_key(hash) {
                    if let Some((id, entry)) = cache.find_by_hash(*hash) {
                        hash_to_existing.insert(*hash, (id, entry));
                    }
                }
            }
        }

        let mut to_cache: Vec<(String, Vec<u8>, u64, usize)> = Vec::new();
        let mut results: Vec<AudioTrack> = Vec::new();

        for (mut track, data, hash) in extracted {
            let result_idx = results.len();
            if let Some(data) = data {
                if let Some((existing_id, entry)) = hash_to_existing.get(&hash) {
                    track.cover_url = Some(entry.cover_path.clone());
                    track.cover_id = Some(existing_id.clone());
                    results.push(track);
                } else {
                    let cover_id = format!("cover_{}", uuid_simple());
                    to_cache.push((cover_id.clone(), data, hash, result_idx));
                    results.push(track);
                }
            } else {
                results.push(track);
            }
        }

        if !to_cache.is_empty() {
            let cache_inputs: Vec<(String, Vec<u8>)> = to_cache.iter().map(|(id, data, _, _)| (id.clone(), data.clone())).collect();

            if let Ok(ref mut cache) = get_cover_cache().write() {
                let cached = cache.put_batch(cache_inputs);

                let mut id_to_entry: HashMap<String, cover_cache::CoverCacheEntry> = HashMap::new();
                for (id, result) in cached {
                    if let Ok(entry) = result {
                        id_to_entry.insert(id, entry);
                    }
                }

                for (_, _, hash, result_idx) in &to_cache {
                    if *result_idx < results.len() {
                        if let Some((real_id, entry)) = cache.find_by_hash(*hash) {
                            results[*result_idx].cover_url = Some(entry.cover_path);
                            results[*result_idx].cover_id = Some(real_id);
                        }
                    }
                }
            }
        }

        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn save_playback_state_on_close(app_handle: &tauri::AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.eval(
            "window.dispatchEvent(new CustomEvent('save-playback-before-close'))"
        );
    }
}

#[tauri::command]
async fn save_playback_state(
    track_id: Option<String>,
    playlist_id: Option<String>
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let mut settings = get_settings_sync().unwrap_or_default();
        settings.last_played_track_id = track_id;
        settings.last_played_playlist_id = playlist_id;
        save_settings_sync(settings)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn get_settings_sync() -> Result<AppSettings, String> {
    let path = get_settings_path();
    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(AppSettings::default())
    }
}

fn save_settings_sync(settings: AppSettings) -> Result<(), String> {
    let dir = ensure_data_dir().map_err(|e| e.to_string())?;
    let path = dir.join("settings.json");
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_playback_state() -> Result<(Option<String>, f32, Option<String>), String> {
    tokio::task::spawn_blocking(move || {
        let settings = get_settings_sync()?;
        Ok((
            settings.last_played_track_id,
            settings.last_played_position,
            settings.last_played_playlist_id
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_library,
            save_library,
            get_library_path_info,
            get_files_with_mtime,
            search_tracks,
            add_track_to_index,
            add_tracks_to_index,
            remove_track_from_index,
            remove_tracks_from_index,
            add_folder,
            remove_folder,
            save_playlists,
            save_tracks,
            open_folder_dialog,
            read_file_bytes,
            read_dir,
            get_file_name,
            parse_audio_metadata,
            scan_folder,
            scan_folder_recursive,
            extract_covers_batch,
            cover_cache::get_cover_entry,
            cover_cache::save_cover_to_cache_cmd,
            cover_cache::extract_and_cache_cover,
            cover_cache::extract_and_cache_covers_batch,
            cover_cache::get_cover_cache_info,
            cover_cache::clear_cover_cache,
            cover_cache::remove_cover,
            clear_search_index,
            rebuild_search_index,
            get_settings,
            get_close_behavior,
            set_close_behavior_and_hint,
            save_settings,
            update_settings,
            save_playback_state,
            get_playback_state,
            show_window,
            hide_window,
            quit_app,
            player_toggle,
            player_next,
            player_prev,
            player_set_loop,
            netease::netease_api_request,
            netease::netease_api_request_with_cookie,
            netease::set_netease_api_base,
            netease::get_netease_api_base,
            netease::download_netease_song,
            netease::save_file_dialog
        ])
        .setup(|app| {
            let settings_path = get_settings_path();
            if !settings_path.exists() {
                let default_settings = AppSettings::default();
                let _ = save_settings_sync(default_settings);
            }

            if let Ok(settings) = get_settings_sync() {
                netease::init_api_base_url(&settings.netease_api_base_url);
            }

            let tray_menu = tauri::menu::MenuBuilder::new(app)
                .text("show", "显示主窗口")
                .separator()
                .text("toggle", "⏯ 播放/暂停")
                .separator()
                .text("prev", "⏮ 上一曲")
                .text("next", "⏭ 下一曲")
                .separator()
                .text("shuffle", "🔀 随机播放")
                .separator()
                .text("loop-off", "🔀 关闭循环")
                .text("loop-track", "🔂 单曲循环")
                .text("loop-playlist", "🔁 列表循环")
                .separator()
                .text("quit", "退出")
                .build()?;

            let tray_handle = app.tray_by_id("main-tray").unwrap();
            let app_handle = app.handle().clone();
            let app_handle_for_tray = app.handle().clone();
            tray_handle.set_menu(Some(tray_menu))?;
            tray_handle.set_tooltip(Some("Mercurial Player NEXT"))?;

            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        let settings_path = get_settings_path();
                        let (close_behavior, first_close_hint_shown) = if settings_path.exists() {
                            if let Ok(content) = fs::read_to_string(&settings_path) {
                                if let Ok(settings) = serde_json::from_str::<AppSettings>(&content) {
                                    (settings.close_behavior, settings.first_close_hint_shown)
                                } else {
                                    ("to_tray".to_string(), false)
                                }
                            } else {
                                ("to_tray".to_string(), false)
                            }
                        } else {
                            ("to_tray".to_string(), false)
                        };

                        if !first_close_hint_shown {
                            api.prevent_close();
                            if let Some(w) = app_handle.get_webview_window("main") {
                                let _ = w.emit("show-close-hint-dialog", ());
                            }
                        } else if close_behavior == "quit" {
                            save_playback_state_on_close(&app_handle);
                            app_handle.exit(0);
                        } else {
                            api.prevent_close();
                            let _ = w.hide();
                        }
                    }
                });
            }

            tray_handle.on_tray_icon_event(move |_tray, event| {
                if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                    if let Some(window) = app_handle_for_tray.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.set_always_on_top(true);
                        let _ = window.set_always_on_top(false);
                    }
                }
            });
            tray_handle.on_menu_event(move |app, event| {
                match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "toggle" => {
                        let _ = app.emit("player-control", serde_json::json!({ "detail": "toggle" }));
                    }
                    "prev" => {
                        let _ = app.emit("player-control", serde_json::json!({ "detail": "prev" }));
                    }
                    "next" => {
                        let _ = app.emit("player-control", serde_json::json!({ "detail": "next" }));
                    }
                    "shuffle" => {
                        let _ = app.emit("player-control", serde_json::json!({ "detail": "shuffle" }));
                    }
                    "loop-off" => {
                        let _ = app.emit("player-control", serde_json::json!({ "detail": "loop", "mode": "off" }));
                    }
                    "loop-track" => {
                        let _ = app.emit("player-control", serde_json::json!({ "detail": "loop", "mode": "track" }));
                    }
                    "loop-playlist" => {
                        let _ = app.emit("player-control", serde_json::json!({ "detail": "loop", "mode": "playlist" }));
                    }
                    "quit" => {
                        save_playback_state_on_close(app);
                        app.exit(0);
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn show_window(window: tauri::Window) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn hide_window(window: tauri::Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) -> Result<(), String> {
    save_playback_state_on_close(&app);
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn player_toggle(app: tauri::AppHandle) -> Result<(), String> {
    let _ = app.emit("player-control", serde_json::json!({ "detail": "toggle" }));
    Ok(())
}

#[tauri::command]
fn player_next(app: tauri::AppHandle) -> Result<(), String> {
    let _ = app.emit("player-control", serde_json::json!({ "detail": "next" }));
    Ok(())
}

#[tauri::command]
fn player_prev(app: tauri::AppHandle) -> Result<(), String> {
    let _ = app.emit("player-control", serde_json::json!({ "detail": "prev" }));
    Ok(())
}

#[tauri::command]
fn player_set_loop(app: tauri::AppHandle, loop_mode: String) -> Result<(), String> {
    let _ = app.emit("player-control", serde_json::json!({ "detail": "loop", "mode": loop_mode }));
    Ok(())
}
