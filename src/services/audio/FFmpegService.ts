import type { AudioTrack, PlaybackState } from '@/types';
import { needsFFmpegConversion } from '@/types';

type StateChangeCallback = (state: PlaybackState) => void;
type ProgressCallback = (currentTime: number, duration: number) => void;
type TrackEndCallback = () => void;

interface CachedAudio {
  buffer: AudioBuffer;
  lastAccessed: number;
}

interface WorkerResponse {
  type: 'init-complete' | 'convert-complete' | 'error' | 'progress';
  data?: any;
  error?: string;
}

class FFmpegAudioService {
  private worker: Worker | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private audioBuffer: AudioBuffer | null = null;

  private state: PlaybackState = 'idle';
  private startTime = 0;
  private pauseTime = 0;
  private currentTrack: AudioTrack | null = null;
  private isInitialized = false;
  private isInitializing = false;

  private audioCache: Map<string, CachedAudio> = new Map();
  private readonly MAX_CACHE_SIZE = 50;

  private stateListeners: Set<StateChangeCallback> = new Set();
  private progressListeners: Set<ProgressCallback> = new Set();
  private trackEndListeners: Set<TrackEndCallback> = new Set();
  private progressInterval: number | null = null;

  private conversionPromises: Map<string, { resolve: (data: Uint8Array) => void; reject: (error: Error) => void }> = new Map();

