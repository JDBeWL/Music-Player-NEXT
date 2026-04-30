<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  Folder,
  Check,
  Music,
  Heart,
  Settings,
  Play,
  ListPlus,
  Search,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-vue-next';
import { useLibraryStore } from '@/stores/libraryStore';
import { usePlaylistStore } from '@/stores/playlistStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { getCoverUrl } from '@/utils/coverUrl';
import { formatTime, getFolderName, getFolderPath } from '@/utils/format';
import { saveLibraryToBackend } from '@/services/persistence/libraryPersistence';
import type { AudioTrack } from '@/types';

const router = useRouter();
const libraryStore = useLibraryStore();
const playlistStore = usePlaylistStore();
const playbackStore = usePlaybackStore();

async function persistLibrary() {
  try {
    await saveLibraryToBackend(
      libraryStore.libraryFolders,
      playlistStore.playlists,
      libraryStore.libraryTracks,
      libraryStore.scanDepth
    );
  } catch (error) {
    console.error('[LocalPage] Failed to persist library:', error);
  }
}

const emit = defineEmits<{
  (e: 'add-to-playlist'): void;
}>();

const tracks = computed(() => libraryStore.libraryTracks);
const selectedIds = computed(() => libraryStore.selectedFileIds);
const favoriteTrackPaths = computed(() => {
  return new Set(playlistStore.favoritePlaylist?.tracks.map(t => t.path) ?? []);
});

const searchQuery = ref('');
const filterFolder = ref('');
const filterArtist = ref('');
const filterAlbum = ref('');
const showFavoritesOnly = ref(false);

type SortKey = 'default' | 'title' | 'artist' | 'album' | 'duration';
type SortOrder = 'asc' | 'desc';
const sortKey = ref<SortKey>('default');
const sortOrder = ref<SortOrder>('asc');
const sortMenuOpen = ref(false);
const folderMenuOpen = ref(false);
const artistMenuOpen = ref(false);
const albumMenuOpen = ref(false);

function closeAllMenus() {
  sortMenuOpen.value = false;
  folderMenuOpen.value = false;
  artistMenuOpen.value = false;
  albumMenuOpen.value = false;
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest('.filter-dropdown')) {
    closeAllMenus();
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside, true);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside, true);
});

const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'default', label: '默认排序' },
  { key: 'title', label: '按标题' },
  { key: 'artist', label: '按艺术家' },
  { key: 'album', label: '按专辑' },
  { key: 'duration', label: '按时长' },
];

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'asc';
  }
  sortMenuOpen.value = false;
}

function getSortIcon(key: SortKey) {
  if (key !== sortKey.value) return ArrowUpDown;
  return sortOrder.value === 'asc' ? ArrowUp : ArrowDown;
}

const folderList = computed(() => {
  const folders = new Map<string, number>();
  for (const [folder, folderTracks] of libraryStore.tracksByFolder) {
    folders.set(folder, folderTracks.length);
  }
  return folders;
});

const artistList = computed(() => {
  const artists = new Map<string, number>();
  for (const track of tracks.value) {
    if (track.artists && track.artists.length > 0) {
      for (const a of track.artists) {
        artists.set(a, (artists.get(a) || 0) + 1);
      }
    } else if (track.artist) {
      artists.set(track.artist, (artists.get(track.artist) || 0) + 1);
    }
  }
  return new Map([...artists.entries()].sort((a, b) => a[0].localeCompare(b[0])));
});

const albumList = computed(() => {
  const albums = new Map<string, number>();
  for (const track of tracks.value) {
    if (track.album && track.album !== 'Unknown Album') {
      albums.set(track.album, (albums.get(track.album) || 0) + 1);
    }
  }
  return new Map([...albums.entries()].sort((a, b) => a[0].localeCompare(b[0])));
});

