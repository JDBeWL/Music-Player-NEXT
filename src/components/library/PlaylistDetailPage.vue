<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, shallowRef } from 'vue';
import { useRoute } from 'vue-router';
import { Play, Edit, Music, Heart, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-vue-next';
import { getCoverUrl } from '@/utils/coverUrl';
import { formatTime } from '@/utils/format';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useQueueStore } from '@/stores/queueStore';
import { usePlaylistStore } from '@/stores/playlistStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { useTrackActions } from '@/composables/useTrackActions';
import type { AudioTrack } from '@/types';

const ITEM_HEIGHT = 72;
const OVERSCAN = 5; // 上下额外渲染的项数
const MAX_VIRTUAL_ITEMS = 100; // 超过此数量启用虚拟滚动

const route = useRoute();
const playbackStore = usePlaybackStore();
const queueStore = useQueueStore();
const playlistStore = usePlaylistStore();
const libraryStore = useLibraryStore();

const { isTrackFavorite, toggleFavorite } = useTrackActions();

const playlistId = computed(() => route.params.id as string);
const playlist = computed(() => playlistStore.playlists.find(p => p.id === playlistId.value)!);
const currentTrackId = computed(() => playbackStore.currentTrack?.id);
const isPlaying = computed(() => playbackStore.isPlaying);

type SortKey = 'default' | 'title' | 'artist' | 'album' | 'duration';
type SortOrder = 'asc' | 'desc';

const isEditingDescription = ref(false);
const descriptionText = ref('');
const showSortMenu = ref(false);
const sortKey = ref<SortKey>('default');
const sortOrder = ref<SortOrder>('asc');
const draggedIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);
const isDragging = ref(false);
const isLongPressing = ref(false);
const dragStartY = ref(0);
const LONG_PRESS_DURATION = 300;
const draggedTrackId = ref<string | null>(null);
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let lastClickTime = 0;
let lastClickTrackId: string | null = null;

const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'default', label: '默认排序' },
  { key: 'title', label: '按标题' },
  { key: 'artist', label: '按艺术家' },
  { key: 'album', label: '按专辑' },
  { key: 'duration', label: '按时长' },
];

// 使用 shallowRef 缓存排序结果，避免深层响应式追踪
const sortedTracksCache = shallowRef<AudioTrack[]>([]);

watch(
  [() => playlist.value?.tracks, sortKey, sortOrder, isDragging, draggedIndex, dragOverIndex],
  () => {
    const pl = playlist.value;
    if (!pl) {
      sortedTracksCache.value = [];
      return;
    }
    if (sortKey.value !== 'default') {
      sortedTracksCache.value = [...pl.tracks].sort((a, b) => {
        let aVal: string | number;
        let bVal: string | number;
        switch (sortKey.value) {
          case 'title': aVal = a.title.toLowerCase(); bVal = b.title.toLowerCase(); break;
          case 'artist': aVal = a.artist.toLowerCase(); bVal = b.artist.toLowerCase(); break;
          case 'album': aVal = a.album.toLowerCase(); bVal = b.album.toLowerCase(); break;
          case 'duration': aVal = a.duration; bVal = b.duration; break;
          default: return 0;
        }
        if (aVal < bVal) return sortOrder.value === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortOrder.value === 'asc' ? 1 : -1;
        return 0;
      });
    } else if (isDragging.value && draggedIndex.value !== null && dragOverIndex.value !== null) {
      const tracks = [...pl.tracks];
      const [removed] = tracks.splice(draggedIndex.value, 1);
      tracks.splice(dragOverIndex.value, 0, removed);
      sortedTracksCache.value = tracks;
    } else {
      sortedTracksCache.value = pl.tracks;
    }
  },
  { immediate: true }
);

const sortedTracks = computed(() => sortedTracksCache.value);

function toggleSortMenu() { showSortMenu.value = !showSortMenu.value; }

function selectSort(key: SortKey) {
  if (sortKey.value === key) { sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'; }
  else { sortKey.value = key; sortOrder.value = 'asc'; }
  showSortMenu.value = false;
}

function getSortIcon(key: SortKey) {
  if (sortKey.value !== key) return ArrowUpDown;
  return sortOrder.value === 'asc' ? ArrowUp : ArrowDown;
}

function closeSortMenu(e: MouseEvent) {
  if (!(e.target as HTMLElement).closest('.sort-dropdown')) showSortMenu.value = false;
}

onMounted(() => {
  document.addEventListener('click', closeSortMenu);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  updateContainerHeight();
  window.addEventListener('resize', updateContainerHeight);
});

onUnmounted(() => {
  document.removeEventListener('click', closeSortMenu);
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  window.removeEventListener('resize', updateContainerHeight);
  if (longPressTimer !== null) {
    clearTimeout(longPressTimer);
  }
});

function handleTrackMouseDown(e: MouseEvent, index: number) {
  if (sortKey.value !== 'default') return;
  if (e.button !== 0) return;
  e.preventDefault();

  const trackId = playlist.value?.tracks[index]?.id;
  const now = Date.now();
  if (trackId && trackId === lastClickTrackId && now - lastClickTime < 400) {
    lastClickTime = 0;
    lastClickTrackId = null;
    playTrack(trackId);
    return;
  }
  lastClickTime = now;
  lastClickTrackId = trackId || null;

  dragStartY.value = e.clientY;
  isLongPressing.value = true;
  draggedTrackId.value = trackId || null;
  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    isDragging.value = true;
    draggedIndex.value = index;
  }, LONG_PRESS_DURATION);
}

