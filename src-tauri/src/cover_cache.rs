// SPDX-License-Identifier: Apache-2.0

use image::imageops::FilterType;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

const MAX_COVER_CACHE_SIZE: usize = 5000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoverCacheEntry {
    pub cover_path: String,
    pub cover_path_thumb: String,
}

pub struct CoverCache {
    dir: PathBuf,
    thumb_dir: PathBuf,
    index_path: PathBuf,
    hash_path: PathBuf,
    index: HashMap<String, CoverCacheEntry>,
    hash_to_id: HashMap<u64, String>,
    access_order: VecDeque<String>,
    dirty: bool,
}

fn compute_hash(data: &[u8]) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    data.hash(&mut hasher);
    hasher.finish()
}

impl CoverCache {
    pub fn new() -> std::io::Result<Self> {
        let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
        let cache_root = base.join("MercurialPlayerNEXT").join("covers");
        let dir = cache_root.join("full");
        let thumb_dir = cache_root.join("thumb");
        let index_path = cache_root.join("index.json");
        let hash_path = cache_root.join("hash_index.json");

        fs::create_dir_all(&dir)?;
        fs::create_dir_all(&thumb_dir)?;

        let mut cache = CoverCache {
            dir,
            thumb_dir,
            index_path,
            hash_path,
            index: HashMap::new(),
            hash_to_id: HashMap::new(),
            access_order: VecDeque::new(),
            dirty: false,
        };

        if let Ok(content) = fs::read_to_string(&cache.index_path) {
            if let Ok(serde_index) = serde_json::from_str::<HashMap<String, CoverCacheEntry>>(&content) {
                cache.index = serde_index;
                cache.access_order = VecDeque::from(cache.index.keys().cloned().collect::<Vec<String>>());
            }
        }

        if let Ok(content) = fs::read_to_string(&cache.hash_path) {
            if let Ok(hash_index) = serde_json::from_str::<HashMap<u64, String>>(&content) {
                cache.hash_to_id = hash_index;
            }
        }

        Ok(cache)
    }

    fn save_index(&mut self) -> Result<(), String> {
        if !self.dirty {
            return Ok(());
        }
        if let Ok(content) = serde_json::to_string(&self.index) {
            fs::write(&self.index_path, content).map_err(|e| e.to_string())?;
        }
        if let Ok(content) = serde_json::to_string(&self.hash_to_id) {
            fs::write(&self.hash_path, content).map_err(|e| e.to_string())?;
        }
        self.dirty = false;
        Ok(())
    }

    fn mark_dirty(&mut self) {
        self.dirty = true;
    }

    fn evict_if_needed(&mut self) {
        while self.index.len() > MAX_COVER_CACHE_SIZE {
            if let Some(oldest_id) = self.access_order.pop_front() {
                if let Some(entry) = self.index.remove(&oldest_id) {
                    let _ = fs::remove_file(&entry.cover_path);
                    let _ = fs::remove_file(&entry.cover_path_thumb);
                    self.hash_to_id.retain(|_, v| v != &oldest_id);
                }
            }
        }
    }

    fn record_access(&mut self, id: &str) {
        self.access_order.retain(|k| k != id);
        self.access_order.push_back(id.to_string());
    }

    pub fn get(&mut self, id: &str) -> Option<CoverCacheEntry> {
        if let Some(entry) = self.index.get(id).cloned() {
            self.record_access(id);
            return Some(entry);
        }
        None
    }

    pub fn find_by_hash(&self, hash: u64) -> Option<(String, CoverCacheEntry)> {
        self.hash_to_id.get(&hash).and_then(|id| {
            self.index.get(id).map(|entry| (id.clone(), entry.clone()))
        })
    }

    pub fn put(&mut self, id: String, cover_data: &[u8]) -> std::io::Result<CoverCacheEntry> {
        let hash = compute_hash(cover_data);

        if let Some((existing_id, entry)) = self.find_by_hash(hash) {
            self.record_access(&existing_id);
            return Ok(entry);
        }

        let full_path = self.dir.join(format!("{}.jpg", id));
        let thumb_path = self.thumb_dir.join(format!("{}_thumb.jpg", id));

        fs::write(&full_path, cover_data)?;

        self.generate_thumbnail_async(cover_data, thumb_path.clone());

        let entry = CoverCacheEntry {
            cover_path: full_path.to_string_lossy().to_string(),
            cover_path_thumb: thumb_path.to_string_lossy().to_string(),
        };

        self.index.insert(id.clone(), entry.clone());
        self.hash_to_id.insert(hash, id.clone());
        self.record_access(&id);
        self.mark_dirty();
        self.evict_if_needed();

        Ok(entry)
    }

