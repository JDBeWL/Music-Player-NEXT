type ProgressCallback = (currentTime: number, duration: number) => void;

export class ProgressTracker {
  private progressListeners: Set<ProgressCallback> = new Set();
  private progressRafId: number | null = null;
  private isPageVisible: boolean = true;
  private visibilityHandler: (() => void) | null = null;
  private getTime: () => number;
  private getDuration: () => number;
  private onResumeTracking: (() => void) | null = null;

  constructor(
    getTime: () => number,
    getDuration: () => number,
    onResumeTracking?: () => void
  ) {
    this.getTime = getTime;
    this.getDuration = getDuration;
    this.onResumeTracking = onResumeTracking ?? null;
    this.setupVisibilityListener();
  }

  private setupVisibilityListener(): void {
    this.visibilityHandler = () => {
      this.isPageVisible = !document.hidden;
      if (this.isPageVisible && this.progressRafId === null) {
        if (this.onResumeTracking) {
          this.onResumeTracking();
        }
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  onProgress(callback: ProgressCallback): () => void {
    this.progressListeners.add(callback);
    return () => this.progressListeners.delete(callback);
  }

  startTracking(): void {
    this.stopTracking();
    const tick = () => {
      if (!this.isPageVisible) {
        this.progressRafId = null;
        return;
      }
      [...this.progressListeners].forEach(cb => {
        cb(this.getTime(), this.getDuration());
      });
      this.progressRafId = requestAnimationFrame(tick);
    };
    this.progressRafId = requestAnimationFrame(tick);
  }

  stopTracking(): void {
    if (this.progressRafId !== null) {
      cancelAnimationFrame(this.progressRafId);
      this.progressRafId = null;
    }
  }

  isTracking(): boolean {
    return this.progressRafId !== null;
  }

  notifyProgress(time: number, duration: number): void {
    [...this.progressListeners].forEach(cb => cb(time, duration));
  }

  destroy(): void {
    this.stopTracking();
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.progressListeners.clear();
  }
}
