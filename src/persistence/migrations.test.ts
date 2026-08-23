import { test } from "node:test";
import assert from "node:assert/strict";
import { runMigrations } from "./migrations";
import { validateAndCoerce } from "./validation";
import { importJson } from "./serialization";

// A legacy (v0, unversioned) blob using the OLD habit model:
// string frequency + a habitLog map instead of dated completion events.
const legacyBlob = {
  goals: [],
  tasks: [],
  habits: [
    { id: "h1", name: "Brush", frequency: "daily" },
    { id: "h2", name: "Deep clean", frequency: "weekly" },
  ],
  habitLog: { h1: ["2025-08-20", "2025-08-21"], h2: ["2025-08-17"] },
};

test("runMigrations upgrades v0 habit model to v1", () => {
  const res = runMigrations(legacyBlob, 0, 1);
  assert.ok(res.ok);
  if (!res.ok) return;
  const { data } = validateAndCoerce(res.value);
  assert.equal(data.habits.length, 2);
  // frequency string became a recurrence rule
  const h1 = data.habits.find((h) => h.id === "h1")!;
  assert.deepEqual(h1.schedule, { kind: "daily" });
  const h2 = data.habits.find((h) => h.id === "h2")!;
  assert.equal(h2.schedule.kind, "weekly");
  // habitLog entries became 3 dated completion events
  assert.equal(data.habitCompletions.length, 3);
});

test("runMigrations refuses to downgrade from a newer version", () => {
  const res = runMigrations({}, 2, 1);
  assert.equal(res.ok, false);
});

test("importing an unversioned legacy blob auto-migrates from v0", () => {
  const outcome = importJson(JSON.stringify(legacyBlob));
  assert.equal(outcome.status, "loaded");
  if (outcome.status !== "loaded") return;
  assert.equal(outcome.migratedFrom, 0);
  assert.equal(outcome.data.habitCompletions.length, 3);
});
