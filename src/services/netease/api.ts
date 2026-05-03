/**
 * API Enhanced 服务
 * 通过 Tauri invoke 调用 Rust 后端代理，避免 CORS 问题和额外的服务器
 */

import { invoke } from '@tauri-apps/api/core';
import { useConfigStore } from '@/stores/configStore';
import { LRUCache } from '@/utils/lruCache';
import type {
  NeteaseSearchResponse,
  NeteaseSongUrlResponse,
  NeteaseLyricResponse,
  NeteaseQrKeyResult,
  NeteaseQrCreateResult,
  NeteaseQrCheckResult,
  NeteaseLoginStatus,
} from './types';

interface CacheEntry {
  data: unknown;
  ts: number;
}

const _cache = new LRUCache<string, CacheEntry>(200);
const _CACHE_TTL = 60_000;
const _pending = new Map<string, Promise<unknown>>();

function _cacheKey(path: string, params: Record<string, string | number | boolean>): string {
  return `${path}?${JSON.stringify(params)}`;
}

function _isCacheable(path: string): boolean {
  return path.startsWith('/cloudsearch') || path.startsWith('/lyric') || path.startsWith('/song/url');
}

function _getCached<T>(key: string): T | null {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > _CACHE_TTL) {
    _cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function _setCache(key: string, data: unknown): void {
  _cache.set(key, { data, ts: Date.now() });
}

/**
 * 获取 realIP 配置
 */
function getRealIP(): string {
  try {
    const configStore = useConfigStore();
    return configStore.neteaseRealIP || '116.25.146.177';
  } catch {
    return '116.25.146.177';
  }
}

/**
 * 通用的API Enhanced 请求，通过 Tauri Rust 后端代理
 */
async function neteaseRequest<T>(path: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
  const key = _cacheKey(path, params);
  if (_isCacheable(path)) {
    const cached = _getCached<T>(key);
    if (cached !== null) return cached;
    const pending = _pending.get(key) as Promise<T> | undefined;
    if (pending) return pending;
  }

  const promise = (async () => {
    try {
      const result = await invoke<string>('netease_api_request', {
        path,
        params: JSON.stringify({ ...params, realIP: getRealIP() }),
      });
      const parsed = JSON.parse(result) as T;
      if (_isCacheable(path)) {
        _setCache(key, parsed);
      }
      return parsed;
    } finally {
      _pending.delete(key);
    }
  })();

  if (_isCacheable(path)) {
    _pending.set(key, promise);
  }

  return promise;
}

/**
 * 带 cookie 的请求
 */
async function neteaseRequestWithCookie<T>(
  path: string,
  params: Record<string, string | number | boolean> = {},
  cookie: string = ''
): Promise<T> {
  const key = _cacheKey(path, { ...params, _cookie: cookie });
  if (_isCacheable(path)) {
    const cached = _getCached<T>(key);
    if (cached !== null) return cached;
    const pending = _pending.get(key) as Promise<T> | undefined;
    if (pending) return pending;
  }

  const promise = (async () => {
    try {
      const result = await invoke<string>('netease_api_request_with_cookie', {
        path,
        params: JSON.stringify({ ...params, realIP: getRealIP() }),
        cookie,
      });
      const parsed = JSON.parse(result) as T;
      if (_isCacheable(path)) {
        _setCache(key, parsed);
      }
      return parsed;
    } finally {
      _pending.delete(key);
    }
  })();

  if (_isCacheable(path)) {
    _pending.set(key, promise);
  }

  return promise;
}

/**
 * 搜索歌曲
 */
export async function searchSongs(
  keywords: string,
  offset: number = 0,
  limit: number = 30
): Promise<NeteaseSearchResponse> {
  return neteaseRequest<NeteaseSearchResponse>('/cloudsearch', {
    keywords,
    type: 1,
    offset,
    limit,
  });
}

/**
 * 音质等级定义
 */
export type QualityLevel = 'standard' | 'higher' | 'exhigh' | 'lossless' | 'hires' | 'jyeffect' | 'jymaster';

/**
 * 音质等级选项
 */
export const QUALITY_OPTIONS = [
  { value: 'standard' as QualityLevel, label: '标准 (128kbps)' },
  { value: 'higher' as QualityLevel, label: '较高 (192kbps)' },
  { value: 'exhigh' as QualityLevel, label: '极高 (320kbps)' },
  { value: 'lossless' as QualityLevel, label: '无损 (FLAC)' },
  { value: 'hires' as QualityLevel, label: 'Hi-Res' },
  { value: 'jyeffect' as QualityLevel, label: '高清环绕声' },
  { value: 'jymaster' as QualityLevel, label: '超清母带' },
];

/**
 * 音质等级到比特率的映射（用于旧版 API）
 */
const QUALITY_TO_BITRATE: Record<QualityLevel, number> = {
  standard: 128000,
  higher: 192000,
  exhigh: 320000,
  lossless: 999000,
  hires: 999000,
  jyeffect: 999000,
  jymaster: 999000,
};

/**
 * 获取歌曲播放 URL
 * 先尝试 /song/url/v1 (新版API)，失败则回退到 /song/url (旧版API)
 */
export async function getSongUrl(
  ids: number[],
  cookie: string = '',
  level: QualityLevel = 'exhigh'
): Promise<NeteaseSongUrlResponse> {
  try {
    // 先尝试新版接口
    const res = await neteaseRequestWithCookie<NeteaseSongUrlResponse>(
      '/song/url/v1',
      {
        id: ids.join(','),
        level,
      },
      cookie
    );
    // 检查是否真的获取到了 URL
    if (res.code === 200 && res.data?.length > 0 && res.data[0].url) {
      return res;
    }
    // 新版接口没返回 URL，尝试旧版
    console.warn('[api] /song/url/v1 returned no URL, trying /song/url');
  } catch (e) {
    console.warn('[api] /song/url/v1 failed, trying /song/url:', e);
  }

  // 回退到旧版接口
  return neteaseRequestWithCookie<NeteaseSongUrlResponse>(
    '/song/url',
    {
      id: ids.join(','),
      br: QUALITY_TO_BITRATE[level],
    },
    cookie
  );
}

/**
 * 获取歌词
 */
export async function getLyric(id: number): Promise<NeteaseLyricResponse> {
  return neteaseRequest<NeteaseLyricResponse>('/lyric', { id });
}

/**
 * 获取二维码登录 key
 */
export async function getQrKey(): Promise<NeteaseQrKeyResult> {
  const res = await neteaseRequest<{ code: number; data: NeteaseQrKeyResult }>('/login/qr/key', {
    timestamp: Date.now(),
  });
  return res.data;
}

/**
 * 生成二维码
 */
export async function createQrCode(key: string): Promise<NeteaseQrCreateResult> {
  const res = await neteaseRequest<{ code: number; data: NeteaseQrCreateResult }>('/login/qr/create', {
    key,
    qrimg: 1,
    timestamp: Date.now(),
  });
  return res.data;
}

/**
 * 检查二维码扫码状态
 */
export async function checkQrStatus(key: string): Promise<NeteaseQrCheckResult> {
  return neteaseRequest<NeteaseQrCheckResult>('/login/qr/check', {
    key,
    timestamp: Date.now(),
    noCookie: 1,
  });
}

/**
 * 获取登录状态
 */
export async function getLoginStatus(cookie: string): Promise<NeteaseLoginStatus> {
  const res = await neteaseRequestWithCookie<{ data: NeteaseLoginStatus }>(
    '/login/status',
    { timestamp: Date.now() },
    cookie
  );
  return res.data;
}

/**
 * 退出登录
 */
export async function logout(cookie: string): Promise<void> {
  await neteaseRequestWithCookie('/logout', {}, cookie);
}

/**
 * 设置 API 基地址
 */
export async function setApiBase(url: string): Promise<void> {
  await invoke('set_netease_api_base', { url });
}

/**
 * 获取当前 API 基地址
 */
export async function getApiBase(): Promise<string> {
  return await invoke<string>('get_netease_api_base');
}

/**
 * 歌曲元数据
 */
export interface SongMetadata {
  title: string;
  artist: string;
  album: string;
  cover_url?: string;
}

/**
 * 下载歌曲到本地（含元数据写入）
 */
export async function downloadSong(url: string, savePath: string, metadata: SongMetadata): Promise<string> {
  return await invoke<string>('download_netease_song', { url, savePath, metadata });
}

/**
 * 打开保存文件对话框
 */
export async function openSaveDialog(defaultName: string): Promise<string | null> {
  return await invoke<string | null>('save_file_dialog', { defaultName });
}
