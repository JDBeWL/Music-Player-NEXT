import { invoke } from '@tauri-apps/api/core';

class SettingsSync {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: Record<string, unknown> = {};

  schedule(updates: Record<string, unknown>, debounceMs = 300) {
    Object.assign(this.pending, updates);
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => this.flush(), debounceMs);
  }

  async flush() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (Object.keys(this.pending).length === 0) return;

    const partial = { ...this.pending };
    this.pending = {};

    try {
      await invoke('update_settings', { partial });
    } catch (error) {
      console.error('[SettingsSync] Failed to update settings:', error);
    }
  }
}

export const settingsSync = new SettingsSync();
