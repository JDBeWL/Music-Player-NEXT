import { onMounted, onUnmounted } from 'vue';
import { listen } from '@tauri-apps/api/event';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { usePlaylistStore } from '@/stores/playlistStore';
import { useConfigStore } from '@/stores/configStore';
import { useNeteaseStore } from '@/stores/neteaseStore';
import { usePlayerControls } from '@/composables/usePlayerControls';
import type { Ref } from 'vue';

export function useAppInit(closeHintDialog: Ref<{ open: () => void } | null>) {
  const playbackStore = usePlaybackStore();
  const libraryStore = useLibraryStore();
  const playlistStore = usePlaylistStore();
  const configStore = useConfigStore();
  const neteaseStore = useNeteaseStore();
  const { handlePlayNext } = usePlayerControls();

  function handleSavePlaybackBeforeClose() {
    if (configStore.persistPlayback) {
      playbackStore.savePlaybackState(playbackStore.currentPlaylistId);
    }
  }

  onMounted(async () => {
    playbackStore.initPlayerListeners();
    playbackStore.setOnTrackEndCallback(handlePlayNext);

    await configStore.loadConfig();

    neteaseStore.init();

    const [loadedPlaylists] = await Promise.all([
      libraryStore.loadLibrary(),
      playbackStore.loadVolumeSettings()
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
        await playbackStore.restorePlaybackState(playlist.tracks, playlistId);
      }
    }

    if (libraryStore.libraryTracks.length > 0) {
      console.log('[App] Starting cover preload...');
      libraryStore.preloadAllCovers(playlistStore.playlists);
    }

    window.addEventListener('save-playback-before-close', handleSavePlaybackBeforeClose);

    listen('show-close-hint-dialog', () => {
      closeHintDialog.value?.open();
    });
  });

  onUnmounted(() => {
    playbackStore.destroyPlayerListeners();
    window.removeEventListener('save-playback-before-close', handleSavePlaybackBeforeClose);
  });
}
