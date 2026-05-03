import { watch } from 'vue';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useQueueStore } from '@/stores/queueStore';
import { getCoverUrl } from '@/utils/coverUrl';

export function useMediaSession() {
  const playbackStore = usePlaybackStore();
  const queueStore = useQueueStore();

  function updateMetadata() {
    if (!('mediaSession' in navigator)) return;

    const track = playbackStore.currentTrack;
    if (!track) {
      navigator.mediaSession.metadata = null;
      return;
    }

    const artworkUrl = getCoverUrl(playbackStore.currentCoverUrl);

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album || '',
      artwork: artworkUrl ? [{ src: artworkUrl, sizes: '512x512', type: 'image/jpeg' }] : [],
    });
  }

  function setupActionHandlers() {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => {
      queueStore.togglePlay();
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      queueStore.togglePlay();
    });

    navigator.mediaSession.setActionHandler('previoustrack', () => {
      queueStore.playPrev();
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      queueStore.playNext();
    });

    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        playbackStore.setCurrentTime(details.seekTime);
      }
    });
  }

  function updatePlaybackState() {
    if (!('mediaSession' in navigator)) return;
    if (!('playbackState' in navigator.mediaSession)) return;

    if (playbackStore.isPlaying) {
      navigator.mediaSession.playbackState = 'playing';
    } else if (playbackStore.playbackState === 'paused') {
      navigator.mediaSession.playbackState = 'paused';
    } else {
      navigator.mediaSession.playbackState = 'none';
    }
  }

  setupActionHandlers();

  watch(() => playbackStore.currentTrack, updateMetadata, { immediate: true });
  watch(() => playbackStore.currentCoverUrl, updateMetadata);
  watch(() => playbackStore.isPlaying, updatePlaybackState);
  watch(() => playbackStore.playbackState, updatePlaybackState);
}
