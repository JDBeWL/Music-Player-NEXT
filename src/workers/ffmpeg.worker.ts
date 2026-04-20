import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let isInitialized = false;

interface WorkerMessage {
  type: 'init' | 'convert';
  data?: {
    audioData?: Uint8Array;
    extension?: string;
    trackId?: string;
  };
}

interface WorkerResponse {
  type: 'init-complete' | 'convert-complete' | 'error' | 'progress';
  data?: any;
  error?: string;
}

function getBaseURL(): string {
  return self.location.origin;
}

async function initFFmpeg() {
  if (isInitialized && ffmpeg) return;

  try {
    console.log('[Worker] Initializing FFmpeg...');
    ffmpeg = new FFmpeg();

    const base = getBaseURL();
    const coreURL = `${base}/ffmpeg/ffmpeg-core.js`;
    const wasmURL = `${base}/ffmpeg/ffmpeg-core.wasm`;

    console.log('[Worker] Loading FFmpeg from local:', coreURL);

    ffmpeg.on('log', ({ message }) => {
      console.log('[Worker FFmpeg]', message);
    });

    ffmpeg.on('progress', ({ progress }) => {
      self.postMessage({
        type: 'progress',
        data: { progress }
      } as WorkerResponse);
    });

    await ffmpeg.load({
      coreURL: await toBlobURL(coreURL, 'text/javascript'),
      wasmURL: await toBlobURL(wasmURL, 'application/wasm'),
    });

    isInitialized = true;
    console.log('[Worker] FFmpeg initialized');
    
    self.postMessage({
      type: 'init-complete'
    } as WorkerResponse);
  } catch (error) {
    console.error('[Worker] FFmpeg init failed:', error);
    self.postMessage({
      type: 'error',
      error: String(error)
    } as WorkerResponse);
  }
}

async function convertAudio(inputAudioData: Uint8Array, extension: string, trackId: string) {
  if (!ffmpeg || !isInitialized) {
    throw new Error('FFmpeg not initialized');
  }

  try {
    const inputFileName = `input_${trackId}.${extension}`;
    const outputFileName = `output_${trackId}.wav`;

    console.log('[Worker] Writing file...');
    await ffmpeg.writeFile(inputFileName, inputAudioData);

    console.log('[Worker] Converting...');
    await ffmpeg.exec([
      '-i', inputFileName,
      '-f', 'wav',
      '-acodec', 'pcm_s16le',
      '-ar', '44100',
      '-ac', '2',
      '-threads', '0',
      outputFileName
    ]);

    console.log('[Worker] Reading output...');
    const data = await ffmpeg.readFile(outputFileName);

    await ffmpeg.deleteFile(inputFileName);
    await ffmpeg.deleteFile(outputFileName);

    console.log('[Worker] Conversion complete');

    const outputAudioData = data instanceof Uint8Array ? data : new Uint8Array();

    const response: WorkerResponse = {
      type: 'convert-complete',
      data: {
        audioData: outputAudioData,
        trackId
      }
    };

    self.postMessage(response, { transfer: [outputAudioData.buffer] });
    
  } catch (error) {
    console.error('[Worker] Conversion failed:', error);
    self.postMessage({
      type: 'error',
      error: String(error)
    } as WorkerResponse);
  }
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, data } = e.data;

  switch (type) {
    case 'init':
      await initFFmpeg();
      break;
    
    case 'convert':
      if (data?.audioData && data?.extension && data?.trackId) {
        await convertAudio(data.audioData, data.extension, data.trackId);
      }
      break;
  }
};
