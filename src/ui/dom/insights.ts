import type { InsightsView } from "../model/insights";
import type { WeeklyReview } from "../../logic/weeklyReview";
import { shortDay, labelDay } from "../../logic/weeklyReview";
import { overallLabel } from "../../logic/scorecard";
import { formatDuration } from "../../logic/sleep";
import { h } from "./h";
import { card, bar, pageHead, emptyLine, stat } from "./ui";

const changeArrow = (cur: number | null, prev: number | null): string => {
  if (cur === null || prev === null) return "—";
  if (cur > prev) return "↑";
  if (cur < prev) return "↓";
  return "→";
};

const ratePctStr = (r: number | null): string => (r === null ? "—" : `${Math.round(r * 100)}%`);

const habitTable = (review: WeeklyReview): HTMLElement => {
  if (review.habits.length === 0) {
    return emptyLine("No active habits scheduled this week.");
  }
  const rows = review.habits.map((hbt) =>
    h(
      "div",
      { class: "insight-row" },
      h("span", { class: "insight-row-name" }, hbt.name),
      h("span", { class: "mono insight-row-num" }, `${hbt.completed}/${hbt.expected}`),
      h(
        "span",
        { class: "insight-row-bar" },
        bar(hbt.rate),
      ),
      h("span", { class: "mono insight-row-rate" }, ratePctStr(hbt.rate)),
    ),
  );
  return h("div", { class: "insight-table" }, ...rows);
};

const missedList = (review: WeeklyReview): HTMLElement | null => {
  const slipping = review.habits.filter((hbt) => hbt.missedDates.length > 0 && hbt.rate < 1);
  if (slipping.length === 0) return null;
  return h(
    "div",
    { class: "insight-missed" },
    ...slipping.map((hbt) =>
      h(
        "div",
        { class: "insight-missed-row" },
        h("span", { class: "insight-missed-name" }, hbt.name),
        h(
          "span",
          { class: "insight-missed-days" },
          `missed ${hbt.missedDates.map((d) => shortDay(d)).join(", ")}`,
        ),
      ),
    ),
  );
};

const ratingsCard = (review: WeeklyReview): HTMLElement => {
  const r = review.ratings;
  if (r.count === 0) return emptyLine("No daily reviews rated this week.");
  const dots = r.perDay.map((p) =>
    h(
      "div",
      { class: "rating-day" },
      h("span", { class: "rating-day-label" }, shortDay(p.date)),
      h(
        "span",
        { class: `rating-day-val ${p.rating === null ? "is-empty" : ""}`.trim() },
        p.rating === null ? "·" : `${p.rating}`,
      ),
    ),
  );
  return h(
    "div",
    {},
    h("div", { class: "rating-strip" }, ...dots),
    h(
      "div",
      { class: "rating-avg" },
      h("span", { class: "mono" }, r.average === null ? "—" : `${r.average.toFixed(1)} / 5`),
      h("span", { class: "muted-inline" }, `avg over ${r.count} day${r.count === 1 ? "" : "s"}`),
    ),
  );
};

const themeCard = (hits: WeeklyReview["problems"], tone: "good" | "bad"): HTMLElement =>
  hits.length === 0
    ? emptyLine(tone === "bad" ? "No recurring problems flagged." : "No recurring wins flagged yet.")
    : h(
        "div",
        { class: "theme-list" },
        ...hits.slice(0, 5).map((t) =>
          h(
            "div",
            { class: `theme-row theme-${tone}` },
            h("span", { class: "theme-name" }, t.theme),
            h("span", { class: "theme-count mono" }, `${t.days} day${t.days === 1 ? "" : "s"}`),
          ),
        ),
      );

const learnedCard = (review: WeeklyReview): HTMLElement =>
  review.learned.length === 0
    ? emptyLine("Nothing recorded in “What I learned” this week.")
    : h(
        "div",
        { class: "learned-list" },
        ...review.learned.map((l) =>
          h(
            "div",
            { class: "learned-row" },
            h("span", { class: "learned-day" }, labelDay(l.date)),
            h("span", { class: "learned-text" }, l.text),
          ),
        ),
      );

