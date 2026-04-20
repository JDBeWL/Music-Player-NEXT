<script setup lang="ts">
import { computed } from 'vue';
import { X, ListMusic } from 'lucide-vue-next';

interface Track {
  id: string;
  title: string;
  artist: string;
  duration: number;
}

interface Props {
  queue: Track[];
  currentIndex: number;
  isPlaying: boolean;
  modelValue: boolean;
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void;
  (e: 'select-track', index: number): void;
  (e: 'remove-track', index: number): void;
  (e: 'clear-queue'): void;
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
        class="queue-panel elevation-2"
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
            <button class="md3-icon-btn-sm text-[var(--text-secondary)]" @click="closePanel" aria-label="关闭">
              <X :size="16" />
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
              class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--hover-overlay)] transition-colors group no-select state-layer"
              :class="{ 'bg-[var(--color-primary-container)]': idx === currentIndex }"
            >
              <div class="w-6 text-center text-sm text-[var(--text-tertiary)]">
                <span v-if="idx !== currentIndex || !isPlaying">{{ idx + 1 }}</span>
                <div v-else class="flex items-center justify-center gap-0.5">
                  <div class="w-0.5 h-3 bg-[var(--color-primary)] animate-pulse"></div>
                  <div class="w-0.5 h-2 bg-[var(--color-primary)] animate-pulse" style="animation-delay: 0.1s"></div>
                  <div class="w-0.5 h-3 bg-[var(--color-primary)] animate-pulse" style="animation-delay: 0.2s"></div>
                </div>
              </div>
              <div class="flex-1 min-w-0 cursor-pointer" @click="emit('select-track', idx)">
                <div class="text-sm font-medium truncate" :class="idx === currentIndex ? 'text-[var(--color-primary)]' : 'text-[var(--text-primary)]'">
                  {{ track.title }}
                </div>
                <div class="text-xs text-[var(--text-tertiary)] truncate">{{ track.artist }}</div>
              </div>
              <span class="text-xs text-[var(--text-tertiary)] mr-1">{{ formatTime(track.duration) }}</span>
              <button class="md3-icon-btn-sm opacity-0 group-hover:opacity-100 text-[var(--text-disabled)] hover:text-[var(--text-primary)]" @click.stop="emit('remove-track', idx)" :aria-label="`移除歌曲 ${track.title}`">
                <X :size="14" />
              </button>
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
  backdrop-filter: blur(40px);
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
</style>