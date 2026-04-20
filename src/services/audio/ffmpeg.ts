import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let loaded = false;

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && loaded) {
    return ffmpeg;
  }

  ffmpeg = new FFmpeg();

  ffmpeg.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
  });

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  loaded = true;
  return ffmpeg;
}

export async function decodeAudio(
  fileData: Uint8Array,
  inputFormat: string
): Promise<Blob> {
  const ff = await getFFmpeg();
  const inputName = `input.${inputFormat}`;
  const outputName = 'output.wav';

  await ff.writeFile(inputName, fileData);

  await ff.exec([
    '-i', inputName,
    '-f', 'wav',
    '-acodec', 'pcm_s16le',
    '-ar', '44100',
    '-ac', '2',
    outputName
  ]);

  const data = await ff.readFile(outputName);

  await ff.deleteFile(inputName);
  await ff.deleteFile(outputName);

  // 确保 data 是 Uint8Array 类型并转换为 ArrayBuffer
  const uint8Data = data instanceof Uint8Array ? data : new Uint8Array(data as unknown as ArrayBuffer);
  return new Blob([new Uint8Array(uint8Data.buffer as ArrayBuffer)], { type: 'audio/wav' });
}

export function isFFmpegLoaded(): boolean {
  return loaded;
}