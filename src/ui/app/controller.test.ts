import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../persistence/store";
import { MemoryStorageAdapter } from "../../persistence/adapter";
import { fixedClock } from "../../core/clock";
import { sequentialFactory } from "../../core/id";
import type { OpDeps } from "../../state/helpers";
import type { TaskId, HabitId } from "../../domain/ids";
import { AppController, formatFullDate } from "./controller";
import { ld } from "../../testing/util";

const ISO = "2025-08-22T06:00:00.000Z"; // 11:30 IST -> local day 2025-08-22

const makeOps = (): OpDeps => ({
  ids: sequentialFactory("c"),
  clock: fixedClock(ISO),
});

const makeController = (adapter: MemoryStorageAdapter) =>
  new AppController({ store: new Store(adapter, { clock: fixedClock(ISO) }), ops: makeOps() });

test("today() uses the store timezone (Asia/Kolkata), not UTC", () => {
  const c = makeController(new MemoryStorageAdapter());
  assert.equal(c.today(), ld("2025-08-22"));
  assert.equal(c.localHour(), 11); // 06:00Z + 5:30
});

test("init on empty storage yields empty status + empty view", async () => {
  const c = makeController(new MemoryStorageAdapter());
  await c.init();
  assert.equal(c.loadStatus(), "empty");
  assert.equal(c.view().isEmpty, true);
});

test("addTask persists through the store (survives reload)", async () => {
  const adapter = new MemoryStorageAdapter();
  const c1 = makeController(adapter);
  await c1.init();
  await c1.addTask({ title: "Write report", due: ld("2025-08-22") });
  assert.equal(c1.view().tasks.length, 1);

  // A brand-new controller over the SAME adapter must see the task.
  const c2 = makeController(adapter);
  await c2.init();
  assert.equal(c2.loadStatus(), "loaded");
  assert.equal(c2.view().tasks.length, 1);
  assert.equal(c2.getState().tasks[0]!.title, "Write report");
});

test("toggleTask completes and un-completes", async () => {
  const c = makeController(new MemoryStorageAdapter());
  await c.init();
  await c.addTask({ title: "T", due: ld("2025-08-22") });
  const id = c.getState().tasks[0]!.id as TaskId;
  await c.toggleTask(id);
  assert.equal(c.getState().tasks[0]!.status, "done");
  await c.toggleTask(id);
  assert.equal(c.getState().tasks[0]!.status, "todo");
});

test("toggleHabit checks a plain habit and clears it", async () => {
  const c = makeController(new MemoryStorageAdapter());
  await c.init();
  await c.addHabit({ name: "Meditate", schedule: { kind: "daily" } });
  const id = c.getState().habits[0]!.id as HabitId;
  await c.toggleHabit(id);
  assert.equal(c.view().habits[0]!.done, true);
  await c.toggleHabit(id);
  assert.equal(c.view().habits[0]!.done, false);
});

test("measurable habit increments by one unit per tap", async () => {
  const c = makeController(new MemoryStorageAdapter());
  await c.init();
  await c.addHabit({
    name: "Water",
    schedule: { kind: "daily" },
    target: { amount: 3, unit: "glasses" },
  });
  const id = c.getState().habits[0]!.id as HabitId;
  await c.toggleHabit(id); // 1
  await c.toggleHabit(id); // 2
  assert.equal(c.view().habits[0]!.current, 2);
  assert.equal(c.view().habits[0]!.done, false);
  await c.toggleHabit(id); // 3 -> done
  assert.equal(c.view().habits[0]!.done, true);
  await c.toggleHabit(id); // clears the day
  assert.equal(c.view().habits[0]!.current, 0);
});

test("subscribe fires on mutation and unsubscribes cleanly", async () => {
  const c = makeController(new MemoryStorageAdapter());
  await c.init();
  let count = 0;
  const off = c.subscribe(() => {
    count++;
  });
  await c.addTask({ title: "x", due: ld("2025-08-22") });
  assert.ok(count >= 1);
  off();
  const at = count;
  await c.addTask({ title: "y", due: ld("2025-08-22") });
  assert.equal(count, at); // no further notifications
});

test("seedExample creates a real, persisted starter set", async () => {
  const adapter = new MemoryStorageAdapter();
  const c = makeController(adapter);
  await c.init();
  await c.seedExample();
  const vm = c.view();
  assert.equal(vm.isEmpty, false);
  assert.ok(vm.habits.length >= 3);
  assert.ok(vm.goals.length >= 2);
  assert.ok(vm.routineGroups.length >= 1);

  // Persisted: a reload sees the same non-empty state.
  const c2 = makeController(adapter);
  await c2.init();
  assert.equal(c2.view().isEmpty, false);
});

test("load error keeps a safe empty state without clobbering raw bytes", async () => {
  const adapter = new MemoryStorageAdapter("{corrupt json");
  const c = makeController(adapter);
  await c.init();
  assert.equal(c.loadStatus(), "error");
  assert.equal(c.view().isEmpty, true);
  assert.equal(adapter.snapshot(), "{corrupt json"); // untouched
});

test("formatFullDate renders a human date from a LocalDate", () => {
  assert.equal(formatFullDate(ld("2025-08-22")), "Friday, August 22");
});
