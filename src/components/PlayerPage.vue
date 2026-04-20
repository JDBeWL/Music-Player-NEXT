<script setup lang="ts">
import { Play, Music, Plus } from 'lucide-vue-next';
import { getCoverUrl } from '../stores/playerStore';

interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  coverUrl?: string;
}

interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
}

interface Props {
  playlists: Playlist[];
  currentTrack: Track | null;
  isLiked: boolean;
}

interface Emits {
  (e: 'create-playlist'): void;
  (e: 'open-playlist', id: string): void;
  (e: 'play-playlist', id: string): void;
  (e: 'toggle-like'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <section class="flex-1 overflow-hidden flex flex-col no-select" role="main" aria-label="我的音乐">
    <div class="px-8 py-6 border-b border-[var(--border-subtle)]">
      <h2 class="text-3xl font-bold text-[var(--text-primary)]">我的音乐</h2>
    </div>

    <div class="flex-1 overflow-y-auto px-8 py-6">
      <div class="mb-6">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-xl font-semibold text-[var(--text-primary)]">播放列表</h3>
          <button
            class="md3-btn-filled flex items-center gap-2"
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
                @click.stop="emit('play-playlist', playlist.id)"
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
            class="md3-btn-filled flex items-center gap-2"
            @click="emit('create-playlist')"
          >
            <Plus :size="16" />
            <span>创建播放列表</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.no-select {
  user-select: none;
  -webkit-user-select: none;
}
</style>