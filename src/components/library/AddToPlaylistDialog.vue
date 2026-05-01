<script setup lang="ts">
import { usePlaylistStore } from '@/stores/playlistStore';
import { useLibraryStore } from '@/stores/libraryStore';

const playlistStore = usePlaylistStore();
const libraryStore = useLibraryStore();

const show = defineModel<boolean>({ required: true });

async function handleAddToPlaylist(playlistId: string) {
  playlistStore.addSelectedToPlaylist(playlistId, libraryStore.selectedFilesArray);
  libraryStore.deselectAllFiles();
  libraryStore.isLocalBrowserOpen = false;
  show.value = false;
  await libraryStore.persistLibrary();
}
</script>

<template>
  <div v-if="show" class="dialog-overlay" @click="show = false">
    <div class="dialog-content md3-surface-tinted" @click.stop>
      <div class="dialog-header">
        <h3 class="text-lg font-semibold text-[var(--text-primary)]">添加到播放列表</h3>
        <button class="md3-icon-btn-xs state-layer text-[var(--text-tertiary)]" @click="show = false">×</button>
      </div>
      <div class="dialog-body">
        <div v-if="playlistStore.playlists.length === 0" class="text-center py-16 px-5">
          <p class="text-[var(--text-tertiary)]">还没有播放列表</p>
          <p class="text-sm text-[var(--text-disabled)] mt-1">请先创建一个播放列表</p>
        </div>
        <div v-else class="space-y-2">
          <button
            v-for="playlist in playlistStore.playlists"
            :key="playlist.id"
            class="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-container)]/30 transition-all text-left"
            @click="handleAddToPlaylist(playlist.id)"
          >
            <span class="text-sm font-medium text-[var(--text-primary)]">{{ playlist.name }}</span>
            <span class="text-xs text-[var(--text-tertiary)]">{{ playlist.tracks.length }} 首</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-overlay {
  @apply fixed inset-0 flex items-center justify-center z-[2000];
  background: var(--scrim);
  backdrop-filter: blur(16px) var(--glass-saturate);
  -webkit-backdrop-filter: blur(16px) var(--glass-saturate);
}

.dialog-content {
  @apply border rounded-3xl w-[90%] max-w-md max-h-[600px] flex flex-col shadow-2xl elevation-3;
  border-color: var(--border-subtle);
}

.dialog-header {
  @apply flex items-center justify-between p-5;
  border-bottom: 1px solid var(--border-subtle);
}

.dialog-body {
  @apply flex-1 overflow-y-auto p-4;
}
</style>
