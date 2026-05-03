export class LRUCache<K, V> {
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

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }

  entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }
}

export class LRUMemoryCache<K, V> {
  private cache = new Map<K, { value: V; size: number }>();
  private _totalSize = 0;

  constructor(
    private maxEntries: number,
    private maxMemoryBytes: number
  ) {}

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (entry !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, entry);
      return entry.value;
    }
    return undefined;
  }

  set(key: K, value: V, entrySize: number): void {
    const existing = this.cache.get(key);
    if (existing) {
      this._totalSize -= existing.size;
      this.cache.delete(key);
    }

    this.evictIfNeeded(entrySize);

    this.cache.set(key, { value, size: entrySize });
    this._totalSize += entrySize;
  }

  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this._totalSize -= entry.size;
    }
    return this.cache.delete(key);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  get size(): number {
    return this.cache.size;
  }

  get totalSize(): number {
    return this._totalSize;
  }

  clear(): void {
    this.cache.clear();
    this._totalSize = 0;
  }

  private evictIfNeeded(requiredBytes: number): void {
    const targetBytes = this.maxMemoryBytes - requiredBytes;

    while (this.cache.size > 0 && (this._totalSize > targetBytes || this.cache.size >= this.maxEntries)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey == null) break;
      const entry = this.cache.get(firstKey);
      if (entry) {
        this._totalSize -= entry.size;
      }
      this.cache.delete(firstKey);
    }
  }
}
