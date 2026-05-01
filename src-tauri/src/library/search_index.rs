// SPDX-License-Identifier: Apache-2.0

use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::*;
use tantivy::{doc, Index, IndexReader, IndexWriter, ReloadPolicy};
use tantivy::tokenizer::{NgramTokenizer, SimpleTokenizer, TextAnalyzer, LowerCaser};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use crate::domain::models::AudioTrack;
use crate::domain::utils::split_artists;

pub struct SearchIndex {
    index: Index,
    reader: IndexReader,
    writer: Arc<Mutex<IndexWriter>>,
    title_field: Field,
    artist_field: Field,
    artists_field: Field,
    album_field: Field,
    path_field: Field,
    id_field: Field,
    duration_field: Field,
    format_field: Field,
    cover_url_field: Field,
    cover_id_field: Field,
    has_lrc_field: Field,
}

impl SearchIndex {
    pub fn new(index_path: PathBuf) -> Result<Self, String> {
        let mut schema_builder = Schema::builder();

        let text_options = TextOptions::default()
            .set_indexing_options(
                TextFieldIndexing::default()
                    .set_tokenizer("ngram")
                    .set_index_option(IndexRecordOption::WithFreqsAndPositions)
            )
            .set_stored();

        let title_field = schema_builder.add_text_field("title", text_options.clone());
        let artist_field = schema_builder.add_text_field("artist", text_options.clone());
        let artists_field = schema_builder.add_text_field("artists", text_options.clone());
        let album_field = schema_builder.add_text_field("album", text_options.clone());

        let string_options = TextOptions::default()
            .set_indexing_options(
                TextFieldIndexing::default()
                    .set_tokenizer("mixed")
                    .set_index_option(IndexRecordOption::Basic)
            )
            .set_stored();

        let path_field = schema_builder.add_text_field("path", string_options.clone());
        let id_field = schema_builder.add_text_field("id", string_options);
        let duration_field = schema_builder.add_text_field("duration", STORED);
        let format_field = schema_builder.add_text_field("format", STORED);
        let cover_url_field = schema_builder.add_text_field("cover_url", STORED);
        let cover_id_field = schema_builder.add_text_field("cover_id", STORED);
        let has_lrc_field = schema_builder.add_text_field("has_lrc", STORED);

        let schema = schema_builder.build();

        let index = match Index::open_in_dir(&index_path) {
            Ok(existing_index) => {
                if existing_index.schema() == schema {
                    existing_index
                } else {
                    let _ = std::fs::remove_dir_all(&index_path);
                    std::fs::create_dir_all(&index_path).map_err(|e| e.to_string())?;
                    Index::create_in_dir(&index_path, schema.clone())
                        .map_err(|e| e.to_string())?
                }
            }
            Err(_) => {
                std::fs::create_dir_all(&index_path).map_err(|e| e.to_string())?;
                Index::create_in_dir(&index_path, schema.clone())
                    .map_err(|e| e.to_string())?
            }
        };

        let simple_tokenizer = TextAnalyzer::builder(SimpleTokenizer::default())
            .filter(LowerCaser)
            .build();
        index.tokenizers().register("mixed", simple_tokenizer);

        let ngram_tokenizer = TextAnalyzer::builder(
            NgramTokenizer::new(1, 3, false).unwrap()
        )
        .filter(LowerCaser)
        .build();
        index.tokenizers().register("ngram", ngram_tokenizer);

        let cpu_cores = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4);
        let num_threads = cpu_cores.min(8).max(2);
        let heap_per_thread = 32 * 1024 * 1024usize;
        let heap_size = (num_threads * heap_per_thread) as usize;
        let writer = index.writer_with_num_threads(num_threads, heap_size)
            .map_err(|e| e.to_string())?;

        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()
            .map_err(|e: tantivy::TantivyError| e.to_string())?;

