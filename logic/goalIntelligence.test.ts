import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../domain/appData";
import { DEFAULT_SETTINGS } from "../config";
import { ld, makeDeps } from "../testing/util";
import { logBodyWeight } from "../state/operations";
import type { Goal } from "../domain/goal";
import {
  goalIntel,
  buildTrend,
  bodyweightHistory,
  bodyweightSeries,
  readingPace,
} from "./goalIntelligence";

const mkGoal = (over: Partial<Goal>): Goal => ({
  id: "g1" as Goal["id"],
  horizon: "year",
  parentId: null,
  name: "Reach 56kg",
  description: null,
  category: null,
  metric: { target: 56, current: 44, unit: "kg" },
  deadline: ld("2026-12-31"),
  status: "active",
  milestones: [],
  notes: null,
  createdAt: "2026-09-01T00:00:00Z" as Goal["createdAt"],
  updatedAt: "2026-09-01T00:00:00Z" as Goal["updatedAt"],
  ...over,
});

test("buildTrend needs >=2 points across >=1 day", () => {
  assert.equal(buildTrend([]).enough, false);
  assert.equal(buildTrend([{ date: ld("2026-09-01"), value: 44 }]).enough, false);
  const t = buildTrend([
    { date: ld("2026-09-01"), value: 44 },
    { date: ld("2026-09-08"), value: 44.7 },
  ]);
  assert.equal(t.enough, true);
  assert.ok(Math.abs(t.totalChange! - 0.7) < 1e-9);
  assert.ok(Math.abs(t.perWeek! - 0.7) < 1e-9); // 0.7 over 7 days = 0.7/week
});

test("goalIntel: bodyweight goal with insufficient data -> unknown, no projection", () => {
  const goal = mkGoal({});
  const gi = goalIntel(goal, ld("2026-09-06"), [{ date: ld("2026-09-01"), value: 44 }]); // one point
  assert.equal(gi.enoughData, false);
  assert.equal(gi.recentPacePerWeek, null);
  assert.equal(gi.projectedDate, null);
  assert.equal(gi.status, "unknown");
});

test("goalIntel: bodyweight 44->56 progresses from start, computes pace + projection", () => {
  const goal = mkGoal({});
  // gaining ~0.5 kg/week for 4 weeks: 44 -> 46
  const series = [
    { date: ld("2026-09-01"), value: 44 },
    { date: ld("2026-09-08"), value: 44.5 },
    { date: ld("2026-09-15"), value: 45 },
    { date: ld("2026-09-22"), value: 46 },
  ];
  const gi = goalIntel(goal, ld("2026-09-22"), series);
  assert.equal(gi.current, 46);
  assert.equal(gi.start, 44);
  assert.equal(gi.remaining, 10); // 56 - 46
  // Progress is current/target: 46/56 ≈ 82.1%
  assert.ok(Math.abs(gi.progress - 46 / 56) < 1e-9);
  assert.ok(gi.recentPacePerWeek! > 0.6 && gi.recentPacePerWeek! < 0.7); // ~0.667/wk
  assert.ok(gi.projectedDate !== null); // gaining toward target -> has a projection
  assert.ok(["ahead", "on_track", "behind"].includes(gi.status));
});

test("goalIntel: pace moving AWAY from target -> no projection", () => {
  const goal = mkGoal({});
  const series = [
    { date: ld("2026-09-01"), value: 44 },
    { date: ld("2026-09-08"), value: 43.5 }, // losing weight, target is higher
  ];
  const gi = goalIntel(goal, ld("2026-09-08"), series);
  assert.equal(gi.projectedDate, null);
});

test("bodyweightHistory: single reading -> not enough for a trend", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  data = logBodyWeight(deps, data, { date: ld("2026-09-01"), weight: 44, unit: "kg" }).data;
  const h = bodyweightHistory(data);
  assert.equal(h.latest, 44);
  assert.equal(h.enough, false);
  assert.equal(h.perWeek, null);
});

test("bodyweightHistory: multiple readings -> latest/start/change/perWeek", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  data = logBodyWeight(deps, data, { date: ld("2026-09-01"), weight: 44, unit: "kg" }).data;
  data = logBodyWeight(deps, data, { date: ld("2026-09-08"), weight: 44.5, unit: "kg" }).data;
  data = logBodyWeight(deps, data, { date: ld("2026-09-15"), weight: 45, unit: "kg" }).data;
  const h = bodyweightHistory(data);
  assert.equal(h.start, 44);
  assert.equal(h.latest, 45);
  assert.equal(h.totalChange, 1);
  assert.equal(h.enough, true);
  assert.ok(Math.abs(h.perWeek! - 0.5) < 1e-9); // 1kg over 14 days = 0.5/wk
  assert.equal(h.unit, "kg");
  // recentChange: latest minus reading ~7 days before (Sep 8) = 45 - 44.5 = 0.5
  assert.ok(Math.abs(h.recentChange! - 0.5) < 1e-9);
  // Feeds goal intel via bodyweightSeries (single source of truth)
  assert.equal(bodyweightSeries(data).length, 3);
});

test("readingPace: <2 books -> not enough", () => {
  const rp = readingPace([ld("2026-09-01")], ld("2026-09-30"), 30);
  assert.equal(rp.enough, false);
  assert.equal(rp.perMonth, null);
  assert.equal(rp.projectedDate, null);
});

test("readingPace: computes pace + year-end projection + status", () => {
  // 2 books across ~30 days -> ~2 books/month
  const rp = readingPace([ld("2026-09-01"), ld("2026-10-01")], ld("2026-10-01"), 30);
  assert.equal(rp.finished, 2);
  assert.equal(rp.remaining, 28);
  assert.ok(rp.perMonth! > 1.9 && rp.perMonth! < 2.1);
  assert.ok(rp.projectedYearEnd !== null);
  // 28 books left at ~2/month would take ~14 months -> projected past year end -> behind
  assert.equal(rp.status, "behind");
});
