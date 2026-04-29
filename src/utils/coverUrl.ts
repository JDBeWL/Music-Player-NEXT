import { convertFileSrc } from '@tauri-apps/api/core';

export function getCoverUrl(coverUrl: string | null | undefined): string | undefined {
  if (!coverUrl) return undefined;
  if (coverUrl.startsWith('data:')) return coverUrl;
  if (coverUrl.startsWith('http://') || coverUrl.startsWith('https://')) return coverUrl;
  if (coverUrl.startsWith('blob:')) return coverUrl;
  if (coverUrl.startsWith('file:')) return coverUrl;
  return convertFileSrc(coverUrl);
}
