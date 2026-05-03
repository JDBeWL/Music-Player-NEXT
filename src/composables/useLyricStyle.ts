import { type Ref } from 'vue';
import { useConfigStore } from '@/stores/configStore';
import type { EnhancedLyricLine } from '@/types';

const STYLE_INVALIDATION_RANGE = 8;

export function useLyricStyle(
  activeIndex: Ref<number>,
  lyrics: Ref<EnhancedLyricLine[]>
) {
  const configStore = useConfigStore();

  const lyricStyleCache = new Map<number, Record<string, string | number>>();
  let cachedActiveIndex = -1;
  let cachedLyricsLength = 0;

  const getLyricLineStyle = (index: number) => {
    const lyricsLen = lyrics.value.length;
    const currentActive = activeIndex.value;

    if (cachedLyricsLength !== lyricsLen) {
      lyricStyleCache.clear();
      cachedLyricsLength = lyricsLen;
      cachedActiveIndex = currentActive;
    } else if (cachedActiveIndex !== currentActive) {
      const oldActive = cachedActiveIndex;
      const newActive = currentActive;
      const lo = Math.max(0, Math.min(oldActive, newActive) - STYLE_INVALIDATION_RANGE);
      const hi = Math.min(lyricsLen - 1, Math.max(oldActive, newActive) + STYLE_INVALIDATION_RANGE);
      for (let i = lo; i <= hi; i++) {
        lyricStyleCache.delete(i);
      }
      cachedActiveIndex = currentActive;
    }

    const cached = lyricStyleCache.get(index);
    if (cached) return cached;

    const distance = Math.abs(index - currentActive);
    const isModern = (configStore.lyricsDisplayMode || 'modern') === 'modern';
    let style: Record<string, string | number>;

    if (isModern) {
      const blurEnabled = configStore.enableLyricsBlur;
      let blur: number;
      let opacity: number;
      let scale: number;

      if (distance === 0) {
        blur = 0;
        opacity = 1;
        scale = 1;
      } else if (blurEnabled) {
        blur = Math.min(8, distance * 1.8);
        opacity = Math.max(0.25, 1 - distance * 0.13);
        scale = Math.max(0.88, 1 - distance * 0.02);
      } else {
        blur = 0;
        opacity = Math.max(0.45, 1 - distance * 0.08);
        scale = Math.max(0.92, 1 - distance * 0.012);
      }

      style = {
        '--align-origin': 'center center',
        '--lyric-blur': `${blur}px`,
        '--lyric-opacity': opacity,
        '--lyric-scale': scale,
        textAlign: 'center',
        fontFamily: 'inherit',
        filter: `blur(var(--lyric-blur))`,
        opacity: 'var(--lyric-opacity)',
        transform: `scale(var(--lyric-scale))`,
        color: distance === 0 ? 'var(--color-primary)' : 'var(--text-tertiary)',
      };
    } else {
      if (distance === 0) {
        style = {
          '--align-origin': 'center center',
          textAlign: 'center',
          fontFamily: 'inherit',
          color: 'var(--color-primary)',
        };
      } else {
        const opacity = distance <= 1 ? 0.6 : Math.max(0.35, 0.6 - (distance - 1) * 0.08);
        style = {
          '--align-origin': 'center center',
          '--lyric-opacity': opacity,
          textAlign: 'center',
          fontFamily: 'inherit',
          opacity: 'var(--lyric-opacity)',
          color: 'var(--text-tertiary)',
        };
      }
    }

    lyricStyleCache.set(index, style);
    return style;
  };

  return {
    getLyricLineStyle,
  };
}
