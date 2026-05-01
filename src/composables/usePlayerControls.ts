import { computed } from 'vue';
import { usePlaybackStore } from '@/stores/playbackStore';
import { usePlaylistStore } from '@/stores/playlistStore';
import { useLibraryStore } from '@/stores/libraryStore';
import type { AudioTrack, RepeatMode } from '@/types';

export function usePlayerControls() {
  const playbackStore = usePlaybackStore();
  const playlistStore = usePlaylistStore();
  const libraryStore = useLibraryStore();

  const isCurrentTrackFavorite = computed(() => {
    if (!playbackStore.currentTrack) return false;
    return playlistStore.isTrackFavorite(playbackStore.currentTrack.path);
  });

  const playbackStatusLabel = computed(() => {
    if (!playbackStore.currentTrack) return '';
    const status = playbackStore.isPlaying ? '正在播放' : '已暂停';
    return `${status}：${playbackStore.currentTrack.title}，艺术家：${playbackStore.currentTrack.artist}`;
  });

  const favoriteTrackPaths = computed(() => {
    return playlistStore.favoritePlaylist?.tracks.map(t => t.path) ?? [];
  });

  function handlePlayNext() {
    const queue = playbackStore.queue;
    if (queue.length === 0) return;

    if (playbackStore.isShuffle) {
      const currentIdx = playbackStore.currentIndex;
      if (queue.length === 1) return;
      let randomIndex;
      do {
        randomIndex = Math.floor(Math.random() * queue.length);
      } while (randomIndex === currentIdx);
      playbackStore.playTrack(randomIndex);
      return;
    }

    if (playbackStore.repeatMode === 'one') {
      playbackStore.playTrack(playbackStore.currentIndex);
      return;
    }

    const nextIndex = playbackStore.currentIndex + 1;
    if (nextIndex >= queue.length) {
      if (playbackStore.repeatMode === 'all') {
        playbackStore.playTrack(0);
      }
      return;
    }

    playbackStore.playTrack(nextIndex);
  }

  function cycleRepeatMode() {
    const modes: Array<RepeatMode> = ['all', 'one', 'none'];
    const currentIdx = modes.indexOf(playbackStore.repeatMode);
    playbackStore.repeatMode = modes[(currentIdx + 1) % modes.length];
    playbackStore.savePlaybackModeSettings();
  }

  function toggleShuffle() {
    playbackStore.isShuffle = !playbackStore.isShuffle;
    playbackStore.savePlaybackModeSettings();
  }

  async function toggleFavorite() {
    if (!playbackStore.currentTrack) return;
    playlistStore.toggleFavorite(playbackStore.currentTrack);
    await libraryStore.persistLibrary();
  }

  async function toggleTrackFavorite(track: AudioTrack) {
    playlistStore.toggleFavorite(track);
    await libraryStore.persistLibrary();
  }

  function playSearchAsNext(track: AudioTrack) {
    playbackStore.insertAndPlayNext(track);
  }

  return {
    isCurrentTrackFavorite,
    playbackStatusLabel,
    favoriteTrackPaths,
    handlePlayNext,
    cycleRepeatMode,
    toggleShuffle,
    toggleFavorite,
    toggleTrackFavorite,
    playSearchAsNext,
  };
}
