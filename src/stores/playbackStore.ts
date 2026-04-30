import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import type { AudioTrack, PlaybackState, RepeatMode } from '@/types';
import { needsFFmpegConversion } from '@/types';
import { unifiedAudioPlayer } from '@/services/audio/UnifiedAudioPlayer';

export const usePlaybackStore = defineStore('playback', () => {
  const currentTrack = ref<AudioTrack | null>(null);
  const queue = ref<AudioTrack[]>([]);
  const currentIndex = ref(-1);
  const playbackState = ref<PlaybackState>('idle');
  const volume = ref(0.5);
  const currentTime = ref(0);
  const duration = ref(0);
  const isLoading = ref(false);
  const errorMessage = ref<string | null>(null);

  const isShuffle = ref(false);
  const repeatMode = ref<RepeatMode>('none');

  const lyricsOffset = ref(0);
  const currentLyricIndex = ref(-1);

  // 内部维护当前播放列表ID，用于保存播放状态
  const currentPlaylistId = ref<string | null>(null);

  const isPlaying = computed(() => playbackState.value === 'playing');
  const isPaused = computed(() => playbackState.value === 'paused');
  const hasTrack = computed(() => currentTrack.value !== null);
  const currentCoverUrl = computed(() => {
    const cover = currentTrack.value?.coverUrl;
    if (!cover) return undefined;
    if (cover.startsWith('data:')) return cover;
    if (cover.startsWith('http://') || cover.startsWith('https://')) return cover;
    return convertFileSrc(cover);
  });

  const progress = computed(() => {
    if (duration.value === 0) return 0;
    return (currentTime.value / duration.value) * 100;
  });

  let _unsubState: (() => void) | null = null;
  let _unsubProgress: (() => void) | null = null;
  let _unsubTrackEnd: (() => void) | null = null;
  let _initialized = false;

  let onTrackEndCallback: (() => void) | null = null;

  function setOnTrackEndCallback(cb: (() => void) | null) {
    onTrackEndCallback = cb;
  }

  function initPlayerListeners() {
    if (_initialized) return;
    _initialized = true;

    _unsubState = unifiedAudioPlayer.onStateChange((state) => {
      playbackState.value = state;
      if (state === 'playing') {
        isLoading.value = false;
      }
    });

    _unsubProgress = unifiedAudioPlayer.onProgress((time, dur) => {
      currentTime.value = time;
      duration.value = dur;
    });

    _unsubTrackEnd = unifiedAudioPlayer.onTrackEnd(() => {
      if (onTrackEndCallback) {
        onTrackEndCallback();
      } else {
        playNext();
      }
    });
  }

  function destroyPlayerListeners() {
    _unsubState?.();
    _unsubProgress?.();
    _unsubTrackEnd?.();
    _unsubState = null;
    _unsubProgress = null;
    _unsubTrackEnd = null;
    _initialized = false;
  }

  async function loadTrack(track: AudioTrack, autoPlay = true) {
    if (!track.path) return;

    isLoading.value = true;
    errorMessage.value = null;
    playbackState.value = 'loading';

    try {
      const isOnlineUrl = track.path.startsWith('http://') || track.path.startsWith('https://');

      let fileUrl: string;
      let audioData: Uint8Array | undefined;

      if (isOnlineUrl) {
        fileUrl = track.path;
      } else {
        fileUrl = convertFileSrc(track.path);

        const extension = track.format || track.path.split('.').pop()?.toLowerCase() || 'mp3';
        const needsFFmpeg = needsFFmpegConversion(extension);

        if (needsFFmpeg) {
          const response = await fetch(fileUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.statusText}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          audioData = new Uint8Array(arrayBuffer);
        }
      }

      if (autoPlay) {
        await unifiedAudioPlayer.loadAndPlay(track, fileUrl, audioData);
      } else {
        await unifiedAudioPlayer.load(track, fileUrl, audioData);
      }

      currentTrack.value = { ...track };

      savePlaybackState(currentPlaylistId.value);

      preloadNextTrack();
    } catch (error) {
      console.error('[PlaybackStore] Failed to load track:', error);
      errorMessage.value = '无法加载音频文件';
      playbackState.value = 'error';
      isLoading.value = false;
    }
  }

  async function preloadNextTrack() {
    const nextIndex = currentIndex.value + 1;
    if (nextIndex >= queue.value.length) return;

    const nextTrack = queue.value[nextIndex];
    if (!nextTrack?.path) return;

    if (nextTrack.path.startsWith('http://') || nextTrack.path.startsWith('https://')) return;

    try {
      const extension = nextTrack.format || nextTrack.path.split('.').pop()?.toLowerCase() || 'mp3';
      const needsFFmpeg = needsFFmpegConversion(extension);

      if (needsFFmpeg) {
        const fileUrl = convertFileSrc(nextTrack.path);
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        await unifiedAudioPlayer.preload(nextTrack, uint8Array);
      }
    } catch (error) {
      console.warn('[PlaybackStore] Failed to preload next track:', error);
    }
  }

  function playTrack(index: number) {
    if (index < 0 || index >= queue.value.length) return;

    currentIndex.value = index;
    loadTrack(queue.value[index]);
  }

  function playTrackFromPlaylist(playlistTracks: AudioTrack[], playlistId: string, trackId: string) {
    const trackIndex = playlistTracks.findIndex(t => t.id === trackId);
    if (trackIndex === -1) return;

    currentPlaylistId.value = playlistId;
    queue.value = [...playlistTracks];
    currentIndex.value = trackIndex;
    loadTrack(queue.value[trackIndex]);
  }

  function addToQueue(track: AudioTrack) {
    const existingIndex = queue.value.findIndex(t => t.path === track.path);
    if (existingIndex !== -1) {
      queue.value.splice(existingIndex, 1);
    }
    queue.value.push({ ...track });
  }

  function insertAndPlayNext(track: AudioTrack) {
    const existingIndex = queue.value.findIndex(t => t.path === track.path);
    if (existingIndex !== -1) {
      queue.value.splice(existingIndex, 1);
    }
    const insertIndex = currentIndex.value + 1;
    queue.value.splice(insertIndex, 0, { ...track });

    if (!currentTrack.value) {
      playTrack(0);
    }
  }

  function removeFromQueue(index: number) {
    if (index < 0 || index >= queue.value.length) return;

    queue.value.splice(index, 1);

    if (index < currentIndex.value) {
      currentIndex.value--;
    } else if (index === currentIndex.value) {
      if (queue.value.length > 0) {
        if (currentIndex.value >= queue.value.length) {
          currentIndex.value = queue.value.length - 1;
        }
        loadTrack(queue.value[currentIndex.value]);
      } else {
        currentTrack.value = null;
        currentIndex.value = -1;
        unifiedAudioPlayer.stop();
      }
    }
  }

  function clearQueue() {
    unifiedAudioPlayer.stop();
    queue.value = [];
    currentTrack.value = null;
    currentIndex.value = -1;
  }

  function togglePlay() {
    if (!currentTrack.value) {
      if (queue.value.length > 0) {
        playTrack(0);
      }
      return;
    }

    const state = unifiedAudioPlayer.getState();

    if (state === 'playing') {
      unifiedAudioPlayer.pause();
    } else if (state === 'paused' || state === 'idle') {
      unifiedAudioPlayer.play();
    }
  }

  function unpausePlayback() {
    if (!currentTrack.value) {
      if (queue.value.length > 0) {
        playTrack(0);
      }
      return;
    }
    unifiedAudioPlayer.play();
  }

  function pausePlayback() {
    unifiedAudioPlayer.pause();
  }

  function setRepeatMode(mode: RepeatMode) {
    repeatMode.value = mode;
    savePlaybackModeSettings();
  }

  function setShuffle(enabled: boolean) {
    isShuffle.value = enabled;
    savePlaybackModeSettings();
  }

  function toggleShuffle() {
    isShuffle.value = !isShuffle.value;
    savePlaybackModeSettings();
  }

  function playNext() {
    if (queue.value.length === 0) return;

    let nextIndex = currentIndex.value + 1;

    if (nextIndex >= queue.value.length) {
      nextIndex = 0;
    }

    playTrack(nextIndex);
  }

  function playPrev() {
    if (queue.value.length === 0) return;

    let prevIndex = currentIndex.value - 1;

    if (prevIndex < 0) {
      prevIndex = queue.value.length - 1;
    }

    playTrack(prevIndex);
  }

  function seek(time: number) {
    unifiedAudioPlayer.seek(time);
    currentTime.value = time;
    savePlaybackState(currentPlaylistId.value);
  }

  function setVolume(value: number) {
    const clampedValue = Math.max(0, Math.min(1, value));
    volume.value = clampedValue;
    unifiedAudioPlayer.setVolume(clampedValue);
    saveVolumeSettings(clampedValue);
  }

  let _settingsSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let _pendingSettings: Record<string, unknown> = {};

  function flushSettings() {
    if (_settingsSaveTimer !== null) {
      clearTimeout(_settingsSaveTimer);
      _settingsSaveTimer = null;
    }
    if (Object.keys(_pendingSettings).length === 0) return;

    const partial = { ..._pendingSettings };
    _pendingSettings = {};

    invoke('update_settings', { partial }).catch((error) => {
      console.error('[PlaybackStore] Failed to update settings:', error);
    });
  }

  function scheduleSettingsUpdate(updates: Record<string, unknown>) {
    Object.assign(_pendingSettings, updates);
    if (_settingsSaveTimer !== null) {
      clearTimeout(_settingsSaveTimer);
    }
    _settingsSaveTimer = setTimeout(flushSettings, 300);
  }

  async function saveVolumeSettings(vol: number) {
    scheduleSettingsUpdate({ volume: vol });
  }

  async function loadVolumeSettings() {
    try {
      const settings = await invoke<{
        volume: number;
        repeat_mode: string;
        shuffle: boolean;
      }>('get_settings');
      if (settings && typeof settings.volume === 'number') {
        volume.value = settings.volume;
        unifiedAudioPlayer.setVolume(settings.volume);
      }
      if (settings.repeat_mode) {
        repeatMode.value = settings.repeat_mode as RepeatMode;
      }
      if (typeof settings.shuffle === 'boolean') {
        isShuffle.value = settings.shuffle;
      }
    } catch (error) {
      console.error('[PlaybackStore] Failed to load volume settings:', error);
    }
  }

  async function savePlaybackModeSettings() {
    scheduleSettingsUpdate({
      repeat_mode: repeatMode.value,
      shuffle: isShuffle.value
    });
  }

  function setCurrentTime(time: number) {
    currentTime.value = time;
    unifiedAudioPlayer.seek(time);
  }

  function adjustLyricsOffset(delta: number) {
    lyricsOffset.value += delta;
  }

  function resetLyricsOffset() {
    lyricsOffset.value = 0;
  }

  function setCurrentLyricIndex(index: number) {
    currentLyricIndex.value = index;
  }

  async function savePlaybackState(playlistId: string | null = null) {
    try {
      await invoke('save_playback_state', {
        trackId: currentTrack.value?.id || null,
        playlistId
      });
    } catch (error) {
      console.error('[PlaybackStore] Failed to save playback state:', error);
    }
  }

  async function loadPlaybackState(): Promise<{ trackId: string | null; position: number; playlistId: string | null }> {
    try {
      const [trackId, position, playlistId] = await invoke<[string | null, number, string | null]>('get_playback_state');
      return { trackId, position, playlistId };
    } catch (error) {
      console.error('[PlaybackStore] Failed to load playback state:', error);
      return { trackId: null, position: 0, playlistId: null };
    }
  }

  async function restorePlaybackState(playlistTracks: AudioTrack[], playlistId: string | null) {
    const { trackId, position } = await loadPlaybackState();
    if (!trackId) return;

    if (playlistId && playlistTracks.length > 0) {
      queue.value = [...playlistTracks];
      const trackIndex = playlistTracks.findIndex(t => t.id === trackId);
      if (trackIndex !== -1) {
        currentIndex.value = trackIndex;
        await loadTrack(queue.value[trackIndex], false);

        const waitForDuration = () => {
          return new Promise<void>((resolve) => {
            const timeout = 5000;
            const startTime = Date.now();
            const check = () => {
              if (duration.value > 0) {
                resolve();
              } else if (Date.now() - startTime > timeout) {
                resolve();
              } else {
                setTimeout(check, 100);
              }
            };
            check();
          });
        };

        await waitForDuration();

        if (position > 0 && position < duration.value) {
          unifiedAudioPlayer.seek(position);
          currentTime.value = position;
        }
      }
    }
  }

  function loadPlaylistToQueue(playlistTracks: AudioTrack[], playlistId: string) {
    if (playlistTracks.length > 0) {
      currentPlaylistId.value = playlistId;
      queue.value = [...playlistTracks];
      currentIndex.value = 0;
      loadTrack(queue.value[0]);
    }
  }

  function addSelectedToQueue(selectedTracks: AudioTrack[]) {
    if (selectedTracks.length === 0) return;

    selectedTracks.forEach(track => {
      const existingIndex = queue.value.findIndex(t => t.path === track.path);
      if (existingIndex !== -1) {
        queue.value.splice(existingIndex, 1);
      }
      queue.value.push({
        ...track,
        id: `track_${Date.now()}_${Math.random()}`
      });
    });

    if (!currentTrack.value && queue.value.length > 0) {
      playTrack(0);
    }
  }

  return {
    currentTrack,
    queue,
    currentIndex,
    playbackState,
    volume,
    currentTime,
    duration,
    isLoading,
    errorMessage,
    isPlaying,
    isPaused,
    hasTrack,
    currentCoverUrl,
    progress,
    isShuffle,
    repeatMode,
    lyricsOffset,
    currentLyricIndex,
    currentPlaylistId,
    loadTrack,
    playTrack,
    playTrackFromPlaylist,
    addToQueue,
    insertAndPlayNext,
    removeFromQueue,
    clearQueue,
    togglePlay,
    unpausePlayback,
    pausePlayback,
    setRepeatMode,
    playNext,
    playPrev,
    setOnTrackEndCallback,
    initPlayerListeners,
    destroyPlayerListeners,
    seek,
    setVolume,
    setCurrentTime,
    adjustLyricsOffset,
    resetLyricsOffset,
    setCurrentLyricIndex,
    savePlaybackState,
    loadPlaybackState,
    restorePlaybackState,
    loadVolumeSettings,
    savePlaybackModeSettings,
    setShuffle,
    toggleShuffle,
    loadPlaylistToQueue,
    addSelectedToQueue,
  };
});
