<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue';
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from 'radix-vue';
import { formatTime } from '@/utils/format';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Volume1,
  ListMusic,
  Repeat,
  Repeat1,
  Shuffle,
  Music,
  Heart,
  AlertCircle,
} from 'lucide-vue-next';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useQueueStore } from '@/stores/queueStore';
import { useTrackActions } from '@/composables/useTrackActions';

const playbackStore = usePlaybackStore();
const queueStore = useQueueStore();
const { isTrackFavorite, toggleFavorite } = useTrackActions();

interface Props {
  showQueuePanel: boolean;
  showNowPlayingPanel: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'toggle-queue': [];
  'toggle-now-playing': [];
}>();

const currentTrack = computed(() => playbackStore.currentTrack);
const isPlaying = computed(() => playbackStore.isPlaying);
const currentTime = computed(() => playbackStore.currentTime);
const duration = computed(() => playbackStore.duration);
const volume = computed(() => playbackStore.volume);
const isShuffle = computed(() => queueStore.isShuffle);
const repeatMode = computed(() => queueStore.repeatMode);
const coverUrl = computed(() => playbackStore.currentCoverUrl);
const isFavorite = computed(() => {
  if (!currentTrack.value) return false;
  return isTrackFavorite(currentTrack.value.path);
});
const errorMessage = computed(() => playbackStore.errorMessage);

const showVolumeSlider = ref(false);
let volumeHideTimer: ReturnType<typeof setTimeout> | null = null;

function onVolumeMouseEnter() {
  if (volumeHideTimer) {
    clearTimeout(volumeHideTimer);
    volumeHideTimer = null;
  }
  showVolumeSlider.value = true;
}

function onVolumeMouseLeave() {
  volumeHideTimer = setTimeout(() => {
    showVolumeSlider.value = false;
  }, 300);
}

const isDragging = ref(false);
const hasDragged = ref(false);
const dragProgress = ref(0);
const previousVolume = ref(0.5);
const progressTrackRef = ref<HTMLElement | null>(null);
const isHovering = ref(false);

const progress = computed(() => {
  if (isDragging.value) return dragProgress.value;
  if (!duration.value) return 0;
  return (currentTime.value / duration.value) * 100;
});

const displayTime = computed(() => {
  if (isDragging.value) {
    return (dragProgress.value / 100) * duration.value;
  }
  return currentTime.value;
});

const VolumeIcon = computed(() => {
  const vol = volume.value;
  if (vol === 0) return VolumeX;
  if (vol < 0.5) return Volume1;
  return Volume2;
});

const RepeatIcon = computed(() => {
  return repeatMode.value === 'one' ? Repeat1 : Repeat;
});

const trackTitle = computed(() => currentTrack.value?.title || '未选择歌曲');
const artistName = computed(() => currentTrack.value?.artist || '未知艺术家');

function handleVolumeChange(value: number[] | undefined) {
  if (value && value.length > 0) {
    playbackStore.setVolume(value[0]);
  }
}

function toggleMute() {
  if (volume.value > 0) {
    previousVolume.value = volume.value;
    playbackStore.setVolume(0);
  } else {
    playbackStore.setVolume(previousVolume.value);
  }
}

function updateProgress(e: MouseEvent) {
  if (!progressTrackRef.value) return;

  const rect = progressTrackRef.value.getBoundingClientRect();
  const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
  dragProgress.value = percent;
}

function handleDocumentMouseMove(e: MouseEvent) {
  if (isDragging.value) {
    hasDragged.value = true;
    updateProgress(e);
  }
}

function handleMouseUp() {
  if (!isDragging.value) return;

  playbackStore.setCurrentTime((dragProgress.value / 100) * duration.value);

  isDragging.value = false;
  hasDragged.value = false;
  document.removeEventListener('mousemove', handleDocumentMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
}

function handleMouseDown(e: MouseEvent) {
  isDragging.value = true;
  hasDragged.value = false;
  updateProgress(e);

  document.addEventListener('mousemove', handleDocumentMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', handleDocumentMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  if (volumeHideTimer) {
    clearTimeout(volumeHideTimer);
  }
});
</script>

