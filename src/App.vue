<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { usePlaybackStore } from './stores/playbackStore';
import { usePlaylistStore } from './stores/playlistStore';
import { useLibraryStore } from './stores/libraryStore';
import { useThemeColor } from './composables/useThemeColor';
import { useNavigation } from './composables/useNavigation';
import { usePlayerControls } from './composables/usePlayerControls';
import { usePlaylistManager } from './composables/usePlaylistManager';
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts';
import { useAppInit } from './composables/useAppInit';
import Sidebar from './components/Sidebar.vue';
import TitleBar from './components/TitleBar.vue';
import PlayerBar from './components/PlayerBar.vue';
import QueuePanel from './components/QueuePanel.vue';
import NowPlayingPanel from './components/NowPlayingPanel.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import PromptDialog from './components/PromptDialog.vue';
import CloseHintDialog from './components/CloseHintDialog.vue';
import AddToPlaylistDialog from './components/AddToPlaylistDialog.vue';

const playbackStore = usePlaybackStore();
const libraryStore = useLibraryStore();
const playlistStore = usePlaylistStore();
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
} = usePlaylistManager();

const closeHintDialogRef = ref<InstanceType<typeof CloseHintDialog> | null>(null);

useKeyboardShortcuts();
useAppInit(closeHintDialogRef as any);

const showQueuePanel = ref(false);
const showNowPlayingPanel = ref(false);

const favoritePaths = computed(() => {
  const fav = playlistStore.favoritePlaylist;
  if (!fav) return new Set<string>();
  return new Set(fav.tracks.map(t => t.path));
});

function handleToggleFavorite(track: any) {
  playlistStore.toggleFavorite(track);
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

          <AddToPlaylistDialog v-model="showPlaylistDialog" />
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

    <CloseHintDialog ref="closeHintDialogRef" />
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
</style>
