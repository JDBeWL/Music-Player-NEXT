<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  Folder,
  Check,
  SkipForward,
  Music,
  Heart,
  Settings,
} from 'lucide-vue-next';

interface Track {
  id: string;
  path: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
}

interface Props {
  tracks: Track[];
  selectedIds: Set<string>;
  tracksByFolder: Map<string, Track[]>;
  favoriteTrackPaths: string[];
}

interface Emits {
  (e: 'toggle-selection', id: string): void;
  (e: 'select-all'): void;
  (e: 'deselect-all'): void;
  (e: 'select-folder', folder: string): void;
  (e: 'add-to-playlist'): void;
  (e: 'add-to-queue'): void;
  (e: 'toggle-favorite', track: Track): void;
  (e: 'navigate', view: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const expandedFolders = ref<Set<string>>(new Set());

function toggleFolderExpand(folder: string) {
  if (expandedFolders.value.has(folder)) {
    expandedFolders.value.delete(folder);
  } else {
    expandedFolders.value.add(folder);
  }
  expandedFolders.value = new Set(expandedFolders.value);
}

function getFolderName(folderPath: string): string {
  const parts = folderPath.split(/[/\\]/);
  return parts[parts.length - 1] || folderPath;
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const hasSelection = computed(() => props.selectedIds.size > 0);

function isTrackFavorite(trackPath: string): boolean {
  return props.favoriteTrackPaths.includes(trackPath);
}
</script>

<template>
  <section class="flex-1 overflow-hidden flex flex-col no-select" role="main" aria-label="本地音乐">
    <header class="px-8 py-5 flex items-center justify-between no-select" style="border-bottom: 1px solid var(--border-subtle);">
      <h2 class="text-3xl font-bold text-[var(--text-primary)]">本地文件</h2>
      <div class="flex gap-2" v-if="hasSelection">
        <button class="md3-btn-filled text-sm" @click="emit('add-to-playlist')">
          添加到播放列表
        </button>
        <button class="md3-btn-outlined text-sm" @click="emit('add-to-queue')">
          添加到队列
        </button>
        <button class="md3-btn-outlined text-sm" @click="emit('deselect-all')">
          取消选择
        </button>
      </div>
      <div class="flex gap-2" v-else>
        <button class="md3-btn-outlined text-sm" @click="emit('select-all')" v-if="tracks.length > 0">
          全选
        </button>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto px-6 py-4">
      <template v-if="tracks.length > 0">
        <div class="space-y-4">
          <div
            v-for="[folder, folderTracks] in tracksByFolder"
            :key="folder"
            class="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] overflow-hidden"
          >
            <div 
              class="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-[var(--hover-overlay)] transition-colors duration-150" 
              @click="toggleFolderExpand(folder)"
            >
              <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-xl bg-[var(--color-primary-container)] flex items-center justify-center">
                  <Folder :size="18" class="text-[var(--color-primary)]" />
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-[var(--text-primary)] font-semibold">{{ getFolderName(folder) }}</span>
                    <span class="text-[var(--text-disabled)] text-xs px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)]">{{ folderTracks.length }} 首</span>
                  </div>
                  <p class="text-xs text-[var(--text-tertiary)] truncate max-w-md">{{ folder }}</p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <button
                  class="md3-chip text-xs"
                  @click.stop="emit('select-folder', folder)"
                >
                  全选
                </button>
                <SkipForward
                  :size="16"
                  class="text-[var(--text-disabled)] transition-transform duration-200"
                  :class="{ 'rotate-90': expandedFolders.has(folder) }"
                />
              </div>
            </div>

            <div
              v-if="expandedFolders.has(folder)"
              class="border-t border-[var(--border-subtle)]"
            >
              <div
                v-for="file in folderTracks"
                :key="file.id"
                class="flex items-center gap-4 px-5 py-3 hover:bg-[var(--hover-overlay)] transition-colors duration-100 group"
                :class="{ 'bg-[var(--color-primary-container)]': selectedIds.has(file.id) }"
              >
                <div
                  class="w-5 h-5 rounded-md border-2 flex items-center justify-center cursor-pointer transition-all duration-150 flex-shrink-0"
                  :class="selectedIds.has(file.id) ? 'bg-[var(--color-primary)] border-[var(--color-primary)]' : 'border-[var(--text-disabled)] group-hover:border-[var(--color-primary)]'"
                  @click="emit('toggle-selection', file.id)"
                >
                  <Check v-if="selectedIds.has(file.id)" :size="12" class="text-[var(--text-on-primary)]" />
                </div>

                <div class="w-10 h-10 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-150">
                  <Music :size="16" class="text-[var(--text-tertiary)]" />
                </div>

                <div class="flex-1 min-w-0">
                  <div class="text-[var(--text-primary)] text-sm font-medium truncate">{{ file.title }}</div>
                  <div class="text-[var(--text-tertiary)] text-xs truncate">{{ file.artist }}</div>
                </div>

                <div class="text-[var(--text-tertiary)] text-xs tabular-nums font-mono px-2">
                  {{ formatTime(file.duration) }}
                </div>

                <button
                  class="md3-icon-btn-sm transition-all duration-150"
                  :class="{ 'text-red-400 scale-110': isTrackFavorite(file.path), 'text-[var(--text-disabled)] opacity-0 group-hover:opacity-100': !isTrackFavorite(file.path) }"
                  @click="emit('toggle-favorite', file)"
                >
                  <Heart :size="15" :fill="isTrackFavorite(file.path) ? 'currentColor' : 'none'" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <div v-else class="flex flex-col items-center justify-center h-full min-h-[60vh]">
        <div class="w-28 h-28 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center mb-8 shadow-lg">
          <Folder :size="48" class="text-[var(--text-tertiary)]" />
        </div>
        <h3 class="text-xl font-semibold text-[var(--text-primary)] mb-3">还没有本地音乐</h3>
        <p class="text-sm text-[var(--text-tertiary)] mb-8 text-center max-w-sm leading-relaxed">在设置中添加音乐文件夹<br>开始管理你的音乐库</p>
        <button
          class="md3-btn-filled flex items-center gap-2 px-6 py-3"
          @click="$emit('navigate', 'settings')"
        >
          <Settings :size="18" />
          <span>前往设置</span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.no-select {
  user-select: none;
  -webkit-user-select: none;
}
</style>