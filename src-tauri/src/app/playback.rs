// SPDX-License-Identifier: Apache-2.0

use tauri::{AppHandle, Manager};

pub(crate) fn save_playback_state_on_close(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.eval(
            "window.dispatchEvent(new CustomEvent('save-playback-before-close'))"
        );
    }
}
