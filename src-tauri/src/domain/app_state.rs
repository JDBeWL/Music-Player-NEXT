use std::sync::{Arc, RwLock};
use crate::cache::cover_cache::CoverCache;
use crate::domain::models::AppSettings;
use crate::library::search_index::SearchIndex;

pub(crate) struct AppState {
    pub settings: Arc<RwLock<AppSettings>>,
    pub search_index: Arc<RwLock<Option<SearchIndex>>>,
    pub cover_cache: Arc<RwLock<CoverCache>>,
}

impl AppState {
    pub fn new(settings: AppSettings) -> Self {
        let cover_cache = CoverCache::new().expect("Failed to init cover cache");
        Self {
            settings: Arc::new(RwLock::new(settings)),
            search_index: Arc::new(RwLock::new(None)),
            cover_cache: Arc::new(RwLock::new(cover_cache)),
        }
    }
}

impl Clone for AppState {
    fn clone(&self) -> Self {
        Self {
            settings: Arc::clone(&self.settings),
            search_index: Arc::clone(&self.search_index),
            cover_cache: Arc::clone(&self.cover_cache),
        }
    }
}
