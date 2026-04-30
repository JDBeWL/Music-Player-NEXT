<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { X } from 'lucide-vue-next';
import { usePlaybackStore } from './stores/playbackStore';
import { useLibraryStore } from './stores/libraryStore';
import { usePlaylistStore } from './stores/playlistStore';
import { useConfigStore } from './stores/configStore';
import { useNeteaseStore } from './stores/neteaseStore';
import { useThemeColor } from './composables/useThemeColor';
import { useNavigation } from './composables/useNavigation';
import { usePlayerControls } from './composables/usePlayerControls';
import { usePlaylistManager } from './composables/usePlaylistManager';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import Sidebar from './components/Sidebar.vue';
import TitleBar from './components/TitleBar.vue';
import PlayerBar from './components/PlayerBar.vue';
import QueuePanel from './components/QueuePanel.vue';
import NowPlayingPanel from './components/NowPlayingPanel.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import PromptDialog from './components/PromptDialog.vue';

const playbackStore = usePlaybackStore();
const libraryStore = useLibraryStore();
const playlistStore = usePlaylistStore();
const configStore = useConfigStore();
const neteaseStore = useNeteaseStore();
const { updateThemeFromCover } = useThemeColor();

const {
  currentView,
  currentPlaylistId,
  canGoBack,
  canGoForward,
  navigateBack,
  navigateForward,
  handleNavigate,
  openPlaylist,
  closePlaylistDetail,
} = useNavigation();

const {
  isCurrentTrackFavorite,
  handlePlayNext,
  cycleRepeatMode,
  toggleShuffle,
  toggleFavorite,
  playSearchAsNext,
} = usePlayerControls();

const {
  showPlaylistDialog,
  showDeleteConfirm,
  showCreatePrompt,
  openCreatePrompt,
  handleCreatePlaylist,
  requestDeletePlaylist,
  confirmDeletePlaylist,
  cancelDeletePlaylist,
  handleAddToPlaylist,
} = usePlaylistManager();

const showQueuePanel = ref(false);
const showNowPlayingPanel = ref(false);
const showCloseHintDialog = ref(false);
const rememberCloseChoice = ref(false);

const favoritePaths = computed(() => {
  const fav = playlistStore.favoritePlaylist;
  if (!fav) return new Set<string>();
  return new Set(fav.tracks.map(t => t.path));
});

function handleToggleFavorite(track: any) {
  playlistStore.toggleFavorite(track);
}

onMounted(async () => {
  playbackStore.initPlayerListeners();
  playbackStore.setOnTrackEndCallback(handlePlayNext);

  await configStore.loadConfig();

  neteaseStore.init();

  const [loadedPlaylists] = await Promise.all([
    libraryStore.loadLibrary(),
    playbackStore.loadVolumeSettings()
  ]);

  // 加载保存的播放列表
  if (loadedPlaylists.length > 0) {
    playlistStore.playlists = loadedPlaylists;
  }

  // 确保"我喜欢的音乐"播放列表存在
  playlistStore.ensureFavoritePlaylist();

  const { playlistId } = await playbackStore.loadPlaybackState();
  if (playlistId && configStore.persistPlayback) {
    const playlist = playlistStore.playlists.find(p => p.id === playlistId);
    if (playlist) {
      playlistStore.currentPlaylistId = playlistId;
      await playbackStore.restorePlaybackState(playlist.tracks, playlistId);
    }
  }

  if (libraryStore.libraryTracks.length > 0) {
    console.log('[App] Starting cover preload...');
    libraryStore.preloadAllCovers(playlistStore.playlists);
  }

  window.addEventListener('save-playback-before-close', handleSavePlaybackBeforeClose);
  window.addEventListener('keydown', handleGlobalKeydown);

  listen('show-close-hint-dialog', () => {
    showCloseHintDialog.value = true;
  });
});

onUnmounted(() => {
  playbackStore.destroyPlayerListeners();
  window.removeEventListener('save-playback-before-close', handleSavePlaybackBeforeClose);
  window.removeEventListener('keydown', handleGlobalKeydown);
});

function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
    return;
  }

  for (const [action, shortcut] of Object.entries(configStore.keyboardShortcuts)) {
    if (
      e.code === shortcut.code &&
      e.shiftKey === shortcut.shift &&
      e.ctrlKey === shortcut.ctrl &&
      e.altKey === shortcut.alt
    ) {
      e.preventDefault();
      switch (action) {
        case 'togglePlay':
          playbackStore.togglePlay();
          break;
        case 'navigateBack':
          navigateBack();
          break;
        case 'navigateForward':
          navigateForward();
          break;
        case 'toggleShuffle':
          toggleShuffle();
          break;
        case 'cycleRepeat':
          cycleRepeatMode();
          break;
        case 'playNext':
          handlePlayNext();
          break;
        case 'playPrev':
          playbackStore.playPrev();
          break;
      }
      return;
    }
  }
}