    pub fn put_batch(&mut self, items: Vec<(String, Vec<u8>)>) -> Vec<(String, std::io::Result<CoverCacheEntry>)> {
        let mut results = Vec::with_capacity(items.len());
        let mut new_entries: Vec<(String, Vec<u8>, u64)> = Vec::new();
        let mut hashes_to_add: HashSet<u64> = HashSet::new();

        for (id, data) in items {
            let hash = compute_hash(&data);

            if let Some((existing_id, entry)) = self.find_by_hash(hash) {
                self.record_access(&existing_id);
                results.push((id, Ok(entry)));
                continue;
            }

            if hashes_to_add.contains(&hash) {
                results.push((id, Err(std::io::Error::new(
                    std::io::ErrorKind::AlreadyExists,
                    "Duplicate in batch"
                ))));
                continue;
            }

            hashes_to_add.insert(hash);
            new_entries.push((id, data, hash));
        }

        for (id, data, hash) in new_entries {
            let full_path = self.dir.join(format!("{}.jpg", id));
            let thumb_path = self.thumb_dir.join(format!("{}_thumb.jpg", id));

            match fs::write(&full_path, &data) {
                Ok(_) => {
                    self.generate_thumbnail_async(&data, thumb_path.clone());

                    let entry = CoverCacheEntry {
                        cover_path: full_path.to_string_lossy().to_string(),
                        cover_path_thumb: thumb_path.to_string_lossy().to_string(),
                    };

                    self.index.insert(id.clone(), entry.clone());
                    self.hash_to_id.insert(hash, id.clone());
                    self.record_access(&id);
                    results.push((id, Ok(entry)));
                }
                Err(e) => {
                    results.push((id, Err(e)));
                }
            }
        }

        self.mark_dirty();
        self.evict_if_needed();
        let _ = self.save_index();

        results
    }

    fn generate_thumbnail_async(&self, cover_data: &[u8], thumb_path: PathBuf) {
        let data = cover_data.to_vec();
        std::thread::spawn(move || {
            if let Ok(img) = image::load_from_memory(&data) {
                let thumb = img.resize(200, 200, FilterType::Triangle);
                let _ = thumb.save(&thumb_path);
            }
        });
    }

    pub fn get_dir(&self) -> &PathBuf {
        &self.dir
    }

    pub fn clear(&mut self) -> std::io::Result<()> {
        for entry in self.index.values() {
            let _ = fs::remove_file(&entry.cover_path);
            let _ = fs::remove_file(&entry.cover_path_thumb);
        }
        self.index.clear();
        self.hash_to_id.clear();
        self.access_order.clear();
        self.mark_dirty();
        let _ = self.save_index();
        Ok(())
    }

    pub fn remove(&mut self, id: &str) -> std::io::Result<()> {
        if let Some(entry) = self.index.remove(id) {
            let _ = fs::remove_file(&entry.cover_path);
            let _ = fs::remove_file(&entry.cover_path_thumb);
            self.access_order.retain(|k| k != id);
            self.hash_to_id.retain(|_, v| v != id);
            self.mark_dirty();
            let _ = self.save_index();
        }
        Ok(())
    }
}

pub fn uuid_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{:x}", nanos)
}

pub fn extract_cover_from_path(path: &str) -> std::io::Result<Option<Vec<u8>>> {
    use lofty::prelude::*;

    let tagged_path = std::path::Path::new(path);
    let tagged_file = lofty::read_from_path(tagged_path)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    let tag = tagged_file.primary_tag();

    let data = tag
        .and_then(|t| t.pictures().first().map(|p| p.data().to_vec()));

    Ok(data)
}

pub fn compute_cover_hash(data: &[u8]) -> u64 {
    compute_hash(data)
}

