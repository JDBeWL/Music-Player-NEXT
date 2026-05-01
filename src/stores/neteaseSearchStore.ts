import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  searchSongs,
  getSongUrl,
  getLyric,
  setApiBase,
  getApiBase,
  downloadSong,
  openSaveDialog,
  type QualityLevel,
} from '@/services/netease/api';
import type { NeteaseSearchResult } from '@/services/netease/types';
import type { AudioTrack } from '@/types';
import { useNeteaseAuthStore } from './neteaseAuthStore';

const NETEASE_API_BASE_KEY = 'netease_api_base';
const NETEASE_QUALITY_KEY = 'netease_quality';

export const useNeteaseSearchStore = defineStore('neteaseSearch', () => {
  const authStore = useNeteaseAuthStore();

  const searchQuery = ref('');
  const searchResults = ref<NeteaseSearchResult[]>([]);
  const searchTotal = ref(0);
  const searchOffset = ref(0);
  const isSearching = ref(false);
  const searchError = ref<string | null>(null);

  const currentNeteaseId = ref<number | null>(null);

  const apiBaseUrl = ref<string>('');
  const quality = ref<QualityLevel>('exhigh');

  const hasMoreResults = computed(() => searchOffset.value < searchTotal.value);

  function convertToAudioTrack(song: NeteaseSearchResult, url: string): AudioTrack {
    const artists = song.ar || song.artists || [];
    const album = song.al || song.album;
    const durationMs = song.dt || song.duration || 0;

    return {
      id: `netease_${song.id}`,
      path: url,
      title: song.name,
      artist: artists.map((a) => a.name).join(' / '),
      artists: artists.map((a) => a.name),
      album: album?.name || '未知专辑',
      duration: durationMs / 1000,
      format: 'mp3',
      coverUrl: album?.picUrl || undefined,
      hasLrc: false,
    };
  }

  async function getPlayableTrack(song: NeteaseSearchResult): Promise<AudioTrack | null> {
    try {
      const response = await getSongUrl([song.id], authStore.cookie, quality.value);
      if (response.code === 200 && response.data?.length > 0) {
        const songData = response.data[0];
        if (songData.url) {
          currentNeteaseId.value = song.id;
          return convertToAudioTrack(song, songData.url);
        } else {
          let reason = '歌曲暂时无法播放';
          if (songData.code === 404) {
            reason = '歌曲链接不可用';
          } else if (songData.fee === 1) {
            reason = '该歌曲为 VIP 专享';
          } else if (songData.freeTrialPrivilege?.cannotListenReason === 1) {
            reason = '版权限制，该歌曲在当前地区不可用';
          }
          console.warn(`[NeteaseSearchStore] ${reason}:`, song.name);
          searchError.value = `${song.name}: ${reason}`;
          setTimeout(() => {
            searchError.value = null;
          }, 3000);
        }
      }
      return null;
    } catch (error) {
      console.error('[NeteaseSearchStore] Failed to get song URL:', error);
      searchError.value = '获取歌曲链接失败';
      setTimeout(() => {
        searchError.value = null;
      }, 3000);
      return null;
    }
  }

  async function fetchLyric(id: number): Promise<string | undefined> {
    try {
      const response = await getLyric(id);
      if (response.code === 200 && response.lrc?.lyric) {
        let lyrics = response.lrc.lyric;
        if (response.tlyric?.lyric) {
          lyrics += '\n' + response.tlyric.lyric;
        }
        return lyrics;
      }
    } catch (error) {
      console.warn('[NeteaseSearchStore] Failed to fetch lyrics:', error);
    }
    return undefined;
  }

  async function search(query: string, loadMore: boolean = false) {
    if (!query.trim()) {
      searchResults.value = [];
      searchTotal.value = 0;
      searchOffset.value = 0;
      return;
    }

    isSearching.value = true;
    searchError.value = null;

    try {
      const offset = loadMore ? searchOffset.value : 0;
      const response = await searchSongs(query, offset, 30);

      if (response.code === 200 && response.result) {
        if (loadMore) {
          searchResults.value = [...searchResults.value, ...(response.result.songs || [])];
        } else {
          searchResults.value = response.result.songs || [];
          searchQuery.value = query;
        }
        searchTotal.value = response.result.songCount || 0;
        searchOffset.value = offset + (response.result.songs?.length || 0);
      }
    } catch (error: any) {
      console.error('[NeteaseSearchStore] Search failed:', error);
      searchError.value = error.message || '搜索失败';
    } finally {
      isSearching.value = false;
    }
  }

  async function loadMoreResults() {
    if (searchOffset.value >= searchTotal.value) return;
    await search(searchQuery.value, true);
  }

  function clearSearch() {
    searchQuery.value = '';
    searchResults.value = [];
    searchTotal.value = 0;
    searchOffset.value = 0;
    searchError.value = null;
  }

  async function updateApiBase(url: string) {
    try {
      const trimmedUrl = url.trim().replace(/\/+$/, '');
      await setApiBase(trimmedUrl);
      apiBaseUrl.value = trimmedUrl;
      localStorage.setItem(NETEASE_API_BASE_KEY, trimmedUrl);
    } catch (error) {
      console.error('[NeteaseSearchStore] Failed to update API base URL:', error);
      throw error;
    }
  }

  function setQuality(newQuality: QualityLevel) {
    quality.value = newQuality;
    localStorage.setItem(NETEASE_QUALITY_KEY, newQuality);
  }

  async function downloadTrack(song: NeteaseSearchResult): Promise<string | null> {
    try {
      const response = await getSongUrl([song.id], authStore.cookie, quality.value);
      if (response.code !== 200 || !response.data?.length || !response.data[0].url) {
        throw new Error('无法获取歌曲下载链接');
      }
      const songData = response.data[0];
      const songUrl = songData.url;
      if (!songUrl) {
        throw new Error('无法获取歌曲下载链接');
      }

      const artists = song.ar || song.artists || [];
      const artistName = artists.map((a: any) => a.name).join(', ');
      const album = song.al || song.album;
      const albumName = album?.name || '未知专辑';
      const coverUrl = album?.picUrl || undefined;

      let ext = songData.type || 'mp3';
      try {
        const urlPath = new URL(songUrl).pathname;
        const urlExt = urlPath.split('.').pop();
        if (urlExt && ['mp3', 'flac', 'm4a', 'ogg', 'wav', 'aac'].includes(urlExt.toLowerCase())) {
          ext = urlExt.toLowerCase();
        }
      } catch {}

      const defaultName = `${artistName} - ${song.name}.${ext}`;

      const savePath = await openSaveDialog(defaultName);
      if (!savePath) {
        return null;
      }

      const metadata = {
        title: song.name,
        artist: artistName,
        album: albumName,
        cover_url: coverUrl,
      };
      const result = await downloadSong(songUrl, savePath, metadata);
      return result;
    } catch (error) {
      console.error('[NeteaseSearchStore] Download failed:', error);
      throw error;
    }
  }

  async function init() {
    try {
      const savedApiBase = localStorage.getItem(NETEASE_API_BASE_KEY);
      if (savedApiBase) {
        await setApiBase(savedApiBase);
      }
      apiBaseUrl.value = await getApiBase();

      const savedQuality = localStorage.getItem(NETEASE_QUALITY_KEY);
      if (savedQuality) {
        quality.value = savedQuality as QualityLevel;
      }
    } catch (error) {
      console.warn('[NeteaseSearchStore] Failed to restore state:', error);
    }
  }

  return {
    searchQuery,
    searchResults,
    searchTotal,
    isSearching,
    searchError,
    hasMoreResults,
    currentNeteaseId,
    apiBaseUrl,
    quality,
    init,
    search,
    loadMoreResults,
    clearSearch,
    getPlayableTrack,
    fetchLyric,
    convertToAudioTrack,
    updateApiBase,
    setQuality,
    downloadTrack,
  };
});
