import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { AudioTrack, PlaybackState } from '@/types';
import { trackNeedsFFmpeg } from '@/types';
import { unifiedAudioPlayer } from '@/services/audio/UnifiedAudioPlayer';
import { playbackPersistence } from '@/services/persistence/playbackPersistence';

const LOAD_TIMEOUT_MS = 30000;
const LARGE_FILE_THRESHOLD_MB = 150;
const LARGE_FILE_THRESHOLD_BYTES = LARGE_FILE_THRESHOLD_MB * 1024 * 1024;

export const usePlaybackStore = defineStore('playback', () => {
  const currentTrack = ref<AudioTrack | null>(null);
  const playbackState = ref<PlaybackState>('idle');
  const volume = ref(0.5);
  const currentTime = ref(0);
  const duration = ref(0);
  const isLoading = ref(false);
  const errorMessage = ref<string | null>(null);

  const lyricsOffset = ref(0);
  const currentLyricIndex = ref(-1);

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

  async function loadTrack(track: AudioTrack, autoPlay = true, playlistId: string | null = null) {
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

        if (trackNeedsFFmpeg(track)) {
          const response = await fetch(fileUrl, { signal: AbortSignal.timeout(LOAD_TIMEOUT_MS) });
          if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.statusText}`);
          }

          const contentLength = response.headers.get('content-length');
          if (contentLength && parseInt(contentLength) > LARGE_FILE_THRESHOLD_BYTES) {
            console.warn(
              `[PlaybackStore] Large file detected (${(parseInt(contentLength) / 1024 / 1024).toFixed(1)} MB), loading may take longer`
            );
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

      audioData = undefined;

      currentTrack.value = { ...track };

      playbackPersistence.savePlaybackState(currentTrack.value.id, playlistId);
    } catch (error) {
      console.error('[PlaybackStore] Failed to load track:', error);
      errorMessage.value = '无法加载音频文件';
      playbackState.value = 'error';
      isLoading.value = false;
    }
  }

  function stop() {
    unifiedAudioPlayer.stop();
    currentTrack.value = null;
    playbackState.value = 'idle';
    currentTime.value = 0;
    duration.value = 0;
    isLoading.value = false;
    errorMessage.value = null;
  }

  function pausePlayback() {
    unifiedAudioPlayer.pause();
  }

  function seek(time: number) {
    unifiedAudioPlayer.seek(time);
    currentTime.value = time;
  }

  function setVolume(value: number) {
    const clampedValue = Math.max(0, Math.min(1, value));
    volume.value = clampedValue;
    unifiedAudioPlayer.setVolume(clampedValue);
    playbackPersistence.scheduleVolumeSave(clampedValue);
  }

  async function loadVolumeSettings() {
    const settings = await playbackPersistence.loadPlaybackSettings();
    if (!settings) return;

    if (typeof settings.volume === 'number') {
      volume.value = settings.volume;
      unifiedAudioPlayer.setVolume(settings.volume);
    }
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
    await playbackPersistence.savePlaybackState(currentTrack.value?.id || null, playlistId);
  }

  async function loadPlaybackState(): Promise<{ trackId: string | null; position: number; playlistId: string | null }> {
    return playbackPersistence.loadPlaybackState();
  }

  function waitForDuration(timeoutMs = 5000): Promise<void> {
    return new Promise((resolve) => {
      if (duration.value > 0) {
        resolve();
        return;
      }

      const unsub = unifiedAudioPlayer.onProgress((_time, dur) => {
        if (dur > 0) {
          unsub();
          resolve();
        }
      });

      setTimeout(() => {
        unsub();
        resolve();
      }, timeoutMs);
    });
  }

  return {
    currentTrack,
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
    lyricsOffset,
    currentLyricIndex,
    loadTrack,
    stop,
    pausePlayback,
    seek,
    setVolume,
    setCurrentTime,
    adjustLyricsOffset,
    resetLyricsOffset,
    setCurrentLyricIndex,
    savePlaybackState,
    loadPlaybackState,
    loadVolumeSettings,
    setOnTrackEndCallback,
    initPlayerListeners,
    destroyPlayerListeners,
    waitForDuration,
  };
});
