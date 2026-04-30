/**
 * Netease状态管理
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  searchSongs,
  getSongUrl,
  getLyric,
  getQrKey,
  createQrCode,
  checkQrStatus,
  getLoginStatus,
  logout as logoutApi,
  setApiBase,
  getApiBase,
  downloadSong,
  openSaveDialog,
  type QualityLevel,
} from '@/services/netease/api';
import type {
  NeteaseSearchResult,
  NeteaseUserProfile,
  NeteaseQrCheckResult,
} from '@/services/netease/types';
import type { AudioTrack } from '@/types';

const NETEASE_COOKIE_KEY = 'netease_cloud_cookie';
const NETEASE_PROFILE_KEY = 'netease_cloud_profile';
const NETEASE_API_BASE_KEY = 'netease_api_base';
const NETEASE_QUALITY_KEY = 'netease_quality';

export const useNeteaseStore = defineStore('netease', () => {
  // 登录状态
  const cookie = ref<string>('');
  const userProfile = ref<NeteaseUserProfile | null>(null);
  const isLoggedIn = computed(() => !!cookie.value && !!userProfile.value);

  // API 地址
  const apiBaseUrl = ref<string>('');

  // 音质设置
  const quality = ref<QualityLevel>('exhigh');

  // 二维码登录
  const qrKey = ref<string>('');
  const qrImg = ref<string>('');
  const qrStatus = ref<NeteaseQrCheckResult | null>(null);
  const isQrLoading = ref(false);
  const qrCheckTimer = ref<ReturnType<typeof setInterval> | null>(null);

  // 搜索状态
  const searchQuery = ref('');
  const searchResults = ref<NeteaseSearchResult[]>([]);
  const searchTotal = ref(0);
  const searchOffset = ref(0);
  const isSearching = ref(false);
  const searchError = ref<string | null>(null);

  // 当前播放的Netease歌曲信息
  const currentNeteaseId = ref<number | null>(null);

  /**
   * 初始化：从本地存储恢复登录状态和 API 地址
   */
  async function init() {
    try {
      const savedCookie = localStorage.getItem(NETEASE_COOKIE_KEY);
      const savedProfile = localStorage.getItem(NETEASE_PROFILE_KEY);
      if (savedCookie) {
        cookie.value = savedCookie;
      }
      if (savedProfile) {
        userProfile.value = JSON.parse(savedProfile);
      }

      // 恢复 API 地址
      const savedApiBase = localStorage.getItem(NETEASE_API_BASE_KEY);
      if (savedApiBase) {
        await setApiBase(savedApiBase);
      }
      // 从后端获取当前 API 地址
      apiBaseUrl.value = await getApiBase();

      // 恢复音质设置
      const savedQuality = localStorage.getItem(NETEASE_QUALITY_KEY);
      if (savedQuality) {
        quality.value = savedQuality as QualityLevel;
      }
    } catch (error) {
      console.warn('[NeteaseStore] Failed to restore state:', error);
    }
  }

  /**
   * 保存登录状态到本地存储
   */
  function saveLoginState() {
    try {
      if (cookie.value) {
        localStorage.setItem(NETEASE_COOKIE_KEY, cookie.value);
      }
      if (userProfile.value) {
        localStorage.setItem(NETEASE_PROFILE_KEY, JSON.stringify(userProfile.value));
      }
    } catch (error) {
      console.warn('[NeteaseStore] Failed to save login state:', error);
    }
  }

  /**
   * 清除登录状态
   */
  function clearLoginState() {
    cookie.value = '';
    userProfile.value = null;
    localStorage.removeItem(NETEASE_COOKIE_KEY);
    localStorage.removeItem(NETEASE_PROFILE_KEY);
  }

  /**
   * 开始二维码登录
   */
  async function startQrLogin() {
    isQrLoading.value = true;
    qrStatus.value = null;

    try {
      const keyResult = await getQrKey();
      qrKey.value = keyResult.unikey;

      const qrResult = await createQrCode(qrKey.value);
      qrImg.value = qrResult.qrimg;

      // 开始轮询扫码状态
      startQrPolling();
    } catch (error) {
      console.error('[NeteaseStore] Failed to start QR login:', error);
      searchError.value = '获取二维码失败';
    } finally {
      isQrLoading.value = false;
    }
  }

  /**
   * 轮询二维码扫码状态
   */
  function startQrPolling() {
    stopQrPolling();
    qrCheckTimer.value = setInterval(async () => {
      try {
        const result = await checkQrStatus(qrKey.value);
        console.log('[NeteaseStore] QR check result:', JSON.stringify(result));
        qrStatus.value = result;

        if (result.code === 803) {
          // 登录成功
          stopQrPolling();
          if (result.cookie) {
            cookie.value = result.cookie;
          }
          // 获取用户信息
          await refreshLoginStatus();
          saveLoginState();
        } else if (result.code === 800) {
          // 二维码过期
          stopQrPolling();
        } else if (result.code === 404 || result.code === 400) {
          // key 无效或已失效，停止轮询
          console.warn('[NeteaseStore] QR key invalid or expired, stopping polling');
          stopQrPolling();
        }
      } catch (error) {
        console.error('[NeteaseStore] QR check failed:', error);
        // 请求失败也停止轮询，避免无限重试
        stopQrPolling();
      }
    }, 2000);
  }

  /**
   * 停止轮询
   */
  function stopQrPolling() {
    if (qrCheckTimer.value) {
      clearInterval(qrCheckTimer.value);
      qrCheckTimer.value = null;
    }
  }

  /**
   * 刷新登录状态
   */
  async function refreshLoginStatus() {
    if (!cookie.value) return;
    try {
      const status = await getLoginStatus(cookie.value);
      if (status.profile) {
        userProfile.value = status.profile;
        saveLoginState();
      } else {
        clearLoginState();
      }
    } catch (error) {
      console.error('[NeteaseStore] Failed to refresh login status:', error);
    }
  }

  /**
   * 退出登录
   */
  async function logout() {
    try {
      if (cookie.value) {
        await logoutApi(cookie.value);
      }
    } catch (error) {
      console.warn('[NeteaseStore] Logout request failed:', error);
    } finally {
      clearLoginState();
      stopQrPolling();
      qrImg.value = '';
      qrKey.value = '';
      qrStatus.value = null;
    }
  }

  /**
   * 搜索歌曲
   */
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
      console.error('[NeteaseStore] Search failed:', error);
      searchError.value = error.message || '搜索失败';
    } finally {
      isSearching.value = false;
    }
  }

  /**
   * 加载更多搜索结果
   */
  async function loadMoreResults() {
    if (searchOffset.value >= searchTotal.value) return;
    await search(searchQuery.value, true);
  }

  /**
   * 将Netease搜索结果转换为 AudioTrack
   * 兼容 /cloudsearch (ar, al, dt) 和 /search (artists, album, duration) 两种字段名
   */
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

  /**
   * 获取歌曲播放 URL 并创建 AudioTrack
   */
  async function getPlayableTrack(song: NeteaseSearchResult): Promise<AudioTrack | null> {
    try {
      const response = await getSongUrl([song.id], cookie.value, quality.value);
      console.log('[NeteaseStore] getSongUrl response:', JSON.stringify(response));
      if (response.code === 200 && response.data?.length > 0) {
        const songData = response.data[0];
        console.log('[NeteaseStore] songData:', JSON.stringify(songData));
        if (songData.url) {
          currentNeteaseId.value = song.id;
          return convertToAudioTrack(song, songData.url);
        } else {
          // 提供更详细的错误信息
          let reason = '歌曲暂时无法播放';
          if (songData.code === 404) {
            reason = '歌曲链接不可用';
          } else if (songData.fee === 1) {
            reason = '该歌曲为 VIP 专享';
          } else if (songData.freeTrialPrivilege?.cannotListenReason === 1) {
            reason = '版权限制，该歌曲在当前地区不可用';
          }
          console.warn(`[NeteaseStore] ${reason}:`, song.name);
          searchError.value = `${song.name}: ${reason}`;
          setTimeout(() => {
            searchError.value = null;
          }, 3000);
        }
      }
      return null;
    } catch (error) {
      console.error('[NeteaseStore] Failed to get song URL:', error);
      searchError.value = '获取歌曲链接失败';
      setTimeout(() => {
        searchError.value = null;
      }, 3000);
      return null;
    }
  }

  /**
   * 获取歌词
   */
  async function fetchLyric(id: number): Promise<string | undefined> {
    try {
      const response = await getLyric(id);
      if (response.code === 200 && response.lrc?.lyric) {
        let lyrics = response.lrc.lyric;
        // 如果有翻译歌词，合并
        if (response.tlyric?.lyric) {
          lyrics += '\n' + response.tlyric.lyric;
        }
        return lyrics;
      }
    } catch (error) {
      console.warn('[NeteaseStore] Failed to fetch lyrics:', error);
    }
    return undefined;
  }

  /**
   * 清除搜索结果
   */
  function clearSearch() {
    searchQuery.value = '';
    searchResults.value = [];
    searchTotal.value = 0;
    searchOffset.value = 0;
    searchError.value = null;
  }

  /**
   * 更新 API 基地址
   */
  async function updateApiBase(url: string) {
    try {
      const trimmedUrl = url.trim().replace(/\/+$/, ''); // 去掉末尾的斜杠
      await setApiBase(trimmedUrl);
      apiBaseUrl.value = trimmedUrl;
      localStorage.setItem(NETEASE_API_BASE_KEY, trimmedUrl);
      console.log('[NeteaseStore] API base URL updated to:', trimmedUrl);
    } catch (error) {
      console.error('[NeteaseStore] Failed to update API base URL:', error);
      throw error;
    }
  }

  /**
   * 设置音质
   */
  function setQuality(newQuality: QualityLevel) {
    quality.value = newQuality;
    localStorage.setItem(NETEASE_QUALITY_KEY, newQuality);
    console.log('[NeteaseStore] Quality updated to:', newQuality);
  }

  /**
   * 下载歌曲
   */
  async function downloadTrack(song: NeteaseSearchResult): Promise<string | null> {
    try {
      // 先获取歌曲 URL
      const response = await getSongUrl([song.id], cookie.value, quality.value);
      if (response.code !== 200 || !response.data?.length || !response.data[0].url) {
        throw new Error('无法获取歌曲下载链接');
      }
      const songData = response.data[0];
      const songUrl = songData.url;
      if (!songUrl) {
        throw new Error('无法获取歌曲下载链接');
      }

      // 解析元数据
      const artists = song.ar || song.artists || [];
      const artistName = artists.map((a: any) => a.name).join(', ');
      const album = song.al || song.album;
      const albumName = album?.name || '未知专辑';
      const coverUrl = album?.picUrl || undefined;

      // 根据 URL 确定文件扩展名
      let ext = songData.type || 'mp3';
      try {
        const urlPath = new URL(songUrl).pathname;
        const urlExt = urlPath.split('.').pop();
        if (urlExt && ['mp3', 'flac', 'm4a', 'ogg', 'wav', 'aac'].includes(urlExt.toLowerCase())) {
          ext = urlExt.toLowerCase();
        }
      } catch {}

      const defaultName = `${artistName} - ${song.name}.${ext}`;

      // 弹出保存文件对话框
      const savePath = await openSaveDialog(defaultName);
      if (!savePath) {
        console.log('[NeteaseStore] Download cancelled by user');
        return null;
      }

      // 下载文件（含元数据写入）
      const metadata = {
        title: song.name,
        artist: artistName,
        album: albumName,
        cover_url: coverUrl,
      };
      const result = await downloadSong(songUrl, savePath, metadata);
      console.log('[NeteaseStore] Download completed:', result);
      return result;
    } catch (error) {
      console.error('[NeteaseStore] Download failed:', error);
      throw error;
    }
  }

  const hasMoreResults = computed(() => searchOffset.value < searchTotal.value);

  return {
    // 登录
    cookie,
    userProfile,
    isLoggedIn,
    qrKey,
    qrImg,
    qrStatus,
    isQrLoading,

    // 搜索
    searchQuery,
    searchResults,
    searchTotal,
    isSearching,
    searchError,
    hasMoreResults,

    // 播放
    currentNeteaseId,

    // API 配置
    apiBaseUrl,
    quality,

    // 方法
    init,
    startQrLogin,
    stopQrPolling,
    refreshLoginStatus,
    logout,
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
