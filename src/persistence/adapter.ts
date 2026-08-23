/**
 * Persistence is kept behind this tiny string-in/string-out interface so the core
 * never depends on where bytes live. Swap in IndexedDB, a file, or a server later
 * without touching domain/logic. Methods may be sync or async.
 */
export interface StorageAdapter {
  read(): string | null | Promise<string | null>;
  write(data: string): void | Promise<void>;
  clear(): void | Promise<void>;
}

/** In-memory adapter for tests and SSR. */
export class MemoryStorageAdapter implements StorageAdapter {
  #value: string | null;
  constructor(initial: string | null = null) {
    this.#value = initial;
  }
  read(): string | null {
    return this.#value;
  }
  write(data: string): void {
    this.#value = data;
  }
  clear(): void {
    this.#value = null;
  }
  /** Test helper: peek at raw stored bytes. */
  snapshot(): string | null {
    return this.#value;
  }
}

/** Browser adapter over window.localStorage (or any Storage-compatible object). */
export class LocalStorageAdapter implements StorageAdapter {
  readonly #key: string;
  readonly #storage: Storage;
  constructor(key: string, storage?: Storage) {
    const s =
      storage ?? (globalThis as { localStorage?: Storage }).localStorage;
    if (s === undefined) {
      throw new Error("localStorage is not available in this environment");
    }
    this.#key = key;
    this.#storage = s;
  }
  read(): string | null {
    return this.#storage.getItem(this.#key);
  }
  write(data: string): void {
    this.#storage.setItem(this.#key, data);
  }
  clear(): void {
    this.#storage.removeItem(this.#key);
  }
}
