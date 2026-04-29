<script setup lang="ts">
import { computed } from 'vue';
import { X, ListMusic, Music, Heart } from 'lucide-vue-next';
import { getCoverUrl } from '@/utils/coverUrl';

interface Track {
  id: string;
  title: string;
  artist: string;
  duration: number;
  coverUrl?: string;
  path: string;
}

interface Props {
  queue: Track[];
  currentIndex: number;
  isPlaying: boolean;
  modelValue: boolean;
  favoritePaths: Set<string>;
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void;
  (e: 'select-track', index: number): void;
  (e: 'remove-track', index: number): void;
  (e: 'clear-queue'): void;
  (e: 'toggle-favorite', track: Track): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function closePanel() {
  isOpen.value = false;
}

function onOverlayClick() {
  closePanel();
}
</script>

<template>
  <Teleport to="body">
    <div class="queue-drawer-container" :class="{ 'queue-visible': isOpen }">
      <Transition name="overlay-fade">
        <div
          v-if="isOpen"
          class="queue-overlay"
          @click="onOverlayClick"
        />
      </Transition>

      <div
        class="queue-panel glass-surface"
        :class="{
          'queue-open': isOpen,
          'queue-closed': !isOpen,
        }"
      >
        <div class="flex items-center justify-between px-5 py-4" style="border-bottom: 1px solid var(--border-subtle);">
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-semibold text-[var(--text-primary)]">播放队列</h3>
            <span class="text-sm text-[var(--text-tertiary)]">{{ queue.length }} 首</span>
          </div>
          <div class="flex items-center gap-2">
            <button v-if="queue.length > 0" class="md3-btn-text text-xs px-3 py-1" @click="emit('clear-queue')" aria-label="清空播放队列">
              清空
            </button>
            <button class="md3-icon-btn-sm state-layer text-[var(--text-secondary)]" @click="closePanel" aria-label="关闭">
              <X :size="18" />
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto">
          <div v-if="queue.length === 0" class="flex flex-col items-center justify-center h-full py-20">
            <div class="w-16 h-16 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center mb-4">
              <ListMusic :size="24" class="text-[var(--text-tertiary)]" />
            </div>
            <h3 class="text-sm font-medium text-[var(--text-primary)] mb-1">播放队列为空</h3>
            <p class="text-xs text-[var(--text-tertiary)]">从库中添加歌曲开始播放</p>
          </div>
          <div v-else class="p-2 space-y-1">
            <div
              v-for="(track, idx) in queue"
              :key="track.id"
              class="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-[var(--hover-overlay)] transition-colors group no-select state-layer"
              :class="{ 'bg-[var(--color-primary-container)]': idx === currentIndex }"
            >
              <div class="w-10 h-10 rounded-[4px] overflow-hidden flex-shrink-0 bg-[var(--bg-tertiary)]">
                <img v-if="track.coverUrl" :src="getCoverUrl(track.coverUrl)" alt="" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <Music :size="16" class="text-[var(--text-tertiary)]" />
                </div>
              </div>
              <div class="flex-1 min-w-0 cursor-pointer" @click="emit('select-track', idx)">
                <div class="text-sm font-medium truncate" :class="idx === currentIndex ? 'text-[var(--color-primary)]' : 'text-[var(--text-primary)]'">
                  {{ track.title }}
                </div>
                <div class="text-xs text-[var(--text-tertiary)] truncate">{{ track.artist }}</div>
              </div>
              <div class="track-actions">
                <span class="track-time group-hover:opacity-0">{{ formatTime(track.duration) }}</span>
                <div class="track-action-btns opacity-0 group-hover:opacity-100">
                  <button
                    class="md3-icon-btn-xs state-layer"
                    :class="favoritePaths.has(track.path) ? 'text-red-400' : ''"
                    @click.stop="emit('toggle-favorite', track)"
                    :aria-label="favoritePaths.has(track.path) ? '取消收藏' : '收藏'"
                  >
                    <Heart :size="16" :fill="favoritePaths.has(track.path) ? 'currentColor' : 'none'" />
                  </button>
                  <button
                    class="md3-icon-btn-xs state-layer"
                    @click.stop="emit('remove-track', idx)"
                    :aria-label="`移除歌曲 ${track.title}`"
                  >
                    <X :size="16" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.queue-drawer-container {
  position: fixed;
  inset: 0;
  z-index: 1150;
  pointer-events: none;
}

.queue-visible {
  pointer-events: auto;
}

.queue-overlay {
  position: absolute;
  inset: 0;
  background: var(--scrim);
  backdrop-filter: blur(4px);
  pointer-events: auto;
}

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.3s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

.queue-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 360px;
  max-width: 90vw;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur) var(--glass-saturate);
  -webkit-backdrop-filter: var(--glass-blur) var(--glass-saturate);
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  will-change: transform;
  transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1);
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
}

.queue-open {
  transform: translateX(0);
}

.queue-closed {
  transform: translateX(100%);
}

.track-actions {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 68px;
  flex-shrink: 0;
}

.track-time {
  font-size: 12px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  transition: opacity 0.15s ease;
  white-space: nowrap;
  line-height: 32px;
}

.track-action-btns {
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  transition: opacity 0.15s ease;
}
</style>