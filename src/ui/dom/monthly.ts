import type { MonthlyInsightsView } from "../model/monthlyInsights";
import type { MonthlyReview } from "../../logic/monthlyReview";
import { labelDay } from "../../logic/weeklyReview";
import { overallLabel } from "../../logic/scorecard";
import { formatDuration } from "../../logic/sleep";
import { h } from "./h";
import { card, bar, pageHead, emptyLine, stat } from "./ui";

const arrow = (cur: number | null, prev: number | null): string => {
  if (cur === null || prev === null) return "—";
  if (cur > prev) return "↑";
  if (cur < prev) return "↓";
  return "→";
};
const ratePct = (r: number | null): string => (r === null ? "—" : `${Math.round(r * 100)}%`);

const themeCard = (hits: MonthlyReview["problems"], tone: "good" | "bad") =>
  hits.length === 0
    ? emptyLine(tone === "bad" ? "No recurring problems flagged." : "No recurring wins flagged yet.")
    : h(
        "div",
        { class: "theme-list" },
        ...hits.slice(0, 6).map((t) =>
          h(
            "div",
            { class: `theme-row theme-${tone}` },
            h("span", { class: "theme-name" }, t.theme),
            h("span", { class: "theme-count mono" }, `${t.days} day${t.days === 1 ? "" : "s"}`),
          ),
        ),
      );

