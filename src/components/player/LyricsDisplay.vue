<template>
  <div class="lyrics-wrapper" :class="`lyrics-style-${configStore.lyricsDisplayMode || 'modern'}`">
    <div
      class="lyrics-display"
      ref="containerRef"
      @scroll="handleScroll"
      @mouseenter="isHovering = true"
      @mouseleave="isHovering = false"
    >
      <div v-if="loading" class="loading">加载中...</div>

      <!-- 没有播放音乐时显示空闲状态 -->
      <div v-else-if="!hasCurrentTrack" class="no-lyrics idle-state">
        <span>当前没有播放的歌曲</span>
      </div>

      <!-- 有音乐但没有歌词 -->
      <div v-else-if="!lyrics.length" class="no-lyrics">
        <span>暂无歌词</span>
      </div>

      <div v-else>
        <div class="lyrics-spacer-up"></div>

        <div
          class="lyrics"
          v-for="(line, index) in lyrics"
          :key="index"
          :class="{ active: isActive(index) }"
          :style="getLyricLineStyle(index)"
          @click="handleLyricClick(line.time, index)"
        >
          <template v-if="line.karaoke && isActive(index)">
            <div class="first-line karaoke-line">
              <span
                v-for="(word, idx) in line.words"
                :key="idx"
                class="karaoke-text"
                :class="{ active: isWordActive(word), animating: isWordAnimating(word) }"
                :style="getKaraokeStyle(word)"
              >{{ word.text }}</span>
            </div>
            <div class="last-line translation" v-if="line.texts[1] && configStore.showTranslation">
              {{ line.texts[1] }}
            </div>
          </template>

          <template v-else>
            <div class="first-line">{{ line.texts[0] }}</div>
            <div class="last-line translation" v-if="line.texts[1] && configStore.showTranslation">
              {{ line.texts[1] }}
            </div>
          </template>
        </div>

        <div class="lyrics-spacer-down"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePlaybackStore } from '@/stores/playbackStore';
import { useConfigStore } from '@/stores/configStore';
import { nextTick, ref, watch, onMounted, onUnmounted, computed } from 'vue';
import { useLyrics } from '@/composables/useLyrics';
import type { KaraokeWord } from '@/types';
import '@/assets/css/lyrics-modern.css';
import '@/assets/css/lyrics-classic.css';

const playbackStore = usePlaybackStore();
const configStore = useConfigStore();
const containerRef = ref<HTMLElement | null>(null);

const lyricsComposable = useLyrics();
const { lyrics, loading, cleanup: cleanupLyrics } = lyricsComposable;

const activeIndex = ref(-1);
const hasCurrentTrack = computed(() => !!playbackStore.currentTrack);

const visualTime = ref(0);
const isUserScroll = ref(false);
let rafId: number | null = null;
let lastFrameTime = 0;

let isPageVisible = true;

function handleVisibilityChange() {
  isPageVisible = !document.hidden;
  if (isPageVisible && playbackStore.isPlaying && rafId === null) {
    startAnimationLoop();
  }
}

function startAnimationLoop() {
  if (rafId !== null) return;
  lastFrameTime = 0;
  visualTime.value = playbackStore.currentTime;

  const animate = (timestamp: number) => {
    if (!isPageVisible) {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      return;
    }

    if (!lastFrameTime) lastFrameTime = timestamp;
    const deltaTime = Math.min((timestamp - lastFrameTime) / 1000, 0.1);
    lastFrameTime = timestamp;

    const realTime = playbackStore.currentTime;
    const diff = visualTime.value - realTime;

    if (Math.abs(diff) > 0.5) {
      visualTime.value = realTime;
    } else if (Math.abs(diff) > 0.05) {
      const speed = 1.0 - diff * 2.0;
      const clampedSpeed = Math.max(0.7, Math.min(1.3, speed));
      visualTime.value += deltaTime * clampedSpeed;
    } else {
      visualTime.value += deltaTime;
    }

    rafId = requestAnimationFrame(animate);
  };
  rafId = requestAnimationFrame(animate);
}

function stopAnimationLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

watch(
  () => playbackStore.isPlaying,
  (isPlaying) => {
    if (isPlaying) {
      startAnimationLoop();
    } else {
      stopAnimationLoop();
      visualTime.value = playbackStore.currentTime;
    }
  },
  { immediate: true }
);

watch(
  () => playbackStore.currentTime,
  (newTime, oldTime) => {
    const jump = newTime - (oldTime ?? newTime);
    if (Math.abs(jump) > 1.5 || jump < -0.1) {
      visualTime.value = newTime;
    }
  }
);

const isTrackChanging = ref(false);

watch(
  () => playbackStore.currentTrack?.path,
  () => {
    isTrackChanging.value = true;
    visualTime.value = playbackStore.currentTime;
    activeIndex.value = -1;

    nextTick(() => {
      cancelScrollAnimation();
      if (containerRef.value) {
        containerRef.value.scrollTop = 0;
        requestAnimationFrame(() => {
          setTimeout(() => {
            isTrackChanging.value = false;
          }, 1000);
        });
      }
    });
  }
);

