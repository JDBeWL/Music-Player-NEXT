<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useNeteaseAuthStore } from '@/stores/neteaseAuthStore';
import { useNeteaseSearchStore } from '@/stores/neteaseSearchStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import {
  Search,
  Loader2,
  X,
  Cloud,
  LogIn,
  ChevronDown,
  AlertCircle,
  User,
  Crown,
  Music,
} from 'lucide-vue-next';
import QrLoginPanel from '@/components/netease/QrLoginPanel.vue';
import SearchResultItem from '@/components/netease/SearchResultItem.vue';

const authStore = useNeteaseAuthStore();
const searchStore = useNeteaseSearchStore();
const playbackStore = usePlaybackStore();

const localSearchQuery = ref('');
const showLoginPanel = ref(false);
const playingId = ref<number | null>(null);
const loadingId = ref<number | null>(null);
const errorMessage = ref<string | null>(null);
const downloadingId = ref<number | null>(null);
const downloadedIds = ref<Set<number>>(new Set());

onMounted(() => {
  authStore.init();
  searchStore.init();
});

onUnmounted(() => {
  authStore.stopQrPolling();
});

let searchTimer: ReturnType<typeof setTimeout> | null = null;

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  const query = localSearchQuery.value.trim();
  if (!query) {
    searchStore.clearSearch();
    return;
  }
  searchTimer = setTimeout(() => {
    searchStore.search(query);
  }, 1000);
}

function handleSearchSubmit() {
  if (searchTimer) clearTimeout(searchTimer);
  const query = localSearchQuery.value.trim();
  if (query) {
    searchStore.search(query);
  }
}

function clearSearch() {
  localSearchQuery.value = '';
  searchStore.clearSearch();
}

async function playSong(song: any) {
  loadingId.value = song.id;
  errorMessage.value = null;
  try {
    const track = await searchStore.getPlayableTrack(song);
    if (track) {
      const lrc = await searchStore.fetchLyric(song.id);
      if (lrc) {
        track.lrc = lrc;
      }
      playbackStore.addToQueue(track);
      const queueLength = playbackStore.queue.length;
      playbackStore.playTrack(queueLength - 1);
      playingId.value = song.id;
    } else {
      errorMessage.value = '该歌曲暂无播放源，可能需要 VIP 或已下架';
    }
  } catch (error: any) {
    console.error('[NeteasePage] Play failed:', error);
    errorMessage.value = error.message || '播放失败';
  } finally {
    loadingId.value = null;
  }
}

function toggleLoginPanel() {
  showLoginPanel.value = !showLoginPanel.value;
  if (showLoginPanel.value && !authStore.isLoggedIn && !authStore.qrImg) {
    authStore.startQrLogin();
  }
}

async function handleLogout() {
  await authStore.logout();
  showLoginPanel.value = false;
}

watch(() => authStore.qrStatus, (status) => {
  if (status?.code === 803) {
    showLoginPanel.value = false;
  }
});

async function downloadSong(song: any, event: Event) {
  event.stopPropagation();
  if (downloadingId.value === song.id) return;
  downloadingId.value = song.id;
  errorMessage.value = null;
  try {
    const result = await searchStore.downloadTrack(song);
    if (result) {
      downloadedIds.value.add(song.id);
    }
  } catch (error: any) {
    console.error('[NeteasePage] Download failed:', error);
    errorMessage.value = error.message || '下载失败';
  } finally {
    downloadingId.value = null;
  }
}
</script>

