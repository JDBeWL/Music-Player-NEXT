import { convertFileSrc } from '@tauri-apps/api/core';

const coverUrlCache = new Map<string, string>();
const CACHE_SIZE_LIMIT = 200;

export function getCoverUrl(coverUrl: string | null | undefined): string | undefined {
  if (!coverUrl) return undefined;
  if (coverUrl.startsWith('data:')) return coverUrl;
  if (coverUrl.startsWith('http://') || coverUrl.startsWith('https://')) return coverUrl;
  if (coverUrl.startsWith('blob:')) return coverUrl;
  if (coverUrl.startsWith('file:')) return coverUrl;

  const cached = coverUrlCache.get(coverUrl);
  if (cached) return cached;

  const result = convertFileSrc(coverUrl);

  if (coverUrlCache.size >= CACHE_SIZE_LIMIT) {
    const firstKey = coverUrlCache.keys().next().value;
    if (firstKey) coverUrlCache.delete(firstKey);
  }
  coverUrlCache.set(coverUrl, result);

  return result;
}

export function clearCoverUrlCache(): void {
  coverUrlCache.clear();
}
