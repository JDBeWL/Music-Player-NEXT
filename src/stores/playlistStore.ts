import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { AudioTrack, Playlist } from '@/types';

const FAVORITE_PLAYLIST_ID = 'favorite_playlist';

export const usePlaylistStore = defineStore('playlist', () => {
  const playlists = ref<Playlist[]>([]);
  const currentPlaylistId = ref<string | null>(null);

  const currentPlaylist = computed(() => {
    return playlists.value.find(p => p.id === currentPlaylistId.value) || null;
  });

  const favoritePlaylist = computed(() => {
    return playlists.value.find(p => p.id === FAVORITE_PLAYLIST_ID) || null;
  });

  function ensureFavoritePlaylist() {
    const existing = playlists.value.find(p => p.id === FAVORITE_PLAYLIST_ID);
    if (!existing) {
      const favoritePlaylist: Playlist = {
        id: FAVORITE_PLAYLIST_ID,
        name: '我喜欢的音乐',
        tracks: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      playlists.value.unshift(favoritePlaylist);
    }
  }

  function createPlaylist(name: string): Playlist {
    const playlist: Playlist = {
      id: `playlist_${Date.now()}`,
      name,
      tracks: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    playlists.value.push(playlist);
    return playlist;
  }

  function deletePlaylist(id: string) {
    if (id === FAVORITE_PLAYLIST_ID) {
      console.warn('[PlaylistStore] Cannot delete favorite playlist');
      return;
    }

    const index = playlists.value.findIndex(p => p.id === id);
    if (index !== -1) {
      playlists.value.splice(index, 1);
      if (currentPlaylistId.value === id) {
        currentPlaylistId.value = null;
      }
    }
  }

  function renamePlaylist(id: string, newName: string) {
    const playlist = playlists.value.find(p => p.id === id);
    if (playlist) {
      playlist.name = newName;
      playlist.updatedAt = Date.now();
    }
  }

  function updatePlaylistDescription(id: string, description: string) {
    const playlist = playlists.value.find(p => p.id === id);
    if (playlist) {
      playlist.description = description;
      playlist.updatedAt = Date.now();
    }
  }

  function addToPlaylist(playlistId: string, track: AudioTrack) {
    const playlist = playlists.value.find(p => p.id === playlistId);
    if (playlist) {
      const existingIndex = playlist.tracks.findIndex(t => t.path === track.path);
      if (existingIndex !== -1) {
        playlist.tracks.splice(existingIndex, 1);
      }
      playlist.tracks.push(track);
      playlist.updatedAt = Date.now();
    }
  }

  function removeFromPlaylist(playlistId: string, trackId: string) {
    const playlist = playlists.value.find(p => p.id === playlistId);
    if (playlist) {
      const index = playlist.tracks.findIndex(t => t.id === trackId);
      if (index !== -1) {
        playlist.tracks.splice(index, 1);
        playlist.updatedAt = Date.now();
      }
    }
  }

  function reorderPlaylistTracks(playlistId: string, fromIndex: number, toIndex: number) {
    const playlist = playlists.value.find(p => p.id === playlistId);
    if (playlist && fromIndex !== toIndex) {
      const [removed] = playlist.tracks.splice(fromIndex, 1);
      playlist.tracks.splice(toIndex, 0, removed);
      playlist.updatedAt = Date.now();
    }
  }

  function addSelectedToPlaylist(playlistId: string, selectedTracks: AudioTrack[]) {
    const playlist = playlists.value.find(p => p.id === playlistId);
    if (!playlist) {
      console.error('[PlaylistStore] Playlist not found:', playlistId);
      return;
    }

    console.log('[PlaylistStore] Adding', selectedTracks.length, 'tracks to playlist:', playlist.name);

    selectedTracks.forEach(track => {
      const existingIndex = playlist.tracks.findIndex(t => t.path === track.path);
      if (existingIndex !== -1) {
        playlist.tracks.splice(existingIndex, 1);
      }
      playlist.tracks.push(track);
    });

    playlist.updatedAt = Date.now();
    console.log('[PlaylistStore] Playlist now has', playlist.tracks.length, 'tracks');
  }

  function isTrackFavorite(trackPath: string): boolean {
    const favoritePlaylist = playlists.value.find(p => p.id === FAVORITE_PLAYLIST_ID);
    if (!favoritePlaylist) return false;
    return favoritePlaylist.tracks.some(t => t.path === trackPath);
  }

  function toggleFavorite(track: AudioTrack) {
    const favoritePlaylist = playlists.value.find(p => p.id === FAVORITE_PLAYLIST_ID);
    if (!favoritePlaylist) {
      console.error('[PlaylistStore] Favorite playlist not found');
      return;
    }

    const existingIndex = favoritePlaylist.tracks.findIndex(t => t.path === track.path);

    if (existingIndex !== -1) {
      favoritePlaylist.tracks.splice(existingIndex, 1);
    } else {
      favoritePlaylist.tracks.push(track);
    }

    favoritePlaylist.updatedAt = Date.now();
  }

  return {
    playlists,
    currentPlaylistId,
    currentPlaylist,
    favoritePlaylist,
    ensureFavoritePlaylist,
    createPlaylist,
    deletePlaylist,
    renamePlaylist,
    updatePlaylistDescription,
    addToPlaylist,
    removeFromPlaylist,
    reorderPlaylistTracks,
    addSelectedToPlaylist,
    isTrackFavorite,
    toggleFavorite,
  };
});
