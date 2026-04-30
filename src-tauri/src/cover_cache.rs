// SPDX-License-Identifier: Apache-2.0

use image::imageops::FilterType;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::sync::{Arc, OnceLock, RwLock};

const MAX_COVER_CACHE_SIZE: usize = 5000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoverCacheEntry {
    pub cover_path: String,
    pub cover_path_thumb: String,
}

struct LruNode {
    id: String,
    prev: Option<usize>,
    next: Option<usize>,
}

struct LruList {
    nodes: Vec<LruNode>,
    free_indices: Vec<usize>,
    head: Option<usize>,
    tail: Option<usize>,
    id_to_idx: HashMap<String, usize>,
}

impl LruList {
    fn new() -> Self {
        LruList {
            nodes: Vec::new(),
            free_indices: Vec::new(),
            head: None,
            tail: None,
            id_to_idx: HashMap::new(),
        }
    }

    fn alloc_node(&mut self, id: String) -> usize {
        let idx = if let Some(free) = self.free_indices.pop() {
            self.nodes[free] = LruNode { id, prev: None, next: None };
            free
        } else {
            let idx = self.nodes.len();
            self.nodes.push(LruNode { id, prev: None, next: None });
            idx
        };
        self.id_to_idx.insert(self.nodes[idx].id.clone(), idx);
        idx
    }

    fn detach(&mut self, idx: usize) {
        let (prev, next) = {
            let node = &self.nodes[idx];
            (node.prev, node.next)
        };

        if let Some(p) = prev {
            self.nodes[p].next = next;
        } else {
            self.head = next;
        }

        if let Some(n) = next {
            self.nodes[n].prev = prev;
        } else {
            self.tail = prev;
        }

        self.nodes[idx].prev = None;
        self.nodes[idx].next = None;
    }

    fn push_back(&mut self, id: &str) {
        if let Some(&idx) = self.id_to_idx.get(id) {
            self.detach(idx);
            self.attach_to_tail(idx);
        } else {
            let idx = self.alloc_node(id.to_string());
            self.attach_to_tail(idx);
        }
    }

    fn attach_to_tail(&mut self, idx: usize) {
        self.nodes[idx].prev = self.tail;
        self.nodes[idx].next = None;

        if let Some(t) = self.tail {
            self.nodes[t].next = Some(idx);
        } else {
            self.head = Some(idx);
        }
        self.tail = Some(idx);
    }

    fn pop_front(&mut self) -> Option<String> {
        let head_idx = self.head?;
        let id = self.nodes[head_idx].id.clone();
        self.detach(head_idx);
        self.id_to_idx.remove(&id);
        self.free_indices.push(head_idx);
        Some(id)
    }

    fn remove(&mut self, id: &str) {
        if let Some(&idx) = self.id_to_idx.get(id) {
            self.detach(idx);
            self.id_to_idx.remove(id);
            self.free_indices.push(idx);
        }
    }

    fn clear(&mut self) {
        self.nodes.clear();
        self.free_indices.clear();
        self.head = None;
        self.tail = None;
        self.id_to_idx.clear();
    }
}

pub struct CoverCache {
    dir: PathBuf,
    thumb_dir: PathBuf,
    index_path: PathBuf,
    hash_path: PathBuf,
    index: HashMap<String, CoverCacheEntry>,
    hash_to_ids: HashMap<u64, Vec<String>>,
    lru: LruList,
    dirty: bool,
}

fn compute_hash(data: &[u8]) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    data.hash(&mut hasher);
    hasher.finish()
}

impl CoverCache {
    pub fn new() -> std::io::Result<Self> {
        let cache_root = crate::get_data_dir().join("covers");
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
            hash_to_ids: HashMap::new(),
            lru: LruList::new(),
            dirty: false,
        };

        if let Ok(content) = fs::read_to_string(&cache.index_path) {
            if let Ok(serde_index) = serde_json::from_str::<HashMap<String, CoverCacheEntry>>(&content) {
                cache.index = serde_index;
                for id in cache.index.keys() {
                    cache.lru.push_back(id);
                }
            }
        }

        if let Ok(content) = fs::read_to_string(&cache.hash_path) {
            if let Ok(hash_index) = serde_json::from_str::<HashMap<u64, Vec<String>>>(&content) {
                cache.hash_to_ids = hash_index;
            }
        }

        cache.verify_and_recover();

