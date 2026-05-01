use crate::domain::app_state::AppState;
use crate::domain::models::AudioTrack;
use crate::library::search_index::SearchIndex;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn rebuild_search_index(state: State<'_, AppState>) -> Result<(), String> {
    let search_index = state.search_index.clone();
    tokio::task::spawn_blocking(move || {
        let library = crate::library::library::get_library_sync()?;
        ensure_search_index(&search_index)?;

        let global_index = search_index.read().map_err(|e| e.to_string())?;
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
pub async fn add_tracks_to_index(tracks: Vec<AudioTrack>, state: State<'_, AppState>) -> Result<(), String> {
    let search_index = state.search_index.clone();
    tokio::task::spawn_blocking(move || {
        ensure_search_index(&search_index)?;

        let global_index = search_index.read().map_err(|e| e.to_string())?;
        if let Some(index) = global_index.as_ref() {
            index.add_tracks(&tracks)?;
        }

        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn add_track_to_index(track: AudioTrack, state: State<'_, AppState>) -> Result<(), String> {
    let search_index = state.search_index.clone();
    tokio::task::spawn_blocking(move || {
        ensure_search_index(&search_index)?;

        let global_index = search_index.read().map_err(|e| e.to_string())?;
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
pub async fn remove_track_from_index(track_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let search_index = state.search_index.clone();
    tokio::task::spawn_blocking(move || {
        let global_index = search_index.read().map_err(|e| e.to_string())?;
        if let Some(index) = global_index.as_ref() {
            index.remove_track(&track_id)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn remove_tracks_from_index(track_ids: Vec<String>, state: State<'_, AppState>) -> Result<(), String> {
    let search_index = state.search_index.clone();
    tokio::task::spawn_blocking(move || {
        ensure_search_index(&search_index)?;

        let global_index = search_index.read().map_err(|e| e.to_string())?;
        if let Some(index) = global_index.as_ref() {
            index.remove_tracks(&track_ids)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn clear_search_index(state: State<'_, AppState>) -> Result<(), String> {
    let search_index = state.search_index.clone();
    tokio::task::spawn_blocking(move || {
        ensure_search_index(&search_index)?;

        let global_index = search_index.read().map_err(|e| e.to_string())?;
        if let Some(index) = global_index.as_ref() {
            index.clear()?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn search_tracks(query: String, limit: Option<usize>, state: State<'_, AppState>) -> Result<Vec<AudioTrack>, String> {
    let search_index = state.search_index.clone();
    tokio::task::spawn_blocking(move || {
        ensure_search_index(&search_index)?;

        let global_index = search_index.read().map_err(|e| e.to_string())?;
        if let Some(index) = global_index.as_ref() {
            index.search(&query, limit.unwrap_or(50))
        } else {
            Ok(Vec::new())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

fn ensure_search_index(search_index: &Arc<std::sync::RwLock<Option<SearchIndex>>>) -> Result<(), String> {
    {
        let guard = search_index.read().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Ok(());
        }
    }

    let mut guard = search_index.write().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok(());
    }

    let index_path = crate::domain::utils::get_index_dir();
    let search_idx = SearchIndex::new(index_path)?;
    *guard = Some(search_idx);
    Ok(())
}
