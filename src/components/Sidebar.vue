<script setup lang="ts">
import { ref } from 'vue';
import { Music, Folder, Settings, Plus, Trash2, ListMusic, PanelLeftClose, PanelLeftOpen } from 'lucide-vue-next';

interface Playlist {
  id: string;
  name: string;
  trackCount: number;
}

interface Props {
  currentView: string;
  currentPlaylistId: string | null;
  playlists: Playlist[];
}

interface Emits {
  (e: 'navigate', view: string): void;
  (e: 'open-playlist', id: string): void;
  (e: 'request-create'): void;
  (e: 'request-delete', id: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const isCollapsed = ref(false);

function handlePlaylistClick(playlist: Playlist) {
  emit('open-playlist', playlist.id);
}

function handleDeletePlaylist(e: Event, playlistId: string) {
  e.stopPropagation();
  emit('request-delete', playlistId);
}

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value;
}
</script>

<template>
  <aside
    class="sidebar-container"
    :class="{ 'sidebar-collapsed': isCollapsed }"
    role="complementary"
    aria-label="侧边栏"
  >
    <div class="sidebar-header">
      <Transition name="fade-text">
        <span v-if="!isCollapsed" class="sidebar-title">Mercurial Player NEXT</span>
      </Transition>
      <button class="collapse-btn" @click="toggleCollapse" :title="isCollapsed ? '展开侧边栏' : '收起侧边栏'" aria-label="侧边栏折叠">
        <component :is="isCollapsed ? PanelLeftOpen : PanelLeftClose" :size="18" />
      </button>
    </div>

    <nav class="sidebar-nav" role="navigation" aria-label="主导航">
      <button
        class="nav-item state-layer"
        :class="{ 'nav-active': currentView === 'player' }"
        @click="emit('navigate', 'player')"
        :title="isCollapsed ? '发现' : undefined"
        aria-label="发现"
      >
        <Music :size="20" class="flex-shrink-0" />
        <Transition name="fade-text">
          <span v-if="!isCollapsed">发现</span>
        </Transition>
      </button>
      <button
        class="nav-item state-layer"
        :class="{ 'nav-active': currentView === 'local' }"
        @click="emit('navigate', 'local')"
        :title="isCollapsed ? '本地文件' : undefined"
        aria-label="本地文件"
      >
        <Folder :size="20" class="flex-shrink-0" />
        <Transition name="fade-text">
          <span v-if="!isCollapsed">本地文件</span>
        </Transition>
      </button>
      <button
        class="nav-item state-layer"
        :class="{ 'nav-active': currentView === 'settings' }"
        @click="emit('navigate', 'settings')"
        :title="isCollapsed ? '设置' : undefined"
        aria-label="设置"
      >
        <Settings :size="20" class="flex-shrink-0" />
        <Transition name="fade-text">
          <span v-if="!isCollapsed">设置</span>
        </Transition>
      </button>
    </nav>

    <div class="playlist-header">
      <Transition name="fade-text">
        <span v-if="!isCollapsed" class="playlist-label">播放列表</span>
      </Transition>
      <button
        class="playlist-add-btn state-layer"
        @click="emit('request-create')"
        :title="isCollapsed ? '创建播放列表' : undefined"
        aria-label="创建播放列表"
      >
        <Plus :size="16" />
      </button>
    </div>

    <div class="sidebar-playlists">
      <div class="playlist-list">
        <div
          v-for="playlist in playlists"
          :key="playlist.id"
          class="playlist-item state-layer"
          :class="{ 'playlist-active': currentPlaylistId === playlist.id }"
          @click="handlePlaylistClick(playlist)"
          :title="isCollapsed ? playlist.name : undefined"
        >
          <ListMusic :size="18" class="flex-shrink-0" />
          <Transition name="fade-text">
            <span v-if="!isCollapsed" class="playlist-name">{{ playlist.name }}</span>
          </Transition>
          <button
            v-show="!isCollapsed && playlist.id !== 'favorite_playlist'"
            class="playlist-delete-btn"
            @click="handleDeletePlaylist($event, playlist.id)"
            title="删除播放列表"
            :aria-label="`删除播放列表 ${playlist.name}`"
          >
            <Trash2 :size="14" />
          </button>
        </div>
        <div v-if="playlists.length === 0 && !isCollapsed" class="playlist-empty">
          <ListMusic :size="24" class="text-[var(--text-tertiary)] mx-auto mb-2" />
          <p class="text-xs text-[var(--text-tertiary)]">暂无播放列表</p>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-container {
  width: 260px;
  background: var(--elevation-1-bg);
  border-right: 1px solid var(--elevation-1-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width 0.25s cubic-bezier(0.32, 0.72, 0, 1);
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
}

.sidebar-collapsed {
  width: 72px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
  min-height: 56px;
  overflow: hidden;
}

.sidebar-collapsed .sidebar-header {
  justify-content: center;
  padding: 8px;
  gap: 0;
  min-height: 48px;
}

.sidebar-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  flex: 1;
}

.collapse-btn {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.sidebar-collapsed .collapse-btn {
  margin-left: 0;
}

.collapse-btn:hover {
  background: var(--hover-overlay);
  color: var(--text-secondary);
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  padding: var(--space-3);
  gap: var(--space-1);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-3);
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 15px;
  font-weight: 500;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: none;
  white-space: nowrap;
  overflow: hidden;
  min-height: 48px;
  position: relative;
}

.sidebar-collapsed .nav-item {
  justify-content: center;
  padding: 0;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
}

.nav-item:hover {
  color: var(--text-primary);
}

.nav-active {
  background: var(--color-primary-container);
  color: var(--color-on-primary-container);
}

.nav-active:hover {
  color: var(--color-on-primary-container);
}

.playlist-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-4);
  min-height: 48px;
  overflow: hidden;
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.sidebar-playlists {
  flex: 1;
  overflow-y: auto;
  padding:  0 var(--space-3);
}

.sidebar-collapsed .playlist-header {
  justify-content: center;
  padding: var(--space-2);
}

.playlist-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.playlist-add-btn {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.playlist-add-btn:hover {
  color: var(--color-primary);
}

.playlist-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: 0;
}

.playlist-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: none;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  min-height: 48px;
  position: relative;
}

.sidebar-collapsed .playlist-item {
  justify-content: center;
  padding: 0;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
}

.playlist-item:hover {
  color: var(--text-primary);
}

.playlist-active {
  background: var(--color-primary-container);
  color: var(--color-on-primary-container);
}

.playlist-name {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
}

.playlist-delete-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--text-disabled);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.playlist-delete-btn:hover {
  color: #f87171;
}

.playlist-empty {
  text-align: center;
  padding: var(--space-6) var(--space-4);
}

.playlist-empty p {
  font-size: 12px;
  color: var(--text-tertiary);
}

.fade-text-enter-active {
  transition: opacity 0.15s ease;
}

.fade-text-leave-active {
  transition: opacity 0.1s ease;
}

.fade-text-enter-from,
.fade-text-leave-to {
  opacity: 0;
}
</style>