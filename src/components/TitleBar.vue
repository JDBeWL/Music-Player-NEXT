<script setup lang="ts">
import { ref } from 'vue';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Minus,
  Square,
  X,
  Copy,
  Music,
  Loader2,
} from 'lucide-vue-next';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import type { AudioTrack } from '@/stores/playerStore';

interface Props {
  currentView: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

interface Emits {
  (e: 'navigate-back'): void;
  (e: 'navigate-forward'): void;
  (e: 'play-next', track: AudioTrack): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const appWindow = getCurrentWindow();

const searchQuery = ref('');
const isSearching = ref(false);
const searchResults = ref<AudioTrack[]>([]);
const showSearchResults = ref(false);
const isMaximized = ref(false);

async function checkMaximized() {
  isMaximized.value = await appWindow.isMaximized();
}

checkMaximized();

appWindow.onResized(() => {
  checkMaximized();
});

async function minimize() {
  await appWindow.minimize();
}

async function toggleMaximize() {
  if (isMaximized.value) {
    await appWindow.unmaximize();
  } else {
    await appWindow.maximize();
  }
}

async function closeWindow() {
  await appWindow.close();
}

async function handleSearch() {
  const query = searchQuery.value.trim();
  if (!query) {
    searchResults.value = [];
    showSearchResults.value = false;
    return;
  }

  isSearching.value = true;
  try {
    searchResults.value = await invoke<AudioTrack[]>('search_tracks', { query, limit: 20 });
    showSearchResults.value = searchResults.value.length > 0;
  } catch (error) {
    console.error('[TitleBar] Search failed:', error);
    searchResults.value = [];
    showSearchResults.value = false;
  } finally {
    isSearching.value = false;
  }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  if (!searchQuery.value.trim()) {
    searchResults.value = [];
    showSearchResults.value = false;
    return;
  }
  searchTimer = setTimeout(handleSearch, 300);
}

function playAsNext(track: AudioTrack) {
  emit('play-next', track);
  searchQuery.value = '';
  searchResults.value = [];
  showSearchResults.value = false;
}

function clearSearch() {
  searchQuery.value = '';
  searchResults.value = [];
  showSearchResults.value = false;
}

function onBlur() {
  setTimeout(() => {
    showSearchResults.value = false;
  }, 200);
}
</script>

<template>
  <header class="titlebar" data-tauri-drag-region>
    <div class="titlebar-left" data-tauri-drag-region="false">
      <button
        class="nav-btn"
        :disabled="!props.canGoBack"
        @click="emit('navigate-back')"
        title="返回"
        aria-label="返回"
      >
        <ChevronLeft :size="16" />
      </button>
      <button
        class="nav-btn"
        :disabled="!props.canGoForward"
        @click="emit('navigate-forward')"
        title="前进"
        aria-label="前进"
      >
        <ChevronRight :size="16" />
      </button>
    </div>

    <div class="titlebar-center">
      <div class="search-wrapper">
        <div class="search-input-container">
          <Search :size="16" class="search-icon" />
          <input
            v-model="searchQuery"
            type="text"
            class="search-input"
            placeholder="搜索歌曲..."
            aria-label="搜索歌曲"
            @input="onSearchInput"
            @focus="showSearchResults && searchResults.length > 0 ? null : null"
            @blur="onBlur"
          />
          <Loader2 v-if="isSearching" :size="14" class="search-loading animate-spin" />
          <button v-else-if="searchQuery" class="search-clear" @click="clearSearch" aria-label="清除搜索">
            <X :size="12" />
          </button>
        </div>

        <div v-if="showSearchResults && searchResults.length > 0" class="search-results elevation-2">
          <div
            v-for="track in searchResults.slice(0, 8)"
            :key="track.id"
            class="search-result-item"
            @mousedown.prevent="playAsNext(track)"
          >
            <Music :size="14" class="result-icon" />
            <div class="result-info">
              <span class="result-title">{{ track.title }}</span>
              <span class="result-artist">{{ track.artist }}</span>
            </div>
            <span class="result-hint">下一首播放</span>
          </div>
          <div v-if="searchResults.length === 0 && !isSearching" class="search-empty">
            未找到匹配的歌曲
          </div>
        </div>
      </div>
    </div>

    <div class="titlebar-right">
      <button class="window-btn" @click="minimize" title="最小化" aria-label="最小化窗口">
        <Minus :size="14" />
      </button>
      <button class="window-btn" @click="toggleMaximize" :title="isMaximized ? '还原' : '最大化'" :aria-label="isMaximized ? '还原窗口' : '最大化窗口'">
        <Square v-if="!isMaximized" :size="14" />
        <Copy v-else :size="14" />
      </button>
      <button class="window-btn window-btn-close" @click="closeWindow" title="关闭" aria-label="关闭窗口">
        <X :size="14" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  background-color: var(--bg-secondary);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  user-select: none;
  z-index: 100;
}

.titlebar-left {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-left: 16px;
}

.nav-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.nav-btn:hover:not(:disabled) {
  background: var(--hover-overlay);
  color: var(--text-secondary);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.titlebar-center {
  flex: 1;
  display: flex;
  justify-content: center;
  max-width: min(520px, calc(100% - 200px));
  margin: 0 20px;
  min-width: 0;
}

.search-wrapper {
  position: relative;
  width: 100%;
}

.search-input-container {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 14px;
  border-radius: var(--radius-lg);
  background: var(--bg-tertiary);
  border: 1px solid transparent;
  transition: all 0.2s ease;
}

.search-input-container:focus-within {
  background: var(--bg-surface);
  border-color: var(--color-primary);
}

.search-icon {
  color: var(--text-tertiary);
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
  caret-color: var(--color-primary);
}

.search-input::placeholder {
  color: var(--text-disabled);
}

.search-loading {
  color: var(--color-primary);
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}

.search-clear {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: color 0.15s;
}

.search-clear:hover {
  color: var(--text-secondary);
}

.search-results {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 320px;
  overflow-y: auto;
  border-radius: var(--radius-lg);
  backdrop-filter: blur(24px);
  z-index: 200;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
}

.search-results::-webkit-scrollbar {
  width: 5px;
}

.search-results::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 3px;
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  cursor: pointer;
  transition: background 0.12s ease;
}

.search-result-item:hover {
  background: var(--hover-overlay);
}

.result-icon {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.result-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.result-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-artist {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-hint {
  font-size: 11px;
  color: var(--color-primary);
  white-space: nowrap;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s ease;
  padding: 3px 8px;
  border-radius: var(--radius-xs);
  background: var(--color-primary-container);
}

.search-result-item:hover .result-hint {
  opacity: 1;
}

.search-empty {
  text-align: center;
  padding: 20px;
  font-size: 13px;
  color: var(--text-tertiary);
}

.titlebar-right {
  display: flex;
  align-items: center;
  gap: 0;
  margin-left: auto;
  padding-right: 8px;
}

.window-btn {
  width: 48px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  border-radius: var(--radius-sm);
  margin: 0 2px;
}

.window-btn:hover {
  background: var(--hover-overlay);
  color: var(--text-primary);
}

.window-btn-close:hover {
  background: #e81123;
  color: white;
}
</style>