function handleSavePlaybackBeforeClose() {
  if (configStore.persistPlayback) {
    playbackStore.savePlaybackState(playbackStore.currentPlaylistId);
  }
}

function handleCloseHintConfirm(remember: boolean) {
  if (remember) {
    configStore.setCloseBehavior('quit');
  }
  showCloseHintDialog.value = false;
  invoke('quit_app').catch(console.error);
}

async function handleCloseHintCancel(remember: boolean) {
  if (remember) {
    await configStore.setCloseBehavior('to_tray');
  }
  showCloseHintDialog.value = false;
  await invoke('hide_window').catch(console.error);
}

function handleCloseHintDismiss() {
  showCloseHintDialog.value = false;
}

watch(() => playbackStore.currentCoverUrl, (coverUrl) => {
  if (coverUrl) {
    updateThemeFromCover(coverUrl);
  }
}, { immediate: true });

const playbackStatusLabel = computed(() => {
  if (!playbackStore.currentTrack) return '';
  const status = playbackStore.isPlaying ? '正在播放' : '已暂停';
  return `${status}：${playbackStore.currentTrack.title}，艺术家：${playbackStore.currentTrack.artist}`;
});

function addSelectedToPlaylist() {
  if (libraryStore.selectedFileIds.size === 0) {
    console.log('[App] No files selected');
    return;
  }
  console.log('[App] Opening playlist dialog, selected:', libraryStore.selectedFileIds.size, 'files');
  showPlaylistDialog.value = true;
}

async function _confirmDeletePlaylist() {
  await confirmDeletePlaylist(closePlaylistDetail);
}
</script>

<template>
  <a href="#main-content" class="skip-link">跳转到主要内容</a>
  <div aria-live="polite" aria-atomic="true" class="sr-only" :aria-label="playbackStatusLabel"></div>
  <div class="app-layout">
    <div class="app-content">
      <Sidebar
        :current-view="currentView"
        :current-playlist-id="currentPlaylistId"
        :playlists="playlistStore.playlists.map(p => ({ id: p.id, name: p.name, trackCount: p.tracks.length }))"
        @navigate="handleNavigate"
        @open-playlist="openPlaylist"
        @request-create="openCreatePrompt"
        @request-delete="requestDeletePlaylist"
      />

      <div class="main-wrapper">
        <TitleBar
          :current-view="currentView"
          :can-go-back="canGoBack"
          :can-go-forward="canGoForward"
          @navigate-back="navigateBack"
          @navigate-forward="navigateForward"
          @play-next="playSearchAsNext"
        />

        <main id="main-content" class="main-content">
          <div class="content-area">
            <router-view
              @create-playlist="openCreatePrompt"
              @open-playlist="openPlaylist"
              @add-to-playlist="addSelectedToPlaylist"
            />
          </div>

          <NowPlayingPanel
            v-model="showNowPlayingPanel"
            :current-track="playbackStore.currentTrack"
            :current-time="playbackStore.currentTime"
            @seek="playbackStore.setCurrentTime"
          />

          <QueuePanel
            v-model="showQueuePanel"
            :queue="playbackStore.queue"
            :current-index="playbackStore.currentIndex"
            :is-playing="playbackStore.isPlaying"
            :favorite-paths="favoritePaths"
            @select-track="playbackStore.playTrack"
            @remove-track="playbackStore.removeFromQueue"
            @clear-queue="playbackStore.clearQueue"
            @toggle-favorite="handleToggleFavorite"
          />

          <div v-if="showPlaylistDialog" class="dialog-overlay" @click="showPlaylistDialog = false">
            <div class="dialog-content md3-surface-tinted" @click.stop>
              <div class="dialog-header">
                <h3 class="text-lg font-semibold text-[var(--text-primary)]">添加到播放列表</h3>
                <button class="md3-icon-btn-xs state-layer text-[var(--text-tertiary)]" @click="showPlaylistDialog = false">×</button>
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
        </main>
      </div>
    </div>

    <PlayerBar
      :current-track="playbackStore.currentTrack"
      :is-playing="playbackStore.isPlaying"
      :current-time="playbackStore.currentTime"
      :duration="playbackStore.duration"
      :volume="playbackStore.volume"
      :is-shuffle="playbackStore.isShuffle"
      :repeat-mode="playbackStore.repeatMode"
      :show-queue-panel="showQueuePanel"
      :show-now-playing-panel="showNowPlayingPanel"
      :cover-url="playbackStore.currentCoverUrl"
      :is-favorite="isCurrentTrackFavorite"
      @toggle-play="playbackStore.togglePlay"
      @play-next="playbackStore.playNext"
      @play-prev="playbackStore.playPrev"
      @time-change="playbackStore.setCurrentTime"
      @volume-change="playbackStore.setVolume"
      @toggle-shuffle="toggleShuffle"
      @cycle-repeat="cycleRepeatMode"
      @toggle-queue="showQueuePanel = !showQueuePanel"
      @toggle-now-playing="showNowPlayingPanel = !showNowPlayingPanel"
      @toggle-favorite="toggleFavorite"
    />

    <ConfirmDialog
      :open="showDeleteConfirm"
      title="确认删除"
      message="确定要删除这个播放列表吗？此操作无法撤销。"
      confirm-text="删除"
      cancel-text="取消"
      variant="danger"
      @confirm="_confirmDeletePlaylist"
      @cancel="cancelDeletePlaylist"
    />

    <PromptDialog
      :open="showCreatePrompt"
      title="创建播放列表"
      message="输入新播放列表的名称"
      placeholder="播放列表名称"
      confirm-text="创建"
      @confirm="handleCreatePlaylist"
      @cancel="showCreatePrompt = false"
    />

    <!-- 首次关闭提示对话框 -->
    <Teleport to="body">
      <div
        v-if="showCloseHintDialog"
        class="close-hint-overlay"
        @click.self="handleCloseHintDismiss"
        role="presentation"
      >
        <div
          class="close-hint-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="close-hint-title"
        >
          <div class="close-hint-header">
            <h3 id="close-hint-title" class="close-hint-title">选择关闭行为</h3>
            <button class="close-hint-close" @click="handleCloseHintDismiss" aria-label="关闭对话框">
              <X :size="18" />
            </button>
          </div>

          <div class="close-hint-body">
            <p>关闭按钮将直接退出应用。如果想最小化到托盘，请在设置中修改关闭按钮行为。您希望如何处理？</p>
            <label class="close-hint-remember">
              <input
                v-model="rememberCloseChoice"
                type="checkbox"
                class="close-hint-checkbox"
              />
              <span>记住我的选择，不再询问</span>
            </label>
          </div>

          <div class="close-hint-footer">
            <button class="btn-cancel" @click="handleCloseHintCancel(rememberCloseChoice)">最小化到托盘</button>
            <button class="btn-confirm warning" @click="handleCloseHintConfirm(rememberCloseChoice)">直接退出</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.skip-link {
  position: absolute;
  top: -100px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-primary);
  color: var(--text-on-primary);
  padding: 12px 24px;
  border-radius: 0 0 12px 12px;
  z-index: 10000;
  font-weight: 500;
  text-decoration: none;
  transition: top 0.2s;
}