  async init(): Promise<void> {
    if (this.isInitialized && this.audioContext) return;
    if (this.isInitializing) return;

    this.isInitializing = true;

    try {
      this.worker = new Worker(new URL('../../workers/ffmpeg.worker.ts', import.meta.url), {
        type: 'module'
      });

      // 监听 Worker 消息
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        this.handleWorkerMessage(e.data);
      };

      this.worker.onerror = (error) => {
        console.error('[FFmpeg] Worker error:', error);
      };

      // 初始化 Worker 中的 FFmpeg
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Worker init timeout')), 30000);

        const handler = (e: MessageEvent<WorkerResponse>) => {
          if (e.data.type === 'init-complete') {
            clearTimeout(timeout);
            this.worker?.removeEventListener('message', handler);
            resolve();
          } else if (e.data.type === 'error') {
            clearTimeout(timeout);
            this.worker?.removeEventListener('message', handler);
            reject(new Error(e.data.error));
          }
        };

        this.worker?.addEventListener('message', handler);
        this.worker?.postMessage({ type: 'init' });
      });

      this.audioContext = new AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0.5;
      this.gainNode.connect(this.audioContext.destination);

      this.isInitialized = true;
    } finally {
      this.isInitializing = false;
    }
  }

  private handleWorkerMessage(response: WorkerResponse): void {
    switch (response.type) {
      case 'convert-complete':
        const { trackId, audioData } = response.data;
        const promise = this.conversionPromises.get(trackId);
        if (promise) {
          promise.resolve(new Uint8Array(audioData));
          this.conversionPromises.delete(trackId);
        }
        break;

      case 'error':
        console.error('[FFmpeg] Worker error:', response.error);
        // 拒绝所有等待的转换
        this.conversionPromises.forEach(p => p.reject(new Error(response.error)));
        this.conversionPromises.clear();
        break;

      case 'progress':
        // 可以在这里更新进度条
        break;
    }
  }

  private async convertAudioInWorker(audioData: Uint8Array, extension: string, trackId: string): Promise<Uint8Array> {
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    return new Promise<Uint8Array>((resolve, reject) => {
      this.conversionPromises.set(trackId, { resolve, reject });

      this.worker!.postMessage({
        type: 'convert',
        data: { audioData, extension, trackId }
      }, [audioData.buffer]);
    });
  }

  private setState(newState: PlaybackState) {
    this.state = newState;
    this.stateListeners.forEach(cb => cb(newState));
  }

  getState(): PlaybackState {
    return this.state;
  }

  getCurrentTrack(): AudioTrack | null {
    return this.currentTrack;
  }

  getCurrentTime(): number {
    if (!this.audioContext || this.state !== 'playing') {
      return this.pauseTime;
    }
    return this.audioContext.currentTime - this.startTime + this.pauseTime;
  }

  getDuration(): number {
    return this.audioBuffer?.duration ?? 0;
  }

  onStateChange(callback: StateChangeCallback): () => void {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }

  onProgress(callback: ProgressCallback): () => void {
    this.progressListeners.add(callback);
    return () => this.progressListeners.delete(callback);
  }

  onTrackEnd(callback: TrackEndCallback): () => void {
    this.trackEndListeners.add(callback);
    return () => this.trackEndListeners.delete(callback);
  }

  private evictOldestCache(): void {
    if (this.audioCache.size >= this.MAX_CACHE_SIZE) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [key, value] of this.audioCache.entries()) {
        if (value.lastAccessed < oldestTime) {
          oldestTime = value.lastAccessed;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.audioCache.delete(oldestKey);
      }
    }
  }

  private getCachedAudio(trackId: string): AudioBuffer | null {
    const cached = this.audioCache.get(trackId);
    if (cached) {
      cached.lastAccessed = Date.now();
      return cached.buffer;
    }
    return null;
  }

  private cacheAudio(trackId: string, buffer: AudioBuffer): void {
    this.evictOldestCache();
    this.audioCache.set(trackId, {
      buffer,
      lastAccessed: Date.now()
    });
  }

  async preloadTrack(track: AudioTrack, audioData: Uint8Array): Promise<void> {
    if (this.audioCache.has(track.id)) {
      return;
    }

    try {
      await this.init();

      const extension = track.path.split('.').pop()?.toLowerCase() || 'mp3';
      let arrayBuffer: ArrayBuffer;

      if (needsFFmpegConversion(extension)) {
        const convertedData = await this.convertAudioInWorker(audioData, extension, `preload_${track.id}`);
        arrayBuffer = convertedData.buffer as ArrayBuffer;
      } else {
        arrayBuffer = audioData.buffer as ArrayBuffer;
      }

      if (!this.audioContext) {
        throw new Error('AudioContext not initialized');
      }
      const buffer = await this.audioContext.decodeAudioData(arrayBuffer);

      this.cacheAudio(track.id, buffer);
    } catch (error) {
      console.warn('[FFmpeg] Preload failed for:', track.title, error);
    }
  }

  async load(track: AudioTrack, audioData: Uint8Array): Promise<void> {
    this.stop();
    this.setState('loading');
    this.currentTrack = track;

    try {
      const cachedBuffer = this.getCachedAudio(track.id);
      if (cachedBuffer) {
        this.audioBuffer = cachedBuffer;
        this.pauseTime = 0;
        this.progressListeners.forEach(cb => cb(0, cachedBuffer.duration));
        this.setState('paused');
        return;
      }

      await this.init();

      const extension = track.path.split('.').pop()?.toLowerCase() || 'mp3';
      let arrayBuffer: ArrayBuffer;

      if (needsFFmpegConversion(extension)) {
        const convertedData = await this.convertAudioInWorker(audioData, extension, track.id);
        arrayBuffer = convertedData.buffer as ArrayBuffer;
      } else {
        arrayBuffer = audioData.buffer as ArrayBuffer;
      }

      if (!this.audioContext) {
        throw new Error('AudioContext not initialized');
      }
      const buffer = await this.audioContext.decodeAudioData(arrayBuffer);

      this.cacheAudio(track.id, buffer);
      this.audioBuffer = buffer;
      this.pauseTime = 0;

      this.progressListeners.forEach(cb => cb(0, buffer.duration));

      this.setState('paused');
    } catch (error) {
      console.error('[FFmpeg] Failed to load audio:', error);
      this.setState('error');
      throw error;
    }
  }

  async loadAndPlay(track: AudioTrack, audioData: Uint8Array): Promise<void> {
    this.stop();
    this.setState('loading');
    this.currentTrack = track;

    try {
      const cachedBuffer = this.getCachedAudio(track.id);
      if (cachedBuffer) {
        this.audioBuffer = cachedBuffer;
        this.pauseTime = 0;
        this.play();
        return;
      }

      await this.init();

      const extension = track.path.split('.').pop()?.toLowerCase() || 'mp3';
      let arrayBuffer: ArrayBuffer;

      if (needsFFmpegConversion(extension)) {
        const convertedData = await this.convertAudioInWorker(audioData, extension, track.id);
        arrayBuffer = convertedData.buffer as ArrayBuffer;
      } else {
        arrayBuffer = audioData.buffer as ArrayBuffer;
      }

      if (!this.audioContext) {
        throw new Error('AudioContext not initialized');
      }
      const buffer = await this.audioContext.decodeAudioData(arrayBuffer);

      this.cacheAudio(track.id, buffer);
      this.audioBuffer = buffer;
      this.pauseTime = 0;

      this.play();

    } catch (error) {
      console.error('[FFmpeg] Failed to load audio:', error);
      this.setState('error');
      throw error;
    }
  }

  play(): void {
    if (!this.audioContext || !this.audioBuffer || !this.gainNode) {
      console.error('[FFmpeg] Cannot play: missing audio context, buffer or gain node');
      return;
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.connect(this.gainNode);

    this.sourceNode.onended = () => {
      if (this.state === 'playing') {
        this.pauseTime = 0;
        this.trackEndListeners.forEach(cb => cb());
      }
    };

    this.startTime = this.audioContext.currentTime;
    this.sourceNode.start(0, this.pauseTime);
    this.setState('playing');

    this.startProgressTracking();
  }

  pause(): void {
    if (this.state !== 'playing' || !this.audioContext) {
      return;
    }

    this.pauseTime = this.getCurrentTime();
    this.sourceNode?.stop();
    this.sourceNode = null;
    this.setState('paused');
    this.stopProgressTracking();
  }

  stop(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch (e) {}
      this.sourceNode = null;
    }
    this.pauseTime = 0;
    this.stopProgressTracking();
    this.setState('idle');
  }

  seek(time: number): void {
    if (!this.audioBuffer) {
      return;
    }

    const wasPlaying = this.state === 'playing';
    if (wasPlaying) {
      this.sourceNode?.stop();
      this.sourceNode = null;
    }

    this.pauseTime = Math.max(0, Math.min(time, this.getDuration()));

    if (wasPlaying) {
      this.play();
    }
  }

  setVolume(value: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, value));
    }
  }

  getVolume(): number {
    return this.gainNode?.gain.value ?? 1;
  }

  private startProgressTracking(): void {
    this.stopProgressTracking();
    this.progressInterval = window.setInterval(() => {
      this.progressListeners.forEach(cb => {
        cb(this.getCurrentTime(), this.getDuration());
      });
    }, 250);
  }

  private stopProgressTracking(): void {
    if (this.progressInterval !== null) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  clearCache(): void {
    this.audioCache.clear();
  }

  getCacheSize(): number {
    return this.audioCache.size;
  }

  async destroy(): Promise<void> {
    this.stop();
    this.clearCache();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export const ffmpegService = new FFmpegAudioService();
export { FFmpegAudioService };