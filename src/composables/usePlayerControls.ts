import { computed } from 'vue';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useQueueStore } from '@/stores/queueStore';
import { usePlaylistStore } from '@/stores/playlistStore';
import { useTrackActions } from '@/composables/useTrackActions';
import type { AudioTrack } from '@/types';

export function usePlayerControls() {
  const playbackStore = usePlaybackStore();
  const queueStore = useQueueStore();
  const playlistStore = usePlaylistStore();
  const { toggleFavorite: toggleFavoriteAction } = useTrackActions();

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
    queueStore.playNext();
  }

  async function toggleFavorite() {
    if (!playbackStore.currentTrack) return;
    await toggleFavoriteAction(playbackStore.currentTrack);
  }

  async function toggleTrackFavorite(track: AudioTrack) {
    await toggleFavoriteAction(track);
  }

  function playSearchAsNext(track: AudioTrack) {
    queueStore.insertAndPlayNext(track);
  }

  return {
    isCurrentTrackFavorite,
    playbackStatusLabel,
    favoriteTrackPaths,
    handlePlayNext,
    toggleFavorite,
    toggleTrackFavorite,
    playSearchAsNext,
  };
}
