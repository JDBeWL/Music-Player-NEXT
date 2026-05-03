<script setup lang="ts">
import { ref, computed } from 'vue';
import { Play, Music, Plus, Cloud, Folder } from 'lucide-vue-next';
import { getCoverUrl } from '@/utils/coverUrl';
import { useQueueStore } from '@/stores/queueStore';
import { usePlaylistStore } from '@/stores/playlistStore';
import NeteasePage from '@/components/netease/NeteasePage.vue';

const queueStore = useQueueStore();
const playlistStore = usePlaylistStore();

const emit = defineEmits<{
  'create-playlist': [];
  'open-playlist': [id: string];
}>();

const activeTab = ref<'local' | 'netease'>('local');

const playlists = computed(() => playlistStore.playlists);

function playPlaylist(id: string) {
  const playlist = playlistStore.playlists.find(p => p.id === id);
  if (playlist) {
    queueStore.loadPlaylistToQueue(playlist.tracks, id);
  }
}
</script>

<template>
  <section class="flex-1 overflow-hidden flex flex-col" role="main" aria-label="我的音乐">
    <div class="header-bar">
      <h2 class="header-title">我的音乐</h2>
      <div class="tab-group">
        <button
          class="tab-btn"
          :class="{ 'tab-active': activeTab === 'local' }"
          @click="activeTab = 'local'"
        >
          <Folder :size="16" />
          <span>本地音乐</span>
        </button>
        <button
          class="tab-btn"
          :class="{ 'tab-active': activeTab === 'netease' }"
          @click="activeTab = 'netease'"
        >
          <Cloud :size="16" />
          <span>Netease</span>
        </button>
      </div>
    </div>

    <div v-if="activeTab === 'local'" class="flex-1 overflow-y-auto px-8 py-6">
      <div class="mb-6">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-xl font-semibold text-[var(--text-primary)]">播放列表</h3>
          <button
            class="md3-btn-filled"
            @click="emit('create-playlist')"
          >
            <Plus :size="18" />
            <span>创建播放列表</span>
          </button>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
          <div
            v-for="playlist in playlists"
            :key="playlist.id"
            class="md3-card group cursor-pointer p-4"
            @click="emit('open-playlist', playlist.id)"
          >
            <div class="relative mb-4 aspect-square rounded-xl overflow-hidden bg-[var(--bg-tertiary)]">
              <img
                v-if="playlist.tracks.length > 0 && playlist.tracks[0].coverUrl"
                :src="getCoverUrl(playlist.tracks[0].coverUrl)"
                alt="封面"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full flex items-center justify-center">
                <Music :size="48" class="text-[var(--text-tertiary)]" />
              </div>
              <button
                class="absolute bottom-3 right-3 w-12 h-12 bg-[var(--color-primary)] rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300 hover:brightness-110"
                @click.stop="playPlaylist(playlist.id)"
              >
                <Play :size="20" class="text-[var(--text-on-primary)] ml-0.5" fill="white" />
              </button>
            </div>
            <h3 class="text-[var(--text-primary)] font-medium truncate mb-1">{{ playlist.name }}</h3>
            <p class="text-[var(--text-tertiary)] text-sm">{{ playlist.tracks.length }} 首歌曲</p>
          </div>
        </div>

        <div v-if="playlists.length === 0" class="flex flex-col items-center justify-center py-24">
          <div class="w-24 h-24 rounded-2xl bg-[var(--bg-surface)] flex items-center justify-center mb-6 border border-[var(--border-default)]">
            <Music :size="40" class="text-[var(--text-tertiary)]" />
          </div>
          <h3 class="text-lg font-medium text-[var(--text-primary)] mb-2">还没有播放列表</h3>
          <p class="text-sm text-[var(--text-tertiary)] mb-6">创建你的第一个播放列表，开始整理喜欢的音乐</p>
          <button
            class="md3-btn-filled"
            @click="emit('create-playlist')"
          >
            <Plus :size="16" />
            <span>创建播放列表</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="activeTab === 'netease'" class="flex-1 overflow-hidden">
      <NeteasePage />
    </div>
  </section>
</template>

<style scoped>
.header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 32px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.header-title {
  font-size: 1.875rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.tab-group {
  display: flex;
  gap: 6px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border: none;
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  background: var(--hover-overlay);
  color: var(--text-primary);
}

.tab-active {
  background: var(--color-primary-container);
  color: var(--color-on-primary-container);
}

.tab-active:hover {
  background: var(--color-primary-container);
  color: var(--color-on-primary-container);
}
</style>