let lastCalcTime = 0;
const CALC_INTERVAL = 50;

watch(visualTime, (time) => {
  if (!lyrics.value.length) {
    if (activeIndex.value !== -1) activeIndex.value = -1;
    return;
  }

  const now = performance.now();
  if (now - lastCalcTime < CALC_INTERVAL) return;
  lastCalcTime = now;

  const offset = playbackStore.lyricsOffset || 0;
  const currentTime = time - offset;

  let l = 0;
  let r = lyrics.value.length - 1;
  let idx = -1;
  while (l <= r) {
    const mid = (l + r) >> 1;
    if (lyrics.value[mid].time <= currentTime) {
      idx = mid;
      l = mid + 1;
    } else {
      r = mid - 1;
    }
  }

  if (idx !== activeIndex.value) {
    activeIndex.value = idx;
    playbackStore.setCurrentLyricIndex(idx);
  }
});

const isActive = (index: number) => index === activeIndex.value;

const getLyricLineStyle = (index: number) => {
  const distance = Math.abs(index - activeIndex.value);
  const isModern = (configStore.lyricsDisplayMode || 'modern') === 'modern';

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

    return {
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
    } as Record<string, string | number>;
  } else {
    if (distance === 0) {
      return {
        '--align-origin': 'center center',
        textAlign: 'center',
        fontFamily: 'inherit',
        color: 'var(--color-primary)',
      } as Record<string, string | number>;
    }

    const opacity = distance <= 1 ? 0.6 : Math.max(0.35, 0.6 - (distance - 1) * 0.08);
    return {
      '--align-origin': 'center center',
      '--lyric-opacity': opacity,
      textAlign: 'center',
      fontFamily: 'inherit',
      opacity: 'var(--lyric-opacity)',
      color: 'var(--text-tertiary)',
    } as Record<string, string | number>;
  }
};

const isWordActive = (word: KaraokeWord) => {
  const offset = playbackStore.lyricsOffset || 0;
  const t = visualTime.value - offset;
  return t >= word.start && t < word.end;
};

const isWordAnimating = (word: KaraokeWord) => {
  const offset = playbackStore.lyricsOffset || 0;
  const t = visualTime.value - offset;
  return t >= word.start && t <= word.end;
};

const getKaraokeStyle = (word: KaraokeWord) => {
  const offset = playbackStore.lyricsOffset || 0;
  const t = visualTime.value - offset;
  if (t >= word.end) return { '--karaoke-progress': '100%' };
  if (t < word.start) return { '--karaoke-progress': '0%' };

  const duration = word.end - word.start;
  const elapsed = t - word.start;
  const progress = Math.min(100, Math.max(0, (elapsed / duration) * 100));
  return { '--karaoke-progress': `${progress.toFixed(2)}%` };
};

const isAutoScrolling = ref(false);
const isHovering = ref(false);
let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
let scrollAnimationId: number | null = null;
let scrollAnimationStart = 0;
let scrollAnimationFrom = 0;
let scrollAnimationTo = 0;
let scrollAnimationDuration = 0;

const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

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

watch(activeIndex, () => {
  if (isTrackChanging.value) return;
  if (!isUserScroll.value) {
    scrollToActiveLyric();
  }
});

watch(loading, (newVal) => {
  if (!newVal) {
    visualTime.value = playbackStore.currentTime;
    if (isTrackChanging.value) return;
    if (playbackStore.currentTime > 2) {
      nextTick(() => scrollToActiveLyric(true));
    }
  }
});

const handleLyricClick = async (time: number, index: number) => {
  if (time < 0) return;

  isUserScroll.value = false;
  if (scrollTimeout) clearTimeout(scrollTimeout);

  await playbackStore.seek(time);

  visualTime.value = time;
  const forceSync = () => {
    visualTime.value = playbackStore.currentTime;
  };
  requestAnimationFrame(forceSync);
  requestAnimationFrame(() => requestAnimationFrame(forceSync));

  nextTick(() => scrollToActiveLyric(true, true, index));
};

const handleResize = () => scrollToActiveLyric(true);

onMounted(() => {
  window.addEventListener('resize', handleResize);
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
  stopAnimationLoop();
  cancelScrollAnimation();
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
    scrollTimeout = null;
  }
  window.removeEventListener('resize', handleResize);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  cleanupLyrics();
  isUserScroll.value = false;
  isAutoScrolling.value = false;
});
</script>

<style scoped>
.lyrics-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.lyrics-display {
  height: 100%;
  padding: 0 32px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
}

.lyrics-display::-webkit-scrollbar {
  display: none;
}

.loading,
.no-lyrics {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 24px;
  gap: 16px;
}

.idle-state {
  color: var(--text-tertiary);
  opacity: 0.6;
}

.idle-icon {
  font-size: 64px;
  margin-bottom: 8px;
}

.lyrics-spacer-up {
  height: 30vh;
}

.lyrics-spacer-down {
  height: 45vh;
}
</style>