<template>
  <footer class="h-24 flex-shrink-0 z-[1100] no-select glass-surface relative">
    <div
      ref="progressTrackRef"
      class="progress-bar-container"
      :class="{ 'is-dragging': isDragging }"
      :style="{ '--progress': `${progress}%` }"
      @mouseenter="isHovering = true"
      @mouseleave="isHovering = false"
      @mousedown="handleMouseDown"
      @keydown.left.prevent="playbackStore.setCurrentTime(Math.max(0, currentTime - 5))"
      @keydown.right.prevent="playbackStore.setCurrentTime(Math.min(duration, currentTime + 5))"
      role="slider"
      :aria-label="'播放进度'"
      :aria-valuenow="Math.round(currentTime)"
      :aria-valuemin="0"
      :aria-valuemax="Math.round(duration)"
      :aria-valuetext="`${formatTime(currentTime)} / ${formatTime(duration)}`"
      tabindex="0"
    >
      <div class="progress-track">
        <div
          class="progress-fill"
          :style="{ width: `${progress}%` }"
        />
      </div>
      <div
        class="progress-thumb"
        :style="{ left: `${progress}%` }"
      />
      <Transition name="tooltip-fade">
        <div
          v-if="isHovering || isDragging"
          class="progress-tooltip"
        >
          {{ formatTime(displayTime) }} / {{ formatTime(duration) }}
        </div>
      </Transition>
    </div>

    <div class="h-full grid grid-cols-[280px_1fr_280px] items-center px-6 gap-4">
      <div
        class="flex items-center gap-4 min-w-0 cursor-pointer group"
        @click="currentTrack && emit('toggle-now-playing')"
      >
        <div v-if="currentTrack" class="flex items-center gap-4 min-w-0">
          <div class="w-14 h-14 rounded-md bg-[var(--bg-tertiary)] flex items-center justify-center flex-shrink-0 overflow-hidden">
            <img v-if="coverUrl" :src="coverUrl" alt="Album Cover" class="w-full h-full object-cover" />
            <Music v-else :size="20" class="text-[var(--text-tertiary)]" />
          </div>
          <div class="flex flex-col min-w-0 flex-1">
            <span class="text-sm font-medium text-[var(--text-primary)] truncate">{{ trackTitle }}</span>
            <span v-if="errorMessage" class="text-xs text-red-400 truncate flex items-center gap-1">
              <AlertCircle :size="12" class="flex-shrink-0" />
              {{ errorMessage }}
            </span>
            <span v-else class="text-xs text-[var(--text-tertiary)] truncate">{{ artistName }}</span>
          </div>
        </div>
        <span v-else class="text-sm text-[var(--text-disabled)] ml-4">未在播放</span>
      </div>

      <div class="flex items-center justify-center gap-2 w-full max-w-2xl mx-auto">
          <button
            class="md3-icon-btn-xs state-layer"
            :class="{ 'text-[var(--color-primary)]': isShuffle }"
            aria-label="随机播放"
            @click="queueStore.toggleShuffle()"
          >
            <Shuffle :size="18" />
          </button>

          <button
            class="md3-icon-btn-sm state-layer"
            aria-label="上一首"
            @click="queueStore.playPrev()"
          >
            <SkipBack :size="20" />
          </button>

          <button
            class="play-btn w-11 h-11 flex items-center justify-center rounded-full bg-[var(--color-primary)] hover:brightness-110 transition-all text-[var(--text-on-primary)]"
            :aria-label="isPlaying ? '暂停' : '播放'"
            @click="queueStore.togglePlay()"
          >
            <Pause v-if="isPlaying" :size="24" />
            <Play v-else :size="24"/>
          </button>

          <button
            class="md3-icon-btn-sm state-layer"
            aria-label="下一首"
            @click="queueStore.playNext()"
          >
            <SkipForward :size="20" />
          </button>

          <button
            class="md3-icon-btn-xs state-layer"
            :class="{ 'text-[var(--color-primary)]': repeatMode !== 'none' }"
            aria-label="循环模式"
            @click="queueStore.cycleRepeatMode()"
          >
            <component :is="RepeatIcon" :size="18" />
          </button>
        </div>

      <div class="flex items-center justify-end gap-1">
        <button
          class="md3-icon-btn-xs state-layer"
          :class="{ 'text-red-400': isFavorite }"
          :disabled="!currentTrack"
          aria-label="喜欢"
          @click="currentTrack && toggleFavorite(currentTrack)"
        >
          <Heart :size="18" :fill="isFavorite ? 'currentColor' : 'none'" />
        </button>

        <button
          class="md3-icon-btn-xs state-layer"
          :class="{ 'text-[var(--color-primary)]': showQueuePanel }"
          aria-label="播放队列"
          @click="emit('toggle-queue')"
        >
          <ListMusic :size="18" />
        </button>

        <div
          class="relative volume-control"
          @mouseenter="onVolumeMouseEnter"
          @mouseleave="onVolumeMouseLeave"
        >
          <button
            class="md3-icon-btn-xs state-layer"
            aria-label="音量"
            @click="toggleMute"
          >
            <component :is="VolumeIcon" :size="18" />
          </button>

          <div
            v-show="showVolumeSlider"
            class="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-32 pointer-events-none"
          ></div>

          <div
              v-show="showVolumeSlider"
              class="absolute bottom-full left-1/2 -translate-x-1/2 pb-2 pointer-events-auto z-20"
            >
            <div class="px-2 py-3 elevation-3 rounded-lg">
              <SliderRoot
                class="relative flex items-center justify-center select-none touch-none h-24 w-3"
                :model-value="[volume]"
                :max="1"
                :step="0.01"
                orientation="vertical"
                @update:model-value="handleVolumeChange"
              >
                <SliderTrack class="bg-[var(--border-default)] relative w-1 h-full rounded-full">
                  <SliderRange class="absolute bg-[var(--color-primary)] rounded-full w-full bottom-0" />
                </SliderTrack>
                <SliderThumb
                  class="block w-3 h-3 bg-[var(--color-primary)] rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50 cursor-pointer"
                  aria-label="音量"
                />
              </SliderRoot>
            </div>
          </div>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.glass-surface {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur) var(--glass-saturate);
  -webkit-backdrop-filter: var(--glass-blur) var(--glass-saturate);
}

