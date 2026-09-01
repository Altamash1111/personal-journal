import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEnvelopeShape, validateAndCoerce } from "./validation";

test("validateEnvelopeShape requires a numeric schemaVersion", () => {
  assert.equal(validateEnvelopeShape({ data: {} }).ok, false);
  assert.equal(validateEnvelopeShape("nope").ok, false);
  const good = validateEnvelopeShape({
    schemaVersion: 1,
    savedAt: "x",
    data: {},
  });
  assert.ok(good.ok);
});

test("a non-array collection is recovered as empty and reported", () => {
  const { data, issues } = validateAndCoerce({ goals: "oops", tasks: [] });
  assert.deepEqual(data.goals, []);
  assert.ok(issues.some((i) => i.includes("goals")));
});

test("malformed entities (no string id) are dropped and reported", () => {
  const { data, issues } = validateAndCoerce({
    tasks: [{ id: "ok" }, { title: "no id" }, 42],
  });
  assert.equal(data.tasks.length, 1);
  assert.ok(issues.some((i) => i.includes("tasks")));
});

test("missing settings falls back to defaults", () => {
  const { data } = validateAndCoerce({});
  assert.equal(data.settings.timeZone, "Asia/Kolkata");
  assert.equal(data.settings.weekStartsOn, 1);
});
