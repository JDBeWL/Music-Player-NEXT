// SPDX-License-Identifier: Apache-2.0

use crate::domain::models::{AudioTrack, FileInfo, MusicLibrary, ScanProgress};
use crate::domain::utils::{ensure_data_dir, get_library_path, normalize_path};
use crate::domain::app_state::AppState;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::State;
use rayon::prelude::*;
use tauri::{AppHandle, Emitter};

pub(crate) fn get_library_sync() -> Result<MusicLibrary, String> {
    let path = get_library_path();
    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(MusicLibrary::default())
    }
}

pub(crate) fn save_library_sync(library: &MusicLibrary) -> Result<(), String> {
    let dir = ensure_data_dir().map_err(|e| e.to_string())?;
    let path = dir.join("library.json");
    let content = serde_json::to_string_pretty(library).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_library() -> Result<MusicLibrary, String> {
    tokio::task::spawn_blocking(get_library_sync)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_library(library: MusicLibrary) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        save_library_sync(&library)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn save_playlists(playlists: Vec<crate::domain::models::Playlist>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let mut lib = get_library_sync().unwrap_or_default();
        lib.playlists = playlists;
        save_library_sync(&lib)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn save_tracks(tracks: Vec<AudioTrack>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let mut lib = get_library_sync().unwrap_or_default();
        lib.tracks = tracks;
        save_library_sync(&lib)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn add_folder(folder_path: String) -> Result<(), String> {
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
pub async fn remove_folder(folder_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let folder_path_clone = folder_path.clone();
    let search_index = state.search_index.clone();
    let cover_cache = state.cover_cache.clone();
    tokio::task::spawn_blocking(move || {
        let lib = get_library_sync().map_err(|e| e.to_string())?;
        let normalized_folder = normalize_path(&folder_path_clone);
        let matches_folder = |track_path: &str| -> bool {
            normalize_path(track_path).starts_with(&normalized_folder)
        };

        let track_ids: Vec<String> = lib.tracks.iter()
            .filter(|t| matches_folder(&t.path))
            .map(|t| t.id.clone())
            .collect();
        let ids: Vec<String> = lib.tracks.iter()
            .filter(|t| matches_folder(&t.path))
            .filter_map(|t| t.cover_id.clone())
            .collect();

        {
            let global_index = search_index.read().map_err(|e| e.to_string())?;
            if let Some(index) = global_index.as_ref() {
                index.remove_tracks(&track_ids).map_err(|e| e.to_string())?;
            }
        }

        {
            let mut cache = cover_cache.write().map_err(|e| e.to_string())?;
            for cover_id in &ids {
                let _ = cache.remove(cover_id);
            }
        }

        let mut lib = lib;
        lib.folders.retain(|f| normalize_path(f) != normalized_folder);
        lib.tracks.retain(|t| !matches_folder(&t.path));
        save_library_sync(&lib)?;

        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| e)?;

    Ok(())
}

#[tauri::command]
pub async fn get_library_path_info() -> Result<String, String> {
    let path = get_library_path();
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn get_files_with_mtime(
    app: AppHandle,
    folder_path: String,
    max_depth: u32,
) -> Result<Vec<FileInfo>, String> {
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
                        if crate::SUPPORTED_AUDIO_EXTENSIONS.contains(&ext_str.as_str()) {
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
pub async fn scan_folder(folder_path: String, state: State<'_, AppState>) -> Result<Vec<AudioTrack>, String> {
    let cover_cache = state.cover_cache.clone();
    let result = tokio::task::spawn_blocking(move || {
        let mut tracks = Vec::new();

        let entries = fs::read_dir(&folder_path)
            .map_err(|e| format!("Failed to read directory: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    let ext_str = ext.to_string_lossy().to_lowercase();
                    if crate::SUPPORTED_AUDIO_EXTENSIONS.contains(&ext_str.as_str()) {
                        if let Ok(track) = crate::library::metadata::parse_audio_metadata_sync(&path.to_string_lossy(), &cover_cache) {
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
pub async fn scan_folder_recursive(
    app: AppHandle,
    folder_path: String,
    max_depth: u32,
    state: State<'_, AppState>,
) -> Result<Vec<AudioTrack>, String> {
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
                        if crate::SUPPORTED_AUDIO_EXTENSIONS.contains(&ext_str.as_str()) {
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

    let cover_cache_for_parse = state.cover_cache.clone();

    let tracks: Vec<AudioTrack> = all_files
        .par_iter()
        .map(|file_path| {
            let _ = processed_for_iter.fetch_add(1, Ordering::Relaxed);

            crate::library::metadata::parse_audio_metadata_sync(&file_path.to_string_lossy(), &cover_cache_for_parse)
                .unwrap_or_else(|_| {
                    let file_mtime = fs::metadata(file_path).ok()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs());
                    AudioTrack {
                        id: crate::domain::utils::track_id_from_path(&file_path.to_string_lossy()),
                        path: file_path.to_string_lossy().to_string(),
                        title: file_path.file_stem()
                            .map(|s| s.to_string_lossy().to_string())
                            .unwrap_or_else(|| "Unknown".to_string()),
                        artist: "Unknown Artist".to_string(),
                        artists: vec!["Unknown Artist".to_string()],
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

    if let Ok(ref mut cache) = state.cover_cache.write() {
        let _ = cache.flush();
    }

    Ok(tracks)
}
