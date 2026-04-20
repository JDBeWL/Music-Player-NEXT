<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { Play, Edit, Music, Heart, Trash2, ArrowUpDown, ArrowUp, ArrowDown, GripVertical } from 'lucide-vue-next';
import { getCoverUrl } from '../stores/playerStore';

interface Track {
  id: string;
  path: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverUrl?: string;
}

interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
}

interface Props {
  playlist: Playlist;
  favoriteTrackPaths: string[];
  currentTrackId?: string;
  isPlaying?: boolean;
}

interface Emits {
  (e: 'play-playlist'): void;
  (e: 'play-track', trackId: string): void;
  (e: 'update-description', description: string): void;
  (e: 'remove-track', trackId: string): void;
  (e: 'toggle-favorite', track: Track): void;
  (e: 'reorder-tracks', fromIndex: number, toIndex: number): void;
}

type SortKey = 'default' | 'title' | 'artist' | 'album' | 'duration';
type SortOrder = 'asc' | 'desc';

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const isEditingDescription = ref(false);
const descriptionText = ref(props.playlist.description || '');
const showSortMenu = ref(false);
const sortKey = ref<SortKey>('default');
const sortOrder = ref<SortOrder>('asc');
const draggedIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);
const isDragging = ref(false);
const dragStartY = ref(0);
const DRAG_THRESHOLD = 20;
const draggedTrackId = ref<string | null>(null);

const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'default', label: '默认排序' },
  { key: 'title', label: '按标题' },
  { key: 'artist', label: '按艺术家' },
  { key: 'album', label: '按专辑' },
  { key: 'duration', label: '按时长' },
];

const sortedTracks = computed(() => {
  if (sortKey.value !== 'default') {
    return [...props.playlist.tracks].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;
      switch (sortKey.value) {
        case 'title':
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
          break;
        case 'artist':
          aVal = a.artist.toLowerCase();
          bVal = b.artist.toLowerCase();
          break;
        case 'album':
          aVal = a.album.toLowerCase();
          bVal = b.album.toLowerCase();
          break;
        case 'duration':
          aVal = a.duration;
          bVal = b.duration;
          break;
        default:
          return 0;
      }
      if (aVal < bVal) return sortOrder.value === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder.value === 'asc' ? 1 : -1;
      return 0;
    });
  }
  if (isDragging.value && draggedIndex.value !== null && dragOverIndex.value !== null) {
    const tracks = [...props.playlist.tracks];
    const [removed] = tracks.splice(draggedIndex.value, 1);
    tracks.splice(dragOverIndex.value, 0, removed);
    return tracks;
  }
  return props.playlist.tracks;
});

function toggleSortMenu() {
  showSortMenu.value = !showSortMenu.value;
}

function selectSort(key: SortKey) {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'asc';
  }
  showSortMenu.value = false;
}

function getSortIcon(key: SortKey) {
  if (sortKey.value !== key) return ArrowUpDown;
  return sortOrder.value === 'asc' ? ArrowUp : ArrowDown;
}

function closeSortMenu(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest('.sort-dropdown')) {
    showSortMenu.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', closeSortMenu);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
});

onUnmounted(() => {
  document.removeEventListener('click', closeSortMenu);
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
});

function handleGripMouseDown(e: MouseEvent, index: number) {
  if (sortKey.value !== 'default') return;
  e.preventDefault();
  e.stopPropagation();
  isDragging.value = true;
  draggedIndex.value = index;
  draggedTrackId.value = props.playlist.tracks[index]?.id || null;
  dragStartY.value = e.clientY;
}

function handleMouseMove(e: MouseEvent) {
  if (!isDragging.value || draggedIndex.value === null) return;

  const trackElements = document.querySelectorAll('.track-item');
  let closestIndex = -1;
  let minDistance = Infinity;

  trackElements.forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    const elementCenterY = rect.top + rect.height / 2;
    const distance = Math.abs(e.clientY - elementCenterY);
    if (distance < minDistance) {
      minDistance = distance;
      closestIndex = i;
    }
  });

  if (closestIndex !== -1) {
    dragOverIndex.value = closestIndex;
  }
}

