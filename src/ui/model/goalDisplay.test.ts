import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../../domain/appData";
import { DEFAULT_SETTINGS } from "../../config";
import { ld, makeDeps } from "../../testing/util";
import { createGoal, logBodyWeight } from "../../state/operations";
import { buildGoalsView } from "./plan";

const today = ld("2026-09-15");

test("D: bodyweight goal progress uses the latest logged bodyweight (not stale metric.current)", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  // Goal stored with current 0 (weight is logged separately).
  ({ data } = createGoal(deps, data, {
    horizon: "year",
    name: "Reach 56kg",
    metric: { target: 56, current: 0, unit: "kg" },
  }));
  // Log actual bodyweight readings; latest = 45.5
  data = logBodyWeight(deps, data, { date: ld("2026-09-01"), weight: 44, unit: "kg" }).data;
  data = logBodyWeight(deps, data, { date: ld("2026-09-08"), weight: 45, unit: "kg" }).data;
  data = logBodyWeight(deps, data, { date: ld("2026-09-15"), weight: 45.5, unit: "kg" }).data;

  const gv = buildGoalsView(data, today);
  const g = gv.goals[0]!;
  // Metric label + current reflect the latest bodyweight, NOT 0.
  assert.equal(g.metricCurrent, 45.5);
  assert.equal(g.metricLabel, "45.5 / 56 kg");
  assert.ok(g.metricFromSeries, "flagged as series-driven");
  // Progress = current/target: 45.5/56 ≈ 81.25%
  assert.ok(Math.abs(g.progress - 45.5 / 56) < 1e-9, `progress=${g.progress}`);
});

test("E: Goal Intelligence and the progress display use the SAME current value", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  ({ data } = createGoal(deps, data, {
    horizon: "year",
    name: "Reach 56kg",
    metric: { target: 56, current: 0, unit: "kg" },
  }));
  data = logBodyWeight(deps, data, { date: ld("2026-09-01"), weight: 44, unit: "kg" }).data;
  data = logBodyWeight(deps, data, { date: ld("2026-09-15"), weight: 45.5, unit: "kg" }).data;

  const gv = buildGoalsView(data, today);
  const g = gv.goals[0]!;
  assert.ok(g.intel !== null);
  // The single authoritative current value: display === intelligence.
  assert.equal(g.metricCurrent, g.intel!.current);
  assert.equal(g.intel!.current, 45.5);
  assert.equal(g.intel!.remaining, 10.5);
  // Progress shown on the bar equals the intelligence progress.
  assert.equal(g.progress, g.intel!.progress);
});

test("bodyweight goal with NO history shows metric.current and no series flag", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  ({ data } = createGoal(deps, data, {
    horizon: "year",
    name: "Reach 56kg",
    metric: { target: 56, current: 44, unit: "kg" },
  }));
  const gv = buildGoalsView(data, today);
  const g = gv.goals[0]!;
  assert.equal(g.metricFromSeries, false);
  assert.equal(g.metricCurrent, 44); // falls back to stored metric
});

test("non-bodyweight metric goal uses current/target progress", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  ({ data } = createGoal(deps, data, {
    horizon: "year",
    name: "Read 24 books",
    metric: { target: 24, current: 6, unit: "books" },
  }));
  const gv = buildGoalsView(data, today);
  const g = gv.goals[0]!;
  assert.equal(g.metricFromSeries, false);
  assert.ok(Math.abs(g.progress - 6 / 24) < 1e-9); // 25%
});
