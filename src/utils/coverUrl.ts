import { convertFileSrc } from '@tauri-apps/api/core';

interface CacheEntry {
  url: string;
  lastAccessed: number;
}

const coverUrlCache = new Map<string, CacheEntry>();
const CACHE_SIZE_LIMIT = 200;

export function getCoverUrl(coverUrl: string | null | undefined): string | undefined {
  if (!coverUrl) return undefined;
  if (coverUrl.startsWith('data:')) return coverUrl;
  if (coverUrl.startsWith('http://') || coverUrl.startsWith('https://')) return coverUrl;
  if (coverUrl.startsWith('blob:')) return coverUrl;
  if (coverUrl.startsWith('file:')) return coverUrl;

  const cached = coverUrlCache.get(coverUrl);
  if (cached) {
    cached.lastAccessed = Date.now();
    return cached.url;
  }

  const result = convertFileSrc(coverUrl);

  if (coverUrlCache.size >= CACHE_SIZE_LIMIT) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of coverUrlCache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    if (oldestKey) coverUrlCache.delete(oldestKey);
  }
  coverUrlCache.set(coverUrl, { url: result, lastAccessed: Date.now() });

  return result;
}

export function clearCoverUrlCache(): void {
  coverUrlCache.clear();
}
