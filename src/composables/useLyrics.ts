import { ref, watch } from 'vue';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { LyricsParser } from '@/utils/lyricsParser';
import type { KaraokeWord } from '@/types';

interface EnhancedLyricLine {
  time: number;
  texts: string[];
  karaoke: boolean;
  words?: KaraokeWord[];
}

export function useLyrics() {
  const playbackStore = usePlaybackStore();
  const libraryStore = useLibraryStore();
  const lyrics = ref<EnhancedLyricLine[]>([]);
  const loading = ref(false);
  const lyricsSource = ref<'local' | 'online' | null>(null);

  const parseLyrics = async (lyricsText: string): Promise<EnhancedLyricLine[]> => {
    if (!lyricsText) return [];

    try {
      const parsed = await LyricsParser.parseAsync(lyricsText, 'auto');

      return parsed.map(line => {
        let texts: string[];
        if (line.texts && line.texts.length > 0) {
          texts = line.texts.filter(Boolean);
        } else if (line.text) {
          texts = [line.text];
        } else {
          texts = [''];
        }

        return {
          time: line.time,
          texts,
          karaoke: !!line.words && line.words.length > 0,
          words: line.words
        };
      });
    } catch (error) {
      console.error('[useLyrics] Failed to parse lyrics:', error);
      return [];
    }
  };

  watch(
    () => playbackStore.currentTrack,
    async (track) => {
      if (!track) {
        lyrics.value = [];
        lyricsSource.value = null;
        return;
      }

      loading.value = true;

      try {
        let lrcText = track.lrc;

        if (!lrcText && !track.id.startsWith('netease_')) {
          lrcText = await libraryStore.loadLyrics(track) ?? undefined;
        }

        if (lrcText) {
          lyrics.value = await parseLyrics(lrcText);
          lyricsSource.value = 'local';
        } else {
          lyrics.value = [];
          lyricsSource.value = null;
        }
      } catch (error) {
        console.error('Failed to parse lyrics:', error);
        lyrics.value = [];
        lyricsSource.value = null;
      } finally {
        loading.value = false;
      }
    },
    { immediate: true }
  );

  const cleanup = () => {
    lyrics.value = [];
    lyricsSource.value = null;
  };

  return {
    lyrics,
    loading,
    lyricsSource,
    cleanup
  };
}

