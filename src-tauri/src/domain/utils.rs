// SPDX-License-Identifier: Apache-2.0

use std::fs;
use std::path::PathBuf;

pub(crate) fn get_data_dir() -> PathBuf {
    let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("MercurialPlayerNEXT")
}

pub(crate) fn get_index_dir() -> PathBuf {
    get_data_dir().join("search_index")
}

pub(crate) fn ensure_data_dir() -> std::io::Result<PathBuf> {
    let dir = get_data_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}

pub(crate) fn get_library_path() -> PathBuf {
    get_data_dir().join("library.json")
}

pub(crate) fn get_settings_path() -> PathBuf {
    get_data_dir().join("settings.json")
}

pub(crate) fn normalize_path(path: &str) -> String {
    path.replace('\\', "/")
}

pub(crate) fn split_artists(artist: &str) -> Vec<String> {
    let re = regex::Regex::new(r"(?:\s*[;&/,]\s*|\s+feat\.?\s*|\s+ft\.?\s*|\s+vs\.?\s*)").unwrap();
    re.split(artist)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

pub(crate) fn track_id_from_path(path: &str) -> String {
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
