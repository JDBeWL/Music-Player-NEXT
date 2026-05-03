import { ref, watch, type Ref } from 'vue';
import { usePlaybackStore } from '@/stores/playbackStore';
import type { EnhancedLyricLine } from '@/types';

const CALC_INTERVAL = 50;
const KARAOKE_CALC_INTERVAL = 80;

export function useLyricActiveIndex(
  visualTime: Ref<number>,
  lyrics: Ref<EnhancedLyricLine[]>
) {
  const playbackStore = usePlaybackStore();
  const activeIndex = ref(-1);
  const isTrackChanging = ref(false);
  let lastCalcTime = 0;

  watch(
    () => playbackStore.currentTrack?.path,
    () => {
      isTrackChanging.value = true;
      activeIndex.value = -1;
      setTimeout(() => {
        isTrackChanging.value = false;
      }, 1000);
    }
  );

  watch(visualTime, (time) => {
    if (!lyrics.value.length) {
      if (activeIndex.value !== -1) activeIndex.value = -1;
      return;
    }

    const now = performance.now();
    const hasKaraoke = activeIndex.value >= 0 &&
      lyrics.value[activeIndex.value]?.karaoke;
    const interval = hasKaraoke ? KARAOKE_CALC_INTERVAL : CALC_INTERVAL;
    if (now - lastCalcTime < interval) return;
    lastCalcTime = now;

    const offset = playbackStore.lyricsOffset || 0;
    const currentTime = time - offset;

    let idx = -1;

    if (activeIndex.value >= 0 && activeIndex.value < lyrics.value.length) {
      if (lyrics.value[activeIndex.value].time <= currentTime) {
        idx = activeIndex.value;
        for (let i = activeIndex.value + 1; i < lyrics.value.length; i++) {
          if (lyrics.value[i].time <= currentTime) {
            idx = i;
          } else {
            break;
          }
        }
      } else {
        for (let i = activeIndex.value - 1; i >= 0; i--) {
          if (lyrics.value[i].time <= currentTime) {
            idx = i;
            break;
          }
        }
      }
    }

    if (idx === -1) {
      let l = 0;
      let r = lyrics.value.length - 1;
      while (l <= r) {
        const mid = (l + r) >> 1;
        if (lyrics.value[mid].time <= currentTime) {
          idx = mid;
          l = mid + 1;
        } else {
          r = mid - 1;
        }
      }
    }

    if (idx !== activeIndex.value) {
      activeIndex.value = idx;
      playbackStore.setCurrentLyricIndex(idx);
    }
  });

  return {
    activeIndex,
    isTrackChanging,
  };
}
