import { defineStore } from 'pinia';
import { ref } from 'vue';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { AudioTrack, RepeatMode } from '@/types';
import { trackNeedsFFmpeg } from '@/types';
import { unifiedAudioPlayer } from '@/services/audio/UnifiedAudioPlayer';
import { playbackPersistence } from '@/services/persistence/playbackPersistence';
import { usePlaybackStore } from './playbackStore';

const MAX_SHUFFLE_HISTORY = 200;
const LOAD_TIMEOUT_MS = 30000;
const PRELOAD_DELAY_MS = 2000;

export const useQueueStore = defineStore('queue', () => {
  const queue = ref<AudioTrack[]>([]);
  const currentIndex = ref(-1);
  const isShuffle = ref(false);
  const repeatMode = ref<RepeatMode>('none');
  const shuffledOrder = ref<number[]>([]);
  const shuffleHistory = ref<number[]>([]);
  const shuffleHistoryIndex = ref(-1);
  const currentPlaylistId = ref<string | null>(null);

  let preloadTimer: ReturnType<typeof setTimeout> | null = null;

  function generateShuffledOrder() {
    const len = queue.value.length;
    if (len === 0) return;

    const order = Array.from({ length: len }, (_, i) => i);
    for (let i = len - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    if (len > 1 && currentIndex.value !== -1 && order[0] === currentIndex.value) {
      const swapWith = Math.floor(Math.random() * (len - 1)) + 1;
      [order[0], order[swapWith]] = [order[swapWith], order[0]];
    }

    shuffledOrder.value = order;
    shuffleHistory.value = [];
    shuffleHistoryIndex.value = -1;
  }

  function playTrack(index: number) {
    if (index < 0 || index >= queue.value.length) return;

    const playbackStore = usePlaybackStore();
    currentIndex.value = index;
    playbackStore.loadTrack(queue.value[index], true, currentPlaylistId.value);

    if (isShuffle.value) {
      if (shuffleHistoryIndex.value === -1 || shuffleHistory.value[shuffleHistoryIndex.value] !== index) {
        shuffleHistory.value = shuffleHistory.value.slice(0, shuffleHistoryIndex.value + 1);
        shuffleHistory.value.push(index);
        shuffleHistoryIndex.value++;
        if (shuffleHistory.value.length > MAX_SHUFFLE_HISTORY) {
          const excess = shuffleHistory.value.length - MAX_SHUFFLE_HISTORY;
          shuffleHistory.value.splice(0, excess);
          shuffleHistoryIndex.value -= excess;
        }
      }
    }

    schedulePreloadNextTrack();
  }

  function playTrackFromPlaylist(playlistTracks: AudioTrack[], playlistId: string, trackId: string) {
    const trackIndex = playlistTracks.findIndex(t => t.id === trackId);
    if (trackIndex === -1) return;

    currentPlaylistId.value = playlistId;
    queue.value = [...playlistTracks];
    currentIndex.value = trackIndex;

    const playbackStore = usePlaybackStore();
    playbackStore.loadTrack(queue.value[trackIndex], true, playlistId);

    schedulePreloadNextTrack();
  }

  function addToQueue(track: AudioTrack) {
    const existingIndex = queue.value.findIndex(t => t.path === track.path);
    if (existingIndex !== -1) {
      queue.value.splice(existingIndex, 1);
    }
    queue.value.push({ ...track });
  }

  function insertAndPlayNext(track: AudioTrack) {
    const playbackStore = usePlaybackStore();
    const existingIndex = queue.value.findIndex(t => t.path === track.path);
    if (existingIndex !== -1) {
      queue.value.splice(existingIndex, 1);
    }
    const insertIdx = currentIndex.value + 1;
    queue.value.splice(insertIdx, 0, { ...track });

    if (!playbackStore.currentTrack) {
      playTrack(0);
    }
  }

  function removeFromQueue(index: number) {
    if (index < 0 || index >= queue.value.length) return;

    const playbackStore = usePlaybackStore();
    queue.value.splice(index, 1);

    if (index < currentIndex.value) {
      currentIndex.value--;
    } else if (index === currentIndex.value) {
      if (queue.value.length > 0) {
        if (currentIndex.value >= queue.value.length) {
          currentIndex.value = queue.value.length - 1;
        }
        playbackStore.loadTrack(queue.value[currentIndex.value], true, currentPlaylistId.value);
      } else {
        playbackStore.stop();
        currentIndex.value = -1;
      }
    }
  }

  function clearQueue() {
    if (preloadTimer) {
      clearTimeout(preloadTimer);
      preloadTimer = null;
    }
    const playbackStore = usePlaybackStore();
    playbackStore.stop();
    queue.value = [];
    currentIndex.value = -1;
  }

  function setRepeatMode(mode: RepeatMode) {
    repeatMode.value = mode;
    savePlaybackModeSettings();
  }

  function setShuffle(enabled: boolean) {
    isShuffle.value = enabled;
    if (enabled) {
      generateShuffledOrder();
    } else {
      shuffledOrder.value = [];
      shuffleHistory.value = [];
      shuffleHistoryIndex.value = -1;
    }
    savePlaybackModeSettings();
  }

  function cycleRepeatMode() {
    const modes: Array<RepeatMode> = ['all', 'one', 'none'];
    const currentIdx = modes.indexOf(repeatMode.value);
    setRepeatMode(modes[(currentIdx + 1) % modes.length]);
  }

  function toggleShuffle() {
    isShuffle.value = !isShuffle.value;
    if (isShuffle.value) {
      generateShuffledOrder();
    } else {
      shuffledOrder.value = [];
      shuffleHistory.value = [];
      shuffleHistoryIndex.value = -1;
    }
    savePlaybackModeSettings();
  }

  function playNext() {
    if (queue.value.length === 0) return;

    if (repeatMode.value === 'one') {
      playTrack(currentIndex.value);
      return;
    }

    if (isShuffle.value) {
      if (shuffledOrder.value.length === 0) {
        generateShuffledOrder();
      }

      const currentPosInShuffle = shuffledOrder.value.indexOf(currentIndex.value);
      let nextPos = currentPosInShuffle + 1;

      if (nextPos >= shuffledOrder.value.length) {
        if (repeatMode.value === 'none') return;
        generateShuffledOrder();
        nextPos = 0;
      }

      const nextIdx = shuffledOrder.value[nextPos];
      playTrack(nextIdx);
      return;
    }

    let nextIdx = currentIndex.value + 1;

    if (nextIdx >= queue.value.length) {
      if (repeatMode.value === 'none') return;
      nextIdx = 0;
    }

    playTrack(nextIdx);
  }

  function playPrev() {
    if (queue.value.length === 0) return;

    const playbackStore = usePlaybackStore();

    if (isShuffle.value) {
      if (shuffleHistoryIndex.value > 0) {
        shuffleHistoryIndex.value--;
        const prevIdx = shuffleHistory.value[shuffleHistoryIndex.value];
        currentIndex.value = prevIdx;
        playbackStore.loadTrack(queue.value[prevIdx], true, currentPlaylistId.value);
      } else if (shuffleHistory.value.length > 0) {
        const prevIdx = shuffleHistory.value[0];
        currentIndex.value = prevIdx;
        playbackStore.loadTrack(queue.value[prevIdx], true, currentPlaylistId.value);
      }
      return;
    }

    let prevIdx = currentIndex.value - 1;

    if (prevIdx < 0) {
      if (repeatMode.value === 'none') {
        prevIdx = 0;
      } else {
        prevIdx = queue.value.length - 1;
      }
    }

    playTrack(prevIdx);
  }

  function togglePlay() {
    const playbackStore = usePlaybackStore();

    if (!playbackStore.currentTrack) {
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
    const playbackStore = usePlaybackStore();

    if (!playbackStore.currentTrack) {
      if (queue.value.length > 0) {
        playTrack(0);
      }
      return;
    }
    unifiedAudioPlayer.play();
  }

  function loadPlaylistToQueue(playlistTracks: AudioTrack[], playlistId: string) {
    if (playlistTracks.length > 0) {
      currentPlaylistId.value = playlistId;
      queue.value = [...playlistTracks];
      currentIndex.value = 0;

      const playbackStore = usePlaybackStore();
      playbackStore.loadTrack(queue.value[0], true, playlistId);

      schedulePreloadNextTrack();
    }
  }

  function addSelectedToQueue(selectedTracks: AudioTrack[]) {
    if (selectedTracks.length === 0) return;

    const playbackStore = usePlaybackStore();
    const baseId = Date.now();
    selectedTracks.forEach((track, index) => {
      const existingIndex = queue.value.findIndex(t => t.path === track.path);
      if (existingIndex !== -1) {
        queue.value.splice(existingIndex, 1);
      }
      queue.value.push({
        ...track,
        id: `track_${baseId}_${index}`
      });
    });

    if (!playbackStore.currentTrack && queue.value.length > 0) {
      playTrack(0);
    }
  }

  function schedulePreloadNextTrack() {
    if (preloadTimer) {
      clearTimeout(preloadTimer);
      preloadTimer = null;
    }
    preloadTimer = setTimeout(() => {
      preloadNextTrack();
      preloadTimer = null;
    }, PRELOAD_DELAY_MS);
  }

  async function preloadNextTrack() {
    const nextIdx = currentIndex.value + 1;
    if (nextIdx >= queue.value.length) return;

    const nextTrack = queue.value[nextIdx];
    if (!nextTrack?.path) return;

    if (nextTrack.path.startsWith('http://') || nextTrack.path.startsWith('https://')) return;

    try {
      if (trackNeedsFFmpeg(nextTrack)) {
        const fileUrl = convertFileSrc(nextTrack.path);
        const response = await fetch(fileUrl, { signal: AbortSignal.timeout(LOAD_TIMEOUT_MS) });
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.statusText}`);
        }
        {
          const arrayBuffer = await response.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          await unifiedAudioPlayer.preload(nextTrack, uint8Array);
        }
      } else {
        const fileUrl = convertFileSrc(nextTrack.path);
        unifiedAudioPlayer.preloadNative(nextTrack, fileUrl);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        console.warn('[QueueStore] Preload timed out for:', nextTrack.title);
      } else {
        console.warn('[QueueStore] Failed to preload next track:', error);
      }
    }
  }

  async function restorePlaybackState(playlistTracks: AudioTrack[], playlistId: string | null) {
    const playbackStore = usePlaybackStore();
    const { trackId, position } = await playbackPersistence.loadPlaybackState();
    if (!trackId) return;

    if (playlistId && playlistTracks.length > 0) {
      queue.value = [...playlistTracks];
      const trackIndex = playlistTracks.findIndex(t => t.id === trackId);
      if (trackIndex !== -1) {
        currentIndex.value = trackIndex;
        await playbackStore.loadTrack(queue.value[trackIndex], false, playlistId);

        await playbackStore.waitForDuration();

        if (position > 0 && position < playbackStore.duration) {
          unifiedAudioPlayer.seek(position);
          playbackStore.currentTime = position;
        }
      }
    }
  }

  async function loadQueueSettings() {
    const settings = await playbackPersistence.loadPlaybackSettings();
    if (!settings) return;

    if (settings.repeat_mode) {
      repeatMode.value = settings.repeat_mode as RepeatMode;
    }
    if (typeof settings.shuffle === 'boolean') {
      isShuffle.value = settings.shuffle;
      if (isShuffle.value) {
        generateShuffledOrder();
      }
    }
  }

  function savePlaybackModeSettings() {
    playbackPersistence.schedulePlaybackModeSave(repeatMode.value, isShuffle.value);
  }

  return {
    queue,
    currentIndex,
    isShuffle,
    repeatMode,
    shuffledOrder,
    shuffleHistory,
    shuffleHistoryIndex,
    currentPlaylistId,
    playTrack,
    playTrackFromPlaylist,
    addToQueue,
    insertAndPlayNext,
    removeFromQueue,
    clearQueue,
    togglePlay,
    unpausePlayback,
    setRepeatMode,
    cycleRepeatMode,
    setShuffle,
    toggleShuffle,
    playNext,
    playPrev,
    loadPlaylistToQueue,
    addSelectedToQueue,
    generateShuffledOrder,
    restorePlaybackState,
    loadQueueSettings,
    savePlaybackModeSettings,
  };
});
