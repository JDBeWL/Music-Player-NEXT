use crate::domain::app_state::AppState;
use crate::cache::cover_cache;
use crate::domain::models::AudioTrack;
use std::collections::HashMap;
use rayon::prelude::*;
use tauri::State;

#[tauri::command]
pub async fn extract_covers_batch(tracks: Vec<AudioTrack>, state: State<'_, AppState>) -> Result<Vec<AudioTrack>, String> {
    let cover_cache = state.cover_cache.clone();
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

        if let Ok(ref cache) = cover_cache.read() {
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
                    let cover_id = format!("cover_{}", cover_cache::uuid_simple());
                    to_cache.push((cover_id.clone(), data, hash, result_idx));
                    results.push(track);
                }
            } else {
                results.push(track);
            }
        }

        if !to_cache.is_empty() {
            let cache_inputs: Vec<(String, Vec<u8>)> = to_cache.iter().map(|(id, data, _, _)| (id.clone(), data.clone())).collect();

            if let Ok(ref mut cache) = cover_cache.write() {
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