const filteredTracks = computed(() => {
  let result = tracks.value;

  if (showFavoritesOnly.value) {
    result = result.filter(t => favoriteTrackPaths.value.has(t.path));
  }

  if (filterFolder.value) {
    // 与 libraryStore 中的 tracksByFolder 逻辑保持一致
    // 提取文件夹路径并确保使用正斜杠 (/) 作为分隔符
    result = result.filter(t => {
      const pathParts = t.path.split(/[/\\]/);
      pathParts.pop();
      const trackFolder = pathParts.join('/');
      return trackFolder === filterFolder.value;
    });
  }

  if (filterArtist.value) {
    result = result.filter(t => {
      if (t.artists && t.artists.length > 0) {
        return t.artists.includes(filterArtist.value);
      }
      return t.artist === filterArtist.value;
    });
  }

  if (filterAlbum.value) {
    result = result.filter(t => t.album === filterAlbum.value);
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    result = result.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.album.toLowerCase().includes(q)
    );
  }

  if (sortKey.value !== 'default') {
    const sorted = [...result];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey.value) {
        case 'title': cmp = a.title.localeCompare(b.title); break;
        case 'artist': cmp = a.artist.localeCompare(b.artist); break;
        case 'album': cmp = a.album.localeCompare(b.album); break;
        case 'duration': cmp = a.duration - b.duration; break;
      }
      return sortOrder.value === 'asc' ? cmp : -cmp;
    });
    result = sorted;
  }

  return result;
});

const activeFilterCount = computed(() => {
  let count = 0;
  if (filterFolder.value) count++;
  if (filterArtist.value) count++;
  if (filterAlbum.value) count++;
  if (showFavoritesOnly.value) count++;
  if (sortKey.value !== 'default') count++;
  return count;
});

const hasSelection = computed(() => selectedIds.value.size > 0);

function isTrackFavorite(trackPath: string): boolean {
  return favoriteTrackPaths.value.has(trackPath);
}

function playTrack(track: AudioTrack) {
  playbackStore.clearQueue();
  playbackStore.addToQueue(track);
  playbackStore.playTrack(0);
}

function playAll() {
  if (filteredTracks.value.length > 0) {
    playbackStore.clearQueue();
    filteredTracks.value.forEach(track => {
      playbackStore.addToQueue(track);
    });
    playbackStore.playTrack(0);
  }
}

function addTrackToQueue(track: AudioTrack) {
  playbackStore.addToQueue(track);
}

function clearSearch() {
  searchQuery.value = '';
}

function clearAllFilters() {
  filterFolder.value = '';
  filterArtist.value = '';
  filterAlbum.value = '';
  showFavoritesOnly.value = false;
  sortKey.value = 'default';
  sortOrder.value = 'asc';
  searchQuery.value = '';
}

function selectAllFiltered() {
  const ids = filteredTracks.value.map(t => t.id);
  libraryStore.selectedFileIds = new Set(ids);
}

function deselectAllFiles() {
  libraryStore.deselectAllFiles();
}
</script>

