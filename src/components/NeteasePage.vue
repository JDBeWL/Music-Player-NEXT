<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useNeteaseStore } from '@/stores/neteaseStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import {
  Search,
  Loader2,
  X,
  Play,
  Cloud,
  LogIn,
  LogOut,
  RefreshCw,
  QrCode,
  Music,
  Clock,
  ChevronDown,
  AlertCircle,
  User,
  Crown,
  Settings,
  Download,
  Check,
} from 'lucide-vue-next';
import { QUALITY_OPTIONS } from '@/services/netease/api';

const neteaseStore = useNeteaseStore();
const playbackStore = usePlaybackStore();

const localSearchQuery = ref('');
const showLoginPanel = ref(false);
const playingId = ref<number | null>(null);
const loadingId = ref<number | null>(null);
const errorMessage = ref<string | null>(null);
const downloadingId = ref<number | null>(null);
const downloadedIds = ref<Set<number>>(new Set());

onMounted(() => {
  neteaseStore.init();
});

onUnmounted(() => {
  neteaseStore.stopQrPolling();
});

// 搜索防抖
let searchTimer: ReturnType<typeof setTimeout> | null = null;

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  const query = localSearchQuery.value.trim();
  if (!query) {
    neteaseStore.clearSearch();
    return;
  }
  searchTimer = setTimeout(() => {
    neteaseStore.search(query);
  }, 1000);
}

function handleSearchSubmit() {
  if (searchTimer) clearTimeout(searchTimer);
  const query = localSearchQuery.value.trim();
  if (query) {
    neteaseStore.search(query);
  }
}

function clearSearch() {
  localSearchQuery.value = '';
  neteaseStore.clearSearch();
}