#[tauri::command]
pub fn get_cover_entry(cover_id: String) -> Result<Option<CoverCacheEntry>, String> {
    if let Ok(ref mut cache) = COVER_CACHE.write() {
        Ok(cache.get(&cover_id))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn save_cover_to_cache_cmd(cover_id: String, cover_data: Vec<u8>) -> Result<CoverCacheEntry, String> {
    if let Ok(ref mut cache) = COVER_CACHE.write() {
        cache.put(cover_id, &cover_data).map_err(|e| e.to_string())
    } else {
        Err("Cache lock failed".to_string())
    }
}

#[tauri::command]
pub fn extract_and_cache_cover(audio_path: String) -> Result<Option<CoverCacheEntry>, String> {
    let data = extract_cover_from_path(&audio_path)
        .map_err(|e| e.to_string())?;

    let Some(data) = data else {
        return Ok(None);
    };

    let hash = compute_cover_hash(&data);

    if let Ok(ref cache) = COVER_CACHE.read() {
        if let Some((_, entry)) = cache.find_by_hash(hash) {
            return Ok(Some(entry));
        }
    }

    let cover_id = format!("cover_{}", uuid_simple());
    if let Ok(ref mut cache) = COVER_CACHE.write() {
        let entry = cache.put(cover_id, &data).map_err(|e| e.to_string())?;
        Ok(Some(entry))
    } else {
        Err("Cache lock failed".to_string())
    }
}

#[tauri::command]
pub fn extract_and_cache_covers_batch(audio_paths: Vec<String>) -> Result<Vec<(String, Option<CoverCacheEntry>)>, String> {
    use rayon::prelude::*;

    let extracted: Vec<(String, Option<Vec<u8>>, u64)> = audio_paths
        .par_iter()
        .map(|path| {
            let data = extract_cover_from_path(path).ok().flatten();
            let hash = data.as_ref().map(|d| compute_cover_hash(d)).unwrap_or(0);
            (path.clone(), data, hash)
        })
        .collect();

    let mut hash_to_existing: HashMap<u64, CoverCacheEntry> = HashMap::new();

    if let Ok(ref cache) = COVER_CACHE.read() {
        for (_, _, hash) in &extracted {
            if *hash != 0 && !hash_to_existing.contains_key(hash) {
                if let Some((_, entry)) = cache.find_by_hash(*hash) {
                    hash_to_existing.insert(*hash, entry);
                }
            }
        }
    }

    let mut to_cache: Vec<(String, Vec<u8>)> = Vec::new();
    let mut results: Vec<(String, Option<CoverCacheEntry>)> = Vec::new();

    for (path, data, hash) in extracted {
        if let Some(data) = data {
            if let Some(entry) = hash_to_existing.get(&hash) {
                results.push((path, Some(entry.clone())));
            } else {
                let cover_id = format!("cover_{}", uuid_simple());
                to_cache.push((cover_id, data));
                results.push((path, None));
            }
        } else {
            results.push((path, None));
        }
    }

    if !to_cache.is_empty() {
        if let Ok(ref mut cache) = COVER_CACHE.write() {
            let cached = cache.put_batch(to_cache);
            let mut cached_map: HashMap<String, CoverCacheEntry> = HashMap::new();
            for (id, result) in cached {
                if let Ok(entry) = result {
                    cached_map.insert(id, entry);
                }
            }

            for result in &mut results {
                if result.1.is_none() {
                    for entry in cached_map.values() {
                        result.1 = Some(entry.clone());
                        break;
                    }
                }
            }
        }
    }

    Ok(results)
}

#[tauri::command]
pub fn get_cover_cache_info() -> Result<(String, usize), String> {
    if let Ok(ref cache) = COVER_CACHE.read() {
        let count = cache.index.len();
        let dir = cache.get_dir().to_string_lossy().to_string();
        Ok((dir, count))
    } else {
        Err("Cache lock failed".to_string())
    }
}

#[tauri::command]
pub fn clear_cover_cache() -> Result<usize, String> {
    if let Ok(ref mut cache) = COVER_CACHE.write() {
        let count = cache.index.len();
        cache.clear().map_err(|e| e.to_string())?;
        Ok(count)
    } else {
        Err("Cache lock failed".to_string())
    }
}

#[tauri::command]
pub fn remove_cover(cover_id: String) -> Result<(), String> {
    if let Ok(ref mut cache) = COVER_CACHE.write() {
        cache.remove(&cover_id).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Cache lock failed".to_string())
    }
}

pub static COVER_CACHE: Lazy<Arc<RwLock<CoverCache>>> = Lazy::new(|| {
    Arc::new(RwLock::new(CoverCache::new().expect("Failed to init cover cache")))
});
