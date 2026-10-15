/* ---------------------------------- analytics.js ----------------------------------
 *
 * Small pure math helpers for trend lines, goal projection and nutrition
 * averages. No React, no storage — easy to reason about and test.
 * --------------------------------------------------------------------------------- */

export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (dateStr, delta) => {
  const dt = new Date(dateStr + "T00:00:00");
  dt.setDate(dt.getDate() + delta);
  return dt.toISOString().slice(0, 10);
};
export const daysBetween = (a, b) =>
  Math.round((new Date(a + "T00:00:00") - new Date(b + "T00:00:00")) / 86400000);

/**
 * Least-squares slope (kg/day) across weight entries within the last maxDays.
 * Entries may be in any order. Returns null when there aren't enough points.
 * Direction matters: a negative slope is a falling trend.
 */
export function weightSlope(entries, maxDays = 60) {
  const pts = (entries || [])
    .filter((e) => Number.isFinite(Number(e.weight)) && Number(e.weight) > 0)
    .filter((e) => daysBetween(today(), e.date) <= maxDays)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < 3) return null;

  const x0 = pts[0].date;
  const xs = pts.map((p) => daysBetween(p.date, x0));
  const ys = pts.map((p) => Number(p.weight));
  const n = pts.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
    sxx += xs[i] * xs[i];
    sxy += xs[i] * ys[i];
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slopePerDay = (n * sxy - sx * sy) / denom;
  return {
    slopePerDay, // kg/day
    ratePerWeek: slopePerDay * 7, // kg/week
    lastDate: pts[n - 1].date,
    lastWeight: Number(pts[n - 1].weight),
  };
}

/**
 * Trailing 7-day average per entry, aligned with the input entries.
 * Returns [{ date, avg }] (same order as input).
 */
export function rollingAverage(entries, windowDays = 7) {
  const sorted = (entries || [])
    .filter((e) => Number.isFinite(Number(e.weight)) && Number(e.weight) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return [];
  return sorted.map((e) => {
    const from = addDays(e.date, -(windowDays - 1));
    const window = sorted.filter((p) => p.date >= from && p.date <= e.date);
    const avg = window.length
      ? window.reduce((s, p) => s + Number(p.weight), 0) / window.length
      : null;
    return { date: e.date, avg: avg != null ? Math.round(avg * 10) / 10 : null };
  });
}

/**
 * Where is the current weight heading relative to the goal (in kg)?
 *  - "no-data": nothing logged
 *  - "maintaining": flat trend (or too few points) — no projection
 *  - "reached": within 0.05 kg of the goal
 *  - "away": the trend is pushing away from the goal
 *  - "on-track": projectedDate estimated (capped at 2 years)
 */
export function projectWeightGoal(entries, goalKg) {
  if (!Number.isFinite(Number(goalKg)) || Number(goalKg) <= 0) return { state: "no-data" };
  const sorted = (entries || [])
    .filter((e) => Number.isFinite(Number(e.weight)) && Number(e.weight) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return { state: "no-data" };

  const last = Number(sorted[sorted.length - 1].weight);
  const delta = goalKg - last;
  if (Math.abs(delta) < 0.05) return { state: "reached", ratePerWeek: 0 };

  const slope = weightSlope(sorted, 60);
  const EPS = 0.0008; // kg/day — anything slower counts as "maintaining"
  if (!slope || Math.abs(slope.slopePerDay) < EPS) {
    return { state: "maintaining", ratePerWeek: slope ? slope.ratePerWeek : 0 };
  }

  // Moving away from the goal = slope and required direction disagree.
  const requiredDirection = delta > 0 ? 1 : -1;
  if (Math.sign(slope.slopePerDay) !== requiredDirection) {
    return { state: "away", ratePerWeek: slope.ratePerWeek, delta };
  }

  const daysRaw = Math.round(delta / slope.slopePerDay);
  const days = Math.max(1, Math.min(daysRaw, 730));
  return {
    state: "on-track",
    ratePerWeek: slope.ratePerWeek,
    delta,
    days,
    projectedDate: addDays(today(), days),
  };
}

/**
 * Averages over the trailing N days, counting only days that actually have
 * logged meals (missing days aren't treated as zero-calorie days).
 */
export function weeklyNutritionAverages(meals, days = 7) {
  const cutoff = addDays(today(), -(days - 1));
  const byDate = {};
  for (const m of meals || []) {
    if (m.date < cutoff) continue;
    if (!byDate[m.date]) byDate[m.date] = { c: 0, p: 0, cb: 0, f: 0 };
    for (const it of m.items || []) {
      byDate[m.date].c += Number(it.calories) || 0;
      byDate[m.date].p += Number(it.protein) || 0;
      byDate[m.date].cb += Number(it.carbs) || 0;
      byDate[m.date].f += Number(it.fat) || 0;
    }
  }
  const dates = Object.keys(byDate);
  if (!dates.length) return { daysLogged: 0, calories: 0, protein: 0, carbs: 0, fat: 0 };
  const n = dates.length;
  let sum = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const d of dates) {
    sum.calories += byDate[d].c;
    sum.protein += byDate[d].p;
    sum.carbs += byDate[d].cb;
    sum.fat += byDate[d].f;
  }
  return {
    daysLogged: n,
    calories: sum.calories / n,
    protein: sum.protein / n,
    carbs: sum.carbs / n,
    fat: sum.fat / n,
  };
}