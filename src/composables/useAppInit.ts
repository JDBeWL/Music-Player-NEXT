import { onMounted, onUnmounted } from 'vue';
import { listen } from '@tauri-apps/api/event';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useQueueStore } from '@/stores/queueStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { usePlaylistStore } from '@/stores/playlistStore';
import { useConfigStore } from '@/stores/configStore';
import { useNeteaseAuthStore } from '@/stores/neteaseAuthStore';
import { useNeteaseSearchStore } from '@/stores/neteaseSearchStore';
import { usePlayerControls } from '@/composables/usePlayerControls';
import { unifiedAudioPlayer } from '@/services/audio/UnifiedAudioPlayer';
import { playerEvents } from '@/services/playerEvents';
import type { Ref } from 'vue';

export function useAppInit(closeHintDialog: Ref<{ open: () => void } | null>) {
  const playbackStore = usePlaybackStore();
  const queueStore = useQueueStore();
  const libraryStore = useLibraryStore();
  const playlistStore = usePlaylistStore();
  const configStore = useConfigStore();
  const neteaseAuthStore = useNeteaseAuthStore();
  const neteaseSearchStore = useNeteaseSearchStore();
  const { handlePlayNext } = usePlayerControls();

  let unsubTrackEnd: (() => void) | null = null;

  function handleSavePlaybackBeforeClose() {
    if (configStore.persistPlayback) {
      playbackStore.savePlaybackState(queueStore.currentPlaylistId);
    }
  }

  onMounted(async () => {
    playbackStore.initPlayerListeners();
    unsubTrackEnd = playerEvents.on('track-end', handlePlayNext);

    await configStore.loadConfig();

    neteaseAuthStore.init();
    neteaseSearchStore.init();

    const [loadedPlaylists] = await Promise.all([
      libraryStore.loadLibrary(),
      Promise.all([
        playbackStore.loadVolumeSettings(),
        queueStore.loadQueueSettings(),
      ])
    ]);

    if (loadedPlaylists.length > 0) {
      playlistStore.playlists = loadedPlaylists;
    }

    playlistStore.ensureFavoritePlaylist();

    const { playlistId } = await playbackStore.loadPlaybackState();
    if (playlistId && configStore.persistPlayback) {
      const playlist = playlistStore.playlists.find(p => p.id === playlistId);
      if (playlist) {
        playlistStore.currentPlaylistId = playlistId;
        await queueStore.restorePlaybackState(playlist.tracks, playlistId);
      }
    }

    if (libraryStore.libraryTracks.length > 0) {
      const scheduleIdle = (window as any).requestIdleCallback
        ? (window as any).requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 1000);
      scheduleIdle(() => {
        console.log('[App] Starting cover preload (idle)...');
        libraryStore.preloadAllCovers(playlistStore.playlists);
      });
    }

    window.addEventListener('save-playback-before-close', handleSavePlaybackBeforeClose);

    listen('show-close-hint-dialog', () => {
      closeHintDialog.value?.open();
    });
  });

  onUnmounted(() => {
    if (unsubTrackEnd) {
      unsubTrackEnd();
      unsubTrackEnd = null;
    }
    playbackStore.destroyPlayerListeners();
    unifiedAudioPlayer.destroy();
    window.removeEventListener('save-playback-before-close', handleSavePlaybackBeforeClose);
  });
}
