export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatDurationMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function getFolderName(folderPath: string): string {
  const parts = folderPath.split(/[/\\]/);
  return parts[parts.length - 1] || folderPath;
}

export function getFolderPath(filePath: string): string {
  return filePath.split(/[/\\]/).slice(0, -1).join('/');
}
