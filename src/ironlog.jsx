import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar,
} from "recharts";
import {
  Scale, Ruler, Flame, Dumbbell, LayoutGrid, Plus, Trash2,
  TrendingUp, TrendingDown, Minus, X, Settings, Download, Check, Pencil, Calculator, Heart,
  Utensils, Activity, ChevronRight, CalendarDays, Layers,
} from "lucide-react";
import { loadKey, saveKey } from "./storage.js";
import ToolsTab, { TOOLS } from "./tools.jsx";
import { rollingAverage, weightSlope, projectWeightGoal, weeklyNutritionAverages } from "./analytics.js";
import {
  MUSCLE_GROUPS, UNCATEGORIZED, EQUIPMENT_OPTIONS,
  normalizeCatalog, blankProgram, computeDaysPerWeek,
  ExercisesTab, ProgramsTab, TodayTab, PillGrid,
} from "./training.jsx";

/* ---------------------------------- helpers ---------------------------------- */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
// Scrolls a form back into view when editing starts from a row buried below it —
// otherwise the form silently repopulates off-screen and looks like nothing happened.
function scrollToRef(ref) {
  requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
}
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (dateStr, delta) => {
  const dt = new Date(dateStr + "T00:00:00");
  dt.setDate(dt.getDate() + delta);
  return dt.toISOString().slice(0, 10);
};
const yesterday = () => addDays(today(), -1);
const fmtDate = (d) => {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
const fmtDateFull = (d) => {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};
const epley = (weight, reps) => (reps <= 1 ? weight : Math.round(weight * (1 + reps / 30) * 10) / 10);
const round1 = (n) => Math.round(n * 10) / 10;

const lbToKg = (v) => Math.round(v * 0.453592 * 10) / 10;
const kgToLb = (v) => Math.round((v / 0.453592) * 10) / 10;
const inToCm = (v) => Math.round(v * 2.54 * 10) / 10;
const cmToIn = (v) => Math.round((v / 2.54) * 10) / 10;

const RANGE_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
  { value: "all", label: "All time" },
];
function filterByRange(entries, range) {
  if (range === "all") return entries;
  const days = Number(range);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return entries.filter((e) => e.date >= cutoffStr);
}
function RangeFilter({ value, onChange, label = "Show" }) {
  return (
    <select className="il-select" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

const MEASURE_FIELDS = [
  { key: "neck", label: "Neck" },
  { key: "shoulders", label: "Shoulders" },
  { key: "chest", label: "Chest" },
  { key: "waist", label: "Waist" },
  { key: "hips", label: "Hips" },
  { key: "bicep", label: "Bicep" },
  { key: "forearm", label: "Forearm" },
  { key: "thigh", label: "Thigh" },
  { key: "calf", label: "Calf" },
];

const MEAL_PRESETS = ["Breakfast", "Lunch", "Dinner", "Snack"];
const DEFAULT_TARGETS = { calories: "", protein: "", carbs: "", fat: "" };

const KEYS = {
  weight: "weight-entries",
  measure: "measurement-entries",
  nutrition: "nutrition-meals",
  nutritionLegacy: "nutrition-entries",
  workout: "workout-entries",
  catalog: "exercise-catalog",
  programs: "training-programs",
  settings: "settings",
  sessions: "workout-sessions",
  activeSession: "active-workout-session",
  uiPrefs: "ui-prefs",
};

function normalizeSettings(s) {
  const src = s || {};
  return {
    weightUnit: src.weightUnit || "lb",
    measureUnit: src.measureUnit || "in",
    theme: src.theme || "auto",
    goalWeight: src.goalWeight ?? "",
    favoriteMeals: Array.isArray(src.favoriteMeals) ? src.favoriteMeals : [],
    ownedEquipment: Array.isArray(src.ownedEquipment) ? src.ownedEquipment : [],
    dailyTargets: { ...DEFAULT_TARGETS, ...(src.dailyTargets || {}) },
    profile: {
      sex: src.profile?.sex || "",
      height: src.profile?.height ?? "",
      birthDate: src.profile?.birthDate || "",
    },
  };
}

/* ---------------------------------- nutrition math ---------------------------------- */

function sumItems(items) {
  return items.reduce(
    (acc, it) => {
      acc.calories += Number(it.calories) || 0;
      acc.protein += Number(it.protein) || 0;
      acc.carbs += Number(it.carbs) || 0;
      acc.fat += Number(it.fat) || 0;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

// Rolls meals up into per-day totals, ascending by date — used for charts and averages.
function dayTotalsAsc(meals) {
  const map = {};
  for (const m of meals) {
    const t = sumItems(m.items);
    if (!map[m.date]) map[m.date] = { date: m.date, calories: 0, protein: 0, carbs: 0, fat: 0 };
    map[m.date].calories += t.calories;
    map[m.date].protein += t.protein;
    map[m.date].carbs += t.carbs;
    map[m.date].fat += t.fat;
  }
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

// Groups meals by date, descending — used for the history list.
function groupMealsDesc(meals) {
  const map = {};
  for (const m of meals) {
    if (!map[m.date]) map[m.date] = { date: m.date, meals: [] };
    map[m.date].meals.push(m);
  }
  return Object.values(map)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((g) => ({ ...g, totals: sumItems(g.meals.flatMap((m) => m.items)) }));
}

/* ---------------------------------- activity / streak ---------------------------------- */

// Counts how many distinct categories (weight, measurements, nutrition, training) were
// logged on each date — used for the consistency heatmap.
function activityMap(weightEntries, measureEntries, meals, workoutEntries) {
  const days = {};
  const mark = (date, cat) => {
    if (!days[date]) days[date] = new Set();
    days[date].add(cat);
  };
  weightEntries.forEach((e) => mark(e.date, "weight"));
  measureEntries.forEach((e) => mark(e.date, "measure"));
  meals.forEach((m) => mark(m.date, "nutrition"));
  workoutEntries.forEach((e) => mark(e.date, "workout"));
  const counts = {};
  for (const [date, set] of Object.entries(days)) counts[date] = set.size;
  return counts;
}

function computeStreak(counts) {
  let streak = 0;
  let cursor = today();
  if (!counts[cursor]) cursor = addDays(cursor, -1);
  while (counts[cursor]) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function Heatmap({ counts }) {
  const days = [];
  for (let i = 83; i >= 0; i--) {
    const d = addDays(today(), -i);
    days.push({ date: d, count: counts[d] || 0 });
  }
  return (
    <div className="il-heatmap">
      {days.map((d) => (
        <div
          key={d.date}
          className={`il-heatcell level-${Math.min(d.count, 4)}`}
          title={`${fmtDateFull(d.date)} · ${d.count ? d.count + " area" + (d.count === 1 ? "" : "s") + " logged" : "no activity"}`}
        />
      ))}
    </div>
  );
}

/* ---------------------------------- shell ---------------------------------- */

const NAV = [
  { id: "dashboard", label: "Overview", icon: LayoutGrid },
  { id: "weight", label: "Weight", icon: Scale },
  { id: "measurements", label: "Body", icon: Ruler },
  { id: "nutrition", label: "Nutrition", icon: Flame },
  { id: "today", label: "Today", icon: CalendarDays },
  { id: "programs", label: "Programs", icon: Layers },
  { id: "exercises", label: "Exercises", icon: Dumbbell },
  { id: "tools", label: "Tools", icon: Calculator },
];

export default function IronLog() {
  const [tab, setTab] = useState("dashboard");
  const [ready, setReady] = useState(false);
  const [weightEntries, setWeightEntries] = useState([]);
  const [measureEntries, setMeasureEntries] = useState([]);
  const [meals, setMeals] = useState([]);
  const [workoutEntries, setWorkoutEntries] = useState([]);
  const [exerciseCatalog, setExerciseCatalog] = useState([]); // normalized RepDeck-era catalog entries
  const [programs, setPrograms] = useState([]); // [{ id, name, description, lengthWeeks, isActive, days }]
  const [sessions, setSessions] = useState([]); // [{ id, date, name, queue? }]
  const [activeSession, setActiveSession] = useState(null);
  const [settings, setSettings] = useState(normalizeSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [toolRequest, setToolRequest] = useState(null);
  const toastTimer = useRef(null);

  // Small persisted UI preferences (which section view a tab was left on, whether
  // secondary charts are expanded) — kept separate from real log data.
  const [uiPrefs, setUiPrefs] = useState({});
  function updateUiPrefs(patch) {
    setUiPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveKey(KEYS.uiPrefs, next);
      return next;
    });
  }

  useEffect(() => {
    (async () => {
      const [w, m, mealData, wo, cat, progs, sess, activeSess, s, prefs] = await Promise.all([
        loadKey(KEYS.weight, []),
        loadKey(KEYS.measure, []),
        loadKey(KEYS.nutrition, null),
        loadKey(KEYS.workout, []),
        loadKey(KEYS.catalog, []),
        loadKey(KEYS.programs, []),
        loadKey(KEYS.sessions, []),
        loadKey(KEYS.activeSession, null),
        loadKey(KEYS.settings, {}),
        loadKey(KEYS.uiPrefs, {}),
      ]);
      setWeightEntries(w);
      setMeasureEntries(m);
      setWorkoutEntries(wo);
      // Normalizing merges in the built-in seed library and fills defaults for any
      // pre-revamp catalog entries — idempotent, so this is safe on every load.
      const normalizedCatalog = normalizeCatalog(cat);
      setExerciseCatalog(normalizedCatalog);
      saveKey(KEYS.catalog, normalizedCatalog);
      setPrograms(progs);
      setSessions(sess);
      setSettings(normalizeSettings(s));
      setUiPrefs(prefs || {});

      // A session left "active" from a previous day is stale — the record stays in
      // history, but it stops being the target for new ad-hoc logging.
      if (activeSess && activeSess.date !== today()) {
        saveKey(KEYS.activeSession, null);
      } else {
        setActiveSession(activeSess);
      }

      if (mealData) {
        setMeals(mealData);
      } else {
        // Migrate legacy one-entry-per-day nutrition logs into the new meal model.
        const legacy = await loadKey(KEYS.nutritionLegacy, []);
        const migrated = legacy.map((e) => ({
          id: e.id || uid(),
          date: e.date,
          name: "Logged",
          items: [{ id: uid(), name: "Logged total", amount: "", calories: e.calories, protein: e.protein, carbs: e.carbs, fat: e.fat }],
        }));
        setMeals(migrated);
        if (migrated.length) saveKey(KEYS.nutrition, migrated);
      }
      setReady(true);
    })();
  }, []);

  function fireToast(message) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  function requestConfirm(message, onConfirm) {
    setConfirmState({ message, onConfirm });
  }
  function closeConfirm() {
    setConfirmState(null);
  }

  // Opens the Tools tab at a specific calculator (used by quick links).
  function openTool(id) {
    setToolRequest(id);
    setTab("tools");
  }

  /* ---- weight ---- */
  function addWeight(entry) {
    const next = [...weightEntries, { id: uid(), ...entry }].sort((a, b) => a.date.localeCompare(b.date));
    setWeightEntries(next);
    saveKey(KEYS.weight, next);
  }
  function updateWeight(id, patch) {
    const next = weightEntries
      .map((e) => (e.id === id ? { ...e, ...patch } : e))
      .sort((a, b) => a.date.localeCompare(b.date));
    setWeightEntries(next);
    saveKey(KEYS.weight, next);
  }
  function deleteWeight(id) {
    const next = weightEntries.filter((e) => e.id !== id);
    setWeightEntries(next);
    saveKey(KEYS.weight, next);
  }

  /* ---- measurements ---- */
  function addMeasure(entry) {
    const next = [...measureEntries, { id: uid(), ...entry }].sort((a, b) => a.date.localeCompare(b.date));
    setMeasureEntries(next);
    saveKey(KEYS.measure, next);
  }
  function updateMeasure(id, patch) {
    const next = measureEntries
      .map((e) => (e.id === id ? { ...e, ...patch } : e))
      .sort((a, b) => a.date.localeCompare(b.date));
    setMeasureEntries(next);
    saveKey(KEYS.measure, next);
  }
  function deleteMeasure(id) {
    const next = measureEntries.filter((e) => e.id !== id);
    setMeasureEntries(next);
    saveKey(KEYS.measure, next);
  }

  /* ---- nutrition (meals) ---- */
  function addMeal(entry) {
    const next = [...meals, { id: uid(), ...entry }].sort((a, b) => a.date.localeCompare(b.date));
    setMeals(next);
    saveKey(KEYS.nutrition, next);
  }
  function updateMeal(id, patch) {
    const next = meals
      .map((e) => (e.id === id ? { ...e, ...patch } : e))
      .sort((a, b) => a.date.localeCompare(b.date));
    setMeals(next);
    saveKey(KEYS.nutrition, next);
  }
  function deleteMeal(id) {
    const next = meals.filter((e) => e.id !== id);
    setMeals(next);
    saveKey(KEYS.nutrition, next);
  }

  /* ---- workouts + exercise catalog ---- */
  function upsertCatalog(exerciseName, groupName) {
    const name = exerciseName.trim();
    const group = MUSCLE_GROUPS.includes(groupName) ? groupName : UNCATEGORIZED;
    if (!name) return;

    const idx = exerciseCatalog.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());
    const nextCatalog =
      idx === -1
        ? [...exerciseCatalog, { name, group }]
        : exerciseCatalog.map((c, i) => (i === idx ? { ...c, group } : c));
    setExerciseCatalog(nextCatalog);
    saveKey(KEYS.catalog, nextCatalog);
  }

  function addWorkout(entry) {
    const key = entry.exercise.trim();
    const priorRecord = computeRecords(workoutEntries).find(
      (r) => r.exercise.toLowerCase() === key.toLowerCase()
    );

    // Attach to whichever session covers this date: the active one if it matches,
    // otherwise the most recent existing session for that date, otherwise a fresh
    // ad-hoc session gets created automatically so nothing logs "session-less".
    let session = activeSession && activeSession.date === entry.date ? activeSession : null;
    if (!session) session = [...sessions].reverse().find((s) => s.date === entry.date) || null;
    let nextSessions = sessions;
    if (!session) {
      session = { id: uid(), date: entry.date, name: "Workout" };
      nextSessions = [...sessions, session];
      setSessions(nextSessions);
      saveKey(KEYS.sessions, nextSessions);
    }
    if (entry.date === today() && (!activeSession || activeSession.id !== session.id)) {
      setActiveSession(session);
      saveKey(KEYS.activeSession, session);
    }

    const next = [...workoutEntries, { id: uid(), ...entry, exercise: key, sessionId: session.id }].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    setWorkoutEntries(next);
    saveKey(KEYS.workout, next);
    upsertCatalog(key, entry.group || "");

    const newRecord = computeRecords(next).find((r) => r.exercise.toLowerCase() === key.toLowerCase());
    if (!priorRecord && newRecord) {
      fireToast(`First entry logged for ${key}`);
    } else if (
      priorRecord &&
      newRecord &&
      (newRecord.weight > priorRecord.weight ||
        (newRecord.weight === priorRecord.weight && newRecord.reps > priorRecord.reps))
    ) {
      fireToast(`New PR — ${key}: ${newRecord.weight} ${settings.weightUnit} × ${newRecord.reps}`);
    }
  }
  function updateWorkout(id, patch) {
    const next = workoutEntries
      .map((e) => (e.id === id ? { ...e, ...patch } : e))
      .sort((a, b) => a.date.localeCompare(b.date));
    setWorkoutEntries(next);
    saveKey(KEYS.workout, next);
    if (patch.exercise) upsertCatalog(patch.exercise, patch.group || "");
  }
  function deleteWorkout(id) {
    const next = workoutEntries.filter((e) => e.id !== id);
    setWorkoutEntries(next);
    saveKey(KEYS.workout, next);
  }

  /* ---- workout sessions ---- */
  function startSession(name, queue) {
    const session = { id: uid(), date: today(), name, queue: queue || null };
    const next = [...sessions, session];
    setSessions(next);
    saveKey(KEYS.sessions, next);
    setActiveSession(session);
    saveKey(KEYS.activeSession, session);
    return session;
  }
  function updateSession(id, patch) {
    const next = sessions.map((s) => (s.id === id ? { ...s, ...patch } : s));
    setSessions(next);
    saveKey(KEYS.sessions, next);
    if (activeSession && activeSession.id === id) {
      const updated = next.find((s) => s.id === id);
      setActiveSession(updated);
      saveKey(KEYS.activeSession, updated);
    }
  }
  function endActiveSession() {
    setActiveSession(null);
    saveKey(KEYS.activeSession, null);
  }

  /* ---- exercise catalog (custom exercises) ---- */
  function addCustomExercise(exerciseEntry) {
    const next = [...exerciseCatalog, exerciseEntry];
    setExerciseCatalog(next);
    saveKey(KEYS.catalog, next);
  }

  /* ---- programs ---- */
  function createProgram() {
    const p = blankProgram();
    const next = [...programs, p];
    setPrograms(next);
    saveKey(KEYS.programs, next);
    return p;
  }
  function updateProgram(id, patch) {
    const next = programs.map((p) => (p.id === id ? { ...p, ...patch } : p));
    setPrograms(next);
    saveKey(KEYS.programs, next);
  }
  function deleteProgram(id) {
    const next = programs.filter((p) => p.id !== id);
    setPrograms(next);
    saveKey(KEYS.programs, next);
  }
  function setActiveProgram(id) {
    const next = programs.map((p) => ({ ...p, isActive: p.id === id }));
    setPrograms(next);
    saveKey(KEYS.programs, next);
  }

  /* ---- Today tab: per-set logging against the active program ---- */
  function logExerciseSets(date, exerciseName, group, sets) {
    const existing = workoutEntries.find(
      (e) => e.date === date && e.exercise.toLowerCase() === exerciseName.toLowerCase()
    );
    if (sets.length === 0) {
      if (existing) deleteWorkout(existing.id);
      return;
    }
    if (existing) updateWorkout(existing.id, { sets, group });
    else addWorkout({ date, exercise: exerciseName, group, sets });
  }
  function setExerciseNote(date, exerciseName, group, note) {
    const existing = workoutEntries.find(
      (e) => e.date === date && e.exercise.toLowerCase() === exerciseName.toLowerCase()
    );
    if (existing) updateWorkout(existing.id, { note });
    else if (note.trim()) addWorkout({ date, exercise: exerciseName, group, sets: [], note });
  }

  /* ---- settings (with unit conversion) ---- */
  function updateSettings(patch) {
    let nextProfileHeight = null;
    let nextGoalWeight = null;
    if (patch.weightUnit && patch.weightUnit !== settings.weightUnit) {
      const conv = patch.weightUnit === "kg" ? lbToKg : kgToLb;
      const gw = settings.goalWeight;
      if (gw != null && gw !== "") nextGoalWeight = String(round1(conv(Number(gw))));
      const nextWeight = weightEntries.map((e) => ({ ...e, weight: conv(e.weight) }));
      const nextWorkout = workoutEntries.map((e) => ({
        ...e,
        sets: e.sets.map((s) => ({ ...s, weight: conv(s.weight) })),
      }));
      setWeightEntries(nextWeight);
      saveKey(KEYS.weight, nextWeight);
      setWorkoutEntries(nextWorkout);
      saveKey(KEYS.workout, nextWorkout);
    }
    if (patch.measureUnit && patch.measureUnit !== settings.measureUnit) {
      const conv = patch.measureUnit === "cm" ? inToCm : cmToIn;
      const nextMeasure = measureEntries.map((e) => {
        const copy = { ...e };
        for (const f of MEASURE_FIELDS) {
          if (copy[f.key] !== undefined) copy[f.key] = conv(copy[f.key]);
        }
        return copy;
      });
      setMeasureEntries(nextMeasure);
      saveKey(KEYS.measure, nextMeasure);

      // Profile height is stored in the measurement unit — keep it consistent.
      const h = settings.profile.height;
      if (h != null && h !== "") {
        nextProfileHeight = String(round1(conv(Number(h))));
      }
    }
    const next = {
      ...settings,
      ...patch,
      dailyTargets: { ...settings.dailyTargets, ...(patch.dailyTargets || {}) },
      profile: {
        ...settings.profile,
        ...(nextProfileHeight != null ? { height: nextProfileHeight } : {}),
        ...(patch.profile || {}),
      },
      ...(nextGoalWeight != null ? { goalWeight: nextGoalWeight } : {}),
    };
    setSettings(next);
    saveKey(KEYS.settings, next);
  }

  function exportData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      settings,
      weightEntries,
      measureEntries,
      meals,
      workoutEntries,
      exerciseCatalog,
      programs,
      sessions,
      muscleGroups: MUSCLE_GROUPS,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `iron-log-export-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Keep the browser chrome (theme-color meta) in sync with the active theme.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const dark = settings.theme === "dark" || (settings.theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (meta) meta.setAttribute("content", dark ? "#1D1B23" : "#3F5C4A");
    if (settings.theme !== "auto") return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (meta) meta.setAttribute("content", mq.matches ? "#1D1B23" : "#3F5C4A");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [settings.theme]);

  const records = useMemo(() => computeRecords(workoutEntries), [workoutEntries]);

  const themeClass = settings.theme === "dark" ? " il-dark" : settings.theme === "light" ? " il-light" : "";

  if (!ready) {
    return (
      <div className={`il-root il-loading${themeClass}`}>
        <Style />
        <span>Loading your log…</span>
      </div>
    );
  }

  const activeLabel = NAV.find((n) => n.id === tab)?.label ?? "";

  return (
    <div className={`il-root${themeClass}`}>
      <Style />
      <div className="il-grain" aria-hidden="true" />

      <header className="il-topbar">
        <div className="il-topbar-inner">
          <span className="il-wordmark">{activeLabel}</span>
          <button className="il-icon-btn" aria-label="Settings" onClick={() => setShowSettings(true)}>
            <Settings size={19} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <main className="il-main" aria-label={activeLabel}>
        {tab === "dashboard" && (
          <Dashboard
            weightEntries={weightEntries}
            measureEntries={measureEntries}
            meals={meals}
            workoutEntries={workoutEntries}
            records={records}
            settings={settings}
            goTo={setTab}
            onOpenTool={openTool}
          />
        )}
        {tab === "weight" && (
          <WeightTab
            entries={weightEntries}
            onAdd={addWeight}
            onUpdate={updateWeight}
            onDelete={(id) => requestConfirm("Delete this weight entry?", () => deleteWeight(id))}
            unit={settings.weightUnit}
            onOpenTool={openTool}
          />
        )}
        {tab === "measurements" && (
          <MeasureTab
            entries={measureEntries}
            onAdd={addMeasure}
            onUpdate={updateMeasure}
            onDelete={(id) => requestConfirm("Delete this measurement entry?", () => deleteMeasure(id))}
            unit={settings.measureUnit}
            onOpenTool={openTool}
          />
        )}
        {tab === "nutrition" && (
          <NutritionTab
            meals={meals}
            onAdd={addMeal}
            onUpdate={updateMeal}
            onDelete={(id) => requestConfirm("Delete this meal?", () => deleteMeal(id))}
            targets={settings.dailyTargets}
            view={uiPrefs.nutritionView || "log"}
            onViewChange={(v) => updateUiPrefs({ nutritionView: v })}
            onOpenTool={openTool}
            settings={settings}
            onUpdateSettings={updateSettings}
          />
        )}
        {tab === "today" && (
          <TodayTab
            programs={programs}
            catalog={exerciseCatalog}
            ownedEquipment={settings.ownedEquipment}
            workoutEntries={workoutEntries}
            records={records}
            unit={settings.weightUnit}
            onLogSets={logExerciseSets}
            onSetNote={setExerciseNote}
            view={uiPrefs.todayView || "today"}
            onViewChange={(v) => updateUiPrefs({ todayView: v })}
          />
        )}
        {tab === "programs" && (
          <ProgramsTab
            programs={programs}
            catalog={exerciseCatalog}
            ownedEquipment={settings.ownedEquipment}
            onCreate={createProgram}
            onUpdate={updateProgram}
            onDelete={(id) => requestConfirm("Delete this program?", () => deleteProgram(id))}
            onSetActive={setActiveProgram}
          />
        )}
        {tab === "exercises" && (
          <ExercisesTab
            catalog={exerciseCatalog}
            ownedEquipment={settings.ownedEquipment}
            onAddCustom={addCustomExercise}
            workoutEntries={workoutEntries}
            unit={settings.weightUnit}
          />
        )}
        {tab === "tools" && (
          <ToolsTab
            settings={settings}
            weightEntries={weightEntries}
            measureEntries={measureEntries}
            onAddWeight={addWeight}
            onUpdateWeight={updateWeight}
            onUpdateSettings={updateSettings}
            onToast={fireToast}
            requested={toolRequest}
            onRequestHandled={() => setToolRequest(null)}
          />
        )}
      </main>

      <nav className="il-bottomnav" aria-label="Sections">
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = tab === n.id;
          return (
            <button
              key={n.id}
              className={`il-navbtn ${active ? "active" : ""}`}
              onClick={() => setTab(n.id)}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={21} strokeWidth={active ? 2.1 : 1.75} />
              <span>{n.label}</span>
            </button>
          );
        })}
      </nav>

      {toast && (
        <div className="il-toast">
          <Check size={15} strokeWidth={2.25} />
          <span>{toast}</span>
        </div>
      )}

      {showSettings && (
        <SettingsModal settings={settings} onChange={updateSettings} onExport={exportData} onClose={() => setShowSettings(false)} />
      )}

      {confirmState && (
        <ConfirmModal
          message={confirmState.message}
          onCancel={closeConfirm}
          onConfirm={() => {
            confirmState.onConfirm();
            closeConfirm();
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------- records / volume ---------------------------------- */

function computeRecords(workoutEntries) {
  const map = {};
  for (const entry of workoutEntries) {
    const key = entry.exercise.trim();
    if (!key) continue;
    for (const s of entry.sets) {
      if (s.warmup) continue;
      if (!s.weight || !s.reps) continue;
      const est = epley(s.weight, s.reps);
      const cur = map[key];
      if (!cur || s.weight > cur.weight || (s.weight === cur.weight && s.reps > cur.reps)) {
        map[key] = { exercise: key, weight: s.weight, reps: s.reps, date: entry.date, est1rm: est };
      }
      if (cur && est > (cur.est1rm || 0) && s.weight <= cur.weight) {
        map[key].est1rm = est;
      }
    }
  }
  return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
}

/* ---------------------------------- sessions ---------------------------------- */

// Human "time ago" phrasing for the last-time reference card (Weight/Measurements tabs).
function daysAgoLabel(dateStr) {
  const diff = Math.round((new Date(today() + "T00:00:00") - new Date(dateStr + "T00:00:00")) / 86400000);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 14) return `${diff} days ago`;
  return fmtDateFull(dateStr);
}

/* ---------------------------------- goal card ---------------------------------- */

function GoalCard({ entries, goalWeight, unit }) {
  const goalNum = Number(goalWeight);
  if (goalWeight === "" || goalWeight == null || !Number.isFinite(goalNum) || goalNum <= 0) return null;
  const sorted = (entries || [])
    .filter((e) => Number.isFinite(Number(e.weight)) && Number(e.weight) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return null;

  const curr = Number(sorted[sorted.length - 1].weight);
  const toKg = unit === "kg" ? (v) => v : (v) => lbToKg(v);
  const fromKg = unit === "kg" ? (v) => v : (v) => kgToLb(v);
  const proj = projectWeightGoal(sorted, toKg(goalNum));

  // Scale the progress track from the recent 90-day range.
  const cutoff = addDays(today(), -90);
  const recent = sorted.filter((e) => e.date >= cutoff).map((e) => Number(e.weight));
  const pool = recent.length ? recent : sorted.map((e) => Number(e.weight));
  const lo = Math.min(...pool, curr, goalNum);
  const hi = Math.max(...pool, curr, goalNum);
  const span = hi - lo || 1;
  const herePct = ((curr - lo) / span) * 100;
  const goalPct = ((goalNum - lo) / span) * 100;
  const delta = round1(Math.abs(curr - goalNum));

  const rateLabel =
    proj.ratePerWeek != null
      ? `${proj.ratePerWeek > 0 ? "+" : ""}${round1(fromKg(proj.ratePerWeek))} ${unit}/wk`
      : null;

  return (
    <div className="il-goalcard">
      <div className="il-goalhead">
        <span className="il-goallabel">Goal weight</span>
        <span className="il-goaldelta">{delta === 0 ? "Goal reached" : `${delta} ${unit} to go`}</span>
      </div>
      <div className="il-goalvalues">
        <span className="il-goalnum">{curr}</span>
        <span className="il-goalarrow">→</span>
        <span className="il-goalnum goal">{goalNum}</span>
        {rateLabel && <span className="il-goalrate">{rateLabel}</span>}
      </div>
      <div className="il-goaltrack">
        <div className="il-goal-here" style={{ left: `${herePct}%` }} />
        <div className="il-goal-target" style={{ left: `${Math.max(0, Math.min(100, goalPct))}%` }} />
      </div>
      <div className="il-goalproj">
        {proj.state === "on-track" && proj.projectedDate
          ? <>≈ {fmtDateFull(proj.projectedDate)} at this pace</>
          : proj.state === "reached"
          ? "Goal reached — nice work."
          : proj.state === "away"
          ? "Trend is moving away from your goal — review your plan."
          : proj.state === "maintaining"
          ? "Weight is steady — log a few more weigh-ins for a projection."
          : "Log a few more weigh-ins to get a projection."}
      </div>
    </div>
  );
}

/* ---------------------------------- dashboard ---------------------------------- */

function Dashboard({ weightEntries, measureEntries, meals, workoutEntries, records, settings, goTo, onOpenTool }) {
  const lastWeight = weightEntries[weightEntries.length - 1];
  const prevWeight = weightEntries[weightEntries.length - 2];
  const delta = lastWeight && prevWeight ? round1(lastWeight.weight - prevWeight.weight) : null;
  const lastBodyFat = [...weightEntries].reverse().find((e) => e.bodyFat !== undefined && e.bodyFat !== "");

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dayTotals = dayTotalsAsc(meals);
  const recentDays = dayTotals.filter((d) => new Date(d.date) >= sevenDaysAgo);
  const avgCals = recentDays.length ? Math.round(recentDays.reduce((s, d) => s + d.calories, 0) / recentDays.length) : null;

  const recentWorkouts = workoutEntries.filter((e) => new Date(e.date) >= sevenDaysAgo).length;

  const chartData = weightEntries.slice(-30).map((e) => ({ date: fmtDate(e.date), weight: e.weight }));

  const activityCounts = useMemo(
    () => activityMap(weightEntries, measureEntries, meals, workoutEntries),
    [weightEntries, measureEntries, meals, workoutEntries]
  );
  const streak = useMemo(() => computeStreak(activityCounts), [activityCounts]);

  const hasAnyData = weightEntries.length || measureEntries.length || meals.length || workoutEntries.length;

  // "Today" checklist: what's left to log, so the dashboard is a to-do list first
  // and a highlights reel second.
  const weightDoneToday = weightEntries.some((e) => e.date === today());
  const mealsDoneToday = meals.some((m) => m.date === today());
  const workoutDoneToday = workoutEntries.some((e) => e.date === today());
  const todayChecks = [
    { id: "weight", tab: "weight", title: "Weight", sub: weightDoneToday ? "Logged for today" : "Not logged yet", done: weightDoneToday },
    { id: "nutrition", tab: "nutrition", title: "Meals", sub: mealsDoneToday ? "Logged for today" : "Not logged yet", done: mealsDoneToday },
    { id: "workouts", tab: "today", title: "Training", sub: workoutDoneToday ? "Logged for today" : "Not logged yet", done: workoutDoneToday },
  ];
  const todayDoneCount = todayChecks.filter((c) => c.done).length;

  if (!hasAnyData) {
    return (
      <div className="il-page">
        <div className="il-welcome">
          <h1>Welcome to Iron Log</h1>
          <p>Track your weight, measurements, nutrition and training in one quiet, simple place.</p>
          <div className="il-welcome-actions">
            <button className="il-btn" onClick={() => goTo("weight")}>Log your weight</button>
            <button className="il-btn ghost" onClick={() => goTo("today")}>Log a workout</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="il-page">
      <div className="il-hero">
        <div className="il-hero-top">
          <div>
            <div className="il-hero-label">Current weight</div>
            <div className="il-hero-value">
              {lastWeight ? lastWeight.weight : "—"}
              <span className="il-hero-unit">{settings.weightUnit}</span>
            </div>
            {lastBodyFat && <div className="il-hero-subvalue">{lastBodyFat.bodyFat}% body fat</div>}
          </div>
          {delta !== null && (
            <div className={`il-hero-delta ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>
              {delta > 0 ? <TrendingUp size={14} /> : delta < 0 ? <TrendingDown size={14} /> : <Minus size={14} />}
              {Math.abs(delta)} {settings.weightUnit}
            </div>
          )}
        </div>
        {chartData.length > 1 ? (
          <div className="il-hero-chart">
            <ResponsiveContainer width="100%" height={80}>
              <LineChart data={chartData}>
                <Line type="monotone" dataKey="weight" stroke="var(--accent)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <button className="il-hero-cta" onClick={() => goTo("weight")}>Log today's weight</button>
        )}
      </div>

      <GoalCard entries={weightEntries} goalWeight={settings.goalWeight} unit={settings.weightUnit} />

      <div className="il-section" style={{ marginTop: 22 }}>
        <div className="il-section-head" style={{ marginTop: 0 }}>
          <h2>Today</h2>
          {todayDoneCount === 3 && <span className="il-streak">All logged</span>}
        </div>
        <div className="il-checklist">
          {todayChecks.map((c) => (
            <button key={c.id} className={`il-checkitem ${c.done ? "done" : ""}`} onClick={() => goTo(c.tab)}>
              <span className="il-checkmark">{c.done && <Check size={14} strokeWidth={3} />}</span>
              <span className="il-checktext">
                <span className="il-checktitle">{c.title}</span>
                <span className="il-checksub">{c.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="il-statrow">
        <button className="il-stat" onClick={() => goTo("nutrition")}>
          <div className="il-stat-value">{avgCals ?? "—"}</div>
          <div className="il-stat-label">{avgCals === null ? "No meals logged" : "Avg cal / day"}</div>
        </button>
        <button className="il-stat" onClick={() => goTo("today")}>
          <div className="il-stat-value">{recentWorkouts}</div>
          <div className="il-stat-label">Sessions, 7d</div>
        </button>
        <button className="il-stat" onClick={() => goTo("today")}>
          <div className="il-stat-value">{records.length}</div>
          <div className="il-stat-label">Tracked lifts</div>
        </button>
      </div>

      <div className="il-section">
        <div className="il-section-head" style={{ marginTop: 0 }}>
          <h2>Calculators</h2>
        </div>
        <div className="il-toolchips">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} className="il-toolchip" onClick={() => onOpenTool(t.id)}>
                {Icon && <Icon size={13} />} {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="il-section">
        <div className="il-section-head">
          <h2>Consistency</h2>
          <span className="il-streak">{streak > 0 ? `${streak} day streak` : "No active streak"}</span>
        </div>
        <Heatmap counts={activityCounts} />
      </div>

      <div className="il-section">
        <div className="il-section-head">
          <h2>Recent records</h2>
        </div>
        {records.length === 0 ? (
          <EmptyState text="No lifts logged yet." action="Log a lift" onAction={() => goTo("today")} />
        ) : (
          <div className="il-list">
            {records.slice(0, 5).map((r) => (
              <div className="il-row" key={r.exercise}>
                <div className="il-row-main">{r.exercise}</div>
                <div className="il-row-meta">{r.weight} {settings.weightUnit} × {r.reps}</div>
                <div className="il-row-date">{fmtDate(r.date)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- weight tab ---------------------------------- */

function WeightTab({ entries, onAdd, onUpdate, onDelete, unit, onOpenTool }) {
  const [date, setDate] = useState(today());
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [rangeFilter, setRangeFilter] = useState("90");
  const formRef = useRef(null);

  const trendMap = useMemo(() => {
    const m = {};
    for (const r of rollingAverage(entries, 7)) if (r.avg != null) m[r.date] = r.avg;
    return m;
  }, [entries]);
  const slope = useMemo(() => weightSlope(entries), [entries]);
  const rate = slope && slope.ratePerWeek != null ? round1(unit === "kg" ? slope.ratePerWeek : kgToLb(slope.ratePerWeek)) : null;

  const chartData = entries.map((e) => ({
    date: fmtDate(e.date),
    weight: e.weight,
    bodyFat: e.bodyFat,
    avg: trendMap[e.date],
  }));
  const hasBodyFat = entries.some((e) => e.bodyFat !== undefined && e.bodyFat !== "");
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const filtered = filterByRange(sorted, rangeFilter);

  // Most recent past entry, shown as a quick reference so you can see what "normal"
  // looked like last time before typing today's number.
  const lastEntry = !editingId ? sorted[0] : null;
  function useLastWeight() {
    if (!lastEntry) return;
    setWeight(String(lastEntry.weight));
    setBodyFat(lastEntry.bodyFat !== undefined ? String(lastEntry.bodyFat) : "");
  }

  function submit(e) {
    e.preventDefault();
    if (!weight) return;
    const patch = { date, weight: Number(weight) };
    if (bodyFat !== "") patch.bodyFat = Number(bodyFat);
    else if (editingId) patch.bodyFat = undefined;
    if (editingId) {
      onUpdate(editingId, patch);
      setEditingId(null);
    } else {
      onAdd(patch);
    }
    setDate(today());
    setWeight("");
    setBodyFat("");
  }

  function startEdit(entry) {
    setEditingId(entry.id);
    setDate(entry.date);
    setWeight(String(entry.weight));
    setBodyFat(entry.bodyFat !== undefined ? String(entry.bodyFat) : "");
    scrollToRef(formRef);
  }
  function cancelEdit() {
    setEditingId(null);
    setDate(today());
    setWeight("");
    setBodyFat("");
  }

  return (
    <div className="il-page">
      <PageHead title="Weight" sub="Log your body weight and watch the trend." />

      <div className="il-toolstrip">
        <span className="il-toolstrip-label">Quick calculators</span>
        <div className="il-toolstrip-links">
          <button type="button" className="il-toolchip" onClick={() => onOpenTool("bmi")}>BMI</button>
          <button type="button" className="il-toolchip" onClick={() => onOpenTool("bodyfat")}>Body fat</button>
          <button type="button" className="il-toolchip" onClick={() => onOpenTool("ideal")}>Ideal weight</button>
        </div>
      </div>

      {lastEntry && (
        <div className="il-lasttime" style={{ marginBottom: 16 }}>
          <div className="il-lasttime-head">
            <span>Last time · {daysAgoLabel(lastEntry.date)}</span>
          </div>
          <div className="il-tags">
            <span className="il-tag">{lastEntry.weight} {unit}</span>
            {lastEntry.bodyFat !== undefined && <span className="il-tag">{lastEntry.bodyFat}% body fat</span>}
          </div>
          <button type="button" className="il-textbtn" onClick={useLastWeight}>Use this weight</button>
        </div>
      )}

      <form className="il-form wrap" ref={formRef} onSubmit={submit}>
        <div className="il-field">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={today()} />
        </div>
        <div className="il-field grow">
          <label>Weight ({unit})</label>
          <input type="number" step="0.1" min="0" inputMode="decimal" placeholder="0.0" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
        <div className="il-field">
          <label>Body fat % (optional)</label>
          <input type="number" step="0.1" min="0" max="100" inputMode="decimal" placeholder="—" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} />
        </div>
        <div className="il-formactions full">
          <button className="il-btn full" type="submit">{editingId ? "Save" : "Log weight"}</button>
          {editingId && <button type="button" className="il-btn ghost" onClick={cancelEdit}>Cancel</button>}
        </div>
      </form>

      {chartData.length > 1 && (
        <div className="il-chartcard">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} domain={["dataMin - 2", "dataMax + 2"]} />
              {hasBodyFat && (
                <YAxis yAxisId="right" orientation="right" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, "dataMax + 5"]} />
              )}
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "var(--text)" }} />
              <Line yAxisId="left" type="monotone" dataKey="weight" stroke="var(--accent)" strokeWidth={2} dot={{ r: 2.5, fill: "var(--accent)" }} />
              <Line yAxisId="left" type="monotone" dataKey="avg" stroke="var(--accent-soft)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />
              {hasBodyFat && (
                <Line yAxisId="right" type="monotone" dataKey="bodyFat" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2, fill: "var(--text-muted)" }} connectNulls />
              )}
            </LineChart>
          </ResponsiveContainer>
          <div className="il-legend">
            <span><i style={{ background: "var(--accent)" }} /> Weight</span>
            <span><i style={{ background: "var(--accent-soft)" }} /> 7-day trend</span>
            {hasBodyFat && <span><i style={{ background: "var(--text-muted)" }} /> Body fat %</span>}
          </div>
          {rate !== null && (
            <div className="il-trendpacked">
              <span className={`il-trendchip ${rate > 0 ? "up" : rate < 0 ? "down" : ""}`}>
                {rate > 0 ? <TrendingUp size={12} /> : rate < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
                {Math.abs(rate)} {unit}/wk trend
              </span>
            </div>
          )}
        </div>
      )}

      <div className="il-section-head">
        <h2>History</h2>
        <RangeFilter value={rangeFilter} onChange={setRangeFilter} label="Filter weight history by date range" />
      </div>
      <EntryList
        empty={sorted.length === 0 ? "No weight entries yet." : "No entries in this range."}
        rows={filtered.map((e) => ({
          id: e.id,
          left: fmtDateFull(e.date),
          sub: e.bodyFat !== undefined ? `${e.bodyFat}% body fat` : undefined,
          right: `${e.weight} ${unit}`,
          raw: e,
        }))}
        onDelete={onDelete}
        onEdit={(row) => startEdit(row.raw)}
      />
    </div>
  );
}

/* ---------------------------------- measurements tab ---------------------------------- */

function MeasureTab({ entries, onAdd, onUpdate, onDelete, unit, onOpenTool }) {
  const [date, setDate] = useState(today());
  const [values, setValues] = useState({});
  const [metric, setMetric] = useState(MEASURE_FIELDS[0].key);
  const [editingId, setEditingId] = useState(null);
  const [rangeFilter, setRangeFilter] = useState("90");
  const [expanded, setExpanded] = useState(false);
  const formRef = useRef(null);

  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const filtered = filterByRange(sorted, rangeFilter);
  const chartData = entries
    .filter((e) => e[metric] !== undefined && e[metric] !== "")
    .map((e) => ({ date: fmtDate(e.date), value: Number(e[metric]) }));

  const primaryFields = MEASURE_FIELDS.slice(0, 3);
  const restFields = MEASURE_FIELDS.slice(3);
  const visibleFields = expanded ? MEASURE_FIELDS : primaryFields;

  const lastEntry = sorted[0];
  // Measurements barely move day to day, so a blank form is mostly wasted typing.
  // Prefill from the most recent entry once — after that, leave the person's edits
  // (including a manual Clear) alone until they submit, cancel, or the source entry changes.
  const prefilledFromRef = useRef(null);
  useEffect(() => {
    if (editingId || !lastEntry) return;
    if (prefilledFromRef.current === lastEntry.id) return;
    const v = {};
    let hasExtra = false;
    for (const f of MEASURE_FIELDS) {
      if (lastEntry[f.key] !== undefined) {
        v[f.key] = String(lastEntry[f.key]);
        if (restFields.some((rf) => rf.key === f.key)) hasExtra = true;
      }
    }
    setValues(v);
    if (hasExtra) setExpanded(true);
    prefilledFromRef.current = lastEntry.id;
  }, [editingId, lastEntry]); // eslint-disable-line react-hooks/exhaustive-deps

  function clearPrefill() {
    setValues({});
    setExpanded(false);
  }

  function submit(e) {
    e.preventDefault();
    const patch = { date };
    let any = false;
    for (const f of MEASURE_FIELDS) {
      if (values[f.key]) {
        patch[f.key] = Number(values[f.key]);
        any = true;
      } else if (editingId) {
        patch[f.key] = undefined;
      }
    }
    if (!any) return;
    if (editingId) {
      onUpdate(editingId, patch);
      setEditingId(null);
    } else {
      onAdd(patch);
    }
    setDate(today());
    setValues({});
    prefilledFromRef.current = null;
  }

  function startEdit(entry) {
    setEditingId(entry.id);
    setDate(entry.date);
    const v = {};
    for (const f of MEASURE_FIELDS) {
      if (entry[f.key] !== undefined) v[f.key] = String(entry[f.key]);
    }
    setValues(v);
    setExpanded(true);
    scrollToRef(formRef);
  }
  function cancelEdit() {
    setEditingId(null);
    setDate(today());
    setValues({});
    setExpanded(false);
    prefilledFromRef.current = null;
  }

  return (
    <div className="il-page">
      <PageHead title="Body measurements" sub={`Track measurements in ${unit}.`} />

      <div className="il-toolstrip">
        <span className="il-toolstrip-label">Quick calculators</span>
        <div className="il-toolstrip-links">
          <button type="button" className="il-toolchip" onClick={() => onOpenTool("bodyfat")}>Body fat</button>
          <button type="button" className="il-toolchip" onClick={() => onOpenTool("bmi")}>BMI</button>
        </div>
      </div>

      {!editingId && lastEntry && Object.keys(values).length > 0 && (
        <div className="il-prefillnote">
          <span>Filled in from {daysAgoLabel(lastEntry.date)} — adjust anything that's changed.</span>
          <button type="button" className="il-textbtn" onClick={clearPrefill}>Clear</button>
        </div>
      )}

      <form className="il-form wrap" ref={formRef} onSubmit={submit}>
        <div className="il-field">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={today()} />
        </div>
        {visibleFields.map((f) => (
          <div className="il-field" key={f.key}>
            <label>{f.label}</label>
            <input
              type="number" step="0.1" min="0" inputMode="decimal" placeholder={unit}
              value={values[f.key] || ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </div>
        ))}
        {!expanded && restFields.length > 0 && (
          <button type="button" className="il-textbtn" onClick={() => setExpanded(true)}>
            + {restFields.length} more measurements
          </button>
        )}
        <div className="il-formactions full">
          <button className="il-btn full" type="submit">{editingId ? "Save" : "Save measurements"}</button>
          {editingId && <button type="button" className="il-btn ghost" onClick={cancelEdit}>Cancel</button>}
        </div>
      </form>

      <div className="il-section-head">
        <h2>Trend</h2>
        <select className="il-select" aria-label="Trend metric" value={metric} onChange={(e) => setMetric(e.target.value)}>
          {MEASURE_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      </div>
      {chartData.length > 1 ? (
        <div className="il-chartcard">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
              <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} domain={["dataMin - 1", "dataMax + 1"]} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "var(--text)" }} />
              <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={{ r: 2.5, fill: "var(--accent)" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState text="Log this measurement twice to see a trend." />
      )}

      <div className="il-section">
        <div className="il-section-head">
          <h2>History</h2>
          <RangeFilter value={rangeFilter} onChange={setRangeFilter} label="Filter measurement history by date range" />
        </div>
        {sorted.length === 0 ? (
          <EmptyState text="No measurements logged yet." />
        ) : filtered.length === 0 ? (
          <EmptyState text="No entries in this range." />
        ) : (
          <div className="il-list">
            {filtered.map((e) => (
              <div className="il-row measure" key={e.id}>
                <button className="il-row-click" onClick={() => startEdit(e)}>
                  <div className="il-row-date-col">{fmtDateFull(e.date)}</div>
                  <div className="il-tags">
                    {MEASURE_FIELDS.filter((f) => e[f.key] !== undefined).map((f) => (
                      <span key={f.key} className="il-tag">{f.label} {e[f.key]}{unit}</span>
                    ))}
                  </div>
                </button>
                <button className="il-icon-btn" aria-label="Delete measurement entry" onClick={() => onDelete(e.id)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- nutrition tab ---------------------------------- */

function blankItem() {
  return { name: "", amount: "", calories: "", protein: "", carbs: "", fat: "" };
}

function WeeklyAvgCard({ meals, targets }) {
  const wk = useMemo(() => weeklyNutritionAverages(meals, 7), [meals]);
  if (!wk.daysLogged) return null;
  const rows = [
    targets.calories != null && targets.calories !== "" && { id: "calories", label: "Calories", value: wk.calories, target: Number(targets.calories), unit: "kcal" },
    targets.protein != null && targets.protein !== "" && { id: "protein", label: "Protein", value: wk.protein, target: Number(targets.protein), unit: "g" },
    targets.carbs != null && targets.carbs !== "" && { id: "carbs", label: "Carbs", value: wk.carbs, target: Number(targets.carbs), unit: "g" },
    targets.fat != null && targets.fat !== "" && { id: "fat", label: "Fat", value: wk.fat, target: Number(targets.fat), unit: "g" },
  ].filter(Boolean);
  if (!rows.length) return null;
  return (
    <div className="il-chartcard" style={{ padding: "14px 16px" }}>
      <div className="il-chartlabel" style={{ padding: 0, marginBottom: 4 }}>Weekly average vs target</div>
      <p className="il-modalnote" style={{ marginBottom: 10 }}>
        Average across {wk.daysLogged} logged day{wk.daysLogged === 1 ? "" : "s"} in the last 7 days.
      </p>
      <div className="il-targetlist">
        {rows.map((r) => (
          <TargetBar key={r.id} label={r.label} value={r.value} target={r.target} unit={r.unit} />
        ))}
      </div>
    </div>
  );
}

function TargetBar({ label, value, target, unit }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const over = value > target;
  return (
    <div className="il-targetrow">
      <div className="il-targetrow-head">
        <span>{label}</span>
        <span className={over ? "over" : ""}>{Math.round(value)} / {Math.round(target)} {unit}</span>
      </div>
      <div className="il-targetbar"><div className={`il-targetbar-fill ${over ? "over" : ""}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function NutritionTab({ meals, onAdd, onUpdate, onDelete, targets, view, onViewChange, onOpenTool, settings, onUpdateSettings }) {
  const [date, setDate] = useState(today());
  const [mealName, setMealName] = useState("");
  const [items, setItems] = useState([blankItem()]);
  const [editingId, setEditingId] = useState(null);
  const [rangeFilter, setRangeFilter] = useState("90");
  const [showMacros, setShowMacros] = useState(false);
  const formRef = useRef(null);

  const mealNameOptions = useMemo(() => {
    const used = Array.from(new Set(meals.map((m) => m.name))).filter((n) => !MEAL_PRESETS.includes(n));
    return [...MEAL_PRESETS, ...used];
  }, [meals]);

  // Recently-logged food items, deduped by name (most recent wins), so a food you eat
  // often can be tapped in with its numbers already filled rather than retyped.
  const recentFoods = useMemo(() => {
    const byName = new Map();
    const byDateDesc = [...meals].sort((a, b) => b.date.localeCompare(a.date));
    for (const m of byDateDesc) {
      for (const it of m.items) {
        const key = it.name.trim().toLowerCase();
        if (!key || byName.has(key)) continue;
        byName.set(key, it);
      }
    }
    return Array.from(byName.values()).slice(0, 10);
  }, [meals]);

  const sorted = [...meals].sort((a, b) => b.date.localeCompare(a.date));
  const filtered = filterByRange(sorted, rangeFilter);
  const grouped = useMemo(() => groupMealsDesc(filtered), [filtered]);

  const dayTotals = dayTotalsAsc(meals);
  const chartData = dayTotals.slice(-14).map((d) => ({ date: fmtDate(d.date), calories: Math.round(d.calories) }));
  const macroData = dayTotals.slice(-14).map((d) => ({
    date: fmtDate(d.date),
    protein: Math.round(d.protein),
    carbs: Math.round(d.carbs),
    fat: Math.round(d.fat),
  }));
  const hasMacros = dayTotals.some((d) => d.protein || d.carbs || d.fat);

  const todayTotals = useMemo(() => {
    const todaysMeals = meals.filter((m) => m.date === today());
    return sumItems(todaysMeals.flatMap((m) => m.items));
  }, [meals]);
  const hasTargets = targets && (targets.calories || targets.protein || targets.carbs || targets.fat);

  const yesterdayMeals = useMemo(() => meals.filter((m) => m.date === yesterday()), [meals]);
  function copyYesterday() {
    yesterdayMeals.forEach((m) => {
      onAdd({ date: today(), name: m.name, items: m.items.map((it) => ({ ...it, id: uid() })) });
    });
  }

  /* ---- favorite meals (persisted in settings) ---- */
  const favorites = settings?.favoriteMeals || [];
  function isFavoriteMeal(name) {
    return favorites.some((f) => f.name.toLowerCase() === name.toLowerCase());
  }
  function addFavoriteMeal(fav) {
    onAdd({ date: today(), name: fav.name, items: (fav.items || []).map((it) => ({ ...it, id: uid() })) });
  }
  function toggleFavoriteMeal(meal) {
    const favs = [...favorites];
    const idx = favs.findIndex((f) => f.name.toLowerCase() === meal.name.toLowerCase());
    const next =
      idx === -1
        ? [...favs, { name: meal.name, items: (meal.items || []).map((it) => ({ ...it })) }]
        : favs.filter((_, i) => i !== idx);
    onUpdateSettings({ favoriteMeals: next });
  }

  function updateItem(i, patch) {
    setItems((its) => its.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function addItemRow() {
    setItems((its) => [...its, blankItem()]);
  }
  function removeItemRow(i) {
    setItems((its) => (its.length > 1 ? its.filter((_, idx) => idx !== i) : its));
  }
  function resetForm() {
    setDate(today());
    setMealName("");
    setItems([blankItem()]);
    setShowMacros(false);
  }

  // Tapping a recently-used food fills it straight into the form: into the first
  // still-empty item row if there is one, otherwise appended as a new row — so
  // a repeat food never needs retyping its calories or macros.
  function quickAddFood(food) {
    const hasMacroData = food.protein !== undefined || food.carbs !== undefined || food.fat !== undefined;
    if (hasMacroData) setShowMacros(true);
    const filled = {
      name: food.name,
      amount: food.amount || "",
      calories: food.calories !== undefined && food.calories !== "" ? String(food.calories) : "",
      protein: food.protein !== undefined ? String(food.protein) : "",
      carbs: food.carbs !== undefined ? String(food.carbs) : "",
      fat: food.fat !== undefined ? String(food.fat) : "",
    };
    setItems((its) => {
      const emptyIdx = its.findIndex((row) => !row.name.trim() && !row.calories);
      if (emptyIdx !== -1) return its.map((row, idx) => (idx === emptyIdx ? filled : row));
      return [...its, filled];
    });
  }

  function submit(e) {
    e.preventDefault();
    const cleanItems = items
      .filter((it) => it.name.trim() && it.calories !== "")
      .map((it) => ({
        id: uid(),
        name: it.name.trim(),
        amount: it.amount.trim(),
        calories: Number(it.calories),
        protein: it.protein !== "" ? Number(it.protein) : undefined,
        carbs: it.carbs !== "" ? Number(it.carbs) : undefined,
        fat: it.fat !== "" ? Number(it.fat) : undefined,
      }));
    if (cleanItems.length === 0) return;
    const meal = { date, name: mealName.trim() || "Meal", items: cleanItems };
    if (editingId) {
      onUpdate(editingId, meal);
      setEditingId(null);
    } else {
      onAdd(meal);
    }
    resetForm();
  }

  function startEdit(meal) {
    setEditingId(meal.id);
    setDate(meal.date);
    setMealName(meal.name);
    setItems(
      meal.items.map((it) => ({
        name: it.name,
        amount: it.amount || "",
        calories: String(it.calories),
        protein: it.protein !== undefined ? String(it.protein) : "",
        carbs: it.carbs !== undefined ? String(it.carbs) : "",
        fat: it.fat !== undefined ? String(it.fat) : "",
      }))
    );
    setShowMacros(meal.items.some((it) => it.protein || it.carbs || it.fat));
    onViewChange("log");
    scrollToRef(formRef);
  }
  function cancelEdit() {
    setEditingId(null);
    resetForm();
  }

  return (
    <div className="il-page">
      <PageHead title="Nutrition" sub="Log what you eat, grouped into meals and days." />

      <div className="il-toolstrip">
        <span className="il-toolstrip-label">Quick calculators</span>
        <div className="il-toolstrip-links">
          <button type="button" className="il-toolchip" onClick={() => onOpenTool("calories")}><Flame size={13} /> Calories</button>
          <button type="button" className="il-toolchip" onClick={() => onOpenTool("macros")}><Utensils size={13} /> Macros</button>
          <button type="button" className="il-toolchip" onClick={() => onOpenTool("bmr")}><Activity size={13} /> BMR</button>
        </div>
      </div>

      <SegmentedControl
        options={[{ id: "log", label: "Log" }, { id: "insights", label: "Insights" }]}
        value={view}
        onChange={onViewChange}
      />

      {view === "log" && (
        <>
          {!editingId && yesterdayMeals.length > 0 && (
            <button type="button" className="il-textbtn" style={{ marginBottom: 14 }} onClick={copyYesterday}>
              Copy yesterday's meals ({yesterdayMeals.length})
            </button>
          )}

          {!editingId && favorites.length > 0 && (
            <div className="il-quickadd">
              <div className="il-setslabel">Favorites</div>
              <div className="il-recentfoods">
                {favorites.map((fav) => (
                  <div className="il-favchipwrap" key={fav.name.toLowerCase()}>
                    <button type="button" className="il-foodchip" onClick={() => addFavoriteMeal(fav)}>
                      <span className="il-foodchip-name">{fav.name}</span>
                      <span className="il-foodchip-cals">{fav.items.length} item{fav.items.length === 1 ? "" : "s"} · tap to add</span>
                    </button>
                    <button
                      type="button"
                      className="il-icon-btn il-favrm"
                      aria-label={`Remove ${fav.name} from favorites`}
                      onClick={() => toggleFavoriteMeal(fav)}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasTargets && (
            <div className="il-chartcard" style={{ padding: "14px 16px" }}>
              <div className="il-chartlabel" style={{ padding: 0, marginBottom: 10 }}>Today vs target</div>
              <div className="il-targetlist">
                {targets.calories && <TargetBar label="Calories" value={todayTotals.calories} target={Number(targets.calories)} unit="kcal" />}
                {targets.protein && <TargetBar label="Protein" value={todayTotals.protein} target={Number(targets.protein)} unit="g" />}
                {targets.carbs && <TargetBar label="Carbs" value={todayTotals.carbs} target={Number(targets.carbs)} unit="g" />}
                {targets.fat && <TargetBar label="Fat" value={todayTotals.fat} target={Number(targets.fat)} unit="g" />}
              </div>
            </div>
          )}

          {!editingId && recentFoods.length > 0 && (
            <div className="il-quickadd">
              <div className="il-setslabel">Quick add from recent</div>
              <div className="il-recentfoods">
                {recentFoods.map((it) => (
                  <button type="button" key={it.name.toLowerCase()} className="il-foodchip" onClick={() => quickAddFood(it)}>
                    <span className="il-foodchip-name">{it.name}</span>
                    <span className="il-foodchip-cals">{it.calories} kcal</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <form className="il-form wrap" ref={formRef} onSubmit={submit}>
            <div className="il-field">
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={today()} />
            </div>
            <div className="il-field grow">
              <label>Meal</label>
              <input list="il-meal-list" placeholder="e.g. Breakfast" value={mealName} onChange={(e) => setMealName(e.target.value)} />
              <datalist id="il-meal-list">
                {mealNameOptions.map((n) => <option key={n} value={n} />)}
              </datalist>
            </div>

            <div className="il-setsblock">
              <div className="il-setslabel">Food items</div>
              {items.map((it, i) => (
                <div className="il-itemrow" key={i}>
                  <div className="il-itemrow-top">
                    <input className="il-itemname" placeholder="Food" value={it.name} onChange={(e) => updateItem(i, { name: e.target.value })} />
                    <button type="button" className="il-icon-btn" aria-label="Remove food item" onClick={() => removeItemRow(i)}><X size={16} /></button>
                  </div>
                  <input className="il-itemamount" placeholder="Amount, e.g. 200g" value={it.amount} onChange={(e) => updateItem(i, { amount: e.target.value })} />
                  <div className="il-itemgrid">
                    <input className="il-itemnum" type="number" min="0" inputMode="numeric" placeholder="kcal" value={it.calories} onChange={(e) => updateItem(i, { calories: e.target.value })} />
                    {showMacros && (
                      <>
                        <input className="il-itemnum" type="number" min="0" inputMode="numeric" placeholder="P g" value={it.protein} onChange={(e) => updateItem(i, { protein: e.target.value })} />
                        <input className="il-itemnum" type="number" min="0" inputMode="numeric" placeholder="C g" value={it.carbs} onChange={(e) => updateItem(i, { carbs: e.target.value })} />
                        <input className="il-itemnum" type="number" min="0" inputMode="numeric" placeholder="F g" value={it.fat} onChange={(e) => updateItem(i, { fat: e.target.value })} />
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div className="il-linkrow">
                <button type="button" className="il-addbtn" onClick={addItemRow}><Plus size={14} /> Add food item</button>
                {!showMacros && <button type="button" className="il-addbtn" onClick={() => setShowMacros(true)}><Plus size={14} /> Add macros</button>}
              </div>
            </div>

            <div className="il-formactions full">
              <button className="il-btn full" type="submit">{editingId ? "Save" : "Log meal"}</button>
              {editingId && <button type="button" className="il-btn ghost" onClick={cancelEdit}>Cancel</button>}
            </div>
          </form>
        </>
      )}

      {view === "insights" && (
        <>
          <WeeklyAvgCard meals={meals} targets={targets} />

          <Collapsible title="Calories per day" summary={chartData.length ? `Last ${chartData.length} days` : undefined} defaultOpen>
            {chartData.length > 1 ? (
              <div className="il-chartcard">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "var(--text)" }} cursor={{ fill: "var(--fill-hover)" }} />
                    <Bar dataKey="calories" fill="var(--accent)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState text="Log a couple of days to see the trend." />
            )}

            {hasMacros && macroData.length > 1 && (
              <div className="il-chartcard">
                <div className="il-chartlabel">Macros per day (g)</div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={macroData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "var(--text)" }} cursor={{ fill: "var(--fill-hover)" }} />
                    <Bar dataKey="protein" stackId="m" fill="var(--accent)" />
                    <Bar dataKey="carbs" stackId="m" fill="var(--accent-soft)" />
                    <Bar dataKey="fat" stackId="m" fill="var(--text-muted)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="il-legend">
                  <span><i style={{ background: "var(--accent)" }} /> Protein</span>
                  <span><i style={{ background: "var(--accent-soft)" }} /> Carbs</span>
                  <span><i style={{ background: "var(--text-muted)" }} /> Fat</span>
                </div>
              </div>
            )}
          </Collapsible>

          <div className="il-section-head" style={{ marginTop: 0 }}>
            <h2>History</h2>
            <RangeFilter value={rangeFilter} onChange={setRangeFilter} label="Filter nutrition history by date range" />
          </div>
          {grouped.length === 0 ? (
            <EmptyState text={sorted.length === 0 ? "No meals logged yet." : "No entries in this range."} />
          ) : (
            <div className="il-daylist">
              {grouped.map((day, dayIdx) => (
                <CollapsibleTile
                  key={day.date}
                  defaultOpen={dayIdx === 0}
                  header={fmtDateFull(day.date)}
                  sub={`${Math.round(day.totals.calories)} kcal`}
                >
                  <div className="il-sessionlist">
                    {day.meals.map((meal) => {
                      const t = sumItems(meal.items);
                      const macroBits = [t.protein && `P ${Math.round(t.protein)}g`, t.carbs && `C ${Math.round(t.carbs)}g`, t.fat && `F ${Math.round(t.fat)}g`].filter(Boolean).join(" · ");
                      return (
                        <div className="il-sessioncard" key={meal.id}>
                          <div className="il-sessionhead">
                            <button className="il-row-click" onClick={() => startEdit(meal)}>
                              <div className="il-row-main">{meal.name}</div>
                              <div className="il-row-sub">{Math.round(t.calories)} kcal{macroBits ? ` · ${macroBits}` : ""}</div>
                            </button>
                            <button
                              className={`il-icon-btn ${isFavoriteMeal(meal.name) ? "fav-on" : ""}`}
                              aria-label={isFavoriteMeal(meal.name) ? `Remove ${meal.name} from favorites` : `Add ${meal.name} to favorites`}
                              onClick={() => toggleFavoriteMeal(meal)}
                            >
                              <Heart size={15} fill={isFavoriteMeal(meal.name) ? "currentColor" : "none"} />
                            </button>
                            <button className="il-icon-btn" aria-label="Delete meal" onClick={() => onDelete(meal.id)}><Trash2 size={14} /></button>
                          </div>
                          <div className="il-tags">
                            {meal.items.map((it) => (
                              <span className="il-tag" key={it.id}>{it.name}{it.amount ? ` (${it.amount})` : ""} · {it.calories} kcal</span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleTile>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}


function PageHead({ title, sub }) {
  return (
    <div className="il-pagehead">
      <h1>{title}</h1>
      <p>{sub}</p>
    </div>
  );
}

function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="il-segmented" role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          className={`il-segbtn ${value === o.id ? "active" : ""}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Collapsible tile: like Collapsible, but built for repeated list items (routine
// cards, workout-history days, record groups) rather than one big section. The
// chevron+label toggle and any always-visible action buttons (Start/Edit/Delete)
// are separate clickable regions side by side, so tapping "Delete" never also
// toggles the tile.
function CollapsibleTile({ header, sub, actions, defaultOpen = false, children, className = "" }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`il-ctile ${className}`}>
      <div className="il-ctile-head">
        <button type="button" className="il-ctile-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <ChevronRight size={16} className={`il-ctile-chevron ${open ? "open" : ""}`} strokeWidth={2.25} />
          <span className="il-ctile-headtext">
            <span className="il-row-main">{header}</span>
            {sub && <span className="il-row-sub">{sub}</span>}
          </span>
        </button>
        {actions && <div className="il-ctile-actions">{actions}</div>}
      </div>
      {open && <div className="il-ctile-body">{children}</div>}
    </div>
  );
}


// Header-as-toggle wrapper: collapsed by default, tap to reveal the chart/content
// underneath. summary is shown inline in the header whether open or closed. If the
// caller passes onToggle, the open/closed state is treated as controlled from outside
// (e.g. persisted to storage) rather than purely local.
function Collapsible({ title, summary, defaultOpen = false, onToggle, children }) {
  const [openState, setOpenState] = useState(defaultOpen);
  const open = onToggle ? defaultOpen : openState;
  function toggle() {
    const next = !open;
    if (onToggle) onToggle(next);
    else setOpenState(next);
  }
  return (
    <div className="il-collapsible">
      <button type="button" className="il-collapsible-head" onClick={toggle} aria-expanded={open}>
        <span className="il-collapsible-title">{title}</span>
        <span className="il-collapsible-right">
          {summary && !open && <span className="il-collapsible-summary">{summary}</span>}
          <Plus size={16} className={`il-collapsible-chevron ${open ? "open" : ""}`} strokeWidth={2} />
        </span>
      </button>
      {open && <div className="il-collapsible-body">{children}</div>}
    </div>
  );
}

function EmptyState({ text, action, onAction }) {
  return (
    <div className="il-empty">
      <p>{text}</p>
      {action && <button className="il-textbtn" onClick={onAction}>{action}</button>}
    </div>
  );
}

function EntryList({ rows, onDelete, onEdit, empty }) {
  if (rows.length === 0) return <EmptyState text={empty} />;
  return (
    <div className="il-list">
      {rows.map((r) => (
        <div className="il-row entry" key={r.id}>
          <button className="il-row-click" onClick={() => onEdit && onEdit(r)}>
            <div className="il-row-date-col">{r.left}</div>
            {r.sub && <div className="il-row-sub">{r.sub}</div>}
          </button>
          <div className="il-row-right">{r.right}</div>
          <button className="il-icon-btn" aria-label="Delete entry" onClick={() => onDelete(r.id)}><Trash2 size={14} /></button>
        </div>
      ))}
    </div>
  );
}

function SettingsModal({ settings, onChange, onExport, onClose }) {
  return (
    <div className="il-modalbg" onClick={onClose}>
      <div className="il-modal" onClick={(e) => e.stopPropagation()}>
        <div className="il-modalhead">
          <h2>Settings</h2>
          <button className="il-icon-btn" aria-label="Close settings" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="il-field">
          <label>Weight unit</label>
          <div className="il-toggle">
            {["lb", "kg"].map((u) => (
              <button key={u} className={settings.weightUnit === u ? "active" : ""} onClick={() => onChange({ weightUnit: u })}>{u}</button>
            ))}
          </div>
        </div>
        <div className="il-field">
          <label>Measurement unit</label>
          <div className="il-toggle">
            {["in", "cm"].map((u) => (
              <button key={u} className={settings.measureUnit === u ? "active" : ""} onClick={() => onChange({ measureUnit: u })}>{u}</button>
            ))}
          </div>
        </div>
        <p className="il-modalnote" style={{ marginBottom: 10 }}>Switching units converts your existing entries.</p>

        <div className="il-field">
          <label>Theme</label>
          <div className="il-toggle">
            {[{ id: "auto", label: "System" }, { id: "light", label: "Light" }, { id: "dark", label: "Dark" }].map((o) => (
              <button key={o.id} className={settings.theme === o.id ? "active" : ""} onClick={() => onChange({ theme: o.id })}>{o.label}</button>
            ))}
          </div>
        </div>

        <div className="il-field">
          <label>Goal weight ({settings.weightUnit})</label>
          <input
            type="number" step="0.1" min="0" inputMode="decimal" placeholder="0.0"
            value={settings.goalWeight}
            onChange={(e) => onChange({ goalWeight: e.target.value })}
          />
        </div>

        <div className="il-setslabel" style={{ fontSize: 12, margin: "8px 0 -2px" }}>Profile</div>
        <p className="il-modalnote" style={{ marginBottom: 10 }}>
          Height, age and sex are used to pre-fill the calculators in Tools.
        </p>
        <div className="il-field">
          <label>Height ({settings.measureUnit})</label>
          <input
            type="number" step="0.1" min="0" inputMode="decimal" placeholder="0.0"
            value={settings.profile.height}
            onChange={(e) => onChange({ profile: { height: e.target.value } })}
          />
        </div>
        <div className="il-field">
          <label>Sex</label>
          <div className="il-toggle">
            {["male", "female"].map((s) => (
              <button key={s} className={settings.profile.sex === s ? "active" : ""} onClick={() => onChange({ profile: { sex: s } })}>
                {s === "male" ? "Male" : "Female"}
              </button>
            ))}
          </div>
        </div>
        <div className="il-field">
          <label>Your equipment</label>
          <p className="il-modalnote" style={{ marginBottom: 6 }}>
            Powers the "missing equipment" flags in Programs and Exercises.
          </p>
          <PillGrid
            options={EQUIPMENT_OPTIONS}
            value={settings.ownedEquipment}
            multi
            onChange={(next) => onChange({ ownedEquipment: next })}
          />
        </div>
        <div className="il-field">
          <label>Date of birth (age auto-updates)</label>
          <input
            type="date" max={today()} value={settings.profile.birthDate}
            onChange={(e) => onChange({ profile: { birthDate: e.target.value } })}
          />
        </div>

        <div className="il-field">
          <label>Daily calorie target (optional)</label>
          <input
            type="number" min="0" inputMode="numeric" placeholder="e.g. 2200"
            value={settings.dailyTargets.calories}
            onChange={(e) => onChange({ dailyTargets: { calories: e.target.value } })}
          />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <div className="il-field" style={{ flex: 1 }}>
            <label>Protein (g)</label>
            <input type="number" min="0" inputMode="numeric" value={settings.dailyTargets.protein} onChange={(e) => onChange({ dailyTargets: { protein: e.target.value } })} />
          </div>
          <div className="il-field" style={{ flex: 1 }}>
            <label>Carbs (g)</label>
            <input type="number" min="0" inputMode="numeric" value={settings.dailyTargets.carbs} onChange={(e) => onChange({ dailyTargets: { carbs: e.target.value } })} />
          </div>
          <div className="il-field" style={{ flex: 1 }}>
            <label>Fat (g)</label>
            <input type="number" min="0" inputMode="numeric" value={settings.dailyTargets.fat} onChange={(e) => onChange({ dailyTargets: { fat: e.target.value } })} />
          </div>
        </div>
        <p className="il-modalnote">Leave a target blank to hide it. Targets show up in Nutrition.</p>

        <button className="il-btn full" style={{ marginTop: 14 }} onClick={onExport}>
          <Download size={14} /> Export data
        </button>
        <p className="il-modalnote">Your data is private, stored locally in your browser, and available offline. Export a backup any time.</p>
      </div>
    </div>
  );
}

function ConfirmModal({ message, onCancel, onConfirm }) {
  return (
    <div className="il-modalbg" onClick={onCancel}>
      <div className="il-modal" onClick={(e) => e.stopPropagation()}>
        <div className="il-modalhead">
          <h2>Delete entry</h2>
          <button className="il-icon-btn" aria-label="Cancel" onClick={onCancel}><X size={17} /></button>
        </div>
        <p className="il-modalnote" style={{ marginBottom: 18 }}>{message} This can't be undone.</p>
        <div className="il-confirmrow">
          <button className="il-btn ghost" onClick={onCancel}>Cancel</button>
          <button className="il-btn danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- theme ---------------------------------- */

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  fontSize: 12,
  fontFamily: "Inter, sans-serif",
  boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
};

function Style() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

      .il-root, .il-root * { box-sizing: border-box; }
      .il-root {
        --bg: #FAF9F6;
        --surface: #FFFFFF;
        --text: #201E19;
        --text-muted: #8A8478;
        --accent: #3F5C4A;
        --accent-soft: #9EB4A4;
        --tier-under: #C9A227;
        --tier-over: #C97B3A;
        --line: #E9E5DC;
        --fill-hover: #F2EFE9;
        --danger: #B0473C;
        --shadow-sm: 0 1px 2px rgba(32,28,20,0.03), 0 2px 10px rgba(32,28,20,0.045);
        --shadow-md: 0 2px 4px rgba(32,28,20,0.04), 0 8px 24px rgba(32,28,20,0.07);
        background: var(--bg);
        color: var(--text);
        min-height: 100vh;
        font-family: 'Inter', sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      .il-loading { display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 14px; }

      /* top bar */
      .il-topbar {
        position: sticky; top: 0; z-index: 30; background: var(--bg);
        border-bottom: 1px solid var(--line);
        padding-top: env(safe-area-inset-top);
      }
      .il-topbar-inner {
        max-width: 640px; margin: 0 auto; padding: 14px 16px;
        display: flex; align-items: center; justify-content: space-between;
      }
      .il-wordmark { font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }

      /* bottom tab bar */
      .il-bottomnav {
        position: fixed; left: 0; right: 0; bottom: 0; z-index: 40;
        max-width: 640px; margin: 0 auto;
        background: var(--surface);
        border-top: 1px solid var(--line);
        display: flex;
        padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
        box-shadow: 0 -2px 12px rgba(30,28,20,0.04);
      }
      .il-navbtn {
        flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
        background: none; border: none; color: var(--text-muted);
        font-size: 10.5px; font-weight: 500; font-family: 'Inter', sans-serif;
        padding: 7px 2px; border-radius: 10px; cursor: pointer;
        min-height: 48px; justify-content: center;
      }
      .il-navbtn.active { color: var(--accent); }
      .il-navbtn:active { background: var(--fill-hover); }

      .il-main { max-width: 640px; margin: 0 auto; }
      .il-page { padding: 18px 16px calc(84px + env(safe-area-inset-bottom)); }

      .il-pagehead h1 { font-size: 21px; font-weight: 600; margin: 0 0 4px; letter-spacing: -0.01em; }
      .il-pagehead p { color: var(--text-muted); font-size: 13.5px; margin: 0 0 22px; }

      .il-welcome { padding: 40px 4px; }
      .il-welcome h1 { font-size: 22px; font-weight: 600; margin: 0 0 8px; }
      .il-welcome p { color: var(--text-muted); font-size: 14px; margin: 0 0 20px; max-width: 42ch; }
      .il-welcome-actions { display: flex; gap: 10px; flex-wrap: wrap; }

      /* hero */
      .il-hero {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 20px 20px 14px;
        margin-bottom: 14px;
        box-shadow: var(--shadow-sm);
      }
      .il-hero-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
      .il-hero-label { color: var(--text-muted); font-size: 13px; margin-bottom: 4px; }
      .il-hero-value {
        font-size: 40px; font-weight: 700; line-height: 1; letter-spacing: -0.02em;
        font-variant-numeric: tabular-nums;
      }
      .il-hero-unit { font-size: 16px; color: var(--text-muted); margin-left: 6px; font-weight: 500; }
      .il-hero-subvalue { font-size: 12.5px; color: var(--text-muted); margin-top: 6px; }
      .il-hero-delta {
        display: flex; align-items: center; gap: 4px; font-size: 12.5px; color: var(--text-muted);
        background: var(--fill-hover); border-radius: 20px; padding: 4px 9px; flex-shrink: 0;
      }
      .il-hero-delta.up { color: var(--danger); }
      .il-hero-delta.down { color: var(--accent); }
      .il-hero-chart { margin-top: 4px; }
      .il-hero-cta {
        margin-top: 10px; background: none; border: none; color: var(--accent);
        font-size: 13px; font-weight: 600; cursor: pointer; padding: 0;
      }

      .il-statrow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 6px; }
      .il-stat {
        background: var(--surface); border: 1px solid var(--line); border-radius: 12px;
        padding: 13px 12px; text-align: left; cursor: pointer; color: var(--text);
        box-shadow: var(--shadow-sm); transition: transform 0.12s ease, border-color 0.12s ease;
      }
      .il-stat:hover { border-color: var(--accent-soft); transform: translateY(-1px); }
      .il-stat:active { transform: translateY(0); }
      .il-stat-value { font-size: 19px; font-weight: 700; letter-spacing: -0.01em; }
      .il-stat-label { font-size: 11px; color: var(--text-muted); margin-top: 3px; }

      /* today checklist */
      .il-checklist { display: flex; flex-direction: column; gap: 8px; }
      .il-checkitem {
        display: flex; align-items: center; gap: 12px; width: 100%;
        background: var(--surface); border: 1px solid var(--line); border-radius: 12px;
        padding: 12px 14px; text-align: left; cursor: pointer; color: var(--text);
        font-family: 'Inter', sans-serif; box-shadow: var(--shadow-sm);
      }
      .il-checkitem:active { background: var(--fill-hover); }
      .il-checkitem.done { border-color: var(--line); background: var(--fill-hover); }
      .il-checkmark {
        width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
        border: 1.5px solid var(--line); display: flex; align-items: center; justify-content: center;
        color: transparent;
      }
      .il-checkitem.done .il-checkmark { background: var(--accent); border-color: var(--accent); color: #FFFFFF; }
      .il-checktext { flex: 1; }
      .il-checktitle { font-size: 14px; font-weight: 600; }
      .il-checkitem.done .il-checktitle { color: var(--text-muted); text-decoration: line-through; text-decoration-color: var(--text-muted); }
      .il-checksub { font-size: 12px; color: var(--text-muted); margin-top: 1px; }
      .il-checkall {
        display: flex; align-items: center; gap: 8px; padding: 4px 2px 2px;
        font-size: 12.5px; color: var(--text-muted);
      }

      .il-section { margin-top: 30px; }
      .il-section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; gap: 10px; margin-top: 30px; }
      .il-section:first-of-type .il-section-head, .il-page > .il-section-head:first-of-type { margin-top: 24px; }
      .il-section-head h2 { font-size: 14.5px; font-weight: 600; margin: 0; }

      .il-streak { font-size: 11.5px; color: var(--text-muted); background: var(--fill-hover); padding: 4px 9px; border-radius: 20px; white-space: nowrap; }

      /* segmented control (Log / Insights / Progress) */
      .il-segmented {
        display: flex; gap: 3px; background: var(--fill-hover); border-radius: 11px;
        padding: 3px; margin-bottom: 18px;
      }
      .il-segbtn {
        flex: 1; background: none; border: none; border-radius: 8px;
        padding: 9px 8px; font-size: 13.5px; font-weight: 600; color: var(--text-muted);
        font-family: 'Inter', sans-serif; cursor: pointer; min-height: 40px;
      }
      .il-segbtn.active { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px rgba(30,28,20,0.08); }

      /* collapsible section */
      .il-collapsible { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; margin-bottom: 22px; overflow: hidden; box-shadow: var(--shadow-sm); }
      .il-collapsible-head {
        width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px;
        background: none; border: none; padding: 14px 16px; cursor: pointer; text-align: left;
        font-family: 'Inter', sans-serif; min-height: 48px;
      }
      .il-collapsible-title { font-size: 14px; font-weight: 600; color: var(--text); flex-shrink: 0; }
      .il-collapsible-right { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .il-collapsible-summary { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .il-collapsible-chevron { color: var(--text-muted); flex-shrink: 0; transition: transform 0.15s ease; }
      .il-collapsible-chevron.open { transform: rotate(45deg); }
      .il-collapsible-body { padding: 0 16px 16px; }
      .il-collapsible-body .il-chartcard { margin-bottom: 14px; }
      .il-collapsible-body .il-chartcard:last-child { margin-bottom: 0; }
      .il-collapsible-body .il-section-head { margin-top: 22px; }
      .il-collapsible-body .il-section-head:first-child { margin-top: 4px; }

      /* collapsible tile: routine cards, workout/nutrition day groups, record groups */
      .il-ctile { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow-sm); overflow: hidden; }
      .il-ctile-head { display: flex; align-items: flex-start; gap: 8px; padding: 13px 14px; }
      .il-ctile-toggle {
        display: flex; align-items: flex-start; gap: 8px; flex: 1; min-width: 0;
        background: none; border: none; padding: 0; margin: 0; cursor: pointer;
        text-align: left; color: inherit; font-family: 'Inter', sans-serif;
      }
      .il-ctile-chevron { color: var(--text-muted); flex-shrink: 0; margin-top: 3px; transition: transform 0.15s ease; }
      .il-ctile-chevron.open { transform: rotate(90deg); }
      .il-ctile-headtext { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .il-ctile-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
      .il-ctile-actions .il-icon-btn:last-child { margin-left: 4px; }
      .il-ctile-body { padding: 0 14px 14px; }

      .il-heatmap { display: flex; flex-wrap: wrap; gap: 3px; }
      .il-heatcell { width: 10px; height: 10px; border-radius: 2px; background: var(--line); }
      .il-heatcell.level-1 { background: var(--accent-soft); opacity: 0.45; }
      .il-heatcell.level-2 { background: var(--accent-soft); opacity: 0.75; }
      .il-heatcell.level-3 { background: var(--accent); opacity: 0.7; }
      .il-heatcell.level-4 { background: var(--accent); }

      .il-list { display: flex; flex-direction: column; }
      .il-row {
        display: flex; align-items: center; gap: 10px; padding: 11px 0;
        border-bottom: 1px solid var(--line); font-size: 13.5px;
      }
      .il-row:first-child { border-top: 1px solid var(--line); }
      .il-row-main { font-weight: 600; flex: 1; }
      .il-row-meta { color: var(--text); font-variant-numeric: tabular-nums; }
      .il-dim { color: var(--text-muted); }
      .il-row-date { color: var(--text-muted); font-size: 12px; width: 52px; text-align: right; flex-shrink: 0; }
      button.il-row-tap {
        width: 100%; background: none; border: none; text-align: left;
        font-family: 'Inter', sans-serif; cursor: pointer; color: inherit;
      }
      .il-row.il-row-tap { border-bottom: 1px solid var(--line); }
      .il-row.il-row-tap:first-child { border-top: 1px solid var(--line); }
      button.il-row-tap:active { background: var(--fill-hover); }

      .il-row-click {
        flex: 1; min-width: 0; background: none; border: none; color: inherit;
        font: inherit; text-align: left; cursor: pointer; padding: 0;
      }
      .il-row-date-col { font-size: 13.5px; font-weight: 500; }
      .il-row-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
      .il-row-right { font-variant-numeric: tabular-nums; font-weight: 600; font-size: 13.5px; }
      .il-row.measure { align-items: flex-start; }
      .il-row.measure .il-row-click { display: flex; flex-direction: column; gap: 6px; }
      .il-row.measure .il-row-date-col { color: var(--text-muted); font-weight: 500; }

      .il-tags { display: flex; flex-wrap: wrap; gap: 6px; }
      .il-tag {
        background: var(--fill-hover); border-radius: 6px;
        padding: 3px 8px; font-size: 11.5px; color: var(--text);
      }
      .il-tag.warmup { color: var(--text-muted); border: 1px dashed var(--line); background: transparent; }

      .il-empty {
        border: 1px dashed var(--line); border-radius: 12px;
        padding: 20px; text-align: center;
      }
      .il-empty p { color: var(--text-muted); font-size: 13.5px; margin: 0 0 6px; }

      /* group buckets (records) */
      .il-grouplist { display: flex; flex-direction: column; gap: 12px; }

      /* nutrition/workout day groups + records — all now render as .il-ctile collapsible tiles */
      .il-daylist { display: flex; flex-direction: column; gap: 12px; }

      /* nutrition targets */
      .il-targetlist { display: flex; flex-direction: column; gap: 10px; }
      .il-targetrow-head { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
      .il-targetrow-head .over { color: var(--danger); }
      .il-targetbar { height: 6px; border-radius: 4px; background: var(--fill-hover); overflow: hidden; }
      .il-targetbar-fill { height: 100%; background: var(--accent); border-radius: 4px; }
      .il-targetbar-fill.over { background: var(--danger); }

      /* nutrition quick-add from recent foods */
      .il-quickadd { margin-bottom: 18px; }
      .il-recentfoods { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
      .il-foodchip {
        display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
        background: var(--surface); border: 1px solid var(--line); border-radius: 10px;
        padding: 8px 12px; cursor: pointer; font-family: 'Inter', sans-serif; text-align: left;
        min-height: 44px; justify-content: center; max-width: 100%;
      }
      .il-foodchip:active { background: var(--fill-hover); border-color: var(--accent-soft); }
      .il-foodchip-name { font-size: 12.5px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 46vw; }
      .il-foodchip-cals { font-size: 11px; color: var(--text-muted); }

      /* forms */
      .il-form {
        display: flex; flex-direction: column; align-items: stretch; gap: 12px;
        background: var(--surface); border: 1px solid var(--line);
        border-radius: 14px; padding: 16px; margin-bottom: 20px;
        box-shadow: var(--shadow-sm);
      }
      .il-field { display: flex; flex-direction: column; gap: 6px; width: 100%; min-width: 0; }
      .il-field.grow { flex: 1; }
      .il-field label { font-size: 12px; color: var(--text-muted); font-weight: 500; }
      /* Global input/select baseline. Scoped to .il-root (not .il-field) so every
         input on the page looks the same whether or not it happens to sit inside
         a labeled .il-field wrapper — food-item rows, inline selects, etc. */
      .il-root input, .il-root select {
        background: var(--bg); border: 1px solid var(--line); border-radius: 8px;
        padding: 12px 11px; color: var(--text); font-size: 16px; font-family: 'Inter', sans-serif;
        min-width: 0; min-height: 44px;
      }
      .il-root input:focus-visible, .il-root select:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
      .il-formactions { display: flex; gap: 8px; align-items: center; }
      .il-formactions.full { width: 100%; margin-top: 2px; }
      .il-formactions.full .il-btn.full { flex: 1; margin-top: 0; }
      .il-btn {
        display: flex; align-items: center; gap: 6px; justify-content: center;
        background: var(--accent); color: #FFFFFF; border: none;
        border-radius: 10px; padding: 13px 18px; font-weight: 600; font-size: 15px;
        cursor: pointer; font-family: 'Inter', sans-serif; white-space: nowrap;
        min-height: 46px;
      }
      .il-btn:active { filter: brightness(1.08); }
      .il-btn.full { width: 100%; }
      .il-btn.ghost { background: none; border: 1px solid var(--line); color: var(--text-muted); }
      .il-btn.ghost:active { color: var(--text); border-color: var(--text-muted); filter: none; }
      .il-btn.danger { background: var(--danger); }
      .il-btn.small { padding: 9px 14px; font-size: 13px; min-height: 40px; }

      .il-textbtn {
        background: none; border: none; color: var(--accent);
        font-size: 13.5px; font-weight: 600; cursor: pointer; padding: 9px 0;
        align-self: flex-start; font-family: 'Inter', sans-serif;
        min-height: 40px; display: inline-flex; align-items: center;
      }
      .il-textbtn:hover { text-decoration: underline; }
      .il-linkrow { display: flex; gap: 8px; flex-wrap: wrap; }

      /* dashed "add row" button — used for +Add set / +Add food item / +Add exercise etc.
         Gives these repeat-tap actions real button affordance instead of a bare text link. */
      .il-addbtn {
        display: flex; align-items: center; justify-content: center; gap: 6px;
        width: 100%; background: transparent; border: 1.5px dashed var(--line);
        color: var(--accent); border-radius: 10px; padding: 10px 14px;
        font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: 'Inter', sans-serif;
        min-height: 44px;
      }
      .il-addbtn:active { background: var(--fill-hover); border-color: var(--accent-soft); }
      .il-linkrow .il-addbtn { width: auto; flex: 1; }

      .il-setsblock { width: 100%; display: flex; flex-direction: column; gap: 8px; }
      .il-setslabel { font-size: 11px; color: var(--text-muted); font-weight: 500; }
      .il-setrow {
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 8px;
      }
      .il-setrow.warmup { opacity: 0.75; }
      .il-setrow-main { display: flex; align-items: center; gap: 8px; flex: 1 1 170px; min-width: 0; }
      .il-setrow-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; flex-shrink: 0; }
      .il-setnum { width: 16px; font-size: 12px; color: var(--text-muted); text-align: center; flex-shrink: 0; }
      .il-setrow-main > input { flex: 0.8; min-width: 0; background: var(--surface); }
      .il-weightgroup { display: flex; align-items: center; gap: 4px; flex: 1.3; min-width: 0; }
      .il-weightgroup input { flex: 1; min-width: 0; text-align: center; padding-left: 4px; padding-right: 4px; background: var(--surface); }
      .il-stepbtn {
        width: 30px; height: 40px; flex-shrink: 0; border-radius: 8px;
        border: 1px solid var(--line); background: var(--surface); color: var(--text-muted);
        font-size: 16px; font-weight: 700; cursor: pointer; font-family: 'Inter', sans-serif;
        display: flex; align-items: center; justify-content: center; line-height: 1;
      }
      .il-stepbtn:active { background: var(--fill-hover); color: var(--text); border-color: var(--accent-soft); }
      .il-warmupbtn {
        width: 40px; height: 40px; flex-shrink: 0; border-radius: 9px;
        border: 1px solid var(--line); background: var(--surface); color: var(--text-muted);
        font-size: 12px; font-weight: 700; cursor: pointer; font-family: 'Inter', sans-serif;
      }
      .il-warmupbtn.active { background: var(--accent-soft); border-color: var(--accent-soft); color: #FFFFFF; }
      .il-setrow .il-icon-btn { width: 36px; height: 36px; }

      .il-itemrow {
        display: flex; flex-direction: column; gap: 8px;
        padding: 10px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px;
      }
      .il-itemrow-top { display: flex; align-items: center; gap: 4px; }
      .il-itemname { flex: 1; min-width: 0; }
      .il-itemrow .il-icon-btn { width: 40px; height: 40px; flex-shrink: 0; }
      .il-itemamount { width: 100%; }
      .il-itemgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(72px, 1fr)); gap: 8px; }
      .il-itemnum { width: 100%; }

      .il-icon-btn {
        background: none; border: none; color: var(--text-muted); cursor: pointer;
        border-radius: 10px; display: flex; align-items: center; justify-content: center;
        flex-shrink: 0; width: 44px; height: 44px;
      }
      .il-icon-btn:active { color: var(--danger); background: var(--fill-hover); }

      .il-chartcard {
        background: var(--surface); border: 1px solid var(--line); border-radius: 14px;
        padding: 14px 8px 6px; margin-bottom: 22px; box-shadow: var(--shadow-sm);
      }
      .il-chartlabel { font-size: 11.5px; color: var(--text-muted); font-weight: 500; padding: 0 10px 6px; }
      .il-legend { display: flex; gap: 16px; padding: 6px 10px 4px; font-size: 11.5px; color: var(--text-muted); }
      .il-legend i { display: inline-block; width: 7px; height: 7px; border-radius: 2px; margin-right: 5px; vertical-align: middle; }

      .il-sessionlist { display: flex; flex-direction: column; gap: 8px; }
      .il-sessioncard { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 13px 14px; box-shadow: var(--shadow-sm); }
      .il-sessionhead { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 8px; }

      /* routines */
      .il-routinelist { display: flex; flex-direction: column; gap: 10px; }

      /* weekly volume */
      .il-volumerow { display: flex; flex-wrap: wrap; gap: 8px; }
      .il-volumechip {
        display: flex; flex-direction: column; gap: 2px;
        background: var(--surface); border: 1px solid var(--line); border-radius: 10px;
        padding: 8px 12px; font-size: 11px; color: var(--text-muted); min-width: 92px;
      }
      .il-volumechip strong { color: var(--text); font-size: 13px; font-variant-numeric: tabular-nums; }

      /* active session queue */
      .il-queuecard { background: var(--surface); border: 1px solid var(--accent-soft); border-radius: 14px; padding: 14px; margin-bottom: 22px; box-shadow: var(--shadow-sm); }
      .il-queuehead { display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 600; margin-bottom: 10px; }
      .il-queuelist { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
      .il-queueitem { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 8px; background: var(--bg); }
      .il-queueitem.done { opacity: 0.55; }
      .il-queueitem-main { flex: 1; display: flex; justify-content: space-between; gap: 8px; background: none; border: none; cursor: pointer; font: inherit; color: inherit; padding: 0; text-align: left; }
      .il-queueadd { display: flex; flex-direction: column; gap: 8px; }
      .il-queueadd-row { display: flex; gap: 8px; }
      .il-queueadd input { width: 100%; }
      .il-queueadd select { flex: 1; min-width: 0; }
      .il-queueadd-row .il-btn { flex-shrink: 0; }

      /* last-time reference card */
      .il-lasttime {
        background: var(--fill-hover); border: 1px solid var(--line); border-radius: 12px;
        padding: 12px; display: flex; flex-direction: column; gap: 8px; width: 100%;
      }
      .il-lasttime-head {
        display: flex; justify-content: space-between; align-items: baseline;
        background: none; border: none; padding: 0; cursor: pointer; font-family: 'Inter', sans-serif;
        font-size: 12.5px; font-weight: 600; color: var(--text);
      }
      .il-lasttime-link { color: var(--accent); font-weight: 600; font-size: 12px; }
      .il-lasttime .il-textbtn { padding: 0; min-height: 0; align-self: flex-start; }

      /* measurement prefill note */
      .il-prefillnote {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        background: var(--fill-hover); border: 1px solid var(--line); border-radius: 10px;
        padding: 10px 12px; margin-bottom: 14px; font-size: 12px; color: var(--text-muted);
      }
      .il-prefillnote .il-textbtn { padding: 0; min-height: 0; }

      /* per-exercise history modal */
      .il-modal.wide { max-width: 420px; }
      .il-exhistory { display: flex; flex-direction: column; gap: 12px; max-height: 50vh; overflow-y: auto; }
      .il-exhistory-row { border-bottom: 1px solid var(--line); padding-bottom: 12px; }
      .il-exhistory-row:last-child { border-bottom: none; padding-bottom: 0; }
      .il-exhistory-head { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
      .il-exhistory-pr {
        background: var(--accent); color: #FFFFFF; font-size: 10.5px; font-weight: 700;
        padding: 2px 8px; border-radius: 20px; letter-spacing: 0.02em;
      }

      /* toast */
      .il-toast {
        position: fixed; bottom: calc(78px + env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%);
        background: var(--text); color: #FFFFFF; padding: 10px 16px; border-radius: 30px;
        display: flex; align-items: center; gap: 7px; font-size: 13.5px; font-weight: 500;
        box-shadow: 0 8px 24px rgba(0,0,0,0.18); z-index: 50; max-width: calc(100vw - 40px);
      }

      /* modal */
      .il-modalbg {
        position: fixed; inset: 0; background: rgba(20,18,14,0.35);
        display: flex; align-items: center; justify-content: center; z-index: 60; padding: 20px;
      }
      .il-modal {
        background: var(--surface); border: 1px solid var(--line); border-radius: 16px;
        padding: 20px; width: 100%; max-width: 340px; max-height: calc(100vh - 40px); overflow-y: auto; overflow-x: hidden;
        box-shadow: var(--shadow-md);
      }
      .il-modalhead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
      .il-modalhead h2 { font-size: 16px; font-weight: 600; margin: 0; }
      .il-modal .il-field { margin-bottom: 14px; }
      .il-toggle { display: flex; gap: 6px; }
      .il-toggle button {
        flex: 1; background: var(--bg); border: 1px solid var(--line); color: var(--text-muted);
        padding: 11px; min-height: 44px; border-radius: 8px; cursor: pointer; font-size: 14px; font-family: 'Inter', sans-serif; font-weight: 500;
      }
      .il-toggle button.active { border-color: var(--accent); color: var(--accent); background: var(--fill-hover); }
      .il-modalnote { font-size: 12px; color: var(--text-muted); margin: 4px 0 0; }
      .il-confirmrow { display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px; }

      /* calculators / tools */
      .il-toolgrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 9px; margin-bottom: 16px; }
      .il-tooltile {
        display: flex; flex-direction: column; align-items: flex-start; gap: 5px;
        background: var(--surface); border: 1px solid var(--line); border-radius: 12px;
        padding: 12px 13px; cursor: pointer; text-align: left; color: var(--text);
        font-family: 'Inter', sans-serif; min-height: 78px; justify-content: center;
        box-shadow: var(--shadow-sm);
      }
      .il-tooltile:hover { border-color: var(--accent-soft); }
      .il-tooltile.active { border-color: var(--accent); background: var(--fill-hover); }
      .il-tooltile-top { display: flex; align-items: center; gap: 7px; min-width: 0; }
      .il-tooltile-icon { color: var(--accent); flex-shrink: 0; }
      .il-tooltile-name { font-size: 13.5px; font-weight: 600; }
      .il-tooltile-preview { font-size: 11px; color: var(--text-muted); font-variant-numeric: tabular-nums; }

      .il-inputs-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
      .il-inputs-note { color: var(--text-muted); }
      .il-inputgrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
      .il-field-wide { width: 100%; }
      .il-katchrow { display: flex; flex-direction: column; gap: 10px; }
      .il-inputsfoot { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
      .il-inputsfoot-right { margin-left: auto; }

      .il-resultcard { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 16px; margin-top: 16px; box-shadow: var(--shadow-sm); }
      .il-result-label { color: var(--text-muted); font-size: 12.5px; margin-bottom: 4px; }
      .il-result-hero { font-size: 38px; font-weight: 700; line-height: 1.05; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
      .il-result-unit { font-size: 14px; color: var(--text-muted); margin-left: 5px; font-weight: 500; }
      .il-result-sub { font-size: 12.5px; color: var(--text-muted); margin-top: 8px; }
      .il-result-rows { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
      .il-result-row { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
      .il-result-row span:first-child { color: var(--text-muted); }
      .il-result-row span:last-child { font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; }

      .il-catbar { position: relative; height: 10px; border-radius: 6px; margin: 14px 0 4px; }
      .il-catbar-fill { position: absolute; inset: 0; border-radius: 6px; }
      .il-catmarker {
        position: absolute; top: -3px; width: 3px; height: 16px; border-radius: 2px;
        background: var(--text); transform: translateX(-1px);
      }
      .il-cat-labels { display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted); margin-top: 4px; }

      .il-rangebox { margin-top: 12px; }
      .il-range-track { position: relative; height: 10px; border-radius: 6px; background: var(--line); overflow: visible; }
      .il-range-healthy { position: absolute; top: 0; bottom: 0; background: var(--accent-soft); opacity: 0.55; }
      .il-range-mark { position: absolute; top: -4px; width: 2px; height: 18px; background: var(--text-muted); opacity: 0.65; transform: translateX(-1px); }
      .il-range-current { position: absolute; top: -5px; width: 3px; height: 20px; background: var(--text); border-radius: 2px; transform: translateX(-1px); }
      .il-range-scale { display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted); margin-top: 4px; }

      .il-macrobar { display: flex; height: 12px; border-radius: 7px; overflow: hidden; margin: 14px 0 6px; }
      .il-toolsblock { margin-top: 18px; }
      .il-toolsblock .il-setslabel { margin-bottom: 8px; }
      .il-goalchips { display: flex; flex-wrap: wrap; gap: 6px; }
      .il-toolchip.active { background: var(--accent); border-color: var(--accent); color: #FFFFFF; }
      .il-planpick { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
      .il-planbtn {
        display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--line); background: var(--bg);
        border-radius: 10px; padding: 10px 12px; text-align: left; cursor: pointer; font-family: 'Inter', sans-serif;
        min-height: 56px; justify-content: center;
      }
      .il-planbtn.active { border-color: var(--accent); background: var(--fill-hover); }
      .il-planbtn-name { font-size: 13px; font-weight: 600; color: var(--text); }
      .il-planbtn-meta { font-size: 10.5px; color: var(--text-muted); }

      .il-toolstrip {
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        background: var(--surface); border: 1px solid var(--line); border-radius: 12px;
        padding: 9px 12px; margin-bottom: 18px;
      }
      .il-toolstrip-label { font-size: 11.5px; color: var(--text-muted); font-weight: 700; margin-right: 2px; }
      .il-toolstrip-links { display: flex; flex-wrap: wrap; gap: 5px; }
      .il-toolchip {
        display: inline-flex; align-items: center; gap: 5px;
        background: var(--fill-hover); border: 1px solid var(--line); border-radius: 20px;
        padding: 6px 12px; font-size: 12px; font-weight: 600; color: var(--accent);
        cursor: pointer; font-family: 'Inter', sans-serif; min-height: 34px;
      }
      .il-toolchip:active { background: var(--line); }
      .il-toolchip svg { flex-shrink: 0; }
      .il-toolchips { display: flex; flex-wrap: wrap; gap: 8px; }

      /* ---- dark mode (pastel dark) ---- */
      .il-root.il-dark {
        color-scheme: dark;
        --bg: #1D1B23;
        --surface: #262330;
        --text: #EDEAF5;
        --text-muted: #A09AAC;
        --accent: #86B89C;
        --accent-soft: #4F6354;
        --line: #363340;
        --fill-hover: #2E2B38;
        --danger: #DC9AAE;
        --tier-under: #D6B569;
        --tier-over: #D99A68;
        --shadow-sm: 0 1px 2px rgba(0,0,0,0.12), 0 2px 10px rgba(0,0,0,0.18);
        --shadow-md: 0 2px 4px rgba(0,0,0,0.14), 0 10px 28px rgba(0,0,0,0.24);
      }
      @media (prefers-color-scheme: dark) {
        .il-root:not(.il-light) {
          color-scheme: dark;
          --bg: #1D1B23;
          --surface: #262330;
          --text: #EDEAF5;
          --text-muted: #A09AAC;
          --accent: #86B89C;
          --accent-soft: #4F6354;
          --line: #363340;
          --fill-hover: #2E2B38;
          --danger: #DC9AAE;
          --tier-under: #D6B569;
          --tier-over: #D99A68;
          --shadow-sm: 0 1px 2px rgba(0,0,0,0.12), 0 2px 10px rgba(0,0,0,0.18);
          --shadow-md: 0 2px 4px rgba(0,0,0,0.14), 0 10px 28px rgba(0,0,0,0.24);
        }
      }
      .il-grain {
        position: fixed; inset: 0; z-index: 45; pointer-events: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        background-size: 200px 200px;
        opacity: 0.045;
        mix-blend-mode: soft-light;
      }
      .il-dark .il-grain { opacity: 0.06; }

      /* goal card */
      .il-goalcard {
        background: var(--surface); border: 1px solid var(--line); border-radius: 14px;
        padding: 16px; margin-bottom: 14px; box-shadow: var(--shadow-sm);
      }
      .il-goalhead { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
      .il-goallabel { color: var(--text-muted); font-size: 12.5px; }
      .il-goaldelta { font-size: 12.5px; font-weight: 600; color: var(--text); }
      .il-goalvalues { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; }
      .il-goalnum { font-size: 28px; font-weight: 700; line-height: 1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
      .il-goalnum.goal { color: var(--accent); }
      .il-goalarrow { color: var(--text-muted); }
      .il-goalrate { margin-left: auto; font-size: 12px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
      .il-goaltrack { position: relative; height: 8px; border-radius: 5px; background: var(--line); margin-bottom: 12px; }
      .il-goal-here { position: absolute; top: -3px; width: 3px; height: 14px; border-radius: 2px; background: var(--text); transform: translateX(-1px); }
      .il-goal-target { position: absolute; top: -5px; width: 3px; height: 18px; border-radius: 2px; background: var(--accent); transform: translateX(-1px); }
      .il-goalproj { font-size: 12px; color: var(--text-muted); }

      /* weight trend chip */
      .il-trendpacked { display: flex; padding: 2px 8px 8px; }
      .il-trendchip {
        display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px;
        color: var(--text-muted); background: var(--fill-hover); border-radius: 20px;
        padding: 4px 10px; font-variant-numeric: tabular-nums;
      }
      .il-trendchip.down { color: var(--accent); }
      .il-trendchip.up { color: var(--danger); }

      /* favorite meals */
      .il-favchipwrap { position: relative; }
      .il-favrm {
        position: absolute; top: -7px; right: -7px; width: 24px; height: 24px;
        border-radius: 50%; background: var(--surface); border: 1px solid var(--line);
        color: var(--text-muted); box-shadow: 0 1px 3px rgba(0,0,0,0.14);
        display: flex; align-items: center; justify-content: center;
      }
      .il-favrm:active { color: var(--danger); }
      .il-icon-btn.fav-on { color: var(--danger); }

      /* small UI polish */
      .il-navbtn { gap: 2px; padding: 6px 1px; font-size: 10px; letter-spacing: -0.01em; }
      .il-bottomnav .il-navbtn .il-navbtn-label { font-size: 10px; }
      button:focus-visible, a:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
      .il-modal { -webkit-overflow-scrolling: touch; }
      .il-collapsible-chevron { transition: transform 0.18s ease; }
      .il-root { overscroll-behavior-y: none; scrollbar-gutter: stable; }

      /* dashboard: colored-left-border checklist + compact stat pattern (training revamp) */
      .il-checkitem { border-left: 3px solid var(--line); }
      .il-checkitem.done { border-left-color: var(--accent); }
      .il-stat-label { text-transform: uppercase; letter-spacing: 0.02em; }

      /* ---- training revamp: Today / Programs / Exercises shared components ---- */
      .tr-eyebrowhead { display: flex; align-items: flex-start; gap: 6px; margin-bottom: 18px; }
      .tr-back { margin-top: -2px; flex-shrink: 0; }
      .tr-eyebrowhead-main { flex: 1; min-width: 0; }
      .tr-eyebrow { display: block; font-size: 11.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
      .tr-titlerow { display: flex; align-items: center; gap: 10px; }
      .tr-title { font-size: 21px; font-weight: 700; letter-spacing: -0.01em; margin: 0; }
      .tr-titlerow-right { margin-left: auto; flex-shrink: 0; }
      .tr-sub { color: var(--text-muted); font-size: 13px; margin: 4px 0 0; }
      .tr-doneBtn { font-weight: 600; }

      .tr-pillrow, .tr-pillgrid { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 14px; }
      .tr-pill {
        border: 1px solid var(--line); background: var(--surface); color: var(--text);
        border-radius: 8px; padding: 7px 12px; font-size: 12.5px; font-weight: 600;
        cursor: pointer; font-family: 'Inter', sans-serif;
      }
      .tr-pill.active { border-color: var(--accent); color: var(--accent); background: var(--fill-hover); }

      .tr-badge { display: inline-flex; align-items: center; font-size: 10.5px; font-weight: 700; letter-spacing: 0.02em; padding: 3px 8px; border-radius: 6px; background: var(--fill-hover); color: var(--text-muted); text-transform: uppercase; }
      .tr-badge.accent { background: var(--accent); color: #fff; }
      .tr-badge.danger { background: var(--danger); color: #fff; }

      .tr-segtabs { display: flex; gap: 4px; background: var(--fill-hover); border-radius: 10px; padding: 3px; margin-bottom: 18px; }
      .tr-segbtn { flex: 1; border: none; background: none; padding: 8px 0; border-radius: 8px; font-size: 12.5px; font-weight: 600; color: var(--text-muted); cursor: pointer; font-family: 'Inter', sans-serif; }
      .tr-segbtn.active { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); }

      .tr-searchbar { display: flex; align-items: center; gap: 8px; border: 1px solid var(--line); border-radius: 10px; padding: 9px 12px; margin-bottom: 12px; background: var(--surface); color: var(--text-muted); }
      .tr-searchbar input { border: none; outline: none; flex: 1; font-size: 13.5px; background: none; color: var(--text); font-family: 'Inter', sans-serif; }
      .tr-matchcount { font-size: 12px; color: var(--text-muted); margin-bottom: 10px; }
      .tr-fieldblock { margin-bottom: 18px; }

      .tr-excard { border: 1px solid var(--line); border-left-width: 4px; border-left-style: solid; border-radius: 12px; padding: 12px 14px; background: var(--surface); margin-bottom: 10px; box-shadow: var(--shadow-sm); }
      .tr-excard-headrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .tr-excard-name { font-weight: 600; font-size: 14px; }
      .tr-excard-titlebtn { display: flex; align-items: center; gap: 5px; background: none; border: none; padding: 0; cursor: pointer; color: var(--text); text-align: left; }
      .tr-info-icon { color: var(--text-muted); flex-shrink: 0; }
      .tr-setsxreps { font-size: 12.5px; font-weight: 600; color: var(--text-muted); flex-shrink: 0; }
      .tr-excard-controls { display: flex; align-items: center; gap: 2px; }
      .tr-excard.summary { padding: 9px 12px; margin-bottom: 6px; }
      .tr-setsrepsedit { display: flex; align-items: flex-end; gap: 8px; margin-top: 8px; }
      .tr-setsrepsedit label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--text-muted); }
      .tr-setsrepsedit input { width: 56px; }
      .tr-x { color: var(--text-muted); font-size: 12.5px; padding-bottom: 8px; }
      .tr-missingbtn { margin-top: 8px; width: 100%; border: 1px solid var(--danger); background: none; color: var(--danger); border-radius: 8px; padding: 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.02em; cursor: pointer; }
      .tr-supersetbtn { width: 100%; border: 1px dashed var(--accent-soft); background: none; color: var(--accent); border-radius: 8px; padding: 5px; margin: -3px 0 10px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.02em; display: flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; }
      .tr-supersetbtn.active { background: var(--fill-hover); }

      .tr-modalrow, .tr-librow {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        width: 100%; text-align: left; border: 1px solid var(--line); border-left-width: 4px; border-left-style: solid;
        border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; background: var(--surface); cursor: pointer;
      }
      .tr-modalrow.selected { border-color: var(--accent); background: var(--fill-hover); }
      .tr-modalrow-main { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
      .tr-checkcircle { width: 20px; height: 20px; border-radius: 50%; background: var(--accent); color: #fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .tr-addmodal .il-modalhead, .tr-addmodal .tr-searchbar, .tr-addmodal .tr-pillrow, .tr-addmodal .tr-matchcount { flex-shrink: 0; }
      .tr-modallist, .tr-liblist { display: flex; flex-direction: column; overflow-y: auto; }
      .tr-stickyfooter { display: flex; flex-direction: column; align-items: center; gap: 6px; padding-top: 10px; border-top: 1px solid var(--line); margin-top: 8px; flex-shrink: 0; }

      .tr-proglist { display: flex; flex-direction: column; gap: 10px; }
      .tr-progcard { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; text-align: left; border: 1px solid var(--line); border-radius: 12px; padding: 14px; background: var(--surface); cursor: pointer; box-shadow: var(--shadow-sm); color: var(--text); }
      .tr-progcard-headrow { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }
      .tr-progcard-name { font-weight: 700; font-size: 15px; }

      .tr-dayrow { border: 1px solid var(--line); border-radius: 12px; margin-bottom: 8px; overflow: hidden; background: var(--surface); }
      .tr-dayrow-head { display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 14px; background: none; border: none; cursor: pointer; text-align: left; color: var(--text); }
      .tr-dayabbr { font-size: 11px; font-weight: 700; letter-spacing: 0.03em; color: var(--text-muted); width: 34px; flex-shrink: 0; text-transform: uppercase; }
      .tr-daynamecol { flex: 1; display: flex; flex-direction: column; gap: 2px; }
      .tr-dayname { font-weight: 600; font-size: 13.5px; }
      .tr-chevron { transition: transform 0.15s ease; color: var(--text-muted); flex-shrink: 0; }
      .tr-chevron.open { transform: rotate(180deg); }
      .tr-dayrow-body { padding: 0 14px 14px; border-top: 1px solid var(--line); }
      .tr-dayrow-body .tr-segtabs { margin-top: 12px; }
      .tr-section { margin-top: 14px; }
      .tr-section-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
      .tr-sectionname { flex: 1; font-size: 12px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: var(--text-muted); border: none; background: none; padding: 2px 0; }
      .tr-dayactions { display: flex; gap: 8px; margin-top: 4px; flex-wrap: wrap; }
      .tr-autoorg { display: flex; align-items: center; gap: 5px; }

      .tr-weekpills { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
      .tr-weekpill { display: flex; flex-direction: column; align-items: center; gap: 2px; border: 1px solid var(--line); border-radius: 8px; padding: 8px 2px; font-size: 10px; text-align: center; }
      .tr-weekpill span:first-child { font-weight: 700; letter-spacing: 0.02em; }
      .tr-weekpill.training { border-color: var(--accent-soft); }

      .tr-daystriphead { display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 600; margin-bottom: 8px; }
      .tr-daystrip { display: flex; align-items: center; gap: 4px; margin-bottom: 18px; }
      .tr-daystrip-cells { display: flex; gap: 5px; overflow-x: auto; flex: 1; }
      .tr-daycell { flex-shrink: 0; min-width: 52px; display: flex; flex-direction: column; align-items: center; gap: 3px; border: 1px solid var(--line); border-radius: 9px; padding: 7px 4px; background: var(--surface); cursor: pointer; }
      .tr-daycell.rest { opacity: 0.6; }
      .tr-daycell.active { border-color: var(--accent); background: var(--fill-hover); }
      .tr-daycell-name { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.01em; }

      .tr-restday { text-align: center; padding: 48px 16px; color: var(--text-muted); display: flex; flex-direction: column; align-items: center; gap: 8px; }
      .tr-restday-title { font-size: 18px; font-weight: 700; color: var(--text); margin-top: 4px; }
      .tr-restday p { max-width: 32ch; font-size: 13px; margin: 0 0 6px; }

      .tr-trainhead { margin-bottom: 16px; }
      .tr-todaybody { margin-top: 10px; border-top: 1px solid var(--line); padding-top: 10px; }
      .tr-todayactions { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
      .tr-resttimer.active { border-color: var(--accent); color: var(--accent); }
      .tr-setrow { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
      .tr-setrow input { width: 100%; min-width: 0; }
      .tr-setrow.done { opacity: 0.75; }
      .tr-checkbtn { width: 32px; height: 32px; flex-shrink: 0; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--text-muted); display: flex; align-items: center; justify-content: center; cursor: pointer; }
      .tr-checkbtn.active { background: var(--accent); border-color: var(--accent); color: #fff; }
      .tr-notearea { width: 100%; margin-top: 8px; border: 1px solid var(--line); border-radius: 8px; padding: 8px; font-size: 13px; font-family: 'Inter', sans-serif; background: var(--surface); color: var(--text); resize: vertical; min-height: 50px; }
      .tr-platesresult { margin-top: 4px; }

      @media (min-width: 640px) {
        .il-page { padding: 26px 0 calc(84px + env(safe-area-inset-bottom)); }
      }
    `}</style>
  );
}