function cancelLongPress() {
  if (longPressTimer !== null) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  isLongPressing.value = false;
  draggedTrackId.value = null;
}

function handleMouseMove(e: MouseEvent) {
  if (isLongPressing.value && !isDragging.value) {
    if (Math.abs(e.clientY - dragStartY.value) > 10) {
      cancelLongPress();
    }
    return;
  }
  if (!isDragging.value || draggedIndex.value === null) return;
  if (!trackListRef.value) return;
  const trackElements = trackListRef.value.querySelectorAll('.track-item');
  let closestIndex = -1;
  let minDistance = Infinity;
  trackElements.forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    const elementCenterY = rect.top + rect.height / 2;
    const distance = Math.abs(e.clientY - elementCenterY);
    if (distance < minDistance) { minDistance = distance; closestIndex = i; }
  });
  if (closestIndex !== -1) dragOverIndex.value = closestIndex;
}

async function handleMouseUp() {
  if (!isDragging.value && !isLongPressing.value) return;
  if (isDragging.value) {
    const fromIndex = draggedIndex.value;
    const toIndex = dragOverIndex.value;
    if (fromIndex !== null && toIndex !== null && fromIndex !== toIndex) {
      if (playlistId.value) playlistStore.reorderPlaylistTracks(playlistId.value, fromIndex, toIndex);
      await libraryStore.persistLibrary(playlistStore.playlists);
    }
  }
  if (longPressTimer !== null) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  isDragging.value = false;
  isLongPressing.value = false;
  draggedIndex.value = null;
  dragOverIndex.value = null;
  draggedTrackId.value = null;
}

const playlistCover = computed(() => {
  const pl = playlist.value;
  if (!pl) return undefined;
  if (pl.coverUrl) return getCoverUrl(pl.coverUrl);
  if (pl.tracks.length > 0 && pl.tracks[0].coverUrl) return getCoverUrl(pl.tracks[0].coverUrl);
  return undefined;
});

const trackListRef = ref<HTMLElement | null>(null);

// 虚拟滚动状态
const scrollTop = ref(0);
const containerHeight = ref(0);

const shouldVirtualize = computed(() => sortedTracks.value.length > MAX_VIRTUAL_ITEMS);

const virtualRange = computed(() => {
  if (!shouldVirtualize.value) {
    return { start: 0, end: sortedTracks.value.length };
  }
  const start = Math.max(0, Math.floor(scrollTop.value / ITEM_HEIGHT) - OVERSCAN);
  const end = Math.min(
    sortedTracks.value.length,
    Math.ceil((scrollTop.value + containerHeight.value) / ITEM_HEIGHT) + OVERSCAN
  );
  return { start, end };
});

interface VirtualTrackItem {
  track: AudioTrack;
  index: number;
  style: Record<string, string> | undefined;
}

const virtualTracks = computed<VirtualTrackItem[]>(() => {
  const { start, end } = virtualRange.value;
  return sortedTracks.value.slice(start, end).map((track, index) => ({
    track,
    index: start + index,
    style: shouldVirtualize.value
      ? { position: 'absolute', top: `${(start + index) * ITEM_HEIGHT}px`, width: '100%' }
      : undefined,
  }));
});

const totalHeight = computed(() =>
  shouldVirtualize.value ? sortedTracks.value.length * ITEM_HEIGHT : 'auto'
);

function handleListScroll(e: Event) {
  scrollTop.value = (e.target as HTMLElement).scrollTop;
}

function updateContainerHeight() {
  if (trackListRef.value) {
    containerHeight.value = trackListRef.value.clientHeight;
  }
}

watch(() => playlist.value?.description, (newDesc) => {
  descriptionText.value = newDesc || '';
}, { immediate: true });

function startEditDescription() { isEditingDescription.value = true; }

async function saveDescription() {
  if (playlistId.value) playlistStore.updatePlaylistDescription(playlistId.value, descriptionText.value);
  isEditingDescription.value = false;
  await libraryStore.persistLibrary(playlistStore.playlists);
}

