<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue';
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from 'radix-vue';
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
} from 'lucide-vue-next';

interface Props {
  currentTrack: any;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isShuffle: boolean;
  repeatMode: 'none' | 'one' | 'all';
  showQueuePanel: boolean;
  showNowPlayingPanel: boolean;
  coverUrl?: string;
  isFavorite: boolean;
}

interface Emits {
  (e: 'toggle-play'): void;
  (e: 'play-next'): void;
  (e: 'play-prev'): void;
  (e: 'time-change', value: number): void;
  (e: 'volume-change', value: number): void;
  (e: 'toggle-shuffle'): void;
  (e: 'cycle-repeat'): void;
  (e: 'toggle-queue'): void;
  (e: 'toggle-now-playing'): void;
  (e: 'toggle-favorite'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const showVolumeSlider = ref(false);
const isDragging = ref(false);
const dragProgress = ref(0);
const previousVolume = ref(0.5);
const progressTrackRef = ref<HTMLElement | null>(null);

const progress = computed(() => {
  if (isDragging.value) return dragProgress.value;
  if (!props.duration) return 0;
  return (props.currentTime / props.duration) * 100;
});

const VolumeIcon = computed(() => {
  const vol = props.volume;
  if (vol === 0) return VolumeX;
  if (vol < 0.5) return Volume1;
  return Volume2;
});

const RepeatIcon = computed(() => {
  return props.repeatMode === 'one' ? Repeat1 : Repeat;
});

const trackTitle = computed(() => props.currentTrack?.title || '未选择歌曲');
const artistName = computed(() => props.currentTrack?.artist || '未知艺术家');

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function handleVolumeChange(value: number[] | undefined) {
  if (value && value.length > 0) {
    emit('volume-change', value[0]);
  }
}

function toggleMute() {
  if (props.volume > 0) {
    previousVolume.value = props.volume;
    emit('volume-change', 0);
  } else {
    emit('volume-change', previousVolume.value);
  }
}

function updateProgress(e: MouseEvent) {
  if (!progressTrackRef.value) return;

  const rect = progressTrackRef.value.getBoundingClientRect();
  const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
  dragProgress.value = percent;

  if (isDragging.value) {
    emit('time-change', (percent / 100) * props.duration);
  }
}

function handleDocumentMouseMove(e: MouseEvent) {
  if (isDragging.value) {
    updateProgress(e);
  }
}

function handleMouseUp() {
  if (isDragging.value) {
    isDragging.value = false;
    document.removeEventListener('mousemove', handleDocumentMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }
}

function handleMouseDown(e: MouseEvent) {
  isDragging.value = true;
  updateProgress(e);

  document.addEventListener('mousemove', handleDocumentMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
}

function handleSeek(e: MouseEvent) {
  if (isDragging.value) return;

  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));

  // 立即更新视觉反馈
  dragProgress.value = percent;
  isDragging.value = true;

  emit('time-change', (percent / 100) * props.duration);

  // 短暂延迟后恢复正常状态，让视觉更新生效
  setTimeout(() => {
    isDragging.value = false;
  }, 100);
}

// 清理事件监听器
onBeforeUnmount(() => {
  document.removeEventListener('mousemove', handleDocumentMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
});
</script>

<template>
  <footer class="h-24 flex-shrink-0 z-[1100] no-select glass-surface" style="border-top: 1px solid var(--glass-border);">
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
            <span class="text-xs text-[var(--text-tertiary)] truncate">{{ artistName }}</span>
          </div>
        </div>
        <span v-else class="text-sm text-[var(--text-disabled)] ml-4">未在播放</span>
      </div>

      <div class="flex flex-col items-center gap-2 w-full max-w-2xl mx-auto">
        <div class="flex items-center gap-2">
          <button
            class="md3-icon-btn-xs state-layer"
            :class="{ 'text-[var(--color-primary)]': isShuffle }"
            aria-label="随机播放"
            @click="emit('toggle-shuffle')"
          >
            <Shuffle :size="18" />
          </button>

          <button
            class="md3-icon-btn-sm state-layer"
            aria-label="上一首"
            @click="emit('play-prev')"
          >
            <SkipBack :size="20" />
          </button>

          <button
            class="play-btn w-11 h-11 flex items-center justify-center rounded-xl bg-[var(--color-primary)] hover:brightness-110 transition-all text-[var(--text-on-primary)]"
            :aria-label="isPlaying ? '暂停' : '播放'"
            @click="emit('toggle-play')"
          >
            <Pause v-if="isPlaying" :size="24" />
            <Play v-else :size="24" class="ml-0.5" />
          </button>

          <button
            class="md3-icon-btn-sm state-layer"
            aria-label="下一首"
            @click="emit('play-next')"
          >
            <SkipForward :size="20" />
          </button>

          <button
            class="md3-icon-btn-xs state-layer"
            :class="{ 'text-[var(--color-primary)]': repeatMode !== 'none' }"
            aria-label="循环模式"
            @click="emit('cycle-repeat')"
          >
            <component :is="RepeatIcon" :size="18" />
          </button>
        </div>

        <div
          class="flex items-center gap-3 w-full"
          role="group"
          aria-label="播放进度"
        >
          <span class="text-xs text-[var(--text-tertiary)] tabular-nums min-w-[44px] text-right" aria-hidden="true">{{ formatTime(currentTime) }}</span>
          <div
            ref="progressTrackRef"
            class="relative w-full h-4 flex items-center group cursor-pointer"
            role="slider"
            :aria-label="'播放进度'"
            :aria-valuenow="Math.round(currentTime)"
            :aria-valuemin="0"
            :aria-valuemax="Math.round(duration)"
            :aria-valuetext="`${formatTime(currentTime)} / ${formatTime(duration)}`"
            tabindex="0"
            @mousedown="handleMouseDown"
            @click="handleSeek"
            @keydown.left.prevent="emit('time-change', Math.max(0, currentTime - 5))"
            @keydown.right.prevent="emit('time-change', Math.min(duration, currentTime + 5))"
          >
            <div class="absolute w-full h-1 bg-[var(--border-default)] rounded-full overflow-hidden">
              <div
                class="h-full bg-[var(--color-primary)] rounded-full transition-none"
                :style="{
                  width: `${progress}%`,
                }"
              />
            </div>
            <div
              class="absolute w-full h-4 flex items-center pointer-events-none"
            >
              <div
                class="w-3 h-3 bg-[var(--color-primary)] rounded-full opacity-0 group-hover:opacity-100 scale-50 group-hover:scale-100 shadow-md transition-opacity transition-transform duration-200"
                :style="{
                  marginLeft: `calc(${progress}% - 6px)`,
                }"
              />
            </div>
          </div>
          <span class="text-xs text-[var(--text-tertiary)] tabular-nums min-w-[44px]">{{ formatTime(duration) }}</span>
        </div>
      </div>

      <div class="flex items-center justify-end gap-1">
        <button
          class="md3-icon-btn-xs state-layer"
          :class="{ 'text-red-400': isFavorite }"
          :disabled="!currentTrack"
          aria-label="喜欢"
          @click="emit('toggle-favorite')"
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
          @mouseenter="showVolumeSlider = true"
          @mouseleave="showVolumeSlider = false"
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
              class="absolute bottom-full left-1/2 -translate-x-1/2 pb-2 pointer-events-auto"
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

.no-select {
  user-select: none;
  -webkit-user-select: none;
}

.play-btn svg {
  width: 24px;
  height: 24px;
}

.volume-control {
  pointer-events: auto;
}
</style>