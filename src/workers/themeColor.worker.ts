import {
  QuantizerCelebi,
  Score,
  Hct,
  TonalPalette,
} from '@material/material-color-utilities';

interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  rgb: [number, number, number];
}

interface WorkerRequest {
  type: 'extract';
  imageData: ImageData;
  url: string;
}

interface WorkerResponse {
  type: 'extract-result';
  url: string;
  theme: ThemeColors | null;
}

function hctToRgb(hct: Hct): [number, number, number] {
  return [
    Math.round(hct.toInt() >> 16 & 0xff),
    Math.round(hct.toInt() >> 8 & 0xff),
    Math.round(hct.toInt() & 0xff),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

function extractColorFromImageData(imageData: ImageData): ThemeColors | null {
  const pixels = imageData.data;

  const pixelArray: number[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];

    if (a < 128) continue;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 10) continue;

    pixelArray.push((r << 16) | (g << 8) | b);
  }

  if (pixelArray.length === 0) {
    return null;
  }

  const resultMap = QuantizerCelebi.quantize(pixelArray, 128);

  if (resultMap.size === 0) {
    return null;
  }

  const scoredColors = Score.score(resultMap);
  if (scoredColors.length === 0) {
    return null;
  }

  const sourceColorArgb = scoredColors[0];
  const sourceHct = Hct.fromInt(sourceColorArgb);

  const palette = TonalPalette.fromHct(sourceHct);

  const primaryHct = palette.getHct(40);
  const primaryDarkHct = palette.getHct(30);
  const primaryLightHct = palette.getHct(50);

  const [r, g, b] = hctToRgb(primaryHct);
  const [rDark, gDark, bDark] = hctToRgb(primaryDarkHct);
  const [rLight, gLight, bLight] = hctToRgb(primaryLightHct);

  return {
    primary: rgbToHex(r, g, b),
    primaryDark: rgbToHex(rDark, gDark, bDark),
    primaryLight: rgbToHex(rLight, gLight, bLight),
    rgb: [r, g, b],
  };
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { type, imageData, url } = e.data;

  if (type === 'extract') {
    try {
      const theme = extractColorFromImageData(imageData);
      const response: WorkerResponse = {
        type: 'extract-result',
        url,
        theme,
      };
      self.postMessage(response);
    } catch (error) {
      console.error('[ThemeColorWorker] Extraction failed:', error);
      const response: WorkerResponse = {
        type: 'extract-result',
        url,
        theme: null,
      };
      self.postMessage(response);
    }
  }
};