        Ok(SearchIndex {
            index,
            reader,
            writer: Arc::new(Mutex::new(writer)),
            title_field,
            artist_field,
            artists_field,
            album_field,
            path_field,
            id_field,
            duration_field,
            format_field,
            cover_url_field,
            cover_id_field,
            has_lrc_field,
        })
    }

    pub fn add_track(&self, track: &AudioTrack) -> Result<(), String> {
        let writer = self.writer.lock().map_err(|e| e.to_string())?;

        let path_term = tantivy::Term::from_field_text(self.path_field, &track.path);
        writer.delete_term(path_term);

        let mut doc = doc!(
            self.title_field => track.title.clone(),
            self.artist_field => track.artist.clone(),
            self.album_field => track.album.clone(),
            self.path_field => track.path.clone(),
            self.id_field => track.id.clone(),
            self.duration_field => track.duration.to_string(),
            self.format_field => track.file_format.clone(),
            self.cover_url_field => track.cover_url.clone().unwrap_or_default(),
            self.cover_id_field => track.cover_id.clone().unwrap_or_default(),
            self.has_lrc_field => if track.has_lrc { "1" } else { "0" }.to_string(),
        );
        for a in &track.artists {
            doc.add_text(self.artists_field, a);
        }

        writer.add_document(doc).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn add_tracks(&self, tracks: &[AudioTrack]) -> Result<(), String> {
        let writer = self.writer.lock().map_err(|e| e.to_string())?;
        for track in tracks {
            let path_term = tantivy::Term::from_field_text(self.path_field, &track.path);
            writer.delete_term(path_term);

            let mut doc = doc!(
                self.title_field => track.title.clone(),
                self.artist_field => track.artist.clone(),
                self.album_field => track.album.clone(),
                self.path_field => track.path.clone(),
                self.id_field => track.id.clone(),
                self.duration_field => track.duration.to_string(),
                self.format_field => track.file_format.clone(),
                self.cover_url_field => track.cover_url.clone().unwrap_or_default(),
                self.cover_id_field => track.cover_id.clone().unwrap_or_default(),
                self.has_lrc_field => if track.has_lrc { "1" } else { "0" }.to_string(),
            );
            for a in &track.artists {
                doc.add_text(self.artists_field, a);
            }
            writer.add_document(doc).map_err(|e| e.to_string())?;
        }
        drop(writer);

        self.commit()?;
        Ok(())
    }

    pub fn clear(&self) -> Result<(), String> {
        let mut writer = self.writer.lock().map_err(|e| e.to_string())?;
        writer.delete_all_documents().map_err(|e| e.to_string())?;
        writer.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn remove_track(&self, track_id: &str) -> Result<(), String> {
        let mut writer = self.writer.lock().map_err(|e| e.to_string())?;
        let term = tantivy::Term::from_field_text(self.id_field, track_id);
        writer.delete_term(term);
        writer.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn remove_tracks(&self, track_ids: &[String]) -> Result<(), String> {
        if track_ids.is_empty() {
            return Ok(());
        }
        let mut writer = self.writer.lock().map_err(|e| e.to_string())?;
        for track_id in track_ids {
            let term = tantivy::Term::from_field_text(self.id_field, track_id);
            writer.delete_term(term);
        }
        writer.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn commit(&self) -> Result<(), String> {
        let mut writer = self.writer.lock().map_err(|e| e.to_string())?;
        writer.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn search(&self, query_str: &str, limit: usize) -> Result<Vec<AudioTrack>, String> {
        let searcher = self.reader.searcher();

        // 使用 ngram tokenizer 进行查询解析
        let mut query_parser = QueryParser::for_index(
            &self.index,
            vec![self.title_field, self.artist_field, self.artists_field, self.album_field]
        );
        query_parser.set_field_boost(self.title_field, 2.0);
        query_parser.set_field_boost(self.artist_field, 1.5);
        query_parser.set_field_boost(self.artists_field, 1.5);

        let query = query_parser.parse_query(query_str).map_err(|e| e.to_string())?;

        let top_docs = searcher.search(&query, &TopDocs::with_limit(limit))
            .map_err(|e| e.to_string())?;

        let mut results = Vec::new();
        for (_score, doc_address) in top_docs {
            let retrieved_doc = searcher.doc::<tantivy::schema::TantivyDocument>(doc_address).map_err(|e| e.to_string())?;

            let id = retrieved_doc.get_first(self.id_field)
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_default();
            let path = retrieved_doc.get_first(self.path_field)
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_default();
            let title = retrieved_doc.get_first(self.title_field)
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| "Unknown".to_string());
            let artist = retrieved_doc.get_first(self.artist_field)
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| "Unknown Artist".to_string());
            let album = retrieved_doc.get_first(self.album_field)
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| "Unknown Album".to_string());
            let duration_str = retrieved_doc.get_first(self.duration_field)
                .and_then(|v| v.as_str())
                .unwrap_or("0");
            let duration: f64 = duration_str.parse().unwrap_or(0.0);
            let file_format = retrieved_doc.get_first(self.format_field)
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_default();
            let cover_url = retrieved_doc.get_first(self.cover_url_field)
                .and_then(|v| v.as_str())
                .map(|s| if s.is_empty() { None } else { Some(s.to_string()) })
                .flatten();
            let cover_id = retrieved_doc.get_first(self.cover_id_field)
                .and_then(|v| v.as_str())
                .map(|s| if s.is_empty() { None } else { Some(s.to_string()) })
                .flatten();
            let has_lrc = retrieved_doc.get_first(self.has_lrc_field)
                .and_then(|v| v.as_str())
                .map(|s| s == "1")
                .unwrap_or(false);

            results.push(AudioTrack {
                id,
                path,
                title: title.clone(),
                artist: artist.clone(),
                artists: split_artists(&artist),
                album,
                duration,
                file_format,
                cover_url,
                cover_id,
                file_mtime: None,
                lrc: None,
                has_lrc,
            });
        }

        Ok(results)
    }
}