<template>
  <section class="flex-1 overflow-hidden flex flex-col no-select" role="main" aria-label="本地音乐">
    <header class="px-8 py-5 flex items-center justify-between no-select" style="border-bottom: 1px solid var(--border-subtle);">
      <div>
        <h2 class="text-3xl font-bold text-[var(--text-primary)]">本地文件</h2>
        <p class="text-sm text-[var(--text-tertiary)] mt-1" v-if="tracks.length > 0">
          {{ filteredTracks.length === tracks.length ? `${tracks.length} 首歌曲` : `${filteredTracks.length} / ${tracks.length} 首歌曲` }}
        </p>
      </div>
      <div class="flex gap-2" v-if="hasSelection">
        <button class="md3-btn-filled text-sm" @click="playbackStore.addSelectedToQueue(libraryStore.selectedFilesArray); libraryStore.deselectAllFiles();">
          添加到队列
        </button>
        <button class="md3-btn-outlined text-sm" @click="emit('add-to-playlist')">
          添加到播放列表
        </button>
        <button class="md3-btn-outlined text-sm" @click="deselectAllFiles()">
          取消选择
        </button>
      </div>
      <div class="flex gap-2 items-center" v-else>
        <button class="md3-btn-filled text-sm" @click="playAll" v-if="tracks.length > 0">
          <Play :size="16" />
          播放全部
        </button>
        <button class="md3-btn-outlined text-sm" @click="selectAllFiltered()" v-if="tracks.length > 0">
          全选
        </button>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto">
      <template v-if="tracks.length > 0">
        <div class="px-6 pt-4 pb-3 flex items-center gap-3" style="border-bottom: 1px solid var(--border-subtle);">
          <div class="search-input-container">
            <Search :size="16" class="search-icon" />
            <input
              v-model="searchQuery"
              type="text"
              class="search-input"
              placeholder="搜索歌曲、艺术家、专辑..."
            />
            <button v-if="searchQuery" class="search-clear" @click="clearSearch">
              <X :size="12" />
            </button>
          </div>

          <button
            class="md3-chip text-xs"
            :class="!showFavoritesOnly ? '' : 'bg-[var(--color-primary-container)] text-[var(--color-primary)]'"
            @click="showFavoritesOnly = !showFavoritesOnly; if (showFavoritesOnly) { filterFolder = ''; filterArtist = ''; filterAlbum = ''; }"
          >
            <Heart :size="12" />
            收藏
          </button>

          <div class="relative filter-dropdown">
            <button
              class="md3-chip text-xs max-w-[120px]"
              :class="filterFolder ? 'bg-[var(--color-primary-container)] text-[var(--color-primary)]' : ''"
              @click="closeAllMenus(); folderMenuOpen = !folderMenuOpen"
            >
              <Folder :size="12" class="flex-shrink-0" />
              <span class="truncate">{{ filterFolder ? getFolderName(filterFolder) : '文件夹' }}</span>
            </button>
            <div
              v-if="folderMenuOpen"
              class="absolute top-full right-0 mt-1.5 p-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-lg z-50 min-w-[160px] max-w-[220px] max-h-[280px] overflow-y-auto dropdown-scrollbar"
            >
              <button
                class="w-full text-left px-3 py-2 text-sm transition-colors rounded-sm mb-0.5 last:mb-0"
                :class="!filterFolder ? 'text-[var(--color-primary)] bg-[var(--color-primary-container)]' : 'text-[var(--text-secondary)] hover:bg-[var(--hover-overlay)]'"
                @click="filterFolder = ''; folderMenuOpen = false"
              >
                全部文件夹
              </button>
              <button
                v-for="[folder, count] in folderList"
                :key="folder"
                class="w-full text-left px-3 py-2 text-sm transition-colors truncate rounded-sm mb-0.5 last:mb-0"
                :class="filterFolder === folder ? 'text-[var(--color-primary)] bg-[var(--color-primary-container)]' : 'text-[var(--text-secondary)] hover:bg-[var(--hover-overlay)]'"
                @click="filterFolder = folder; filterArtist = ''; filterAlbum = ''; showFavoritesOnly = false; folderMenuOpen = false"
              >
                {{ getFolderName(folder) }} <span class="opacity-60 text-xs ml-1">{{ count }}</span>
              </button>
            </div>
          </div>

          <div class="relative filter-dropdown">
            <button
              class="md3-chip text-xs max-w-[120px]"
              :class="filterArtist ? 'bg-[var(--color-primary-container)] text-[var(--color-primary)]' : ''"
              @click="closeAllMenus(); artistMenuOpen = !artistMenuOpen"
            >
              <span class="truncate">{{ filterArtist || '艺术家' }}</span>
            </button>
            <div
              v-if="artistMenuOpen"
              class="absolute top-full right-0 mt-1.5 p-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-lg z-50 min-w-[160px] max-w-[220px] max-h-[280px] overflow-y-auto dropdown-scrollbar"
            >
              <button
                class="w-full text-left px-3 py-2 text-sm transition-colors rounded-sm mb-0.5 last:mb-0"
                :class="!filterArtist ? 'text-[var(--color-primary)] bg-[var(--color-primary-container)]' : 'text-[var(--text-secondary)] hover:bg-[var(--hover-overlay)]'"
                @click="filterArtist = ''; artistMenuOpen = false"
              >
                全部艺术家
              </button>
              <button
                v-for="[artist, count] in artistList"
                :key="artist"
                class="w-full text-left px-3 py-2 text-sm transition-colors truncate rounded-sm mb-0.5 last:mb-0"
                :class="filterArtist === artist ? 'text-[var(--color-primary)] bg-[var(--color-primary-container)]' : 'text-[var(--text-secondary)] hover:bg-[var(--hover-overlay)]'"
                @click="filterArtist = artist; filterFolder = ''; filterAlbum = ''; showFavoritesOnly = false; artistMenuOpen = false"
              >
                {{ artist }} <span class="opacity-60 text-xs ml-1">{{ count }}</span>
              </button>
            </div>
          </div>

          <div class="relative filter-dropdown">
            <button
              class="md3-chip text-xs max-w-[120px]"
              :class="filterAlbum ? 'bg-[var(--color-primary-container)] text-[var(--color-primary)]' : ''"
              @click="closeAllMenus(); albumMenuOpen = !albumMenuOpen"
            >
              <span class="truncate">{{ filterAlbum || '专辑' }}</span>
            </button>
            <div
              v-if="albumMenuOpen"
              class="absolute top-full right-0 mt-1.5 p-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-lg z-50 min-w-[160px] max-w-[220px] max-h-[280px] overflow-y-auto dropdown-scrollbar"
            >
              <button
                class="w-full text-left px-3 py-2 text-sm transition-colors rounded-sm mb-0.5 last:mb-0"
                :class="!filterAlbum ? 'text-[var(--color-primary)] bg-[var(--color-primary-container)]' : 'text-[var(--text-secondary)] hover:bg-[var(--hover-overlay)]'"
                @click="filterAlbum = ''; albumMenuOpen = false"
              >
                全部专辑
              </button>
              <button
                v-for="[album, count] in albumList"
                :key="album"
                class="w-full text-left px-3 py-2 text-sm transition-colors truncate rounded-sm mb-0.5 last:mb-0"
                :class="filterAlbum === album ? 'text-[var(--color-primary)] bg-[var(--color-primary-container)]' : 'text-[var(--text-secondary)] hover:bg-[var(--hover-overlay)]'"
                @click="filterAlbum = album; filterFolder = ''; filterArtist = ''; showFavoritesOnly = false; albumMenuOpen = false"
              >
                {{ album }} <span class="opacity-60 text-xs ml-1">{{ count }}</span>
              </button>
            </div>
          </div>

          <div class="relative filter-dropdown">
            <button
              class="md3-chip text-xs"
              :class="sortKey !== 'default' ? 'bg-[var(--color-primary-container)] text-[var(--color-primary)]' : ''"
              @click="closeAllMenus(); sortMenuOpen = !sortMenuOpen"
            >
              <component :is="getSortIcon(sortKey)" :size="14" />
              {{ sortOptions.find(o => o.key === sortKey)?.label }}
            </button>
            <div
              v-if="sortMenuOpen"
              class="absolute top-full right-0 mt-1.5 p-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-lg z-50 min-w-[140px] dropdown-scrollbar"
            >
              <button
                v-for="option in sortOptions"
                :key="option.key"
                class="w-full text-left px-3 py-2 text-sm transition-colors rounded-sm mb-0.5 last:mb-0"
                :class="sortKey === option.key ? 'text-[var(--color-primary)] bg-[var(--color-primary-container)]' : 'text-[var(--text-secondary)] hover:bg-[var(--hover-overlay)]'"
                @click="toggleSort(option.key)"
              >
                {{ option.label }}
                <component v-if="sortKey === option.key" :is="sortOrder === 'asc' ? ArrowUp : ArrowDown" :size="12" class="inline ml-1" />
              </button>
            </div>
          </div>

          <button
            v-if="activeFilterCount > 0"
            class="text-xs text-[var(--color-primary)] hover:underline whitespace-nowrap"
            @click="clearAllFilters"
          >
            清除筛选
          </button>
        </div>

        <div class="px-4 py-2">
          <div
            v-for="track in filteredTracks"
            :key="track.id"
            class="flex items-center mt-1 gap-3 px-4 py-2.5 rounded-md hover:bg-[var(--hover-overlay)] transition-colors duration-100 group cursor-pointer"
            :class="{ 'bg-[var(--color-primary-container)]': selectedIds.has(track.id) }"
            @dblclick="playTrack(track)"
          >
            <div
              class="w-5 h-5 rounded-md border-2 flex items-center justify-center cursor-pointer transition-all duration-150 flex-shrink-0"
              :class="selectedIds.has(track.id) ? 'bg-[var(--color-primary)] border-[var(--color-primary)]' : 'border-[var(--text-disabled)] group-hover:border-[var(--color-primary)]'"
              @click.stop="libraryStore.toggleFileSelection(track.id)"
            >
              <Check v-if="selectedIds.has(track.id)" :size="12" class="text-[var(--text-on-primary)]" />
            </div>

            <div class="w-10 h-10 rounded-[4px] overflow-hidden flex-shrink-0 bg-[var(--bg-tertiary)]">
              <img v-if="track.coverUrl" :src="getCoverUrl(track.coverUrl)" alt="" class="w-full h-full object-cover" />
              <div v-else class="w-full h-full flex items-center justify-center">
                <Music :size="16" class="text-[var(--text-tertiary)]" />
              </div>
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-[var(--text-primary)] text-sm font-medium truncate flex-1 min-w-1">{{ track.title }}</span>
              </div>
              <div class="text-[var(--text-tertiary)] text-xs flex items-center overflow-hidden gap-1 min-w-0">
                <span v-if="track.format" class="track-format-tag shrink-0">{{ track.format.toUpperCase() }}</span>
                <span class="truncate min-w-0 flex-shrink">{{ track.artist }}{{ track.album && track.album !== 'Unknown Album' ? ` · ${track.album}` : '' }}</span>
              </div>
            </div>

            <div class="track-actions">
              <span class="track-path-text group-hover:opacity-0">{{ getFolderPath(track.path) }}</span>
              <span class="track-time group-hover:opacity-0">{{ formatTime(track.duration) }}</span>
              <div class="track-action-btns opacity-0 group-hover:opacity-100">
                <button
                  class="md3-icon-btn-xs state-layer"
                  @click.stop="addTrackToQueue(track)"
                  title="添加到队列"
                >
                  <ListPlus :size="16" />
                </button>

                <button
                  class="md3-icon-btn-xs state-layer"
                  :class="{ 'text-red-400': isTrackFavorite(track.path) }"
                  @click.stop="async () => { playlistStore.toggleFavorite(track); await persistLibrary(); }"
                  title="收藏"
                >
                  <Heart :size="16" :fill="isTrackFavorite(track.path) ? 'currentColor' : 'none'" />
                </button>
              </div>
            </div>
          </div>

          <div v-if="filteredTracks.length === 0 && tracks.length > 0" class="flex flex-col items-center justify-center py-20">
            <Search :size="36" class="text-[var(--text-disabled)] mb-4" />
            <p class="text-sm text-[var(--text-tertiary)]">没有找到匹配的歌曲</p>
            <button class="mt-3 text-sm text-[var(--color-primary)] hover:underline" @click="clearAllFilters">
              清除筛选
            </button>
          </div>
        </div>
      </template>

      <div v-else class="flex flex-col items-center justify-center h-full min-h-[60vh]">
        <div class="w-28 h-28 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center mb-8 shadow-lg">
          <Folder :size="48" class="text-[var(--text-tertiary)]" />
        </div>
        <h3 class="text-xl font-semibold text-[var(--text-primary)] mb-3">还没有本地音乐</h3>
        <p class="text-sm text-[var(--text-tertiary)] mb-8 text-center max-w-sm leading-relaxed">在设置中添加音乐文件夹<br>开始管理你的音乐库</p>
        <button
          class="md3-btn-filled px-6 py-3"
          @click="router.push({ name: 'settings' })"
        >
          <Settings :size="18" />
          <span>前往设置</span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.no-select {
  user-select: none;
  -webkit-user-select: none;
}