export const renderMonthly = (v: MonthlyInsightsView): HTMLElement => {
  const root = h("div", { class: "dash module" });
  root.appendChild(pageHead("Monthly review", "A historical report of the month — what moved, what slipped."));

  root.appendChild(
    h(
      "div",
      { class: "week-nav" },
      h("button", { class: "btn btn-ghost btn-sm", "data-action": "monthly-prev" }, "‹ Prev"),
      h("span", { class: "week-nav-label mono" }, v.label + (v.isCurrentMonth ? " · This month" : "")),
      v.canGoNext
        ? h("button", { class: "btn btn-ghost btn-sm", "data-action": "monthly-next" }, "Next ›")
        : h("button", { class: "btn btn-ghost btn-sm is-disabled", disabled: "true" }, "Next ›"),
      h("button", { class: "btn btn-ghost btn-sm", "data-action": "monthly-today" }, "This month"),
    ),
  );

  const grid = h("div", { class: "grid" });
  const r = v.review;

  if (!r.hasData) {
    grid.appendChild(card("Monthly review", emptyLine("Not enough data this month — keep using Life OS and your monthly report will appear here."), { cls: "card-wide" }));
    root.appendChild(grid);
    return root;
  }

  // Attention needed
  if (v.attention.length > 0) {
    grid.appendChild(
      card(
        "Attention needed",
        h("div", { class: "attention-list" }, ...v.attention.map((a) =>
          h("div", { class: `attention-row sev-${a.severity}` },
            h("span", { class: "attention-dot", "aria-hidden": "true" }, a.severity === "warn" ? "▲" : "•"),
            h("span", { class: "attention-msg" }, a.message)))),
        { count: String(v.attention.length), cls: "card-wide" },
      ),
    );
  }

  // Monthly scorecard
  {
    const sc = v.scorecard;
    grid.appendChild(
      card(
        "Monthly scorecard",
        h("div", {},
          h("div", { class: "scorecard-overall" },
            h("span", { class: "scorecard-big mono" }, sc.overall === null ? "—" : `${Math.round(sc.overall * 100)}%`),
            h("span", { class: "scorecard-verdict" }, overallLabel(sc.overall)),
            sc.strongest && sc.weakest ? h("span", { class: "scorecard-extremes" }, h("span", { class: "muted-inline" }, `Strongest: ${sc.strongest.label} · Weakest: ${sc.weakest.label}`)) : null,
          ),
          h("div", { class: "scorecard-areas" }, ...sc.areas.map((a) =>
            h("div", { class: "scorecard-row" },
              h("span", { class: "scorecard-area-label" }, a.label),
              h("span", { class: "scorecard-area-score mono" }, a.score === null ? "—" : `${Math.round(a.score * 100)}%`),
              h("span", { class: "scorecard-area-detail" }, `= ${a.detail}`)))),
        ),
        { cls: "card-wide" },
      ),
    );
  }

  // Month vs last month
  const c = v.comparison;
  const cmpRow = (label: string, cur: string, prev: string, a: string) =>
    h("div", { class: "compare-row" },
      h("span", { class: "compare-label" }, label),
      h("span", { class: "mono compare-cur" }, cur),
      h("span", { class: "mono compare-prev" }, prev),
      h("span", { class: `compare-arrow arrow-${a === "↑" ? "up" : a === "↓" ? "down" : "flat"}` }, a));
  grid.appendChild(
    card("This month vs last month",
      h("div", { class: "compare-table" },
        h("div", { class: "compare-row compare-head" },
          h("span", { class: "compare-label" }, ""), h("span", { class: "compare-cur" }, "This"),
          h("span", { class: "compare-prev" }, "Last"), h("span", { class: "compare-arrow" }, "")),
        cmpRow("Habit completion", ratePct(c.habitRate.cur), ratePct(c.habitRate.prev), arrow(c.habitRate.cur, c.habitRate.prev)),
        cmpRow("Tasks completed", String(c.tasksCompleted.cur), String(c.tasksCompleted.prev), arrow(c.tasksCompleted.cur, c.tasksCompleted.prev)),
        cmpRow("Workouts", String(c.workouts.cur), String(c.workouts.prev), arrow(c.workouts.cur, c.workouts.prev)),
        cmpRow("Avg sleep", c.avgSleep.cur === null ? "—" : formatDuration(c.avgSleep.cur), c.avgSleep.prev === null ? "—" : formatDuration(c.avgSleep.prev), arrow(c.avgSleep.cur, c.avgSleep.prev)),
        cmpRow("Avg rating", c.avgRating.cur === null ? "—" : c.avgRating.cur.toFixed(1), c.avgRating.prev === null ? "—" : c.avgRating.prev.toFixed(1), arrow(c.avgRating.cur, c.avgRating.prev)),
      ),
      { cls: "card-wide" }),
  );

  // Habit consistency (+ missed for weak ones)
  const habitRows = r.habits.length === 0
    ? emptyLine("No active habits this month.")
    : h("div", { class: "insight-table" }, ...r.habits.map((hb) =>
        h("div", { class: "insight-row" },
          h("span", { class: "insight-row-name" }, hb.name),
          h("span", { class: "mono insight-row-num" }, `${hb.completed}/${hb.expected}`),
          h("span", { class: "insight-row-bar" }, bar(hb.rate)),
          h("span", { class: "mono insight-row-rate" }, ratePct(hb.rate)))));
  grid.appendChild(card("Habit consistency", habitRows, { count: r.habitRate === null ? undefined : ratePct(r.habitRate), cls: "card-wide" }));

  // Bodyweight over the month
  const bh = v.bodyweight;
  grid.appendChild(
    card("Bodyweight",
      bh.latest === null
        ? emptyLine("No weight logged.")
        : h("div", { class: "stat-row tight" },
            stat("Latest", `${bh.latest} ${bh.unit}`),
            stat("Starting", bh.start === null ? "—" : `${bh.start} ${bh.unit}`),
            stat("Change", bh.totalChange === null ? "—" : `${bh.totalChange > 0 ? "+" : ""}${bh.totalChange.toFixed(1)}`),
            stat("Per week", bh.enough && bh.perWeek !== null ? `${bh.perWeek > 0 ? "+" : ""}${bh.perWeek.toFixed(2)}` : "—"))),
  );

  // Tasks
  const t = r.tasks;
  grid.appendChild(card("Tasks", h("div", { class: "stat-row tight" },
    stat("Completed", String(t.completed)), stat("Created", String(t.created)),
    stat("Pending", String(t.pending)), stat("Overdue", String(t.overdue)))));

  // Fitness / Sleep / Diet / Reading (month totals)
  grid.appendChild(card("Fitness", h("div", { class: "stat-row tight" },
    stat("Workouts", String(r.fitness.workoutsThisWeek)),
    stat("Volume", `${r.fitness.totalVolume}`),
    stat("Last", r.fitness.lastWorkoutDate === null ? "—" : labelDay(r.fitness.lastWorkoutDate)))));

  const s = r.sleep;
  grid.appendChild(card("Sleep", s.nights === 0 ? emptyLine("No sleep logged.") :
    h("div", { class: "stat-row tight" },
      stat("Avg", s.avgMinutes === null ? "—" : formatDuration(s.avgMinutes)),
      stat("≥ target", `${s.daysMetTarget}/${s.nights}`),
      stat("Best", s.bestMinutes === null ? "—" : formatDuration(s.bestMinutes)),
      stat("Worst", s.worstMinutes === null ? "—" : formatDuration(s.worstMinutes)))));

  const d = r.diet;
  grid.appendChild(card("Diet", d.daysLogged === 0 ? emptyLine("No meals or water logged.") :
    h("div", {},
      h("div", { class: "stat-row tight" },
        stat("Cals ≥ min", `${d.daysCalorieMin}/${d.daysLogged}`),
        stat("Protein ≥ min", `${d.daysProteinMin}/${d.daysLogged}`),
        stat("Water ≥ min", `${d.daysWaterMin}/${d.daysLogged}`)),
      h("p", { class: "muted", style: "margin-top:8px" },
        `Avg ${d.avgCalories ?? 0} kcal · ${d.avgProtein ?? 0} g protein · ${((d.avgWaterMl ?? 0) / 1000).toFixed(1)} L · minimums ≥ ${d.targets.calories}/${d.targets.protein}/${(d.targets.waterMl / 1000).toFixed(1)}L`))));

  grid.appendChild(card("Reading", h("div", { class: "stat-row tight" },
    stat("Finished (mo)", String(r.reading.finishedThisWeek)),
    stat("Reading now", String(r.reading.currentlyReading)),
    stat("Finished total", String(r.reading.finishedTotal)))));

  // Ratings summary
  grid.appendChild(card("Daily ratings",
    r.ratings.count === 0 ? emptyLine("No daily reviews rated this month.") :
    h("div", { class: "rating-avg" },
      h("span", { class: "mono" }, r.ratings.average === null ? "—" : `${r.ratings.average.toFixed(1)} / 5`),
      h("span", { class: "muted-inline" }, `avg over ${r.ratings.count} day${r.ratings.count === 1 ? "" : "s"} · ${r.reviewsWritten}/${r.daysInMonth} reviews written`))));

  // Wins + problems
  grid.appendChild(card("What went well", themeCard(r.wins, "good")));
  grid.appendChild(card("Common problems", themeCard(r.problems, "bad")));

  // What I learned (by day)
  grid.appendChild(
    card("What I learned",
      r.learned.length === 0 ? emptyLine("Nothing recorded in “What I learned” this month.") :
      h("div", { class: "learned-list" }, ...r.learned.map((l) =>
        h("div", { class: "learned-row" },
          h("span", { class: "learned-day" }, labelDay(l.date)),
          h("span", { class: "learned-text" }, l.text)))),
      { cls: "card-wide" }),
  );

  root.appendChild(grid);
  return root;
};