function handleMouseUp(e: MouseEvent) {
  if (!isDragging.value) return;
  const dragDistance = Math.abs(e.clientY - dragStartY.value);
  const fromIndex = draggedIndex.value;
  const toIndex = dragOverIndex.value;
  if (dragDistance >= DRAG_THRESHOLD && fromIndex !== null && toIndex !== null && fromIndex !== toIndex) {
    emit('reorder-tracks', fromIndex, toIndex);
  }
  isDragging.value = false;
  draggedIndex.value = null;
  dragOverIndex.value = null;
  draggedTrackId.value = null;
}

const playlistCover = computed(() => {
  if (props.playlist.coverUrl) {
    return getCoverUrl(props.playlist.coverUrl);
  }
  if (props.playlist.tracks.length > 0 && props.playlist.tracks[0].coverUrl) {
    return getCoverUrl(props.playlist.tracks[0].coverUrl);
  }
  return undefined;
});

watch(() => props.playlist.description, (newDesc) => {
  descriptionText.value = newDesc || '';
});

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function startEditDescription() {
  isEditingDescription.value = true;
}

function saveDescription() {
  emit('update-description', descriptionText.value);
  isEditingDescription.value = false;
}

function cancelEditDescription() {
  descriptionText.value = props.playlist.description || '';
  isEditingDescription.value = false;
}