const compareRow = (label: string, cur: string, prev: string, arrow: string): HTMLElement =>
  h(
    "div",
    { class: "compare-row" },
    h("span", { class: "compare-label" }, label),
    h("span", { class: "mono compare-cur" }, cur),
    h("span", { class: "mono compare-prev" }, prev),
    h("span", { class: `compare-arrow arrow-${arrow === "↑" ? "up" : arrow === "↓" ? "down" : "flat"}` }, arrow),
  );

export const renderInsights = (v: InsightsView): HTMLElement => {
  const root = h("div", { class: "dash module" });
  root.appendChild(pageHead("Weekly review", "Your real data, turned into insight — one week at a time."));

  // Week selector
  root.appendChild(
    h(
      "div",
      { class: "week-nav" },
      h("button", { class: "btn btn-ghost btn-sm", "data-action": "insights-prev" }, "‹ Prev"),
      h("span", { class: "week-nav-label mono" }, v.rangeLabel + (v.isCurrentWeek ? " · This week" : "")),
      v.canGoNext
        ? h("button", { class: "btn btn-ghost btn-sm", "data-action": "insights-next" }, "Next ›")
        : h("button", { class: "btn btn-ghost btn-sm is-disabled", disabled: "true" }, "Next ›"),
      h("button", { class: "btn btn-ghost btn-sm", "data-action": "insights-today" }, "This week"),
    ),
  );

  const grid = h("div", { class: "grid" });

  if (!v.review.hasData) {
    grid.appendChild(
      card(
        "Weekly review",
        emptyLine("Not enough data yet — keep using Life OS and your trends will appear here."),
        { cls: "card-wide" },
      ),
    );
    root.appendChild(grid);
    return root;
  }

  // Attention needed — most important, shown first when present.
  if (v.attention.length > 0) {
    grid.appendChild(
      card(
        "Attention needed",
        h(
          "div",
          { class: "attention-list" },
          ...v.attention.map((a) =>
            h(
              "div",
              { class: `attention-row sev-${a.severity}` },
              h("span", { class: "attention-dot", "aria-hidden": "true" }, a.severity === "warn" ? "▲" : "•"),
              h("span", { class: "attention-msg" }, a.message),
            ),
          ),
        ),
        { count: String(v.attention.length), cls: "card-wide" },
      ),
    );
  }

  // Weekly scorecard — transparent: each area shows its formula.
  {
    const sc = v.scorecard;
    grid.appendChild(
      card(
        "Weekly scorecard",
        h(
          "div",
          {},
          h(
            "div",
            { class: "scorecard-overall" },
            h("span", { class: "scorecard-big mono" }, sc.overall === null ? "—" : `${Math.round(sc.overall * 100)}%`),
            h("span", { class: "scorecard-verdict" }, overallLabel(sc.overall)),
            sc.strongest && sc.weakest
              ? h(
                  "span",
                  { class: "scorecard-extremes" },
                  h("span", { class: "muted-inline" }, `Strongest: ${sc.strongest.label} · Weakest: ${sc.weakest.label}`),
                )
              : null,
          ),
          h(
            "div",
            { class: "scorecard-areas" },
            ...sc.areas.map((a) =>
              h(
                "div",
                { class: "scorecard-row" },
                h("span", { class: "scorecard-area-label" }, a.label),
                h("span", { class: "scorecard-area-score mono" }, a.score === null ? "—" : `${Math.round(a.score * 100)}%`),
                h("span", { class: "scorecard-area-detail" }, `= ${a.detail}`),
              ),
            ),
          ),
        ),
        { cls: "card-wide" },
      ),
    );
  }

  // This week vs last week
  const c = v.comparison;
  grid.appendChild(
    card(
      "This week vs last week",
      h(
        "div",
        { class: "compare-table" },
        h(
          "div",
          { class: "compare-row compare-head" },
          h("span", { class: "compare-label" }, ""),
          h("span", { class: "compare-cur" }, "This"),
          h("span", { class: "compare-prev" }, "Last"),
          h("span", { class: "compare-arrow" }, ""),
        ),
        compareRow("Habit completion", ratePctStr(c.habitRate.cur), ratePctStr(c.habitRate.prev), changeArrow(c.habitRate.cur, c.habitRate.prev)),
        compareRow("Tasks completed", String(c.tasksCompleted.cur), String(c.tasksCompleted.prev), changeArrow(c.tasksCompleted.cur, c.tasksCompleted.prev)),
        compareRow(
          "Avg daily rating",
          c.avgRating.cur === null ? "—" : c.avgRating.cur.toFixed(1),
          c.avgRating.prev === null ? "—" : c.avgRating.prev.toFixed(1),
          changeArrow(c.avgRating.cur, c.avgRating.prev),
        ),
      ),
      { cls: "card-wide" },
    ),
  );

  // Habit consistency
  grid.appendChild(
    card(
      "Habit consistency",
      h("div", {}, habitTable(v.review), missedList(v.review)),
      { count: v.review.habitRate === null ? undefined : ratePctStr(v.review.habitRate), cls: "card-wide" },
    ),
  );

  // Daily ratings
  grid.appendChild(card("Daily ratings", ratingsCard(v.review)));

  // Task stats
  const t = v.review.tasks;
  grid.appendChild(
    card(
      "Tasks",
      h(
        "div",
        { class: "stat-row tight" },
        stat("Completed", String(t.completed)),
        stat("Created", String(t.created)),
        stat("Pending", String(t.pending)),
        stat("Overdue", String(t.overdue)),
      ),
    ),
  );

  // Fitness
  const f = v.review.fitness;
  grid.appendChild(
    card(
      "Fitness",
      f.workoutsThisWeek === 0 && f.lastWorkoutDate === null
        ? emptyLine("No workouts logged yet.")
        : h(
            "div",
            { class: "stat-row tight" },
            stat("Workouts", String(f.workoutsThisWeek)),
            stat("Last week", String(f.workoutsPrevWeek)),
            stat("Volume", `${f.totalVolume}`),
            stat("Last", f.lastWorkoutDate === null ? "—" : labelDay(f.lastWorkoutDate)),
          ),
    ),
  );

  // Sleep (target from settings)
  const s = v.review.sleep;
  grid.appendChild(
    card(
      "Sleep",
      s.nights === 0
        ? emptyLine("No sleep logged this week.")
        : h(
            "div",
            { class: "stat-row tight" },
            stat("Avg", s.avgMinutes === null ? "—" : formatDuration(s.avgMinutes)),
            stat("≥ target", `${s.daysMetTarget}/${s.nights}`),
            stat("Best", s.bestMinutes === null ? "—" : formatDuration(s.bestMinutes)),
            stat("Worst", s.worstMinutes === null ? "—" : formatDuration(s.worstMinutes)),
          ),
    ),
  );

  // Diet — targets are MINIMUMS (≥ is success)
  const d = v.review.diet;
  grid.appendChild(
    card(
      "Diet",
      d.daysLogged === 0
        ? emptyLine("No meals or water logged this week.")
        : h(
            "div",
            {},
            h(
              "div",
              { class: "stat-row tight" },
              stat("Cals ≥ min", `${d.daysCalorieMin}/${d.daysLogged}`),
              stat("Protein ≥ min", `${d.daysProteinMin}/${d.daysLogged}`),
              stat("Water ≥ min", `${d.daysWaterMin}/${d.daysLogged}`),
            ),
            h(
              "p",
              { class: "muted", style: "margin-top:8px" },
              `Avg ${d.avgCalories ?? 0} kcal · ${d.avgProtein ?? 0} g protein · ${((d.avgWaterMl ?? 0) / 1000).toFixed(1)} L · minimums ≥ ${d.targets.calories}/${d.targets.protein}/${(d.targets.waterMl / 1000).toFixed(1)}L`,
            ),
          ),
    ),
  );

  // Reading
  const rd = v.review.reading;
  grid.appendChild(
    card(
      "Reading",
      h(
        "div",
        { class: "stat-row tight" },
        stat("Finished (wk)", String(rd.finishedThisWeek)),
        stat("Reading now", String(rd.currentlyReading)),
        stat("Finished total", String(rd.finishedTotal)),
      ),
    ),
  );

  // Wins + problems
  grid.appendChild(card("What went well", themeCard(v.review.wins, "good")));
  grid.appendChild(card("Common problems", themeCard(v.review.problems, "bad")));

  // What I learned
  grid.appendChild(card("What I learned", learnedCard(v.review), { cls: "card-wide" }));

  root.appendChild(grid);
  return root;
};
