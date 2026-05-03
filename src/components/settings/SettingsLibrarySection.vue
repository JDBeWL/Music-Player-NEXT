<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from 'radix-vue';
import { Folder, Trash2, Plus, Loader2, FolderSearch, Database, Trash } from 'lucide-vue-next';
import { invoke } from '@tauri-apps/api/core';
import { useLibraryStore } from '@/stores/libraryStore';
import { usePlaylistStore } from '@/stores/playlistStore';
import { toast } from '@/services/toast';
import { getFolderName } from '@/utils/format';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';

const libraryStore = useLibraryStore();
const playlistStore = usePlaylistStore();

const isScanning = ref(false);
const showClearCacheConfirm = ref(false);

const folders = computed(() => libraryStore.libraryFolders);
const scanDepth = computed(() => libraryStore.scanDepth);
const scanProgress = computed(() => libraryStore.scanProgress);

const coverCacheCount = ref<number>(0);
const coverCacheDir = ref<string>('');
const isLoadingCacheInfo = ref(false);
const isClearingCache = ref(false);

async function addFolder() {
  try {
    const folderPath = await invoke<string | null>('open_folder_dialog');
    if (folderPath) {
      await libraryStore.addFolder(folderPath);
    }
  } catch (error) {
    console.error('Failed to add folder:', error);
  }
}

async function scanFolders() {
  isScanning.value = true;
  try {
    await libraryStore.scanLibraryFolders(playlistStore.playlists);
    await loadCacheInfo();
  } finally {
    isScanning.value = false;
  }
}

async function loadCacheInfo() {
  isLoadingCacheInfo.value = true;
  try {
    const [dir, count] = await invoke<[string, number]>('get_cover_cache_info');
    coverCacheDir.value = dir;
    coverCacheCount.value = count;
  } catch (error) {
    console.error('Failed to load cache info:', error);
  } finally {
    isLoadingCacheInfo.value = false;
  }
}

async function confirmClearCache() {
  showClearCacheConfirm.value = false;
  isClearingCache.value = true;
  try {
    await invoke('clear_cover_cache');
    await invoke('clear_search_index');

    libraryStore.clearAllCoverReferences();

    coverCacheCount.value = 0;
    toast.success('缓存已清理完毕，下次扫描文件夹时将重新生成封面缓存');
  } catch (error) {
    console.error('Failed to clear cache:', error);
    toast.error('清理缓存失败');
  } finally {
    isClearingCache.value = false;
  }
}

const progressPercentage = computed(() => {
  if (!scanProgress.value || scanProgress.value.total === 0) return 0;
  return Math.round((scanProgress.value.current / scanProgress.value.total) * 100);
});

const progressText = computed(() => {
  if (!scanProgress.value) return '';
  return `${scanProgress.value.current} / ${scanProgress.value.total}`;
});

onMounted(() => {
  loadCacheInfo();
});
</script>

<template>
  <div>
    <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
      <Folder :size="20" class="text-[var(--color-primary)]" />
      音乐库
    </h3>
    <p class="text-sm text-[var(--text-tertiary)] mb-4">管理你的音乐文件夹</p>

    <div class="space-y-2 mb-4">
      <div v-for="folder in folders" :key="folder" class="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
        <Folder :size="18" class="text-[var(--color-primary)] flex-shrink-0" />
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-[var(--text-primary)] truncate">{{ getFolderName(folder) }}</div>
          <div class="text-xs text-[var(--text-tertiary)] truncate">{{ folder }}</div>
        </div>
        <button class="md3-icon-btn-xs state-layer text-[var(--text-tertiary)] hover:text-red-400" @click="libraryStore.removeFolder(folder)" :aria-label="`移除文件夹 ${folder}`">
          <Trash2 :size="16" />
        </button>
      </div>
    </div>

    <div class="flex gap-3">
      <button class="md3-btn-outlined" @click="addFolder">
        <Plus :size="16" />
        添加文件夹
      </button>
      <button
        class="md3-btn-filled"
        :disabled="isScanning || folders.length === 0"
        @click="scanFolders"
      >
        <Loader2 v-if="isScanning" :size="16" class="animate-spin" />
        {{ isScanning ? '扫描中...' : '扫描文件夹' }}
      </button>
    </div>

    <div v-if="isScanning && scanProgress" class="mt-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <Loader2 :size="16" class="text-[var(--color-primary)] animate-spin" />
          <span class="text-sm text-[var(--text-secondary)]">正在扫描</span>
        </div>
        <span class="text-sm text-[var(--text-tertiary)]">{{ progressText }} ({{ progressPercentage }}%)</span>
      </div>
      <div class="w-full h-1.5 bg-[var(--border-default)] rounded-full overflow-hidden">
        <div
          class="h-full bg-[var(--color-primary)] rounded-full transition-all duration-300 ease-out"
          :style="{ width: `${progressPercentage}%` }"
        ></div>
      </div>
      <div class="mt-2 text-xs text-[var(--text-disabled)] truncate">
        {{ scanProgress.current_file }}
      </div>
    </div>
  </div>

  <div>
    <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
      <FolderSearch :size="20" class="text-[var(--color-primary)]" />
      扫描深度
    </h3>
    <p class="text-sm text-[var(--text-tertiary)] mb-4">设置扫描子文件夹的层级深度（1-10）</p>

    <div class="flex items-center gap-4">
      <SliderRoot
        :model-value="[scanDepth || 1]"
        :min="1"
        :max="10"
        :step="1"
        @update:model-value="(v: number[] | undefined) => v && libraryStore.setScanDepth(v[0])"
        class="relative flex items-center select-none touch-none flex-1 h-5"
      >
        <SliderTrack class="bg-[var(--border-default)] relative grow rounded-full h-1.5">
          <SliderRange class="absolute bg-[var(--color-primary)] rounded-full h-full" />
        </SliderTrack>
        <SliderThumb class="block w-5 h-5 bg-[var(--color-primary)] rounded-full shadow-md hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50 transition-transform" />
      </SliderRoot>
      <div class="w-12 text-center text-[var(--text-primary)] font-medium tabular-nums">{{ scanDepth || 1 }}</div>
    </div>
  </div>

  <div>
    <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
      <Database :size="20" class="text-[var(--color-primary)]" />
      缓存管理
    </h3>
    <p class="text-sm text-[var(--text-tertiary)] mb-4">清理封面缓存和搜索索引</p>

    <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-[var(--text-primary)] font-medium">封面缓存</span>
          <span class="block text-sm text-[var(--text-tertiary)]">已缓存的封面数量</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-[var(--text-secondary)]">{{ isLoadingCacheInfo ? '加载中...' : `${coverCacheCount} 个封面` }}</span>
          <button
            class="md3-btn-filled"
            :disabled="isClearingCache || isLoadingCacheInfo || coverCacheCount === 0"
            @click="showClearCacheConfirm = true"
          >
            <Loader2 v-if="isClearingCache" :size="14" class="animate-spin" />
            <Trash v-else :size="14" />
            {{ isClearingCache ? '清理中...' : '清理缓存' }}
          </button>
        </div>
      </div>
      <div class="text-xs text-[var(--text-disabled)]">
        缓存位置: {{ coverCacheDir || '加载中...' }}
      </div>
    </div>
  </div>

  <ConfirmDialog
    :open="showClearCacheConfirm"
    title="清理缓存"
    message="确定要清理所有封面缓存和搜索索引吗？下次扫描文件夹时将重新生成。"
    confirm-text="清理"
    cancel-text="取消"
    variant="danger"
    @confirm="confirmClearCache"
    @cancel="showClearCacheConfirm = false"
  />
</template>
