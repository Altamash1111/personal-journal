import type { AppData } from "../domain/appData";
import type { Clock } from "../core/clock";
import type { StorageAdapter } from "./adapter";
import type { LoadOutcome } from "./envelope";
import { exportJson, loadFromRaw } from "./serialization";

export interface StoreDeps {
  readonly clock: Clock;
}

/**
 * Thin IO layer tying an adapter to the (de)serialization pipeline.
 * IMPORTANT: load() NEVER writes. On an \"error\" outcome the caller still holds
 * the original bytes (outcome.rawBackup) and can back them up before choosing to
 * overwrite — the store will not clobber unreadable data on its own.
 */
export class Store {
  readonly #adapter: StorageAdapter;
  readonly #clock: Clock;

  constructor(adapter: StorageAdapter, deps: StoreDeps) {
    this.#adapter = adapter;
    this.#clock = deps.clock;
  }

  async load(): Promise<LoadOutcome> {
    const raw = await this.#adapter.read();
    if (raw === null || raw.trim() === "") return { status: "empty" };
    return loadFromRaw(raw);
  }

  async save(data: AppData): Promise<void> {
    await this.#adapter.write(exportJson(data, this.#clock));
  }

  /** Read the raw stored bytes without parsing (for manual backup). */
  async backupRaw(): Promise<string | null> {
    return this.#adapter.read();
  }

  async clear(): Promise<void> {
    await this.#adapter.clear();
  }
}
