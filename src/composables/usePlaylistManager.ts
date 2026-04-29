import { ref } from 'vue';
import { usePlaylistStore } from '@/stores/playlistStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { saveLibraryToBackend } from '@/services/persistence/libraryPersistence';

export function usePlaylistManager() {
  const playlistStore = usePlaylistStore();
  const playbackStore = usePlaybackStore();
  const libraryStore = useLibraryStore();

  const showPlaylistDialog = ref(false);
  const showDeleteConfirm = ref(false);
  const showCreatePrompt = ref(false);
  const pendingDeleteId = ref<string | null>(null);

  function openCreatePrompt() {
    showCreatePrompt.value = true;
  }

  async function handleCreatePlaylist(name: string) {
    playlistStore.createPlaylist(name);
    showCreatePrompt.value = false;
    await persistLibrary();
  }

  function playPlaylist(id: string) {
    const playlist = playlistStore.playlists.find(p => p.id === id);
    if (playlist) {
      playbackStore.loadPlaylistToQueue(playlist.tracks, id);
    }
  }

  function playTrackFromPlaylist(playlistId: string, trackId: string) {
    const playlist = playlistStore.playlists.find(p => p.id === playlistId);
    if (playlist) {
      playbackStore.playTrackFromPlaylist(playlist.tracks, playlistId, trackId);
      playlistStore.currentPlaylistId = playlistId;
    }
  }

  async function updatePlaylistDescription(description: string) {
    const currentPlaylistId = playlistStore.currentPlaylistId;
    if (!currentPlaylistId) return;
    playlistStore.updatePlaylistDescription(currentPlaylistId, description);
    await persistLibrary();
  }

  async function removeTrackFromPlaylist(trackId: string) {
    const currentPlaylistId = playlistStore.currentPlaylistId;
    if (!currentPlaylistId) return;
    playlistStore.removeFromPlaylist(currentPlaylistId, trackId);
    await persistLibrary();
  }

  async function reorderTracksInPlaylist(fromIndex: number, toIndex: number) {
    const currentPlaylistId = playlistStore.currentPlaylistId;
    if (!currentPlaylistId) return;
    playlistStore.reorderPlaylistTracks(currentPlaylistId, fromIndex, toIndex);
    await persistLibrary();
  }

  function requestDeletePlaylist(playlistId: string) {
    pendingDeleteId.value = playlistId;
    showDeleteConfirm.value = true;
  }

  async function confirmDeletePlaylist(closePlaylistDetail: () => void) {
    const playlistIdToDelete = pendingDeleteId.value;
    showDeleteConfirm.value = false;
    pendingDeleteId.value = null;

    if (playlistIdToDelete) {
      if (playlistStore.currentPlaylistId === playlistIdToDelete) {
        closePlaylistDetail();
      }
      playlistStore.deletePlaylist(playlistIdToDelete);
      await persistLibrary();
    }
  }

  function cancelDeletePlaylist() {
    pendingDeleteId.value = null;
    showDeleteConfirm.value = false;
  }

  function addSelectedToPlaylist() {
    showPlaylistDialog.value = true;
  }

  async function handleAddToPlaylist(playlistId: string) {
    playlistStore.addSelectedToPlaylist(playlistId, libraryStore.selectedFilesArray);
    libraryStore.deselectAllFiles();
    libraryStore.isLocalBrowserOpen = false;
    showPlaylistDialog.value = false;
    await persistLibrary();
  }

  async function persistLibrary() {
    try {
      await saveLibraryToBackend(
        libraryStore.libraryFolders,
        playlistStore.playlists,
        libraryStore.libraryTracks,
        libraryStore.scanDepth
      );
    } catch (error) {
      console.error('[usePlaylistManager] Failed to persist library:', error);
    }
  }

  return {
    showPlaylistDialog,
    showDeleteConfirm,
    showCreatePrompt,
    pendingDeleteId,
    openCreatePrompt,
    handleCreatePlaylist,
    playPlaylist,
    playTrackFromPlaylist,
    updatePlaylistDescription,
    removeTrackFromPlaylist,
    reorderTracksInPlaylist,
    requestDeletePlaylist,
    confirmDeletePlaylist,
    cancelDeletePlaylist,
    addSelectedToPlaylist,
    handleAddToPlaylist,
  };
}