        Ok(cache)
    }

    fn verify_and_recover(&mut self) {
        let mut id_to_hash: HashMap<String, u64> = HashMap::new();
        for (hash, ids) in &self.hash_to_ids {
            for id in ids {
                id_to_hash.insert(id.clone(), *hash);
            }
        }

        let mut needs_fix = false;
        for id in self.index.keys() {
            if !id_to_hash.contains_key(id) {
                needs_fix = true;
                break;
            }
        }

        if !needs_fix {
            for (_hash, ids) in &self.hash_to_ids {
                for id in ids {
                    if !self.index.contains_key(id) {
                        needs_fix = true;
                        break;
                    }
                }
                if needs_fix {
                    break;
                }
            }
        }

        if needs_fix {
            self.rebuild_hash_to_ids();
        }
    }

    fn rebuild_hash_to_ids(&mut self) {
        self.hash_to_ids.clear();

        for (id, entry) in &self.index {
            match fs::read(&entry.cover_path) {
                Ok(data) => {
                    if !data.is_empty() {
                        let hash = compute_hash(&data);
                        self.hash_to_ids.entry(hash).or_insert_with(Vec::new).push(id.clone());
                    }
                }
                Err(_) => {
                }
            }
        }

        self.mark_dirty();
        let _ = self.save_index();
    }

    fn save_index(&mut self) -> Result<(), String> {
        if !self.dirty {
            return Ok(());
        }
        if let Ok(content) = serde_json::to_string(&self.index) {
            fs::write(&self.index_path, content).map_err(|e| e.to_string())?;
        }
        if let Ok(content) = serde_json::to_string(&self.hash_to_ids) {
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
            if let Some(oldest_id) = self.lru.pop_front() {
                if let Some(entry) = self.index.remove(&oldest_id) {
                    let _ = fs::remove_file(&entry.cover_path);
                    let _ = fs::remove_file(&entry.cover_path_thumb);
                    self.hash_to_ids.retain(|_, v| {
                        v.retain(|id| id != &oldest_id);
                        !v.is_empty()
                    });
                }
            }
        }
    }

    fn record_access(&mut self, id: &str) {
        self.lru.push_back(id);
    }

    pub fn get(&mut self, id: &str) -> Option<CoverCacheEntry> {
        if let Some(entry) = self.index.get(id).cloned() {
            self.record_access(id);
            return Some(entry);
        }
        None
    }

    pub fn find_by_hash(&self, hash: u64) -> Option<(String, CoverCacheEntry)> {
        self.hash_to_ids.get(&hash).and_then(|ids| {
            ids.first().and_then(|id| {
                self.index.get(id).map(|entry| (id.clone(), entry.clone()))
            })
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
        self.hash_to_ids.entry(hash).or_insert_with(Vec::new).push(id.clone());
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
                self.hash_to_ids.entry(hash).or_insert_with(Vec::new).push(id.clone());
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
                    self.hash_to_ids.entry(hash).or_insert_with(Vec::new).push(id.clone());
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

    pub fn flush(&mut self) -> Result<(), String> {
        self.save_index()
    }

    pub fn clear(&mut self) -> std::io::Result<()> {
        for entry in self.index.values() {
            let _ = fs::remove_file(&entry.cover_path);
            let _ = fs::remove_file(&entry.cover_path_thumb);
        }

        if let Ok(entries) = fs::read_dir(&self.dir) {
            for entry in entries.flatten() {
                let _ = fs::remove_file(entry.path());
            }
        }
        if let Ok(entries) = fs::read_dir(&self.thumb_dir) {
            for entry in entries.flatten() {
                let _ = fs::remove_file(entry.path());
            }
        }

        self.index.clear();
        self.hash_to_ids.clear();
        self.lru.clear();
        self.mark_dirty();
        self.save_index().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        Ok(())
    }

    pub fn remove(&mut self, id: &str) -> std::io::Result<()> {
        let hash_to_remove = self.hash_to_ids.iter()
            .find(|(_, ids)| ids.iter().any(|cover_id| cover_id == id))
            .map(|(hash, _)| *hash);

        let cover_existed_in_index = self.index.contains_key(id);
        let hash_has_other_ids = hash_to_remove.map(|hash| {
            self.hash_to_ids.get(&hash)
                .map(|ids| ids.len() > 1)
                .unwrap_or(false)
        }).unwrap_or(false);

        if cover_existed_in_index && !hash_has_other_ids {
            if let Some(entry) = self.index.remove(id) {
                let _ = fs::remove_file(&entry.cover_path);
                let _ = fs::remove_file(&entry.cover_path_thumb);
                self.lru.remove(id);
            }
        } else if cover_existed_in_index {
            self.index.remove(id);
            self.lru.remove(id);
        }

        if let Some(hash) = hash_to_remove {
            if let Some(ids) = self.hash_to_ids.get_mut(&hash) {
                ids.retain(|cover_id| cover_id != id);
            }
            self.hash_to_ids.retain(|_, ids| !ids.is_empty());
        }

        self.mark_dirty();
        let _ = self.save_index();
        Ok(())
    }
}

pub fn uuid_simple() -> String {
    uuid::Uuid::new_v4().to_string()
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
    if let Ok(ref mut cache) = get_cover_cache().write() {
        Ok(cache.get(&cover_id))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn save_cover_to_cache_cmd(cover_id: String, cover_data: Vec<u8>) -> Result<CoverCacheEntry, String> {
    if let Ok(ref mut cache) = get_cover_cache().write() {
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

    if let Ok(ref cache) = get_cover_cache().read() {
        if let Some((_, entry)) = cache.find_by_hash(hash) {
            return Ok(Some(entry));
        }
    }

    let cover_id = format!("cover_{}", uuid_simple());
    if let Ok(ref mut cache) = get_cover_cache().write() {
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

    if let Ok(ref cache) = get_cover_cache().read() {
        for (_, _, hash) in &extracted {
            if *hash != 0 && !hash_to_existing.contains_key(hash) {
                if let Some((_, entry)) = cache.find_by_hash(*hash) {
                    hash_to_existing.insert(*hash, entry);
                }
            }
        }
    }

    let mut to_cache: Vec<(String, Vec<u8>, u64, usize)> = Vec::new();
    let mut results: Vec<(String, Option<CoverCacheEntry>)> = Vec::new();

    for (path, data, hash) in extracted {
        let result_idx = results.len();
        if let Some(data) = data {
            if let Some(entry) = hash_to_existing.get(&hash) {
                results.push((path, Some(entry.clone())));
            } else {
                let cover_id = format!("cover_{}", uuid_simple());
                to_cache.push((cover_id, data, hash, result_idx));
                results.push((path, None));
            }
        } else {
            results.push((path, None));
        }
    }

    if !to_cache.is_empty() {
        if let Ok(ref mut cache) = get_cover_cache().write() {
            let cache_inputs: Vec<(String, Vec<u8>)> = to_cache.iter().map(|(id, data, _, _)| (id.clone(), data.clone())).collect();
            let _cached = cache.put_batch(cache_inputs);

            for (_, _, hash, result_idx) in &to_cache {
                if *result_idx < results.len() && results[*result_idx].1.is_none() {
                    if let Some((_, entry)) = cache.find_by_hash(*hash) {
                        results[*result_idx].1 = Some(entry);
                    }
                }
            }
        }
    }

    Ok(results)
}

#[tauri::command]
pub fn get_cover_cache_info() -> Result<(String, usize), String> {
    if let Ok(ref cache) = get_cover_cache().read() {
        // Count actual files on disk to give accurate count,
        // since in-memory index may be out of sync after restart with new UUIDs
        let disk_count = fs::read_dir(&cache.dir)
            .map(|entries| entries.filter_map(|e| e.ok()).filter(|e| e.path().is_file()).count())
            .unwrap_or(0);
        let count = if cache.index.is_empty() && disk_count > 0 {
            // Index is empty but files exist on disk - show disk count
            disk_count
        } else {
            cache.index.len()
        };
        let dir = cache.get_dir().to_string_lossy().to_string();
        Ok((dir, count))
    } else {
        Err("Cache lock failed".to_string())
    }
}

#[tauri::command]
pub fn clear_cover_cache() -> Result<usize, String> {
    if let Ok(ref mut cache) = get_cover_cache().write() {
        let count = cache.index.len();
        cache.clear().map_err(|e| e.to_string())?;
        Ok(count)
    } else {
        Err("Cache lock failed".to_string())
    }
}

#[tauri::command]
pub fn remove_cover(cover_id: String) -> Result<(), String> {
    if let Ok(ref mut cache) = get_cover_cache().write() {
        cache.remove(&cover_id).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Cache lock failed".to_string())
    }
}

/// Remove covers from cache that are not referenced by any track.
/// Returns the number of orphaned covers removed.
#[tauri::command]
pub fn cleanup_orphan_covers(referenced_cover_ids: Vec<String>) -> Result<usize, String> {
    if let Ok(ref mut cache) = get_cover_cache().write() {
        let referenced: std::collections::HashSet<String> = referenced_cover_ids.into_iter().collect();
        let orphan_ids: Vec<String> = cache.index.keys()
            .filter(|id| !referenced.contains(*id))
            .cloned()
            .collect();
        let count = orphan_ids.len();
        for id in orphan_ids {
            let _ = cache.remove(&id);
        }
        Ok(count)
    } else {
        Err("Cache lock failed".to_string())
    }
}

pub static COVER_CACHE: OnceLock<Arc<RwLock<CoverCache>>> = OnceLock::new();

pub fn get_cover_cache() -> &'static Arc<RwLock<CoverCache>> {
    COVER_CACHE.get_or_init(|| Arc::new(RwLock::new(CoverCache::new().expect("Failed to init cover cache"))))
}
