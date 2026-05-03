import { invoke } from '@tauri-apps/api/core';
import { settingsSync } from '@/services/settingsSync';
import type { RepeatMode } from '@/types';

interface PlaybackStateData {
  trackId: string | null;
  position: number;
  playlistId: string | null;
}

interface PlaybackSettings {
  volume: number;
  repeat_mode: string;
  shuffle: boolean;
}

async function savePlaybackState(trackId: string | null, playlistId: string | null): Promise<void> {
  try {
    await invoke('save_playback_state', {
      trackId,
      playlistId
    });
  } catch (error) {
    console.error('[PlaybackPersistence] Failed to save playback state:', error);
  }
}

async function loadPlaybackState(): Promise<PlaybackStateData> {
  try {
    const [trackId, position, playlistId] = await invoke<[string | null, number, string | null]>('get_playback_state');
    return { trackId, position, playlistId };
  } catch (error) {
    console.error('[PlaybackPersistence] Failed to load playback state:', error);
    return { trackId: null, position: 0, playlistId: null };
  }
}

async function loadPlaybackSettings(): Promise<PlaybackSettings | null> {
  try {
    const settings = await invoke<Record<string, unknown>>('get_settings');
    return {
      volume: typeof settings.volume === 'number' ? settings.volume : 0.5,
      repeat_mode: typeof settings.repeat_mode === 'string' ? settings.repeat_mode : 'none',
      shuffle: typeof settings.shuffle === 'boolean' ? settings.shuffle : false,
    };
  } catch (error) {
    console.error('[PlaybackPersistence] Failed to load playback settings:', error);
    return null;
  }
}

function scheduleVolumeSave(vol: number): void {
  settingsSync.schedule({ volume: vol });
}

function schedulePlaybackModeSave(repeatMode: RepeatMode, shuffle: boolean): void {
  settingsSync.schedule({
    repeat_mode: repeatMode,
    shuffle
  });
}

export const playbackPersistence = {
  savePlaybackState,
  loadPlaybackState,
  loadPlaybackSettings,
  scheduleVolumeSave,
  schedulePlaybackModeSave,
};

export type { PlaybackStateData, PlaybackSettings };
