// SPDX-License-Identifier: Apache-2.0

use serde::{Deserialize, Serialize};

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
pub struct AudioTrack {
    pub id: String,
    pub path: String,
    pub title: String,
    pub artist: String,
    #[serde(rename = "artists")]
    pub artists: Vec<String>,
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

fn default_scan_depth() -> u32 {
    3
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

fn default_volume() -> f32 {
    0.5
}
fn default_lyrics_display_mode() -> String {
    "modern".to_string()
}
fn default_repeat_mode() -> String {
    "all".to_string()
}
fn default_theme_mode() -> String {
    "dark".to_string()
}
fn default_close_behavior() -> String {
    "to_tray".to_string()
}
fn default_persist_playback() -> bool {
    true
}
fn default_netease_real_ip() -> String {
    "116.25.146.177".to_string()
}
fn default_netease_api_base_url() -> String {
    "https://netease-cloud-music-api-two-sandy.vercel.app".to_string()
}
