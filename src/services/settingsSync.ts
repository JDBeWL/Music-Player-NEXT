import { invoke } from '@tauri-apps/api/core';

const MAX_QUEUE_SIZE = 50;
const MAX_RETRY_COUNT = 3;

class SettingsSync {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: Record<string, unknown> = {};
  private isFlushing = false;
  private flushQueue: Array<Record<string, unknown>> = [];
  private retryCount = 0;

  schedule(updates: Record<string, unknown>, debounceMs = 300) {
    Object.assign(this.pending, updates);
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => this.flush(), debounceMs);
  }

  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (Object.keys(this.pending).length === 0) return;

    const partial = { ...this.pending };
    this.pending = {};

    if (this.isFlushing) {
      if (this.flushQueue.length < MAX_QUEUE_SIZE) {
        this.flushQueue.push(partial);
      }
      return;
    }

    this.isFlushing = true;

    try {
      await invoke('update_settings', { partial });
      this.retryCount = 0;
    } catch (error) {
      console.error('[SettingsSync] Failed to update settings:', error);
      this.retryCount++;
      if (this.retryCount <= MAX_RETRY_COUNT) {
        Object.assign(this.pending, partial);
      } else {
        console.warn('[SettingsSync] Max retry count reached, discarding settings update');
        this.retryCount = 0;
      }
    } finally {
      this.isFlushing = false;
      if (this.flushQueue.length > 0) {
        const queued = this.flushQueue.reduce((acc, item) => ({ ...acc, ...item }), {});
        this.flushQueue = [];
        this.pending = queued;
        await this.flush();
      }
    }
  }
}

export const settingsSync = new SettingsSync();
