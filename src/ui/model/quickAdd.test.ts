import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuickAdd } from "./quickAdd";
import {
  resolveTheme,
  nextTheme,
  isThemeChoice,
  themeLabel,
} from "./theme";
import { ld } from "../../testing/util";

const today = ld("2025-08-22");

test("parseQuickAdd returns null for empty/whitespace", () => {
  assert.equal(parseQuickAdd("task", "   ", today), null);
  assert.equal(parseQuickAdd("habit", "", today), null);
});

test("task intent defaults to due today, no priority", () => {
  const intent = parseQuickAdd("task", "Buy milk", today);
  assert.ok(intent && intent.kind === "task");
  if (!intent || intent.kind !== "task") return;
  assert.equal(intent.input.title, "Buy milk");
  assert.equal(intent.input.due, today);
  assert.equal(intent.input.priority, undefined);
});

test("leading ! and !! set high/urgent priority and are stripped", () => {
  const high = parseQuickAdd("task", "! Call bank", today);
  const urgent = parseQuickAdd("task", "!! Pay rent", today);
  assert.ok(high && high.kind === "task" && urgent && urgent.kind === "task");
  if (!high || high.kind !== "task" || !urgent || urgent.kind !== "task") return;
  assert.equal(high.input.priority, "high");
  assert.equal(high.input.title, "Call bank");
  assert.equal(urgent.input.priority, "urgent");
  assert.equal(urgent.input.title, "Pay rent");
});

test("habit intent creates a daily habit", () => {
  const intent = parseQuickAdd("habit", "Journal", today);
  assert.ok(intent && intent.kind === "habit");
  if (!intent || intent.kind !== "habit") return;
  assert.equal(intent.input.name, "Journal");
  assert.deepEqual(intent.input.schedule, { kind: "daily" });
});

test("resolveTheme respects choice and system preference", () => {
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
});

test("nextTheme cycles dark -> light -> system -> dark", () => {
  assert.equal(nextTheme("dark"), "light");
  assert.equal(nextTheme("light"), "system");
  assert.equal(nextTheme("system"), "dark");
});

test("theme guards + labels", () => {
  assert.ok(isThemeChoice("dark"));
  assert.equal(isThemeChoice("blue"), false);
  assert.equal(themeLabel("system"), "System");
});