.play-btn svg {
  width: 24px;
  height: 24px;
}

.volume-control {
  pointer-events: auto;
}

.progress-bar-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 14px;
  z-index: 10;
  cursor: pointer;
  padding-top: 0;
}

.progress-track {
  position: relative;
  width: 100%;
  height: 3px;
  background: var(--border-default);
  transition: height 0.15s ease, margin-top 0.15s ease;
  overflow: hidden;
}

.progress-bar-container:hover .progress-track,
.progress-bar-container.is-dragging .progress-track {
  height: 5px;
  margin-top: -1px;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary);
}

.progress-thumb {
  position: absolute;
  top: 1.5px;
  width: 12px;
  height: 12px;
  background: var(--color-primary);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.progress-bar-container:hover .progress-thumb,
.progress-bar-container.is-dragging .progress-thumb {
  opacity: 1;
}

.progress-tooltip {
  position: absolute;
  top: -8px;
  left: clamp(50px, var(--progress), calc(100% - 50px));
  transform: translate(-50%, -100%);
  padding: 3px 8px;
  background: var(--elevation-3-bg);
  color: var(--text-primary);
  font-size: 11px;
  line-height: 1.4;
  border-radius: var(--radius-xs);
  white-space: nowrap;
  pointer-events: none;
  box-shadow: var(--shadow-md);
  border: 1px solid var(--elevation-3-border);
  z-index: 20;
  font-variant-numeric: tabular-nums;
}

.tooltip-fade-enter-active {
  transition: opacity 0.15s ease;
}

.tooltip-fade-leave-active {
  transition: opacity 0.1s ease;
}

.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
  opacity: 0;
}
</style>