function isTrackFavorite(trackPath: string): boolean {
  return props.favoriteTrackPaths.includes(trackPath);
}
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden">
    <div class="flex-1 overflow-y-auto px-8 py-8">
      <div class="max-w-5xl mx-auto">
        <div class="flex gap-8 mb-8">
          <div class="w-52 h-52 rounded-2xl overflow-hidden flex-shrink-0 shadow-lg elevation-2">
            <img v-if="playlistCover" :src="playlistCover" alt="播放列表封面" class="w-full h-full object-cover" />
            <div v-else class="w-full h-full bg-[var(--bg-surface)] flex items-center justify-center">
              <Music :size="72" class="text-[var(--text-tertiary)]" />
            </div>
          </div>

          <div class="flex-1 flex flex-col justify-end">
            <h1 class="text-4xl font-bold text-[var(--text-primary)] mb-3">{{ playlist.name }}</h1>
            <p class="text-[var(--text-tertiary)] mb-4 no-select">{{ playlist.tracks.length }} 首歌曲</p>

            <div class="mb-4">
              <div v-if="!isEditingDescription">
                <p v-if="playlist.description" class="text-[var(--text-secondary)]">{{ playlist.description }}</p>
                <p v-else class="text-[var(--text-disabled)]">添加描述...</p>
                <button class="mt-2 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 no-select transition-colors" @click="startEditDescription">
                  <Edit :size="14" />
                  编辑
                </button>
              </div>
              <div v-else>
                <textarea
                  v-model="descriptionText"
                  class="md3-text-field resize-none"
                  placeholder="输入播放列表描述..."
                  rows="3"
                ></textarea>
                <div class="flex gap-2 mt-3">
                  <button class="md3-btn-filled text-sm" @click="saveDescription">保存</button>
                  <button class="md3-btn-outlined text-sm" @click="cancelEditDescription">取消</button>
                </div>
              </div>
            </div>

            <button class="md3-btn-filled flex items-center gap-2 w-fit no-select" @click="emit('play-playlist')">
              <Play :size="18" />
              播放全部
            </button>
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-xl font-semibold text-[var(--text-primary)] no-select">歌曲列表</h3>
            <div class="relative sort-dropdown no-select">
              <button
                class="md3-chip flex items-center gap-2 no-select"
                @click="toggleSortMenu"
              >
                <component :is="getSortIcon(sortKey)" :size="16" />
                <span>{{ sortOptions.find(o => o.key === sortKey)?.label }}</span>
              </button>
              <div
                v-if="showSortMenu"
                class="absolute right-0 top-full mt-2 p-2 elevation-3 rounded-2xl min-w-[160px] z-10"
              >
                <button
                  v-for="option in sortOptions"
                  :key="option.key"
                  class="w-full px-3 py-2.5 text-left text-sm flex items-center justify-between rounded-xl transition-colors"
                  :class="sortKey === option.key ? 'text-[var(--color-primary)] bg-[var(--color-primary-container)]' : 'text-[var(--text-secondary)] hover:bg-[var(--hover-overlay)]'"
                  @click="selectSort(option.key)"
                >
                  <span>{{ option.label }}</span>
                  <component :is="getSortIcon(option.key)" :size="14" />
                </button>
              </div>
            </div>
          </div>

          <div v-if="playlist.tracks.length === 0" class="flex flex-col items-center justify-center py-24">
            <div class="w-20 h-20 rounded-2xl bg-[var(--bg-surface)] flex items-center justify-center mb-5 border border-[var(--border-default)]">
              <Music :size="32" class="text-[var(--text-tertiary)]" />
            </div>
            <h3 class="text-base font-medium text-[var(--text-primary)] mb-1">播放列表为空</h3>
            <p class="text-sm text-[var(--text-tertiary)]">添加一些歌曲来填充这个列表</p>
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="(track, trackIndex) in sortedTracks"
              :key="track.id"
              class="track-item flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-150 group no-select relative state-layer"
              :class="[
                isDragging && track.id === draggedTrackId ? 'opacity-50 scale-[0.98] elevation-2 z-10' : '',
                !isDragging && track.id === currentTrackId ? 'bg-[var(--color-primary-container)]' : ''
              ]"
              @click="!isDragging && emit('play-track', track.id)"
            >
              <div class="w-8 h-8 flex items-center justify-center">
                <span v-if="track.id !== currentTrackId || !isPlaying" class="text-[var(--text-tertiary)] font-medium">{{ trackIndex + 1 }}</span>
                <div v-else class="flex items-center justify-center gap-0.5">
                  <div class="w-0.5 h-3 bg-[var(--color-primary)] animate-pulse"></div>
                  <div class="w-0.5 h-2 bg-[var(--color-primary)] animate-pulse" style="animation-delay: 0.1s"></div>
                  <div class="w-0.5 h-3 bg-[var(--color-primary)] animate-pulse" style="animation-delay: 0.2s"></div>
                </div>
              </div>
              <GripVertical
                v-if="sortKey === 'default'"
                :size="16"
                class="text-[var(--text-disabled)] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                @mousedown.stop.prevent="handleGripMouseDown($event, trackIndex)"
              />
              <div v-else class="w-4 flex-shrink-0"></div>
              <div class="w-12 h-12 rounded-md overflow-hidden flex-shrink-0 bg-[var(--bg-tertiary)]">
                <img v-if="track.coverUrl" :src="getCoverUrl(track.coverUrl)" alt="封面" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <Music :size="18" class="text-[var(--text-tertiary)]" />
                </div>
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-[var(--text-primary)] font-medium truncate" :class="{ 'text-[var(--color-primary)]': track.id === currentTrackId }">{{ track.title }}</div>
                <div class="text-[var(--text-tertiary)] text-sm truncate">{{ track.artist }}</div>
              </div>
              <div class="text-[var(--text-tertiary)] text-sm">{{ formatTime(track.duration) }}</div>
              <button
                class="md3-icon-btn-sm opacity-0 group-hover:opacity-100"
                :class="isTrackFavorite(track.path) ? 'text-red-400' : 'text-[var(--text-tertiary)]'"
                @click.stop="emit('toggle-favorite', track)"
              >
                <Heart :size="16" :fill="isTrackFavorite(track.path) ? 'currentColor' : 'none'" />
              </button>
              <button
                class="md3-icon-btn-sm opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-red-400"
                @click.stop="emit('remove-track', track.id)"
              >
                <Trash2 :size="16" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>