function cancelEditDescription() {
  descriptionText.value = playlist.value?.description || '';
  isEditingDescription.value = false;
}

function playPlaylist() {
  if (playlist.value) queueStore.loadPlaylistToQueue(playlist.value.tracks, playlistId.value);
}

function playTrack(trackId: string) {
  if (playlist.value) queueStore.playTrackFromPlaylist(playlist.value.tracks, playlistId.value, trackId);
}

async function removeTrack(trackId: string) {
  if (playlistId.value) playlistStore.removeFromPlaylist(playlistId.value, trackId);
  await libraryStore.persistLibrary(playlistStore.playlists);
}
</script>

<template>
  <div v-if="playlist" class="flex-1 flex flex-col overflow-hidden">
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
            <p class="text-[var(--text-tertiary)] mb-4">{{ playlist.tracks.length }} 首歌曲</p>

            <div class="mb-4">
              <div v-if="!isEditingDescription">
                <p v-if="playlist.description" class="text-[var(--text-secondary)]">{{ playlist.description }}</p>
                <p v-else class="text-[var(--text-disabled)]">添加描述...</p>
                <button class="mt-2 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 transition-colors" @click="startEditDescription">
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

            <button class="md3-btn-filled w-fit no-select" @click="playPlaylist">
              <Play :size="18" />
              播放全部
            </button>
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-xl font-semibold text-[var(--text-primary)]">歌曲列表</h3>
            <div class="relative sort-dropdown no-select">
              <button
                class="md3-chip no-select min-w-[150px]"
                @click="toggleSortMenu"
              >
                <component :is="getSortIcon(sortKey)" :size="16" />
                <span>{{ sortOptions.find(o => o.key === sortKey)?.label }}</span>
              </button>
              <div
                v-if="showSortMenu"
                class="absolute right-0 top-full mt-2 p-2 elevation-3 rounded-2xl min-w-[150px] z-10"
              >
                <button
                  v-for="option in sortOptions"
                  :key="option.key"
                  class="w-full mt-1 px-3 py-2.5 text-left text-sm flex items-center justify-between rounded-xl transition-colors"
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

          <div v-else ref="trackListRef" class="space-y-2 relative" :style="{ height: typeof totalHeight === 'number' ? `${totalHeight}px` : 'auto' }" @scroll="handleListScroll">
            <div
              v-for="{ track, index: trackIndex, style } in virtualTracks"
              :key="track.id"
              class="track-item flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-150 group no-select relative state-layer"
              :class="[
                isDragging && track.id === draggedTrackId ? 'opacity-50 scale-[0.98] elevation-2 z-10' : '',
                !isDragging && track.id === currentTrackId ? 'bg-[var(--color-primary-container)]' : '',
                isLongPressing && !isDragging && track.id === draggedTrackId ? 'scale-[0.98] opacity-80' : '',
                isDragging ? 'cursor-grabbing' : 'cursor-pointer'
              ]"
              :style="style"
              @mousedown="handleTrackMouseDown($event, trackIndex)"
              @dragstart.prevent
            >
              <div class="w-8 h-8 flex items-center justify-center">
                <span v-if="track.id !== currentTrackId || !isPlaying" class="text-[var(--text-tertiary)] font-medium">{{ trackIndex + 1 }}</span>
                <div v-else class="flex items-center justify-center gap-0.5">
                  <div class="w-0.5 h-3 bg-[var(--color-primary)] animate-pulse"></div>
                  <div class="w-0.5 h-2 bg-[var(--color-primary)] animate-pulse" style="animation-delay: 0.1s"></div>
                  <div class="w-0.5 h-3 bg-[var(--color-primary)] animate-pulse" style="animation-delay: 0.2s"></div>
                </div>
              </div>
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
              <div class="track-actions">
                <span class="track-time group-hover:opacity-0">{{ formatTime(track.duration) }}</span>
                <div class="track-action-btns opacity-0 group-hover:opacity-100">
                  <button
                    class="md3-icon-btn-xs state-layer"
                    :class="isTrackFavorite(track.path) ? 'text-red-400' : ''"
                    @click.stop="toggleFavorite(track)"
                  >
                    <Heart :size="16" :fill="isTrackFavorite(track.path) ? 'currentColor' : 'none'" />
                  </button>
                  <button
                    class="md3-icon-btn-xs state-layer text-[var(--text-tertiary)] hover:text-red-400"
                    @click.stop="removeTrack(track.id)"
                  >
                    <Trash2 :size="16" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.track-actions {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 90px;
  flex-shrink: 0;
}

.track-time {
  font-size: 14px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  transition: opacity 0.15s ease;
  white-space: nowrap;
}

.track-action-btns {
  position: absolute;
  right: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  transition: opacity 0.15s ease;
}
</style>
