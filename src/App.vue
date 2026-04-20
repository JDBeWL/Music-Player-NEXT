<script setup lang="ts">
/**
 * SPDX-License-Identifier: Apache-2.0
 */

import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { usePlayerStore } from './stores/playerStore';
import { useConfigStore } from './stores/configStore';
import { useThemeColor } from './composables/useThemeColor';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import Sidebar from './components/Sidebar.vue';
import TitleBar from './components/TitleBar.vue';
import PlayerBar from './components/PlayerBar.vue';
import QueuePanel from './components/QueuePanel.vue';
import NowPlayingPanel from './components/NowPlayingPanel.vue';
import PlayerPage from './components/PlayerPage.vue';
import LocalPage from './components/LocalPage.vue';
import SettingsPage from './components/SettingsPage.vue';
import PlaylistDetailPage from './components/PlaylistDetailPage.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import PromptDialog from './components/PromptDialog.vue';

const playerStore = usePlayerStore();
const configStore = useConfigStore();
const { updateThemeFromCover } = useThemeColor();

onMounted(async () => {
  playerStore.setOnTrackEndCallback(handlePlayNext);

  await configStore.loadConfig();

  await Promise.all([
    playerStore.loadLibrary(),
    playerStore.loadVolumeSettings()
  ]);

  await playerStore.restorePlaybackState();

  if (playerStore.libraryTracks.length > 0) {
    console.log('[App] Starting cover preload...');
    playerStore.preloadAllCovers();
  }

  window.addEventListener('save-playback-before-close', handleSavePlaybackBeforeClose);
  window.addEventListener('keydown', handleGlobalKeydown);

  listen('show-close-hint-dialog', () => {
    showCloseHintDialog.value = true;
  });
});

onUnmounted(() => {
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
          playerStore.togglePlay();
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
          playerStore.playPrev();
          break;
      }
      return;
    }
  }
}

function handleSavePlaybackBeforeClose() {
  playerStore.savePlaybackState();
}

watch(() => playerStore.currentCoverUrl, (coverUrl) => {
  if (coverUrl) {
    updateThemeFromCover(coverUrl);
  }
}, { immediate: true });

type ViewName = 'player' | 'local' | 'settings' | 'playlist-detail';

const currentView = ref<ViewName>('player');
const showQueuePanel = ref(false);
const showNowPlayingPanel = ref(false);
const showPlaylistDialog = ref(false);
const showDeleteConfirm = ref(false);
const showCloseHintDialog = ref(false);
const pendingDeleteId = ref<string | null>(null);
const showCreatePrompt = ref(false);
const currentPlaylistId = ref<string | null>(null);
const isScanning = ref(false);

interface NavEntry {
  view: ViewName;
  playlistId?: string | null;
}

const navHistory = ref<NavEntry[]>([{ view: 'player' }]);
const navHistoryIndex = ref(0);

function pushHistory(view: ViewName, playlistId?: string | null) {
  const current = navHistory.value[navHistoryIndex.value];
  if (current.view !== view || current.playlistId !== playlistId) {
    navHistory.value = navHistory.value.slice(0, navHistoryIndex.value + 1);
    navHistory.value.push({ view, playlistId: playlistId ?? null });
    navHistoryIndex.value = navHistory.value.length - 1;
  }
}

function navigateBack() {
  if (navHistoryIndex.value > 0) {
    navHistoryIndex.value--;
    const entry = navHistory.value[navHistoryIndex.value];
    currentView.value = entry.view;
    currentPlaylistId.value = entry.playlistId ?? null;
  }
}

function navigateForward() {
  if (navHistoryIndex.value < navHistory.value.length - 1) {
    navHistoryIndex.value++;
    const entry = navHistory.value[navHistoryIndex.value];
    currentView.value = entry.view;
    currentPlaylistId.value = entry.playlistId ?? null;
  }
}

function handleNavigate(view: string) {
  const newView = view as ViewName;
  if (newView !== 'playlist-detail') {
    currentPlaylistId.value = null;
  }
  currentView.value = newView;
  pushHistory(newView);
}

function openPlaylist(playlistId: string) {
  currentPlaylistId.value = playlistId;
  currentView.value = 'playlist-detail';
  pushHistory('playlist-detail', playlistId);
}

function closePlaylistDetail() {
  navigateBack();
}

const canGoBack = computed(() => navHistoryIndex.value > 0);
const canGoForward = computed(() => navHistoryIndex.value < navHistory.value.length - 1);

const isCurrentTrackFavorite = computed(() => {
  if (!playerStore.currentTrack) return false;
  return playerStore.isTrackFavorite(playerStore.currentTrack.path);
});

const playbackStatusLabel = computed(() => {
  if (!playerStore.currentTrack) return '';
  const status = playerStore.isPlaying ? '正在播放' : '已暂停';
  return `${status}：${playerStore.currentTrack.title}，艺术家：${playerStore.currentTrack.artist}`;
});