.filter-dropdown {
  z-index: 40;
}

.search-input-container {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 14px;
  border-radius: var(--radius-sm); /* 改为 radius-sm */
  background: var(--bg-tertiary);
  border: 1px solid transparent;
  transition: all 0.2s ease;
  flex: 1;
  min-width: 200px;
  max-width: 24rem;
}

.search-input-container:focus-within {
  background: var(--bg-surface);
  border-color: var(--color-primary);
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

.search-clear {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  flex-shrink: 0;
}

.search-clear:hover {
  color: var(--text-primary);
  background: var(--hover-overlay);
}

.track-actions {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 68px;
  flex-shrink: 0;
  overflow: hidden;
}

.track-time {
  font-size: 12px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  transition: opacity 0.15s ease;
  white-space: nowrap;
  line-height: 32px;
}

.track-action-btns {
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  transition: opacity 0.15s ease;
}

.track-format-tag {
  display: inline-flex;
  align-items: center;
  font-size: 9px;
  font-weight: 600;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--color-primary-container);
  color: var(--color-primary);
  line-height: 16px;
  flex-shrink: 0;
  letter-spacing: 0.5px;
}

.track-path-text {
  font-size: 12px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  transition: opacity 0.15s ease;
  white-space: nowrap;
  line-height: 22px;
  text-align: right;
}

/* 局部下拉菜单滚动条样式 */
.dropdown-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.dropdown-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(155, 155, 155, 0.4);
  background-clip: padding-box;
  border: 2px solid transparent;
  border-radius: 10px;
}

.dropdown-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: var(--color-primary);
}
</style>
