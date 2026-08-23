import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../domain/appData";
import { DEFAULT_SETTINGS } from "../config";
import { fixedClock } from "../core/clock";
import { createTask } from "../state/operations";
import { MemoryStorageAdapter, LocalStorageAdapter } from "./adapter";
import { Store } from "./store";
import { ld, makeDeps } from "../testing/util";

const clock = fixedClock("2025-08-22T06:00:00.000Z");

test("save then load round-trips through the store", async () => {
  const deps = makeDeps();
  const { data } = createTask(deps, emptyAppData(DEFAULT_SETTINGS), {
    title: "T",
    due: ld("2025-08-22"),
  });
  const store = new Store(new MemoryStorageAdapter(), { clock });
  await store.save(data);
  const outcome = await store.load();
  assert.equal(outcome.status, "loaded");
  if (outcome.status !== "loaded") return;
  assert.deepEqual(outcome.data, data);
});

test("loading an empty adapter yields empty status", async () => {
  const store = new Store(new MemoryStorageAdapter(), { clock });
  const outcome = await store.load();
  assert.equal(outcome.status, "empty");
});

test("loading corrupt data never overwrites the stored bytes", async () => {
  const adapter = new MemoryStorageAdapter("{{ corrupt");
  const store = new Store(adapter, { clock });
  const outcome = await store.load();
  assert.equal(outcome.status, "error");
  // load must not have written anything
  assert.equal(adapter.snapshot(), "{{ corrupt");
});

// Minimal Storage-compatible fake to exercise the browser adapter in Node.
const fakeStorage = (): Storage => {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear() {
      m.clear();
    },
    getItem(k: string) {
      return m.get(k) ?? null;
    },
    key(i: number) {
      return [...m.keys()][i] ?? null;
    },
    removeItem(k: string) {
      m.delete(k);
    },
    setItem(k: string, v: string) {
      m.set(k, v);
    },
  } as Storage;
};

test("LocalStorageAdapter reads and writes via a Storage object", async () => {
  const deps = makeDeps();
  const { data } = createTask(deps, emptyAppData(DEFAULT_SETTINGS), { title: "L" });
  const store = new Store(new LocalStorageAdapter("plos", fakeStorage()), { clock });
  await store.save(data);
  const outcome = await store.load();
  assert.equal(outcome.status, "loaded");
});