const favoriteTrackPaths = computed(() => {
  return playerStore.favoritePlaylist?.tracks.map(t => t.path) ?? [];
});

function handlePlayNext() {
  const queue = playerStore.queue;
  if (queue.length === 0) return;

  if (playerStore.isShuffle) {
    const currentIdx = playerStore.currentIndex;
    if (queue.length === 1) return;
    let randomIndex;
    do {
      randomIndex = Math.floor(Math.random() * queue.length);
    } while (randomIndex === currentIdx);
    playerStore.playTrack(randomIndex);
    return;
  }

  if (playerStore.repeatMode === 'one') {
    playerStore.playTrack(playerStore.currentIndex);
    return;
  }

  const nextIndex = playerStore.currentIndex + 1;
  if (nextIndex >= queue.length) {
    if (playerStore.repeatMode === 'all') {
      playerStore.playTrack(0);
    }
    return;
  }

  playerStore.playTrack(nextIndex);
}

function cycleRepeatMode() {
  const modes: Array<'none' | 'one' | 'all'> = ['all', 'one', 'none'];
  const currentIdx = modes.indexOf(playerStore.repeatMode);
  playerStore.repeatMode = modes[(currentIdx + 1) % modes.length];
  playerStore.savePlaybackModeSettings();
}

function toggleShuffle() {
  playerStore.isShuffle = !playerStore.isShuffle;
  playerStore.savePlaybackModeSettings();
}

function toggleFavorite() {
  if (!playerStore.currentTrack) return;
  playerStore.toggleFavorite(playerStore.currentTrack);
}

function handleCloseHintConfirm() {
  configStore.setCloseBehavior('quit');
  showCloseHintDialog.value = false;
  invoke('quit_app').catch(console.error);
}

function handleCloseHintCancel() {
  configStore.setCloseBehavior('to_tray');
  showCloseHintDialog.value = false;
}

function openCreatePrompt() {
  showCreatePrompt.value = true;
}

function handleCreatePlaylist(name: string) {
  playerStore.createPlaylist(name);
  showCreatePrompt.value = false;
}

function playPlaylist(id: string) {
  playerStore.loadPlaylistToQueue(id);
}

function playTrackFromPlaylist(trackId: string) {
  if (!currentPlaylistId.value) return;
  playerStore.playTrackFromPlaylist(currentPlaylistId.value, trackId);
}

function updatePlaylistDescription(description: string) {
  if (!currentPlaylistId.value) return;
  playerStore.updatePlaylistDescription(currentPlaylistId.value, description);
}

function removeTrackFromPlaylist(trackId: string) {
  if (!currentPlaylistId.value) return;
  playerStore.removeFromPlaylist(currentPlaylistId.value, trackId);
}

function reorderTracksInPlaylist(fromIndex: number, toIndex: number) {
  if (!currentPlaylistId.value) return;
  playerStore.reorderPlaylistTracks(currentPlaylistId.value, fromIndex, toIndex);
}

function toggleTrackFavorite(track: any) {
  playerStore.toggleFavorite(track);
}

function requestDeletePlaylist(playlistId: string) {
  pendingDeleteId.value = playlistId;
  showDeleteConfirm.value = true;
}

async function confirmDeletePlaylist() {
  const playlistIdToDelete = pendingDeleteId.value;
  showDeleteConfirm.value = false;
  pendingDeleteId.value = null;

  if (playlistIdToDelete) {
    if (currentPlaylistId.value === playlistIdToDelete) {
      closePlaylistDetail();
    }
    await playerStore.deletePlaylist(playlistIdToDelete);
  }
}

function cancelDeletePlaylist() {
  pendingDeleteId.value = null;
  showDeleteConfirm.value = false;
}

async function addLibraryFolder() {
  try {
    const folderPath = await invoke<string | null>('open_folder_dialog');
    if (folderPath) {
      await playerStore.addFolder(folderPath);
    }
  } catch (error) {
    console.error('Failed to add folder:', error);
  }
}

async function scanFolders() {
  isScanning.value = true;
  try {
    await playerStore.scanLibraryFolders();
  } finally {
    isScanning.value = false;
  }
}

function addSelectedToPlaylist() {
  if (playerStore.selectedFileIds.size === 0) {
    console.log('[App] No files selected');
    return;
  }
  console.log('[App] Opening playlist dialog, selected:', playerStore.selectedFileIds.size, 'files');
  showPlaylistDialog.value = true;
}

function handleAddToPlaylist(playlistId: string) {
  console.log('[App] Adding to playlist:', playlistId);
  playerStore.addSelectedToPlaylist(playlistId);
  showPlaylistDialog.value = false;
}

function addSelectedToQueue() {
  playerStore.addSelectedToQueue();
}

function selectFolder(folder: string) {
  playerStore.selectFolder(folder);
}

function handleSelectAll() {
  playerStore.selectAllFiles();
}

