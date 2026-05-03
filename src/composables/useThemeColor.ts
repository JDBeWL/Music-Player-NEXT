import { ref } from 'vue';
import { LRUCache } from '@/utils/lruCache';

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  rgb: [number, number, number];
}

const DEFAULT_THEME: ThemeColors = {
  primary: '#5BABAE',
  primaryDark: '#005457',
  primaryLight: '#b8dbdd',
  rgb: [91, 171, 174],
};

const currentTheme = ref<ThemeColors>({ ...DEFAULT_THEME });

const colorCache = new LRUCache<string, ThemeColors>(100);

const pendingExtractions = new Map<string, Promise<ThemeColors | null>>();

let worker: Worker | null = null;
let workerInitPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (worker) return Promise.resolve(worker);

  if (workerInitPromise) return workerInitPromise;

  workerInitPromise = (async (): Promise<Worker> => {
    const w = new Worker(new URL('../workers/themeColor.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker = w;
    return w;
  })();

  return workerInitPromise;
}

interface WorkerResponse {
  type: 'extract-result';
  url: string;
  theme: ThemeColors | null;
}

const pendingWorkerCallbacks = new Map<string, {
  resolve: (theme: ThemeColors | null) => void;
  reject: (error: Error) => void;
}>();

async function initWorkerListeners(): Promise<void> {
  const w = await getWorker();
  w.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const { url, theme } = e.data;
    const callbacks = pendingWorkerCallbacks.get(url);
    if (callbacks) {
      pendingWorkerCallbacks.delete(url);
      callbacks.resolve(theme);
    }
  };
  w.onerror = (error) => {
    console.warn('[ThemeColor] Worker error:', error);
    pendingWorkerCallbacks.forEach(cb => cb.reject(new Error('Worker error')));
    pendingWorkerCallbacks.clear();
  };
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let abortController: AbortController | null = null;

let listenersInitialized = false;

export function useThemeColor() {
  const extractColorFromImage = async (imageUrl: string): Promise<ThemeColors | null> => {
    const cached = colorCache.get(imageUrl);
    if (cached !== undefined) {
      return cached;
    }

    const pending = pendingExtractions.get(imageUrl);
    if (pending) {
      return pending;
    }

    const extractionPromise = (async (): Promise<ThemeColors | null> => {
      try {
        const img = new Image();
        img.crossOrigin = 'Anonymous';

        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Image load failed'));
          img.src = imageUrl;
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          return null;
        }

        const size = 128;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);

        const imageData = ctx.getImageData(0, 0, size, size);

        if (!listenersInitialized) {
          await initWorkerListeners();
          listenersInitialized = true;
        }

        const w = await getWorker();

        const resultPromise = new Promise<ThemeColors | null>((resolve, reject) => {
          pendingWorkerCallbacks.set(imageUrl, { resolve, reject });
          w.postMessage({ type: 'extract', imageData, url: imageUrl }, [imageData.data.buffer]);
        });

        const theme = await resultPromise;

        if (theme) {
          colorCache.set(imageUrl, theme);
        }

        return theme;
      } catch (error) {
        console.warn('Failed to extract color:', error);
        return null;
      } finally {
        pendingExtractions.delete(imageUrl);
      }
    })();

    pendingExtractions.set(imageUrl, extractionPromise);
    return extractionPromise;
  };

  const applyTheme = (theme: ThemeColors) => {
    currentTheme.value = theme;
    const root = document.documentElement.style;
    root.setProperty('--color-primary', theme.primary);
    root.setProperty('--color-primary-dark', theme.primaryDark);
    root.setProperty('--color-primary-light', theme.primaryLight);
    root.setProperty('--color-on-primary-container', theme.primary);

    const [r, g, b] = theme.rgb;
    root.setProperty('--color-primary-container', `rgba(${r}, ${g}, ${b}, 0.15)`);
  };

  const updateThemeFromCover = (coverUrl: string | undefined, immediate: boolean = false) => {
    if (!coverUrl) return;

    if (abortController) {
      abortController.abort();
      abortController = null;
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    const doExtract = async () => {
      const controller = new AbortController();
      abortController = controller;

      try {
        const theme = await extractColorFromImage(coverUrl);
        if (theme && !controller.signal.aborted) {
          applyTheme(theme);
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.warn('Theme extraction error:', error);
        }
      }
    };

    if (immediate) {
      doExtract();
    } else {
      debounceTimer = setTimeout(doExtract, 150);
    }
  };

  const resetToDefault = () => {
    applyTheme({ ...DEFAULT_THEME });
  };

  const clearCache = () => {
    colorCache.clear();
  };

  const cleanup = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    pendingWorkerCallbacks.forEach(cb => cb.reject(new Error('Cleanup')));
    pendingWorkerCallbacks.clear();
    pendingExtractions.clear();
    if (worker) {
      worker.terminate();
      worker = null;
    }
    workerInitPromise = null;
    listenersInitialized = false;
  };

  return {
    currentTheme,
    extractColorFromImage,
    applyTheme,
    updateThemeFromCover,
    resetToDefault,
    clearCache,
    cleanup,
  };
}
