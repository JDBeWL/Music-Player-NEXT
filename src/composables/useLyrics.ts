import { ref, watch } from 'vue';
import { usePlayerStore } from '@/stores/playerStore';
import { LyricsParser } from '@/utils/lyricsParser';
import type { KaraokeWord } from '@/types';

interface EnhancedLyricLine {
  time: number;
  texts: string[];
  karaoke: boolean;
  words?: KaraokeWord[];
}

export function useLyrics() {
  const playerStore = usePlayerStore();
  const lyrics = ref<EnhancedLyricLine[]>([]);
  const loading = ref(false);
  const lyricsSource = ref<'local' | 'online' | null>(null);

  // 解析歌词并转换为增强格式（支持 LRC、ASS、SRT）
  const parseLyrics = async (lyricsText: string): Promise<EnhancedLyricLine[]> => {
    if (!lyricsText) return [];

    try {
      // 使用异步解析器，支持卡拉OK和双语
      const parsed = await LyricsParser.parseAsync(lyricsText, 'auto');

      // 转换为增强格式
      return parsed.map(line => {
        // 处理 texts 字段
        let texts: string[];
        if (line.texts && line.texts.length > 0) {
          // 已经有 texts 数组（来自 ASS 双语）
          texts = line.texts.filter(Boolean);
        } else if (line.text) {
          // 只有单个 text（来自 LRC 或简单 ASS）
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

  // 监听当前曲目变化，加载歌词
  watch(
    () => playerStore.currentTrack,
    async (track) => {
      if (!track) {
        lyrics.value = [];
        lyricsSource.value = null;
        return;
      }

      loading.value = true;

      try {
        if (track.lrc) {
          lyrics.value = await parseLyrics(track.lrc);
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

  // 清理函数
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