function playSearchAsNext(track: any) {
  playerStore.insertAndPlayNext(track);
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
        :playlists="playerStore.playlists.map(p => ({ id: p.id, name: p.name, trackCount: p.tracks.length }))"
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
            <PlayerPage
              v-if="currentView === 'player'"
              :playlists="playerStore.playlists"
              :current-track="playerStore.currentTrack"
              :is-liked="isCurrentTrackFavorite"
              @create-playlist="openCreatePrompt"
              @open-playlist="openPlaylist"
              @play-playlist="playPlaylist"
              @toggle-like="toggleFavorite"
            />

            <LocalPage
              v-else-if="currentView === 'local'"
              :tracks="playerStore.libraryTracks"
              :selected-ids="playerStore.selectedFileIds"
              :tracks-by-folder="playerStore.tracksByFolder"
              :favorite-track-paths="favoriteTrackPaths"
              @toggle-selection="playerStore.toggleFileSelection"
              @select-all="handleSelectAll"
              @deselect-all="playerStore.deselectAllFiles"
              @select-folder="selectFolder"
              @add-to-playlist="addSelectedToPlaylist"
              @add-to-queue="addSelectedToQueue"
              @toggle-favorite="toggleTrackFavorite"
              @navigate="handleNavigate"
            />

            <SettingsPage
              v-else-if="currentView === 'settings'"
              :folders="playerStore.libraryFolders"
              :scan-depth="playerStore.scanDepth"
              :is-scanning="isScanning"
              :scan-progress="playerStore.scanProgress"
              @add-folder="addLibraryFolder"
              @remove-folder="playerStore.removeFolder"
              @scan-folders="scanFolders"
              @update-scan-depth="playerStore.setScanDepth"
            />

            <PlaylistDetailPage
              v-else-if="currentView === 'playlist-detail' && currentPlaylistId"
              :playlist="playerStore.playlists.find(p => p.id === currentPlaylistId)!"
              :current-track-id="playerStore.currentTrack?.id"
              :is-playing="playerStore.isPlaying"
              :favorite-track-paths="favoriteTrackPaths"
              @play-playlist="playPlaylist(currentPlaylistId)"
              @play-track="playTrackFromPlaylist"
              @update-description="updatePlaylistDescription"
              @remove-track="removeTrackFromPlaylist"
              @reorder-tracks="reorderTracksInPlaylist"
              @toggle-favorite="toggleTrackFavorite"
            />
          </div>

          <NowPlayingPanel
            v-model="showNowPlayingPanel"
            :current-track="playerStore.currentTrack"
            :current-time="playerStore.currentTime"
            @seek="playerStore.setCurrentTime"
          />

          <QueuePanel
            v-model="showQueuePanel"
            :queue="playerStore.queue"
            :current-index="playerStore.currentIndex"
            :is-playing="playerStore.isPlaying"
            @select-track="playerStore.playTrack"
            @remove-track="playerStore.removeFromQueue"
            @clear-queue="playerStore.clearQueue"
          />

          <div v-if="showPlaylistDialog" class="dialog-overlay" @click="showPlaylistDialog = false">
            <div class="dialog-content md3-surface-tinted" @click.stop>
              <div class="dialog-header">
                <h3 class="text-lg font-semibold text-[var(--text-primary)]">添加到播放列表</h3>
                <button class="md3-icon-btn-sm text-[var(--text-tertiary)]" @click="showPlaylistDialog = false">×</button>
              </div>
              <div class="dialog-body">
                <div v-if="playerStore.playlists.length === 0" class="text-center py-16 px-5">
                  <p class="text-[var(--text-tertiary)]">还没有播放列表</p>
                  <p class="text-sm text-[var(--text-disabled)] mt-1">请先创建一个播放列表</p>
                </div>
                <div v-else class="space-y-2">
                  <button
                    v-for="playlist in playerStore.playlists"
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
      :current-track="playerStore.currentTrack"
      :is-playing="playerStore.isPlaying"
      :current-time="playerStore.currentTime"
      :duration="playerStore.duration"
      :volume="playerStore.volume"
      :is-shuffle="playerStore.isShuffle"
      :repeat-mode="playerStore.repeatMode"
      :show-queue-panel="showQueuePanel"
      :show-now-playing-panel="showNowPlayingPanel"
      :cover-url="playerStore.currentCoverUrl"
      :is-favorite="isCurrentTrackFavorite"
      @toggle-play="playerStore.togglePlay"
      @play-next="playerStore.playNext"
      @play-prev="playerStore.playPrev"
      @time-change="playerStore.setCurrentTime"
      @volume-change="playerStore.setVolume"
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
      @confirm="confirmDeletePlaylist"
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

    <ConfirmDialog
      :open="showCloseHintDialog"
      title="选择关闭行为"
      message="关闭按钮将直接退出应用。如果想最小化到托盘，请在设置中修改关闭按钮行为。您希望如何处理？"
      confirm-text="直接退出"
      cancel-text="最小化到托盘"
      variant="warning"
      @confirm="handleCloseHintConfirm"
      @cancel="handleCloseHintCancel"
    />
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
  backdrop-filter: blur(8px);
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