<template>
  <div class="netease-section">
    <div class="netease-header">
      <div class="header-left">
        <Cloud :size="22" class="header-icon" />
        <h3>Netease</h3>
      </div>
      <div class="header-right">
        <button
          v-if="authStore.isLoggedIn"
          class="user-badge"
          @click="toggleLoginPanel"
          :title="authStore.userProfile?.nickname"
        >
          <img
            v-if="authStore.userProfile?.avatarUrl"
            :src="authStore.userProfile.avatarUrl"
            class="user-avatar"
            alt="头像"
          />
          <User v-else :size="14" />
          <span class="user-name">{{ authStore.userProfile?.nickname }}</span>
          <Crown v-if="authStore.userProfile?.vipType" :size="12" class="vip-icon" />
        </button>
        <button
          v-else
          class="login-btn"
          @click="toggleLoginPanel"
        >
          <LogIn :size="16" />
          <span>登录</span>
        </button>
      </div>
    </div>

    <Transition name="slide-down">
      <QrLoginPanel
        v-if="showLoginPanel"
        @logout="handleLogout"
      />
    </Transition>

    <div class="search-area">
      <div class="search-box">
        <Search :size="16" class="search-icon" />
        <input
          v-model="localSearchQuery"
          type="text"
          class="search-input"
          placeholder="搜索Netease..."
          @input="onSearchInput"
          @keydown.enter="handleSearchSubmit"
        />
        <Loader2 v-if="searchStore.isSearching" :size="14" class="search-loading animate-spin" />
        <button v-else-if="localSearchQuery" class="search-clear" @click="clearSearch">
          <X :size="12" />
        </button>
      </div>
    </div>

    <Transition name="fade">
      <div v-if="errorMessage" class="error-banner">
        <AlertCircle :size="14" />
        <span>{{ errorMessage }}</span>
        <button @click="errorMessage = null"><X :size="12" /></button>
      </div>
    </Transition>

    <div v-if="searchStore.searchResults.length > 0" class="search-results-area">
      <div class="results-header">
        <span class="results-count">找到 {{ searchStore.searchTotal }} 首歌曲</span>
      </div>

      <div class="results-list">
        <SearchResultItem
          v-for="(song, index) in searchStore.searchResults"
          :key="song.id"
          :song="song"
          :index="index"
          :is-playing="playingId === song.id"
          :is-loading="loadingId === song.id"
          :is-downloading="downloadingId === song.id"
          :is-downloaded="downloadedIds.has(song.id)"
          @play="playSong(song)"
          @download="downloadSong(song, $event)"
        />

        <div v-if="searchStore.hasMoreResults" class="load-more">
          <button
            class="load-more-btn"
            @click="searchStore.loadMoreResults()"
            :disabled="searchStore.isSearching"
          >
            <Loader2 v-if="searchStore.isSearching" :size="14" class="animate-spin" />
            <ChevronDown v-else :size="14" />
            <span>{{ searchStore.isSearching ? '加载中...' : '加载更多' }}</span>
          </button>
        </div>
      </div>
    </div>

    <div v-else-if="searchStore.searchError" class="empty-state error-state">
      <AlertCircle :size="32" />
      <p>{{ searchStore.searchError }}</p>
      <button class="retry-btn" @click="handleSearchSubmit">重试</button>
    </div>

    <div v-else-if="!searchStore.isSearching && localSearchQuery" class="empty-state">
      <Music :size="32" />
      <p>未找到结果</p>
    </div>

    <div v-else-if="!searchStore.isSearching && !localSearchQuery" class="empty-state initial-state">
      <Cloud :size="40" class="initial-icon" />
      <p class="initial-subtitle">输入歌名、歌手或专辑名称开始搜索</p>
    </div>
  </div>
</template>

<style scoped>
.netease-section {
  display: flex;
  flex-direction: column;
  gap: 0;
  height: 100%;
  padding: 24px 32px;
  overflow: hidden;
}

.netease-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 16px 0;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-icon {
  color: var(--color-primary);
}

.header-left h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px 4px 4px;
  border-radius: 999px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-tertiary);
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-primary);
  font-size: 13px;
}

.user-badge:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-container);
}

.user-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
}

.user-name {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.vip-icon {
  color: #fbbf24;
  flex-shrink: 0;
}

.login-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.login-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-container);
}

.search-area {
  margin-bottom: 16px;
  flex-shrink: 0;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 42px;
  padding: 0 14px;
  border-radius: var(--radius-xl);
  background: var(--bg-tertiary);
  border: 1px solid transparent;
  transition: all 0.2s ease;
}

.search-box:focus-within {
  background: var(--bg-surface);
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(var(--color-primary-rgb, 99, 102, 241), 0.1);
}

.search-icon {
  color: var(--text-tertiary);
  flex-shrink: 0;
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
}

.search-clear {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-sm);
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

.error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  margin-bottom: 12px;
  border-radius: var(--radius-lg);
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.2);
  color: #f87171;
  font-size: 13px;
  flex-shrink: 0;
}

.error-banner button {
  margin-left: auto;
  background: transparent;
  border: none;
  color: #f87171;
  cursor: pointer;
  padding: 2px;
}

.search-results-area {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  flex-shrink: 0;
}

.results-count {
  font-size: 12px;
  color: var(--text-tertiary);
}

.results-list {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}

.load-more {
  padding: 12px 0;
  display: flex;
  justify-content: center;
}

.load-more-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.load-more-btn:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.load-more-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px;
  color: var(--text-tertiary);
  gap: 8px;
}

.empty-state p {
  font-size: 14px;
  margin: 0;
}

.initial-state {
  gap: 6px;
}

.initial-icon {
  color: var(--color-primary);
  opacity: 0.5;
  margin-bottom: 8px;
}

.initial-subtitle {
  font-size: 13px !important;
  color: var(--text-tertiary) !important;
}

.error-state {
  color: #f87171;
}

.retry-btn {
  margin-top: 8px;
  padding: 6px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.retry-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.slide-down-enter-active {
  transition: all 0.3s ease;
}

.slide-down-leave-active {
  transition: all 0.2s ease;
}

.slide-down-enter-from {
  opacity: 0;
  max-height: 0;
  transform: translateY(-8px);
}

.slide-down-leave-to {
  opacity: 0;
  max-height: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
