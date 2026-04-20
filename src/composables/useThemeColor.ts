import { ref } from 'vue';

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  rgb: [number, number, number];
}

const currentTheme = ref<ThemeColors>({
  primary: '#91c4c7',
  primaryDark: '#6aadb1',
  primaryLight: '#b8dbdd',
  rgb: [145, 196, 199],
});

export function useThemeColor() {
  // RGB 转 HSL
  const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return [h * 360, s * 100, l * 100];
  };

  // HSL 转 RGB
  const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
    h /= 360;
    s /= 100;
    l /= 100;
    let r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  };

  const extractColorFromImage = async (imageUrl: string): Promise<ThemeColors | null> => {
    try {
      const img = new Image();
      img.crossOrigin = 'Anonymous';

      return new Promise((resolve) => {
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(null);
              return;
            }

            // 缩小图片以提高性能
            const size = 100;
            canvas.width = size;
            canvas.height = size;
            ctx.drawImage(img, 0, 0, size, size);

            const imageData = ctx.getImageData(0, 0, size, size);
            const pixels = imageData.data;

            // 收集所有颜色并计算饱和度
            const colors: Array<{r: number, g: number, b: number, saturation: number, count: number}> = [];
            const colorMap = new Map<string, number>();

            for (let i = 0; i < pixels.length; i += 4) {
              const r = pixels[i];
              const g = pixels[i + 1];
              const b = pixels[i + 2];
              const a = pixels[i + 3];

              // 跳过透明和过暗/过亮的像素
              if (a < 128) continue;
              const brightness = (r + g + b) / 3;
              if (brightness < 30 || brightness > 240) continue;

              const [, s] = rgbToHsl(r, g, b);

              // 只保留饱和度较高的颜色
              if (s < 20) continue;

              const key = `${Math.floor(r/10)},${Math.floor(g/10)},${Math.floor(b/10)}`;
              colorMap.set(key, (colorMap.get(key) || 0) + 1);

              const existing = colors.find(c =>
                Math.abs(c.r - r) < 30 &&
                Math.abs(c.g - g) < 30 &&
                Math.abs(c.b - b) < 30
              );

              if (existing) {
                existing.count++;
              } else {
                colors.push({ r, g, b, saturation: s, count: 1 });
              }
            }

            if (colors.length === 0) {
              resolve(null);
              return;
            }

            // 选择饱和度最高且出现频率较高的颜色
            colors.sort((a, b) => (b.saturation * b.count) - (a.saturation * a.count));
            const dominant = colors[0];

            const [h, s, l] = rgbToHsl(dominant.r, dominant.g, dominant.b);

            // 确保颜色足够鲜艳
            const adjustedS = Math.max(s, 50);
            const adjustedL = Math.min(Math.max(l, 45), 65);

            const [r, g, b] = hslToRgb(h, adjustedS, adjustedL);
            const [rDark, gDark, bDark] = hslToRgb(h, adjustedS, Math.max(adjustedL - 15, 30));
            const [rLight, gLight, bLight] = hslToRgb(h, adjustedS, Math.min(adjustedL + 15, 75));

            const theme: ThemeColors = {
              primary: `rgb(${r}, ${g}, ${b})`,
              primaryDark: `rgb(${rDark}, ${gDark}, ${bDark})`,
              primaryLight: `rgb(${rLight}, ${gLight}, ${bLight})`,
              rgb: [r, g, b],
            };

            resolve(theme);
          } catch (error) {
            console.error('Failed to extract color:', error);
            resolve(null);
          }
        };

        img.onerror = () => resolve(null);
        img.src = imageUrl;
      });
    } catch (error) {
      console.error('Failed to load image:', error);
      return null;
    }
  };

  const applyTheme = (theme: ThemeColors) => {
    currentTheme.value = theme;
    document.documentElement.style.setProperty('--color-primary', theme.primary);
    document.documentElement.style.setProperty('--color-primary-dark', theme.primaryDark);
    document.documentElement.style.setProperty('--color-primary-light', theme.primaryLight);
  };

  const updateThemeFromCover = async (coverUrl: string | undefined) => {
    if (!coverUrl) return;
    
    const theme = await extractColorFromImage(coverUrl);
    if (theme) {
      applyTheme(theme);
    }
  };

  return {
    currentTheme,
    extractColorFromImage,
    applyTheme,
    updateThemeFromCover,
  };
}