async function playSong(song: any) {
  loadingId.value = song.id;
  errorMessage.value = null;
  try {
    const track = await neteaseStore.getPlayableTrack(song);
    if (track) {
      // 获取歌词
      const lrc = await neteaseStore.fetchLyric(song.id);
      if (lrc) {
        track.lrc = lrc;
      }

      // 插入到队列并立即播放
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

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function toggleLoginPanel() {
  showLoginPanel.value = !showLoginPanel.value;
  if (showLoginPanel.value && !neteaseStore.isLoggedIn && !neteaseStore.qrImg) {
    neteaseStore.startQrLogin();
  }
}

function refreshQr() {
  neteaseStore.startQrLogin();
}

async function handleLogout() {
  await neteaseStore.logout();
  showLoginPanel.value = false;
}

// 监听二维码状态变化
watch(() => neteaseStore.qrStatus, (status) => {
  if (status?.code === 803) {
    showLoginPanel.value = false;
  }
});

function handleQualityChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  neteaseStore.setQuality(target.value as any);
}

async function downloadSong(song: any, event: Event) {
  event.stopPropagation();
  if (downloadingId.value === song.id) return;
  downloadingId.value = song.id;
  errorMessage.value = null;
  try {
    const result = await neteaseStore.downloadTrack(song);
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

function getQrStatusText(): string {
  if (!neteaseStore.qrStatus) return '等待扫码...';
  switch (neteaseStore.qrStatus.code) {
    case 801: return '等待扫码...';
    case 802: return '请在手机上确认登录';
    case 803: return '登录成功！';
    case 800: return '二维码已过期';
    default: return '未知状态';
  }
}

function getQrStatusClass(): string {
  if (!neteaseStore.qrStatus) return '';
  switch (neteaseStore.qrStatus.code) {
    case 802: return 'status-confirming';
    case 803: return 'status-success';
    case 800: return 'status-expired';
    default: return '';
  }
}

function getFeeTag(fee: number): string {
  switch (fee) {
    case 1: return 'VIP';
    case 4: return '付费';
    default: return '';
  }
}

// 兼容 /cloudsearch (ar, al, dt) 和 /search (artists, album, duration) 两种字段名
function getSongArtists(song: any): string {
  const artists = song.ar || song.artists || [];
  return artists.map((a: any) => a.name).join(' / ');
}

function getSongAlbum(song: any): any {
  return song.al || song.album;
}

function getSongDuration(song: any): number {
  return song.dt || song.duration || 0;
}
</script>

<template>
  <div class="netease-section">
    <!-- 头部区域 -->
    <div class="netease-header">
      <div class="header-left">
        <Cloud :size="22" class="header-icon" />
        <h3>Netease</h3>
      </div>
      <div class="header-right">
        <button
          v-if="neteaseStore.isLoggedIn"
          class="user-badge"
          @click="toggleLoginPanel"
          :title="neteaseStore.userProfile?.nickname"
        >
          <img
            v-if="neteaseStore.userProfile?.avatarUrl"
            :src="neteaseStore.userProfile.avatarUrl"
            class="user-avatar"
            alt="头像"
          />
          <User v-else :size="14" />
          <span class="user-name">{{ neteaseStore.userProfile?.nickname }}</span>
          <Crown v-if="neteaseStore.userProfile?.vipType" :size="12" class="vip-icon" />
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

    <!-- 登录面板 -->
    <Transition name="slide-down">
      <div v-if="showLoginPanel" class="login-panel">
        <div v-if="neteaseStore.isLoggedIn" class="logged-in-panel">
          <img
            v-if="neteaseStore.userProfile?.avatarUrl"
            :src="neteaseStore.userProfile.avatarUrl"
            class="profile-avatar"
            alt="头像"
          />
          <div class="profile-info">
            <span class="profile-name">{{ neteaseStore.userProfile?.nickname }}</span>
            <span v-if="neteaseStore.userProfile?.vipType" class="vip-tag">
              <Crown :size="12" /> VIP
            </span>
          </div>
          <button class="logout-btn" @click="handleLogout">
            <LogOut :size="14" />
            <span>退出登录</span>
          </button>
        </div>

        <!-- 音质选择器 -->
        <div class="quality-selector">
          <div class="quality-label">
            <Settings :size="14" />
            <span>音质</span>
          </div>
          <select
            :value="neteaseStore.quality"
            @change="handleQualityChange"
            class="quality-select"
          >
            <option
              v-for="option in QUALITY_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>

        <div v-if="!neteaseStore.isLoggedIn" class="qr-login-panel">
          <div class="qr-title">
            <QrCode :size="18" />
            <span>扫码登录</span>
          </div>
          <div class="qr-container">
            <div v-if="neteaseStore.isQrLoading" class="qr-loading">
              <Loader2 :size="32" class="animate-spin" />
              <span>生成二维码中...</span>
            </div>
            <div v-else-if="neteaseStore.qrImg" class="qr-content">
              <img :src="neteaseStore.qrImg" class="qr-image" alt="扫码登录" />
              <div class="qr-status" :class="getQrStatusClass()">
                {{ getQrStatusText() }}
              </div>
              <button
                v-if="neteaseStore.qrStatus?.code === 800"
                class="refresh-qr-btn"
                @click="refreshQr"
              >
                <RefreshCw :size="14" />
                <span>刷新二维码</span>
              </button>
            </div>
            <div v-else class="qr-error">
              <AlertCircle :size="24" />
              <span>获取二维码失败</span>
              <button class="refresh-qr-btn" @click="refreshQr">
                <RefreshCw :size="14" />
                <span>重试</span>
              </button>
            </div>
          </div>
          <p class="qr-hint">使用Netease App 扫描二维码登录</p>
        </div>
      </div>
    </Transition>

    <!-- 搜索区域 -->
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
        <Loader2 v-if="neteaseStore.isSearching" :size="14" class="search-loading animate-spin" />
        <button v-else-if="localSearchQuery" class="search-clear" @click="clearSearch">
          <X :size="12" />
        </button>
      </div>
    </div>

    <!-- 错误提示 -->
    <Transition name="fade">
      <div v-if="errorMessage" class="error-banner">
        <AlertCircle :size="14" />
        <span>{{ errorMessage }}</span>
        <button @click="errorMessage = null"><X :size="12" /></button>
      </div>
    </Transition>

    <!-- 搜索结果 -->
    <div v-if="neteaseStore.searchResults.length > 0" class="search-results-area">
      <div class="results-header">
        <span class="results-count">找到 {{ neteaseStore.searchTotal }} 首歌曲</span>
      </div>

      <div class="results-list">
        <div
          v-for="(song, index) in neteaseStore.searchResults"
          :key="song.id"
          class="result-item"
          :class="{ 'is-playing': playingId === song.id }"
          @click="playSong(song)"
        >
          <div class="result-index">
            <Loader2 v-if="loadingId === song.id" :size="14" class="animate-spin" />
            <Play v-else-if="playingId === song.id" :size="14" class="playing-icon" />
            <span v-else>{{ index + 1 }}</span>
          </div>
          <div class="result-cover">
            <img
              v-if="getSongAlbum(song)?.picUrl"
              :src="getSongAlbum(song).picUrl + '?param=80y80'"
              class="cover-img"
              alt=""
              loading="lazy"
            />
            <div v-else class="cover-placeholder">
              <Music :size="16" />
            </div>
          </div>
          <div class="result-info">
            <div class="result-title-row">
              <span class="result-title">{{ song.name }}</span>
              <span v-if="getFeeTag(song.fee)" class="fee-tag">{{ getFeeTag(song.fee) }}</span>
            </div>
            <span class="result-artist">
              {{ getSongArtists(song) }}
              <span v-if="getSongAlbum(song)?.name" class="result-album"> - {{ getSongAlbum(song).name }}</span>
            </span>
          </div>
          <div class="result-duration">
            <Clock :size="12" />
            <span>{{ formatDuration(getSongDuration(song)) }}</span>
          </div>
          <button
            class="result-download-btn"
            :class="{ 'downloaded': downloadedIds.has(song.id) }"
            @click="downloadSong(song, $event)"
            :disabled="downloadingId === song.id"
            :title="downloadedIds.has(song.id) ? '已下载' : '下载'"
          >
            <Loader2 v-if="downloadingId === song.id" :size="14" class="animate-spin" />
            <Check v-else-if="downloadedIds.has(song.id)" :size="14" />
            <Download v-else :size="14" />
          </button>
        </div>
      </div>

      <!-- 加载更多 -->
      <div v-if="neteaseStore.hasMoreResults" class="load-more">
        <button
          class="load-more-btn"
          @click="neteaseStore.loadMoreResults()"
          :disabled="neteaseStore.isSearching"
        >
          <Loader2 v-if="neteaseStore.isSearching" :size="14" class="animate-spin" />
          <ChevronDown v-else :size="14" />
          <span>{{ neteaseStore.isSearching ? '加载中...' : '加载更多' }}</span>
        </button>
      </div>
    </div>

    <!-- 搜索错误 -->
    <div v-else-if="neteaseStore.searchError" class="empty-state error-state">
      <AlertCircle :size="32" />
      <p>{{ neteaseStore.searchError }}</p>
      <button class="retry-btn" @click="handleSearchSubmit">重试</button>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!neteaseStore.isSearching && localSearchQuery" class="empty-state">
      <Music :size="32" />
      <p>未找到结果</p>
    </div>

    <!-- 初始状态 -->
    <div v-else-if="!neteaseStore.isSearching && !localSearchQuery" class="empty-state initial-state">
      <Cloud :size="40" class="initial-icon" />
      <p class="initial-title">搜索Netease</p>
      <p class="initial-subtitle">输入歌名、歌手或专辑名称开始搜索</p>
      <p v-if="!neteaseStore.isLoggedIn" class="initial-hint">
        <LogIn :size="12" />
        登录后可获得更好的音质
      </p>
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

/* 登录面板 */
.login-panel {
  margin-bottom: 16px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-subtle);
  background: var(--bg-tertiary);
  overflow: hidden;
  flex-shrink: 0;
}

.logged-in-panel {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
}

.profile-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--border-subtle);
}

.profile-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.vip-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #fbbf24;
  font-weight: 600;
}

