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

      <div v-else-if="!hasCurrentTrack" class="no-lyrics idle-state">
        <span>当前没有播放的歌曲</span>
      </div>

      <div v-else-if="!lyrics.length" class="no-lyrics">
        <span>暂无歌词</span>
      </div>

      <div v-else>
        <div class="lyrics-spacer-up"></div>

        <div
          class="lyrics"
          v-for="(line, index) in lyrics"
          :key="`${line.time}-${line.texts[0] || ''}`"
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
import { useLyricsAnimation } from '@/composables/useLyricsAnimation';
import { useLyricActiveIndex } from '@/composables/useLyricActiveIndex';
import { useLyricStyle } from '@/composables/useLyricStyle';
import { useLyricsScroll } from '@/composables/useLyricsScroll';
import type { KaraokeWord } from '@/types';
import '@/assets/css/lyrics-modern.css';
import '@/assets/css/lyrics-classic.css';

const playbackStore = usePlaybackStore();
const configStore = useConfigStore();
const containerRef = ref<HTMLElement | null>(null);

const lyricsComposable = useLyrics();
const { lyrics, loading, cleanup: cleanupLyrics } = lyricsComposable;

const hasCurrentTrack = computed(() => !!playbackStore.currentTrack);

const { visualTime, stopAnimationLoop, handleVisibilityChange } = useLyricsAnimation();
const { activeIndex, isTrackChanging } = useLyricActiveIndex(visualTime, lyrics);
const { getLyricLineStyle } = useLyricStyle(activeIndex, lyrics);
const {
  isHovering,
  handleScroll,
  scrollToActiveLyric,
  handleLyricClick,
  cancelScrollAnimation,
  handleResize,
  cleanup: cleanupScroll,
} = useLyricsScroll(containerRef, activeIndex, lyrics, isTrackChanging, visualTime);

const isActive = (index: number) => index === activeIndex.value;

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

watch(
  () => playbackStore.currentTrack?.path,
  () => {
    visualTime.value = playbackStore.currentTime;
    nextTick(() => {
      cancelScrollAnimation();
      if (containerRef.value) {
        containerRef.value.scrollTop = 0;
      }
    });
  }
);

watch(loading, (newVal) => {
  if (!newVal) {
    visualTime.value = playbackStore.currentTime;
    if (isTrackChanging.value) return;
    if (playbackStore.currentTime > 2) {
      nextTick(() => scrollToActiveLyric(true));
    }
  }
});

onMounted(() => {
  window.addEventListener('resize', handleResize);
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
  stopAnimationLoop();
  cleanupScroll();
  window.removeEventListener('resize', handleResize);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  cleanupLyrics();
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
