import { computed } from 'vue';
import { usePlaylistStore } from '@/stores/playlistStore';
import { useQueueStore } from '@/stores/queueStore';
import { useLibraryStore } from '@/stores/libraryStore';
import type { AudioTrack } from '@/types';

export function useTrackActions() {
  const playlistStore = usePlaylistStore();
  const queueStore = useQueueStore();
  const libraryStore = useLibraryStore();

  const favoritePaths = computed(() => playlistStore.favoritePaths);

  function isTrackFavorite(trackPath: string): boolean {
    return favoritePaths.value.has(trackPath);
  }

  async function toggleFavorite(track: AudioTrack) {
    playlistStore.toggleFavorite(track);
    await libraryStore.persistLibrary(playlistStore.playlists);
  }

  function addTrackToQueue(track: AudioTrack) {
    queueStore.addToQueue(track);
  }

  function playTrack(track: AudioTrack) {
    queueStore.clearQueue();
    queueStore.addToQueue(track);
    queueStore.playTrack(0);
  }

  return {
    favoritePaths,
    isTrackFavorite,
    toggleFavorite,
    addTrackToQueue,
    playTrack,
  };
}