.skip-link:focus {
  top: 0;
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.app-layout {
  @apply w-screen h-screen flex flex-col overflow-hidden;
  background: var(--bg-primary);
}

.app-content {
  @apply flex-1 flex overflow-hidden;
}

.main-wrapper {
  @apply flex-1 flex flex-col overflow-hidden;
}

.main-content {
  @apply flex-1 flex overflow-hidden;
}

.content-area {
  @apply flex-1 flex overflow-hidden;
}

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

.close-hint-overlay {
  position: fixed;
  inset: 0;
  background: var(--scrim);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.15s ease;
}

.close-hint-dialog {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 24px;
  width: 400px;
  max-width: 90vw;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  animation: slideUp 0.2s ease;
}

.close-hint-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 20px 0;
}

.close-hint-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.close-hint-icon.warning {
  background: #fef3c7;
  color: #eab308;
}

.close-hint-title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.close-hint-close {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-disabled);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.close-hint-close:hover {
  background: var(--hover-overlay);
  color: var(--text-primary);
}

.close-hint-body {
  padding: 16px 20px;
}

.close-hint-body p {
  margin: 0 0 16px;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.close-hint-remember {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.close-hint-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--color-primary);
  cursor: pointer;
}

.close-hint-footer {
  display: flex;
  gap: 12px;
  padding: 0 20px 20px;
  justify-content: flex-end;
}

.btn-cancel,
.btn-confirm {
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  border: none;
}

.btn-cancel {
  background: var(--hover-overlay);
  color: var(--text-secondary);
}

.btn-cancel:hover {
  background: var(--pressed-overlay);
  color: var(--text-primary);
}

.btn-confirm {
  color: var(--text-on-primary);
}

.btn-confirm.warning {
  background: #eab308;
}

.btn-confirm.warning:hover {
  background: #ca8a04;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { transform: translateY(10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
</style>
