// SPDX-License-Identifier: Apache-2.0

use crate::domain::app_state::AppState;
use crate::cache::cover_cache;
use crate::domain::models::AudioTrack;
use crate::domain::utils::track_id_from_path;
use lofty::file::AudioFile;
use lofty::prelude::*;
use lofty::tag::Tag;
use std::fs;
use std::path::Path;
use std::sync::{Arc, RwLock};
use tauri::State;

#[tauri::command]
pub async fn parse_audio_metadata(path: String, state: State<'_, AppState>) -> Result<AudioTrack, String> {
    let cover_cache = state.cover_cache.clone();
    tokio::task::spawn_blocking(move || parse_audio_metadata_sync(&path, &cover_cache))
        .await
        .map_err(|e| e.to_string())?
}

pub(crate) fn parse_audio_metadata_sync(path: &str, cover_cache: &Arc<RwLock<cover_cache::CoverCache>>) -> Result<AudioTrack, String> {
    let tagged_path = Path::new(&path);

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

                    if let Ok(ref mut cache) = cover_cache.write() {
                        if let Some((existing_id, entry)) = cache.find_by_hash(hash) {
                            let _ = cache.get(&existing_id);
                            cover_url = Some(entry.cover_path);
                            cover_id_val = Some(existing_id);
                        } else {
                            let cid = format!("cover_{}", cover_cache::uuid_simple());
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

    let lrc_path = tagged_path.with_extension("lrc");
    let ass_path = tagged_path.with_extension("ass");
    let has_lrc = lrc_path.exists() || ass_path.exists();

    let file_format = tagged_path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    Ok(AudioTrack {
        id: track_id_from_path(&path),
        path: path.to_string(),
        title: title.clone(),
        artist: artist.clone(),
        artists: crate::domain::utils::split_artists(&artist),
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
