interface PlayerEventMap {
  'track-end': void;
}

type EventCallback<T> = T extends void ? () => void : (data: T) => void;

class PlayerEventBus {
  private listeners: Map<string, Set<EventCallback<unknown>>> = new Map();

  on<E extends keyof PlayerEventMap>(
    event: E,
    callback: EventCallback<PlayerEventMap[E]>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback<unknown>);
    return () => {
      this.listeners.get(event)?.delete(callback as EventCallback<unknown>);
    };
  }

  emit<E extends keyof PlayerEventMap>(event: E, ...args: PlayerEventMap[E] extends void ? [] : [PlayerEventMap[E]]): void {
    const cbs = this.listeners.get(event);
    if (!cbs) return;
    for (const cb of cbs) {
      (cb as (...a: unknown[]) => void)(...args);
    }
  }

  off<E extends keyof PlayerEventMap>(
    event: E,
    callback: EventCallback<PlayerEventMap[E]>
  ): void {
    this.listeners.get(event)?.delete(callback as EventCallback<unknown>);
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const playerEvents = new PlayerEventBus();