.logout-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--text-tertiary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.logout-btn:hover {
  color: #f87171;
  border-color: #f87171;
}

/* 音质选择器 */
.quality-selector {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-secondary);
}

.quality-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

.quality-select {
  padding: 6px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  outline: none;
}

.quality-select:hover {
  border-color: var(--color-primary);
}

.quality-select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-container);
}

.qr-login-panel {
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.qr-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.qr-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
}

.qr-loading,
.qr-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-tertiary);
  font-size: 13px;
}

.qr-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.qr-image {
  width: 160px;
  height: 160px;
  border-radius: var(--radius-lg);
  border: 2px solid var(--border-subtle);
  background: white;
  padding: 4px;
}

.qr-status {
  font-size: 13px;
  color: var(--text-tertiary);
  font-weight: 500;
  padding: 4px 12px;
  border-radius: var(--radius-md);
}

.status-confirming {
  color: var(--color-primary);
  background: var(--color-primary-container);
}

.status-success {
  color: #34d399;
}

.status-expired {
  color: #f87171;
}

.refresh-qr-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--color-primary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.refresh-qr-btn:hover {
  background: var(--color-primary-container);
}

.qr-hint {
  font-size: 12px;
  color: var(--text-disabled);
}

/* 搜索 */
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

/* 错误提示 */
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

/* 搜索结果 */
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
  font-weight: 500;
}

.results-list {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  margin: 2px 0;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: background 0.15s ease;
}

.result-item:hover {
  background: var(--hover-overlay);
}

.result-item.is-playing {
  background: var(--color-primary-container);
}

.result-index {
  width: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-disabled);
  flex-shrink: 0;
}

.result-item.is-playing .result-index {
  color: var(--color-primary);
}

.playing-icon {
  color: var(--color-primary);
}

.result-cover {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  overflow: hidden;
  flex-shrink: 0;
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  color: var(--text-disabled);
}

.result-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.result-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.result-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-item.is-playing .result-title {
  color: var(--color-on-primary-container);
}

.fee-tag {
  font-size: 10px;
  font-weight: 600;
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.15);
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  flex-shrink: 0;
  letter-spacing: 0.03em;
}

.result-artist {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-album {
  color: var(--text-disabled);
}

.result-duration {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-disabled);
  flex-shrink: 0;
}

.result-download-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-disabled);
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
  opacity: 0;
  padding: 0;
}

.result-item:hover .result-download-btn {
  opacity: 1;
}

.result-download-btn:hover:not(:disabled) {
  color: var(--color-primary);
  background: var(--color-primary-container);
}

.result-download-btn:disabled {
  cursor: not-allowed;
  opacity: 1;
  color: var(--color-primary);
}

.result-download-btn.downloaded {
  opacity: 1;
  color: #34d399;
}

.load-more {
  padding: 12px 0;
  display: flex;
  justify-content: center;
  flex-shrink: 0;
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

/* 空状态 */
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

.initial-title {
  font-size: 16px !important;
  font-weight: 600;
  color: var(--text-secondary) !important;
}

.initial-subtitle {
  font-size: 13px !important;
  color: var(--text-tertiary) !important;
}

.initial-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px !important;
  color: var(--text-disabled) !important;
  margin-top: 8px;
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

/* 过渡动画 */
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
