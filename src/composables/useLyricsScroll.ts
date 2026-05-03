import { ref, watch, nextTick, type Ref } from 'vue';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useConfigStore } from '@/stores/configStore';

interface EnhancedLyricLine {
  time: number;
  texts: string[];
  karaoke: boolean;
  words?: any[];
}

const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function useLyricsScroll(
  containerRef: Ref<HTMLElement | null>,
  activeIndex: Ref<number>,
  lyrics: Ref<EnhancedLyricLine[]>,
  isTrackChanging: Ref<boolean>,
  visualTime: Ref<number>,
  notifySeek: () => void
) {
  const playbackStore = usePlaybackStore();
  const configStore = useConfigStore();

  const isAutoScrolling = ref(false);
  const isHovering = ref(false);
  const isUserScroll = ref(false);

  let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
  let scrollAnimationId: number | null = null;
  let scrollAnimationStart = 0;
  let scrollAnimationFrom = 0;
  let scrollAnimationTo = 0;
  let scrollAnimationDuration = 0;

  const cancelScrollAnimation = () => {
    if (scrollAnimationId !== null) {
      cancelAnimationFrame(scrollAnimationId);
      scrollAnimationId = null;
    }
  };

  const animatedScrollTo = (
    targetScroll: number,
    duration = 600,
    immediate = false,
    easing = easeOutExpo
  ) => {
    if (!containerRef.value) return;

    cancelScrollAnimation();

    const container = containerRef.value;

    if (immediate) {
      container.scrollTop = targetScroll;
      return;
    }

    scrollAnimationFrom = container.scrollTop;
    scrollAnimationTo = targetScroll;
    scrollAnimationDuration = duration;
    scrollAnimationStart = 0;
    isAutoScrolling.value = true;

    const animateScroll = (timestamp: number) => {
      if (!scrollAnimationStart) scrollAnimationStart = timestamp;
      const elapsed = timestamp - scrollAnimationStart;
      const progress = Math.min(elapsed / scrollAnimationDuration, 1);
      const eased = easing(progress);

      container.scrollTop = scrollAnimationFrom + (scrollAnimationTo - scrollAnimationFrom) * eased;

      if (progress < 1) {
        scrollAnimationId = requestAnimationFrame(animateScroll);
      } else {
        scrollAnimationId = null;
        setTimeout(() => {
          isAutoScrolling.value = false;
        }, 50);
      }
    };

    scrollAnimationId = requestAnimationFrame(animateScroll);
  };

  const handleScroll = () => {
    if (isAutoScrolling.value) return;
    if (!isHovering.value) return;

    isUserScroll.value = true;
    cancelScrollAnimation();

    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      isUserScroll.value = false;
    }, 2500);
  };

  const scrollToActiveLyric = (immediate = false, isUserClick = false, targetIndex = -1) => {
    if (!containerRef.value) return;

    const idx = targetIndex !== -1 ? targetIndex : activeIndex.value;
    if (idx === -1 || !lyrics.value.length) return;

    const container = containerRef.value;
    const lyricElements = container.querySelectorAll('.lyrics');
    if (!lyricElements || !lyricElements[idx]) return;

    const activeEl = lyricElements[idx] as HTMLElement;
    const isModern = (configStore.lyricsDisplayMode || 'modern') === 'modern';

    const containerH = container.clientHeight;
    const elTop = activeEl.offsetTop;
    const elH = activeEl.clientHeight;
    const targetScroll = Math.max(0, elTop - containerH * 0.5 + elH / 2);

    if (immediate || isUserClick) {
      cancelScrollAnimation();
      container.scrollTop = targetScroll;
    } else if (isModern) {
      const currentScroll = container.scrollTop;
      const distance = Math.abs(targetScroll - currentScroll);
      const duration = Math.max(300, Math.min(700, distance * 0.6));
      animatedScrollTo(targetScroll, duration, false, easeOutExpo);
    } else {
      const currentScroll = container.scrollTop;
      const distance = Math.abs(targetScroll - currentScroll);
      const duration = Math.max(200, Math.min(400, distance * 0.4));
      animatedScrollTo(targetScroll, duration, false, easeOutCubic);
    }
  };

  const handleLyricClick = async (time: number, index: number) => {
    if (time < 0) return;

    isUserScroll.value = false;
    if (scrollTimeout) clearTimeout(scrollTimeout);

    await playbackStore.seek(time);

    visualTime.value = time;
    notifySeek();

    nextTick(() => scrollToActiveLyric(true, true, index));
  };

  watch(activeIndex, () => {
    if (isTrackChanging.value) return;
    if (!isUserScroll.value) {
      scrollToActiveLyric();
    }
  });

  const handleResize = () => scrollToActiveLyric(true);

  const cleanup = () => {
    cancelScrollAnimation();
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
      scrollTimeout = null;
    }
    isUserScroll.value = false;
    isAutoScrolling.value = false;
  };

  return {
    isAutoScrolling,
    isHovering,
    isUserScroll,
    handleScroll,
    scrollToActiveLyric,
    handleLyricClick,
    cancelScrollAnimation,
    handleResize,
    cleanup,
  };
}
