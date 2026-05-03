// SPDX-License-Identifier: Apache-2.0

use tauri::{Emitter, Manager};

mod domain;
mod library;
mod cache;
mod netease;
mod settings;
mod app;

pub(crate) const SUPPORTED_AUDIO_EXTENSIONS: &[&str] = &["mp3", "wav", "flac", "ogg", "m4a", "aac", "ape", "wma"];

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            library::library::get_library,
            library::library::save_library,
            library::library::get_library_path_info,
            library::library::get_files_with_mtime,
            library::library::add_folder,
            library::library::remove_folder,
            library::library::save_playlists,
            library::library::save_tracks,
            library::library::scan_folder,
            library::library::scan_folder_recursive,
            library::search::search_tracks,
            library::search::add_track_to_index,
            library::search::add_tracks_to_index,
            library::search::remove_track_from_index,
            library::search::remove_tracks_from_index,
            library::search::clear_search_index,
            library::search::rebuild_search_index,
            cache::cover::extract_covers_batch,
            cache::cover_cache::get_cover_entry,
            cache::cover_cache::save_cover_to_cache_cmd,
            cache::cover_cache::extract_and_cache_cover,
            cache::cover_cache::extract_and_cache_covers_batch,
            cache::cover_cache::get_cover_cache_info,
            cache::cover_cache::clear_cover_cache,
            cache::cover_cache::remove_cover,
            cache::cover_cache::cleanup_orphan_covers,
            settings::settings::get_settings,
            settings::settings::get_close_behavior,
            settings::settings::set_close_behavior_and_hint,
            settings::settings::save_settings,
            settings::settings::update_settings,
            settings::settings::save_playback_state,
            settings::settings::get_playback_state,
            app::commands::show_window,
            app::commands::hide_window,
            app::commands::quit_app,
            app::commands::player_toggle,
            app::commands::player_next,
            app::commands::player_prev,
            app::commands::player_set_loop,
            app::commands::open_folder_dialog,
            app::commands::read_file_bytes,
            app::commands::read_dir,
            app::commands::get_file_name,
            library::metadata::parse_audio_metadata,
            netease::netease::netease_api_request,
            netease::netease::netease_api_request_with_cookie,
            netease::netease::set_netease_api_base,
            netease::netease::get_netease_api_base,
            netease::netease::download_netease_song,
            netease::netease::save_file_dialog,
            netease::netease::save_netease_auth,
            netease::netease::load_netease_auth,
            netease::netease::clear_netease_auth
        ])
        .setup(|app| {
            let settings_path = domain::utils::get_settings_path();
            if !settings_path.exists() {
                let default_settings = domain::models::AppSettings::default();
                let _ = settings::settings::save_settings_sync(default_settings);
            }

            let settings = settings::settings::get_settings_sync().unwrap_or_default();

            app.manage(domain::app_state::AppState::new(settings));

            let tray_menu = tauri::menu::MenuBuilder::new(app)
                .text("show", "显示主窗口")
                .separator()
                .text("toggle", "⏯ 播放/暂停")
                .separator()
                .text("prev", "⏮ 上一曲")
                .text("next", "⏭ 下一曲")
                .separator()
                .text("shuffle", "🔀 随机播放")
                .separator()
                .text("loop-off", "🔀 关闭循环")
                .text("loop-track", "🔂 单曲循环")
                .text("loop-playlist", "🔁 列表循环")
                .separator()
                .text("quit", "退出")
                .build()?;

            let tray_handle = app.tray_by_id("main-tray").unwrap();
            let app_handle = app.handle().clone();
            let app_handle_for_tray = app.handle().clone();
            tray_handle.set_menu(Some(tray_menu))?;
            tray_handle.set_tooltip(Some("Mercurial Player NEXT"))?;

            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                let state_for_close = app.state::<domain::app_state::AppState>().inner().clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        let (close_behavior, first_close_hint_shown) = {
                            let s = state_for_close.settings.read().unwrap_or_else(|e| e.into_inner());
                            (s.close_behavior.clone(), s.first_close_hint_shown)
                        };

                        if !first_close_hint_shown {
                            api.prevent_close();
                            if let Some(w) = app_handle.get_webview_window("main") {
                                let _ = w.unminimize();
                                let _ = w.show();
                                let _ = w.set_focus();
                                let _ = w.emit("show-close-hint-dialog", ());
                            }
                        } else if close_behavior == "quit" {
                            app::playback::save_playback_state_on_close(&app_handle);
                            app_handle.exit(0);
                        } else {
                            api.prevent_close();
                            let _ = w.hide();
                        }
                    }
                });
            }

            tray_handle.on_tray_icon_event(move |_tray, event| {
                if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                    if let Some(window) = app_handle_for_tray.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.set_always_on_top(true);
                        let _ = window.set_always_on_top(false);
                    }
                }
            });
            tray_handle.on_menu_event(move |app, event| {
                match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "toggle" => {
                        let _ = app.emit("player-control", serde_json::json!({ "detail": "toggle" }));
                    }
                    "prev" => {
                        let _ = app.emit("player-control", serde_json::json!({ "detail": "prev" }));
                    }
                    "next" => {
                        let _ = app.emit("player-control", serde_json::json!({ "detail": "next" }));
                    }
                    "shuffle" => {
                        let _ = app.emit("player-control", serde_json::json!({ "detail": "shuffle" }));
                    }
                    "loop-off" => {
                        let _ = app.emit("player-control", serde_json::json!({ "detail": "loop", "mode": "off" }));
                    }
                    "loop-track" => {
                        let _ = app.emit("player-control", serde_json::json!({ "detail": "loop", "mode": "track" }));
                    }
                    "loop-playlist" => {
                        let _ = app.emit("player-control", serde_json::json!({ "detail": "loop", "mode": "playlist" }));
                    }
                    "quit" => {
                        app::playback::save_playback_state_on_close(app);
                        app.exit(0);
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
