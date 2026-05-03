<script setup lang="ts">
import {
  Play,
  Loader2,
  Music,
  Clock,
  Download,
  Check,
} from 'lucide-vue-next';
import { formatDurationMs } from '@/utils/format';

interface Song {
  id: number;
  name: string;
  ar?: Array<{ name: string }>;
  artists?: Array<{ name: string }>;
  al?: { name: string; picUrl?: string };
  album?: { name: string; picUrl?: string };
  dt?: number;
  duration?: number;
  fee?: number;
}

const props = defineProps<{
  song: Song;
  index: number;
  isPlaying: boolean;
  isLoading: boolean;
  isDownloading: boolean;
  isDownloaded: boolean;
}>();

const emit = defineEmits<{
  play: [];
  download: [event: Event];
}>();

function getFeeTag(fee: number | undefined): string {
  switch (fee) {
    case 1: return 'VIP';
    case 4: return '付费';
    default: return '';
  }
}

function getSongArtists(song: Song): string {
  const artists = song.ar || song.artists || [];
  return artists.map((a) => a.name).join(' / ');
}

function getSongAlbum(song: Song): { name: string; picUrl?: string } | undefined {
  return song.al || song.album;
}

function getSongDuration(song: Song): number {
  return song.dt ?? song.duration ?? 0;
}
</script>

<template>
  <div
    class="result-item"
    :class="{ 'is-playing': isPlaying }"
    @click="emit('play')"
  >
    <div class="result-index">
      <Loader2 v-if="isLoading" :size="14" class="animate-spin" />
      <Play v-else-if="isPlaying" :size="14" class="playing-icon" />
      <span v-else>{{ index + 1 }}</span>
    </div>
    <div class="result-cover">
      <img
        v-if="getSongAlbum(song)?.picUrl"
        :src="(getSongAlbum(song)?.picUrl ?? '') + '?param=80y80'"
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
        <span v-if="getSongAlbum(song)?.name" class="result-album"> - {{ getSongAlbum(song)?.name }}</span>
      </span>
    </div>
    <div class="result-duration">
      <Clock :size="12" />
      <span>{{ formatDurationMs(getSongDuration(song) || 0) }}</span>
    </div>
    <button
      class="result-download-btn"
      :class="{ 'downloaded': isDownloaded }"
      @click="emit('download', $event)"
      :disabled="isDownloading"
      :title="isDownloaded ? '已下载' : '下载'"
    >
      <Loader2 v-if="isDownloading" :size="14" class="animate-spin" />
      <Check v-else-if="isDownloaded" :size="14" />
      <Download v-else :size="14" />
    </button>
  </div>
</template>

<style scoped>
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
</style>
