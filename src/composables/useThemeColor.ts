import { ref } from 'vue';
import {
  QuantizerCelebi,
  Score,
  Hct,
  TonalPalette,
} from '@material/material-color-utilities';

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

// LRU Cache with max size
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  constructor(private maxSize: number) {}

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }
}

const colorCache = new LRUCache<string, ThemeColors>(100);

// In-flight request deduplication
const pendingExtractions = new Map<string, Promise<ThemeColors | null>>();

// Convert HCT to RGB array
function hctToRgb(hct: Hct): [number, number, number] {
  return [
    Math.round(hct.toInt() >> 16 & 0xff),
    Math.round(hct.toInt() >> 8 & 0xff),
    Math.round(hct.toInt() & 0xff),
  ];
}

// Convert RGB to hex string
function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

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

        // Use smaller size for performance while maintaining accuracy
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);

        const imageData = ctx.getImageData(0, 0, size, size);
        const pixels = imageData.data;

        // Build pixel array for quantizer (filter out transparent and near-gray pixels)
        const pixelArray: number[] = [];
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const a = pixels[i + 3];

          // Skip transparent pixels
          if (a < 128) continue;

          // Skip near-gray pixels (low saturation)
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          if (max - min < 10) continue;

          pixelArray.push((r << 16) | (g << 8) | b);
        }

        if (pixelArray.length === 0) {
          return null;
        }

        // Use MD3 QuantizerCelebi to extract color clusters
        const resultMap = QuantizerCelebi.quantize(pixelArray, 128);

        if (resultMap.size === 0) {
          return null;
        }

        // Use MD3 Score to find the best source color
        const scoredColors = Score.score(resultMap);
        if (scoredColors.length === 0) {
          return null;
        }

        const sourceColorArgb = scoredColors[0];
        const sourceHct = Hct.fromInt(sourceColorArgb);

        // Create tonal palette from source color
        const palette = TonalPalette.fromHct(sourceHct);

        // MD3 tonal palette: 0-100 tone scale
        // Primary: tone 40 (main color)
        // On Primary: tone 100 (text on primary)
        // Primary Container: tone 90
        // On Primary Container: tone 10
        // We use tone 40 for primary, tone 30 for dark variant, tone 50 for light variant
        const primaryHct = palette.getHct(40);
        const primaryDarkHct = palette.getHct(30);
        const primaryLightHct = palette.getHct(50);

        const [r, g, b] = hctToRgb(primaryHct);
        const [rDark, gDark, bDark] = hctToRgb(primaryDarkHct);
        const [rLight, gLight, bLight] = hctToRgb(primaryLightHct);

        const theme: ThemeColors = {
          primary: rgbToHex(r, g, b),
          primaryDark: rgbToHex(rDark, gDark, bDark),
          primaryLight: rgbToHex(rLight, gLight, bLight),
          rgb: [r, g, b],
        };

        colorCache.set(imageUrl, theme);
        return theme;
      } catch (error) {
        console.error('Failed to extract color:', error);
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

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let abortController: AbortController | null = null;

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
          console.error('Theme extraction error:', error);
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

  return {
    currentTheme,
    extractColorFromImage,
    applyTheme,
    updateThemeFromCover,
    resetToDefault,
    clearCache,
  };
}
