/* ------------------------------------------------------------------------
 * training.jsx — Programs / Exercises / Today
 *
 * Self-contained like tools.jsx: duplicates the handful of small helpers it
 * needs from ironlog.jsx rather than importing them, so there's no circular
 * dependency between this file and the shell. ironlog.jsx owns all
 * persisted state (catalog, programs, gear, workout entries) and passes
 * data + callbacks down, the same pattern the rest of the app already uses.
 * ---------------------------------------------------------------------- */
import React, { useState, useEffect, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar,
} from "recharts";
import {
  Plus, Trash2, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Check, Info,
  Moon, Zap, ArrowLeftRight, Search, Timer, Calculator as CalculatorIcon,
} from "lucide-react";

/* ---------------------------------- helpers (duplicated by design) ---------------------------------- */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (dateStr, delta) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
};
const fmtDate = (d) => {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
const fmtDateFull = (d) => {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};
const round1 = (n) => Math.round(n * 10) / 10;
const epley = (weight, reps) => (reps <= 1 ? weight : Math.round(weight * (1 + reps / 30) * 10) / 10);
function weekStart(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  fontSize: 12,
  fontFamily: "Inter, sans-serif",
  boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
};

/* ---------------------------------- constants ---------------------------------- */

export const UNCATEGORIZED = "Uncategorized";
export const MUSCLE_GROUPS = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Legs", "Abs", "Forearms"];

export const EQUIPMENT_OPTIONS = [
  "Barbell", "Dumbbell", "Cable", "Machine", "Smith Machine", "EZ Bar",
  "Bench", "Rack", "Pull-Up Bar", "Bands", "Kettlebell", "Exercise Ball",
  "Trap Bar", "Box / Step",
];

export const CARD_STYLES = [
  { id: "compound", label: "Compound" },
  { id: "cable", label: "Cable" },
  { id: "dumbbell", label: "Dumbbell" },
  { id: "bodyweight", label: "Bodyweight" },
];

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DAY_LABELS = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
// JS Date.getDay(): 0=Sun..6=Sat. Map to our Monday-first DAY_KEYS.
const JS_DOW_TO_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export function dayKeyFor(dateStr) {
  return JS_DOW_TO_KEY[new Date(dateStr + "T00:00:00").getDay()];
}

/* ---------------------------------- seed exercise catalog ---------------------------------- */

const ex = (name, group, secondaryMuscles, equipment, cardStyle) => ({
  id: uid(), name, group, secondaryMuscles, equipment, cardStyle, isCustom: false,
});

const SEED_CATALOG = [
  // Chest
  ex("Barbell Bench Press", "Chest", ["Triceps", "Shoulders"], ["Barbell", "Bench", "Rack"], "compound"),
  ex("Incline Barbell Bench Press", "Chest", ["Shoulders", "Triceps"], ["Barbell", "Bench", "Rack"], "compound"),
  ex("Smith Machine Incline Bench Press", "Chest", ["Shoulders", "Triceps"], ["Smith Machine", "Bench"], "compound"),
  ex("Smith Machine Bench Press", "Chest", ["Triceps", "Shoulders"], ["Smith Machine", "Bench"], "compound"),
  ex("Dumbbell Bench Press", "Chest", ["Triceps", "Shoulders"], ["Dumbbell", "Bench"], "dumbbell"),
  ex("Incline Dumbbell Press", "Chest", ["Shoulders", "Triceps"], ["Dumbbell", "Bench"], "dumbbell"),
  ex("Dumbbell Fly", "Chest", ["Shoulders"], ["Dumbbell", "Bench"], "dumbbell"),
  ex("Cable Chest Fly", "Chest", ["Shoulders"], ["Cable"], "cable"),
  ex("Cable Crossover", "Chest", ["Shoulders"], ["Cable"], "cable"),
  ex("Pec Deck Machine", "Chest", ["Shoulders"], ["Machine"], "cable"),
  ex("Band Chest Press", "Chest", ["Triceps"], ["Bands"], "bodyweight"),
  ex("Push-Up", "Chest", ["Triceps", "Shoulders"], [], "bodyweight"),
  ex("Dips", "Chest", ["Triceps", "Shoulders"], [], "bodyweight"),
  ex("Assisted Dip Machine", "Chest", ["Triceps"], ["Machine"], "cable"),

  // Back
  ex("Deadlift", "Back", ["Legs", "Forearms"], ["Barbell", "Rack"], "compound"),
  ex("Trap Bar Deadlift", "Back", ["Legs", "Forearms"], ["Trap Bar"], "compound"),
  ex("Barbell Row", "Back", ["Biceps"], ["Barbell"], "compound"),
  ex("Pendlay Row", "Back", ["Biceps"], ["Barbell"], "compound"),
  ex("Pull-Up", "Back", ["Biceps", "Forearms"], ["Pull-Up Bar"], "compound"),
  ex("Chin-Up", "Back", ["Biceps", "Forearms"], ["Pull-Up Bar"], "compound"),
  ex("Assisted Pull-Up Machine", "Back", ["Biceps"], ["Machine"], "cable"),
  ex("Lat Pulldown", "Back", ["Biceps"], ["Cable"], "cable"),
  ex("Seated Cable Row", "Back", ["Biceps"], ["Cable"], "cable"),
  ex("Single-Arm Dumbbell Row", "Back", ["Biceps"], ["Dumbbell", "Bench"], "dumbbell"),
  ex("T-Bar Row", "Back", ["Biceps"], ["Barbell"], "compound"),
  ex("Back Extension Machine", "Back", ["Legs"], ["Machine"], "cable"),
  ex("Face Pull", "Back", ["Shoulders"], ["Cable"], "cable"),

  // Shoulders
  ex("Overhead Press", "Shoulders", ["Triceps"], ["Barbell", "Rack"], "compound"),
  ex("Smith Machine Overhead Press", "Shoulders", ["Triceps"], ["Smith Machine"], "compound"),
  ex("Dumbbell Shoulder Press", "Shoulders", ["Triceps"], ["Dumbbell"], "dumbbell"),
  ex("Arnold Press", "Shoulders", ["Triceps"], ["Dumbbell"], "dumbbell"),
  ex("Lateral Raise", "Shoulders", [], ["Dumbbell"], "dumbbell"),
  ex("Cable Lateral Raise", "Shoulders", [], ["Cable"], "cable"),
  ex("Band Lateral Raise", "Shoulders", [], ["Bands"], "bodyweight"),
  ex("Front Raise", "Shoulders", [], ["Dumbbell"], "dumbbell"),
  ex("Rear Delt Fly", "Shoulders", ["Back"], ["Dumbbell"], "dumbbell"),
  ex("Cable Overhead Extension", "Triceps", ["Shoulders"], ["Cable"], "cable"),
  ex("Upright Row", "Shoulders", ["Traps"], ["Barbell"], "compound"),
  ex("Shrugs", "Shoulders", ["Forearms"], ["Dumbbell"], "dumbbell"),

  // Biceps
  ex("Barbell Curl", "Biceps", ["Forearms"], ["Barbell"], "compound"),
  ex("EZ Bar Curl", "Biceps", ["Forearms"], ["EZ Bar"], "compound"),
  ex("Dumbbell Curl", "Biceps", ["Forearms"], ["Dumbbell"], "dumbbell"),
  ex("Hammer Curl", "Biceps", ["Forearms"], ["Dumbbell"], "dumbbell"),
  ex("Incline Dumbbell Curl", "Biceps", ["Forearms"], ["Dumbbell", "Bench"], "dumbbell"),
  ex("Cable Curl", "Biceps", ["Forearms"], ["Cable"], "cable"),
  ex("Preacher Curl", "Biceps", ["Forearms"], ["EZ Bar", "Bench"], "compound"),
  ex("Band Biceps Curl", "Biceps", ["Forearms"], ["Bands"], "bodyweight"),
  ex("Concentration Curl", "Biceps", ["Forearms"], ["Dumbbell"], "dumbbell"),

  // Triceps
  ex("Close-Grip Bench Press", "Triceps", ["Chest", "Shoulders"], ["Barbell", "Bench"], "compound"),
  ex("Cable Tricep Pushdown", "Triceps", [], ["Cable"], "cable"),
  ex("Cable Triceps Kickback", "Triceps", [], ["Cable"], "cable"),
  ex("Skull Crushers", "Triceps", [], ["EZ Bar", "Bench"], "compound"),
  ex("Overhead Dumbbell Extension", "Triceps", [], ["Dumbbell"], "dumbbell"),
  ex("Tricep Dip Machine", "Triceps", ["Chest"], ["Machine"], "cable"),
  ex("Diamond Push-Up", "Triceps", ["Chest"], [], "bodyweight"),

  // Legs
  ex("Barbell Back Squat", "Legs", ["Abs"], ["Barbell", "Rack"], "compound"),
  ex("Barbell Front Squat", "Legs", ["Abs"], ["Barbell", "Rack"], "compound"),
  ex("Smith Machine Squat", "Legs", ["Abs"], ["Smith Machine"], "compound"),
  ex("Romanian Deadlift", "Legs", ["Back", "Forearms"], ["Barbell"], "compound"),
  ex("Leg Press", "Legs", [], ["Machine"], "cable"),
  ex("Walking Lunge", "Legs", ["Abs"], ["Dumbbell"], "dumbbell"),
  ex("Bulgarian Split Squat", "Legs", ["Abs"], ["Dumbbell", "Bench"], "dumbbell"),
  ex("Leg Extension", "Legs", [], ["Machine"], "cable"),
  ex("Leg Curl Machine", "Legs", [], ["Machine"], "cable"),
  ex("Hip Thrust", "Legs", ["Abs"], ["Barbell", "Bench"], "compound"),
  ex("Cable Glute Kickback", "Legs", [], ["Cable"], "cable"),
  ex("Band Glute Kickback", "Legs", [], ["Bands"], "bodyweight"),
  ex("Standing Calf Raise", "Legs", [], ["Machine"], "cable"),
  ex("Bodyweight Squat", "Legs", ["Abs"], [], "bodyweight"),
  ex("Box Step-Up", "Legs", ["Abs"], ["Box / Step", "Dumbbell"], "dumbbell"),
  ex("Goblet Squat", "Legs", ["Abs"], ["Dumbbell"], "dumbbell"),

  // Abs
  ex("Ab Crunch Machine", "Abs", [], ["Machine"], "cable"),
  ex("Ab Wheel Rollout", "Abs", ["Shoulders"], ["Exercise Ball"], "bodyweight"),
  ex("Hanging Leg Raise", "Abs", ["Forearms"], ["Pull-Up Bar"], "bodyweight"),
  ex("Cable Crunch", "Abs", [], ["Cable"], "cable"),
  ex("Plank", "Abs", ["Shoulders"], [], "bodyweight"),
  ex("Band Palloff Press", "Abs", ["Shoulders"], ["Bands"], "bodyweight"),
  ex("Russian Twist", "Abs", [], [], "bodyweight"),
  ex("Sit-Up", "Abs", [], [], "bodyweight"),

  // Forearms
  ex("Wrist Curl", "Forearms", [], ["Dumbbell", "Bench"], "dumbbell"),
  ex("Reverse Curl", "Forearms", ["Biceps"], ["EZ Bar"], "compound"),
  ex("Farmer's Carry", "Forearms", ["Back"], ["Dumbbell", "Kettlebell"], "dumbbell"),
  ex("Dead Hang", "Forearms", ["Back"], ["Pull-Up Bar"], "bodyweight"),
];

/* ---------------------------------- data model helpers ---------------------------------- */

// Older catalog entries only have {name, group}. New ones need the RepDeck-era fields too.
// Runs once at load: fills in defaults for anything missing, then unions in the seed
// library (skipping any name the user already has) so Exercises/Programs aren't empty
// on first run. Idempotent — safe to call every load.
export function normalizeCatalog(raw) {
  const existing = (raw || []).map((c) => ({
    id: c.id || uid(),
    name: c.name,
    group: MUSCLE_GROUPS.includes(c.group) ? c.group : UNCATEGORIZED,
    secondaryMuscles: Array.isArray(c.secondaryMuscles) ? c.secondaryMuscles : [],
    equipment: Array.isArray(c.equipment) ? c.equipment : [],
    cardStyle: CARD_STYLES.some((s) => s.id === c.cardStyle) ? c.cardStyle : "bodyweight",
    isCustom: c.isCustom !== undefined ? c.isCustom : true,
  }));
  const haveNames = new Set(existing.map((c) => c.name.toLowerCase()));
  const seeded = SEED_CATALOG.filter((c) => !haveNames.has(c.name.toLowerCase()));
  return [...existing, ...seeded];
}

export function blankDaySlot() {
  return { type: "rest" };
}
export function blankSection(name = "Main Lifts") {
  return { id: uid(), name, exercises: [] };
}
export function blankTrainingDay() {
  return { type: "training", dayName: "", sections: [blankSection()] };
}
export function blankProgramExercise(exerciseId) {
  return { id: uid(), exerciseId, sets: 3, reps: 8, supersetWithNextId: null };
}
export function blankProgram() {
  const days = {};
  DAY_KEYS.forEach((k, i) => {
    days[k] = i === 0 ? blankTrainingDay() : blankDaySlot();
  });
  return {
    id: uid(),
    name: "Untitled Program",
    description: "",
    lengthWeeks: null,
    isActive: false,
    days,
  };
}
export function computeDaysPerWeek(program) {
  return DAY_KEYS.filter((k) => program.days[k]?.type === "training").length;
}
export function catalogById(catalog, id) {
  return catalog.find((c) => c.id === id);
}
export function missingEquipment(catalogEntry, ownedEquipment) {
  if (!catalogEntry) return [];
  return (catalogEntry.equipment || []).filter((eq) => !(ownedEquipment || []).includes(eq));
}

// Sorts a training day's exercises into Main Lifts (compound cardStyle) and
// Accessories (everything else), preserving relative order within each bucket.
// Superset links are dropped since exercises may move to non-adjacent sections.
function autoOrganizeDay(day, catalog) {
  const all = day.sections.flatMap((s) => s.exercises);
  const main = [];
  const accessories = [];
  for (const pe of all) {
    const entry = catalogById(catalog, pe.exerciseId);
    const clean = { ...pe, supersetWithNextId: null };
    if (entry?.cardStyle === "compound") main.push(clean);
    else accessories.push(clean);
  }
  const sections = [{ id: uid(), name: "Main Lifts", exercises: main }];
  if (accessories.length) sections.push({ id: uid(), name: "Accessories", exercises: accessories });
  return { ...day, sections };
}

/* ---------------------------------- shared components ---------------------------------- */

export function EyebrowHeader({ eyebrow, title, sub, onBack, right }) {
  return (
    <div className="tr-eyebrowhead">
      {onBack && (
        <button type="button" className="il-icon-btn tr-back" aria-label="Back" onClick={onBack}>
          <ChevronLeft size={19} />
        </button>
      )}
      <div className="tr-eyebrowhead-main">
        <span className="tr-eyebrow">{eyebrow}</span>
        {(title || right) && (
          <div className="tr-titlerow">
            {title && <h1 className="tr-title">{title}</h1>}
            {right && <div className="tr-titlerow-right">{right}</div>}
          </div>
        )}
        {sub && <p className="tr-sub">{sub}</p>}
      </div>
    </div>
  );
}

export function Pill({ active, onClick, children, disabled }) {
  return (
    <button type="button" className={`tr-pill ${active ? "active" : ""}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function PillGrid({ options, value, multi, onChange }) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  function toggle(id) {
    if (multi) {
      onChange(list.includes(id) ? list.filter((v) => v !== id) : [...list, id]);
    } else {
      onChange(id);
    }
  }
  return (
    <div className="tr-pillgrid">
      {options.map((o) => {
        const id = typeof o === "string" ? o : o.id;
        const label = typeof o === "string" ? o : o.label;
        return (
          <Pill key={id} active={list.includes(id)} onClick={() => toggle(id)}>
            {label}
          </Pill>
        );
      })}
    </div>
  );
}

export function Badge({ tone = "default", children }) {
  return <span className={`tr-badge ${tone}`}>{children}</span>;
}

export function SegTabs({ options, value, onChange }) {
  return (
    <div className="tr-segtabs" role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          className={`tr-segbtn ${value === o.id ? "active" : ""}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StickyFooter({ children }) {
  return <div className="tr-stickyfooter">{children}</div>;
}

const cardStyleColor = { compound: "var(--accent)", cable: "var(--tier-under)", dumbbell: "var(--accent-soft)", bodyweight: "var(--tier-over)" };

// The one exercise-card component, reused everywhere (editor rows, Today's
// logging cards, library rows, modal rows) via a `variant` prop.
export function ExerciseCard({
  entry, programExercise, variant = "library", ownedEquipment = [],
  onInfo, onSwap, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown,
  onSetsRepsChange, onSelectToggle, selected,
  supersetBelow, onToggleSuperset,
  children,
}) {
  if (!entry) return null;
  const missing = missingEquipment(entry, ownedEquipment);
  const stripe = cardStyleColor[entry.cardStyle] || "var(--line)";
  const repsLabel = programExercise
    ? typeof programExercise.reps === "object"
      ? `${programExercise.reps.min}-${programExercise.reps.max}`
      : programExercise.reps
    : null;

  if (variant === "modalRow") {
    return (
      <button type="button" className={`tr-modalrow ${selected ? "selected" : ""}`} style={{ borderLeftColor: stripe }} onClick={onSelectToggle}>
        <div className="tr-modalrow-main">
          <div className="il-row-main">{entry.name}</div>
          <div className="il-row-sub">{entry.group}</div>
          {missing.length > 0 && <Badge tone="danger">MISSING EQUIPMENT</Badge>}
        </div>
        {selected && (
          <span className="tr-checkcircle"><Check size={13} strokeWidth={3} /></span>
        )}
      </button>
    );
  }

  if (variant === "library") {
    return (
      <button type="button" className="tr-librow" style={{ borderLeftColor: stripe }} onClick={onInfo}>
        <div className="tr-modalrow-main">
          <div className="il-row-main">{entry.name}</div>
          <div className="il-row-sub">{entry.group}</div>
          {missing.length > 0 && <Badge tone="danger">MISSING EQUIPMENT</Badge>}
        </div>
      </button>
    );
  }

  if (variant === "summary") {
    return (
      <div className="tr-excard summary" style={{ borderLeftColor: stripe }}>
        <div className="tr-excard-headrow">
          <div>
            <div className="tr-excard-name">{entry.name}</div>
            <div className="il-row-sub">{entry.group}</div>
          </div>
          {programExercise && <span className="tr-setsxreps">{programExercise.sets} × {repsLabel}</span>}
        </div>
      </div>
    );
  }

  if (variant === "editor") {
    return (
      <>
        <div className="tr-excard editor" style={{ borderLeftColor: stripe }}>
          <div className="tr-excard-headrow">
            <div className="tr-excard-name">{entry.name}</div>
            <div className="tr-excard-controls">
              <button type="button" className="il-icon-btn" aria-label="Move up" disabled={!canMoveUp} onClick={onMoveUp}><ChevronUp size={15} /></button>
              <button type="button" className="il-icon-btn" aria-label="Move down" disabled={!canMoveDown} onClick={onMoveDown}><ChevronDown size={15} /></button>
              <button type="button" className="il-icon-btn" aria-label="Swap exercise" onClick={onSwap}><ArrowLeftRight size={14} /></button>
              <button type="button" className="il-icon-btn" aria-label="Remove exercise" onClick={onRemove}><X size={15} /></button>
            </div>
          </div>
          <div className="il-row-sub">{entry.group}</div>
          <div className="tr-setsrepsedit">
            <label>
              <span>Sets</span>
              <input
                type="number" min="1" inputMode="numeric" value={programExercise.sets}
                onChange={(e) => onSetsRepsChange({ sets: Math.max(1, Number(e.target.value) || 1) })}
              />
            </label>
            <span className="tr-x">×</span>
            <label>
              <span>Reps</span>
              <input
                type="number" min="1" inputMode="numeric" value={repsLabel}
                onChange={(e) => onSetsRepsChange({ reps: Math.max(1, Number(e.target.value) || 1) })}
              />
            </label>
          </div>
          {missing.length > 0 && (
            <button type="button" className="tr-missingbtn" onClick={onSwap}>
              MISSING {missing[0].toUpperCase()} · SWAP
            </button>
          )}
        </div>
        {supersetBelow !== undefined && (
          <button type="button" className={`tr-supersetbtn ${supersetBelow ? "active" : ""}`} onClick={onToggleSuperset}>
            <Zap size={12} /> Superset with below
          </button>
        )}
      </>
    );
  }

  // variant === "today"
  return (
    <div className="tr-excard today" style={{ borderLeftColor: stripe }}>
      <div className="tr-excard-headrow">
        <button type="button" className="tr-excard-titlebtn" onClick={onInfo}>
          <span className="tr-excard-name">{entry.name}</span>
          <Info size={13} className="tr-info-icon" />
        </button>
        <span className="tr-setsxreps">{programExercise?.sets} × {repsLabel}</span>
      </div>
      <div className="il-row-sub">{entry.group}</div>
      {children}
    </div>
  );
}

/* ---------------------------------- Add Exercise modal ---------------------------------- */

export function AddExerciseModal({ catalog, ownedEquipment, mode = "add", onClose, onAdd, onSwapPick }) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("ALL");
  const [selected, setSelected] = useState([]);

  const filtered = useMemo(() => {
    return catalog.filter((c) => {
      if (group !== "ALL" && c.group !== group) return false;
      if (search.trim() && !c.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [catalog, group, search]);

  function toggle(id) {
    if (mode === "swap") {
      onSwapPick(id);
      return;
    }
    setSelected((s) => (s.includes(id) ? s.filter((v) => v !== id) : [...s, id]));
  }

  return (
    <div className="il-modalbg" onClick={onClose}>
      <div className="il-modal tr-addmodal" onClick={(e) => e.stopPropagation()}>
        <div className="il-modalhead">
          <h2>{mode === "swap" ? "Swap Exercise" : "Add Exercise"}</h2>
          <button className="il-icon-btn" aria-label="Close" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="tr-searchbar">
          <Search size={15} />
          <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="tr-pillrow">
          <Pill active={group === "ALL"} onClick={() => setGroup("ALL")}>All</Pill>
          {MUSCLE_GROUPS.map((g) => (
            <Pill key={g} active={group === g} onClick={() => setGroup(g)}>{g}</Pill>
          ))}
        </div>
        <div className="tr-matchcount">{filtered.length} match{filtered.length === 1 ? "" : "es"}</div>
        <div className="tr-modallist">
          {filtered.map((c) => (
            <ExerciseCard
              key={c.id}
              entry={c}
              variant="modalRow"
              ownedEquipment={ownedEquipment}
              selected={selected.includes(c.id)}
              onSelectToggle={() => toggle(c.id)}
            />
          ))}
          {filtered.length === 0 && <div className="il-empty"><p>No exercises match.</p></div>}
        </div>
        {mode !== "swap" && (
          <StickyFooter>
            <button type="button" className="il-btn full" disabled={!selected.length} onClick={() => { onAdd(selected); setSelected([]); }}>
              Add {selected.length || ""} Exercise{selected.length === 1 ? "" : "s"}
            </button>
            <button type="button" className="il-textbtn" onClick={() => setSelected([])}>Clear</button>
          </StickyFooter>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- Plate calculator & Rest timer ---------------------------------- */

const PLATES_LB = [45, 35, 25, 10, 5, 2.5];
const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];

function platesForSide(targetTotal, barWeight, unit) {
  let perSide = (targetTotal - barWeight) / 2;
  if (perSide <= 0) return [];
  const plates = unit === "kg" ? PLATES_KG : PLATES_LB;
  const result = [];
  for (const p of plates) {
    while (perSide + 1e-6 >= p) {
      result.push(p);
      perSide -= p;
    }
  }
  return result;
}

export function PlateCalculatorModal({ targetWeight, unit, onClose }) {
  const [bar, setBar] = useState(unit === "kg" ? "20" : "45");
  const [target, setTarget] = useState(String(targetWeight || ""));
  const plates = useMemo(() => platesForSide(Number(target) || 0, Number(bar) || 0, unit), [target, bar, unit]);
  return (
    <div className="il-modalbg" onClick={onClose}>
      <div className="il-modal" onClick={(e) => e.stopPropagation()}>
        <div className="il-modalhead">
          <h2>Plate Calculator</h2>
          <button className="il-icon-btn" aria-label="Close" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="il-field">
          <label>Target weight ({unit})</label>
          <input type="number" min="0" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
        <div className="il-field">
          <label>Bar weight ({unit})</label>
          <input type="number" min="0" inputMode="decimal" value={bar} onChange={(e) => setBar(e.target.value)} />
        </div>
        <div className="tr-platesresult">
          <div className="il-setslabel">Per side</div>
          {plates.length === 0 ? (
            <p className="il-modalnote">Target is at or below bar weight.</p>
          ) : (
            <div className="il-tags">
              {plates.map((p, i) => <span className="il-tag" key={i}>{p}{unit}</span>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function RestTimerButton({ seconds = 180 }) {
  const [remaining, setRemaining] = useState(null);
  useEffect(() => {
    if (remaining === null) return undefined;
    if (remaining <= 0) return undefined;
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining]);
  const mm = remaining !== null ? String(Math.floor(remaining / 60)).padStart(2, "0") : null;
  const ss = remaining !== null ? String(remaining % 60).padStart(2, "0") : null;
  const running = remaining !== null && remaining > 0;
  return (
    <button
      type="button"
      className={`il-btn ghost small tr-resttimer ${running ? "active" : ""}`}
      onClick={() => setRemaining(running ? null : seconds)}
    >
      <Timer size={13} /> {running ? `${mm}:${ss}` : `Rest ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
    </button>
  );
}

/* ---------------------------------- Exercises tab ---------------------------------- */

export function ExercisesTab({ catalog, ownedEquipment, onAddCustom, workoutEntries, unit }) {
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("ALL");
  const [gearOnly, setGearOnly] = useState(false);
  const [detail, setDetail] = useState(null);

  const filtered = useMemo(() => {
    return catalog.filter((c) => {
      if (group !== "ALL" && c.group !== group) return false;
      if (search.trim() && !c.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      if (gearOnly && missingEquipment(c, ownedEquipment).length > 0) return false;
      return true;
    });
  }, [catalog, group, search, gearOnly, ownedEquipment]);

  if (creating) {
    return <CreateExerciseScreen onBack={() => setCreating(false)} onSave={(ex2) => { onAddCustom(ex2); setCreating(false); }} />;
  }

  return (
    <div className="il-page">
      <EyebrowHeader
        eyebrow="Library" title="Exercises"
        right={<button type="button" className="il-btn small" onClick={() => setCreating(true)}><Plus size={13} /> New</button>}
      />
      <div className="tr-searchbar">
        <Search size={15} />
        <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="tr-pillrow">
        <Pill active={group === "ALL"} onClick={() => setGroup("ALL")}>All</Pill>
        {MUSCLE_GROUPS.map((g) => <Pill key={g} active={group === g} onClick={() => setGroup(g)}>{g}</Pill>)}
        <Pill active={gearOnly} onClick={() => setGearOnly((v) => !v)}>My Gear Only</Pill>
      </div>
      <div className="tr-matchcount">{filtered.length} exercise{filtered.length === 1 ? "" : "s"}</div>
      <div className="tr-liblist">
        {filtered.map((c) => (
          <ExerciseCard key={c.id} entry={c} variant="library" ownedEquipment={ownedEquipment} onInfo={() => setDetail(c)} />
        ))}
        {filtered.length === 0 && <div className="il-empty"><p>No exercises match.</p></div>}
      </div>
      {detail && (
        <ExerciseDetailModal exercise={detail} entries={workoutEntries} unit={unit} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

function CreateExerciseScreen({ onBack, onSave }) {
  const [name, setName] = useState("");
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [cardStyle, setCardStyle] = useState("bodyweight");

  function save() {
    if (!name.trim() || !primary) return;
    onSave({
      id: uid(), name: name.trim(), group: primary, secondaryMuscles: secondary,
      equipment, cardStyle, isCustom: true,
    });
  }

  return (
    <div className="il-page">
      <EyebrowHeader eyebrow="New Exercise" title="Create Custom" sub="Visible only to you. Use in any of your programs." onBack={onBack} />
      <div className="il-field">
        <label>Name *</label>
        <input placeholder="e.g. Landmine T-Bar Row" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="tr-fieldblock">
        <div className="il-setslabel">Primary Muscle *</div>
        <p className="il-modalnote">The main muscle the exercise targets.</p>
        <PillGrid options={MUSCLE_GROUPS} value={primary} onChange={setPrimary} />
      </div>
      <div className="tr-fieldblock">
        <div className="il-setslabel">Secondary Muscles</div>
        <p className="il-modalnote">Pick any that also get worked.</p>
        <PillGrid options={MUSCLE_GROUPS} value={secondary} multi onChange={setSecondary} />
      </div>
      <div className="tr-fieldblock">
        <div className="il-setslabel">Equipment</div>
        <p className="il-modalnote">Leave empty for bodyweight.</p>
        <PillGrid options={EQUIPMENT_OPTIONS} value={equipment} multi onChange={setEquipment} />
      </div>
      <div className="tr-fieldblock">
        <div className="il-setslabel">Card Style</div>
        <p className="il-modalnote">Determines the colored stripe on the exercise card.</p>
        <PillGrid options={CARD_STYLES} value={cardStyle} onChange={setCardStyle} />
      </div>
      <button type="button" className="il-btn full" style={{ marginTop: 8 }} disabled={!name.trim() || !primary} onClick={save}>
        Save Exercise
      </button>
    </div>
  );
}

function exerciseHistoryRows(entries, exerciseName) {
  return [...entries]
    .filter((e) => e.exercise.toLowerCase() === exerciseName.toLowerCase())
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((e) => {
      const working = e.sets.filter((s) => !s.warmup);
      const topSet = working.reduce((best, s) => (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps) ? s : best), null);
      return { ...e, topSet, topEst1rm: topSet ? epley(topSet.weight, topSet.reps) : null };
    });
}

function ExerciseDetailModal({ exercise, entries, unit, onClose }) {
  const rows = useMemo(() => exerciseHistoryRows(entries, exercise.name), [entries, exercise.name]);
  const bestEst1rm = rows.reduce((max, r) => (r.topEst1rm && r.topEst1rm > max ? r.topEst1rm : max), 0);
  const trendData = useMemo(
    () => [...rows].reverse().filter((r) => r.topSet).map((r) => ({ date: fmtDate(r.date), weight: r.topSet.weight })),
    [rows]
  );
  return (
    <div className="il-modalbg" onClick={onClose}>
      <div className="il-modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="il-modalhead">
          <h2>{exercise.name}</h2>
          <button className="il-icon-btn" aria-label="Close" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="tr-pillrow" style={{ marginBottom: 14 }}>
          <Badge>{exercise.group}</Badge>
          {exercise.equipment.map((e) => <Badge key={e}>{e}</Badge>)}
          {exercise.equipment.length === 0 && <Badge>Bodyweight</Badge>}
        </div>
        {trendData.length > 1 && (
          <div className="il-chartcard" style={{ margin: "0 0 16px" }}>
            <div className="il-chartlabel">Top set weight over time</div>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={trendData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} domain={["dataMin - 5", "dataMax + 5"]} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "var(--text)" }} />
                <Line type="monotone" dataKey="weight" stroke="var(--accent)" strokeWidth={2} dot={{ r: 2.5, fill: "var(--accent)" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {rows.length === 0 ? (
          <div className="il-empty"><p>No history for this exercise yet.</p></div>
        ) : (
          <div className="il-exhistory">
            {rows.map((r) => (
              <div className="il-exhistory-row" key={r.id}>
                <div className="il-exhistory-head">
                  <span>{fmtDateFull(r.date)}</span>
                  {r.topEst1rm && r.topEst1rm === bestEst1rm && <span className="il-exhistory-pr">Best</span>}
                </div>
                <div className="il-tags">
                  {r.sets.map((s, i) => (
                    <span className={`il-tag ${s.warmup ? "warmup" : ""}`} key={i}>{s.warmup ? "W · " : ""}{s.weight}{unit} × {s.reps}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- Programs tab ---------------------------------- */

export function ProgramsTab({ programs, catalog, ownedEquipment, onCreate, onUpdate, onDelete, onSetActive }) {
  const [openId, setOpenId] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const openProgram = programs.find((p) => p.id === openId);
  const editingProgram = programs.find((p) => p.id === editingId);

  if (editingProgram) {
    return (
      <ProgramEditor
        program={editingProgram}
        catalog={catalog}
        ownedEquipment={ownedEquipment}
        onChange={(patch) => onUpdate(editingProgram.id, patch)}
        onDone={() => setEditingId(null)}
      />
    );
  }

  if (openProgram) {
    return (
      <ProgramDetail
        program={openProgram}
        catalog={catalog}
        onBack={() => setOpenId(null)}
        onEdit={() => setEditingId(openProgram.id)}
        onSetActive={() => onSetActive(openProgram.id)}
        onDelete={() => { onDelete(openProgram.id); setOpenId(null); }}
      />
    );
  }

  return (
    <div className="il-page">
      <EyebrowHeader
        eyebrow="Library" title="Programs"
        right={<button type="button" className="il-btn small" onClick={() => { const p = onCreate(); setEditingId(p.id); }}><Plus size={13} /> New</button>}
      />
      <div className="il-section" style={{ marginTop: 0 }}>
        <div className="il-section-head" style={{ marginTop: 0 }}><h2>My Programs</h2></div>
        {programs.length === 0 ? (
          <div className="il-empty">
            <p>No programs yet.</p>
            <button className="il-textbtn" onClick={() => { const p = onCreate(); setEditingId(p.id); }}>+ New Program</button>
          </div>
        ) : (
          <div className="tr-proglist">
            {programs.map((p) => (
              <button type="button" className="tr-progcard" key={p.id} onClick={() => setOpenId(p.id)}>
                <div className="tr-progcard-main">
                  <div className="tr-progcard-headrow">
                    <span className="tr-progcard-name">{p.name}</span>
                    {p.isActive && <Badge tone="accent">ACTIVE</Badge>}
                  </div>
                  <div className="il-row-sub">{computeDaysPerWeek(p)} days/wk</div>
                </div>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProgramEditor({ program, catalog, ownedEquipment, onChange, onDone }) {
  const [openDay, setOpenDay] = useState(null);
  const [modal, setModal] = useState(null); // { dayKey, sectionId } | { dayKey, sectionId, swapExerciseIndex }

  function patchDay(dayKey, patch) {
    onChange({ days: { ...program.days, [dayKey]: { ...program.days[dayKey], ...patch } } });
  }
  function setDayType(dayKey, type) {
    if (type === "rest") patchDay(dayKey, blankDaySlot());
    else onChange({ days: { ...program.days, [dayKey]: blankTrainingDay() } });
  }
  function patchSection(dayKey, sectionId, patch) {
    const day = program.days[dayKey];
    patchDay(dayKey, { sections: day.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)) });
  }
  function addSection(dayKey) {
    const day = program.days[dayKey];
    patchDay(dayKey, { sections: [...day.sections, blankSection("Accessories")] });
  }
  function removeSection(dayKey, sectionId) {
    const day = program.days[dayKey];
    patchDay(dayKey, { sections: day.sections.filter((s) => s.id !== sectionId) });
  }
  function addExercises(dayKey, sectionId, exerciseIds) {
    const day = program.days[dayKey];
    const section = day.sections.find((s) => s.id === sectionId);
    const added = exerciseIds.map((id) => blankProgramExercise(id));
    patchSection(dayKey, sectionId, { exercises: [...section.exercises, ...added] });
  }
  function removeExercise(dayKey, sectionId, exIdx) {
    const day = program.days[dayKey];
    const section = day.sections.find((s) => s.id === sectionId);
    patchSection(dayKey, sectionId, { exercises: section.exercises.filter((_, i) => i !== exIdx) });
  }
  function moveExercise(dayKey, sectionId, exIdx, dir) {
    const day = program.days[dayKey];
    const section = day.sections.find((s) => s.id === sectionId);
    const next = [...section.exercises];
    const target = exIdx + dir;
    if (target < 0 || target >= next.length) return;
    [next[exIdx], next[target]] = [next[target], next[exIdx]];
    patchSection(dayKey, sectionId, { exercises: next });
  }
  function updateExercise(dayKey, sectionId, exIdx, patch) {
    const day = program.days[dayKey];
    const section = day.sections.find((s) => s.id === sectionId);
    patchSection(dayKey, sectionId, { exercises: section.exercises.map((e, i) => (i === exIdx ? { ...e, ...patch } : e)) });
  }
  function swapExercise(dayKey, sectionId, exIdx, newExerciseId) {
    updateExercise(dayKey, sectionId, exIdx, { exerciseId: newExerciseId });
    setModal(null);
  }
  function toggleSuperset(dayKey, sectionId, exIdx) {
    const day = program.days[dayKey];
    const section = day.sections.find((s) => s.id === sectionId);
    const cur = section.exercises[exIdx];
    const nextId = section.exercises[exIdx + 1]?.id;
    updateExercise(dayKey, sectionId, exIdx, { supersetWithNextId: cur.supersetWithNextId ? null : nextId });
  }
  function autoOrganize(dayKey) {
    patchDay(dayKey, autoOrganizeDay(program.days[dayKey], catalog));
  }

  return (
    <div className="il-page">
      <EyebrowHeader eyebrow="My Program (Editable)" title="" onBack={onDone} right={<button type="button" className="il-textbtn tr-doneBtn" onClick={onDone}>Done</button>} />
      <div className="il-field">
        <label>Name</label>
        <input value={program.name} onChange={(e) => onChange({ name: e.target.value })} />
      </div>
      <div className="il-field">
        <label>Description</label>
        <textarea placeholder="What's this program about?" value={program.description} onChange={(e) => onChange({ description: e.target.value })} rows={2} />
      </div>
      <div className="il-field">
        <label>Length (optional)</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="number" min="0" inputMode="numeric" style={{ maxWidth: 90 }} placeholder="—"
            value={program.lengthWeeks ?? ""}
            onChange={(e) => onChange({ lengthWeeks: e.target.value === "" ? null : Number(e.target.value) })}
          />
          <span className="il-dim">weeks</span>
        </div>
        <p className="il-modalnote">Drives the "Week X of Y" tracker on Today. Leave empty for an open-ended plan.</p>
      </div>
      <p className="il-modalnote">Changes save automatically as you edit.</p>

      <div className="tr-fieldblock">
        <div className="il-setslabel">Days</div>
        {DAY_KEYS.map((dayKey) => {
          const day = program.days[dayKey];
          const open = openDay === dayKey;
          return (
            <div className="tr-dayrow" key={dayKey}>
              <button type="button" className="tr-dayrow-head" onClick={() => setOpenDay(open ? null : dayKey)}>
                <span className="tr-dayabbr">{DAY_LABELS[dayKey]}</span>
                <span className="tr-daynamecol">
                  <span className="tr-dayname">{day.type === "training" ? (day.dayName || "Training") : "Rest"}</span>
                  {day.type === "training" && <span className="il-dim">{day.sections.length} section{day.sections.length === 1 ? "" : "s"}</span>}
                </span>
                <ChevronDown size={16} className={open ? "tr-chevron open" : "tr-chevron"} />
              </button>
              {open && (
                <div className="tr-dayrow-body">
                  <SegTabs
                    options={[{ id: "training", label: "Training Day" }, { id: "rest", label: "Rest" }]}
                    value={day.type}
                    onChange={(t) => setDayType(dayKey, t)}
                  />
                  {day.type === "training" && (
                    <>
                      <div className="il-field">
                        <label>Day Name</label>
                        <input placeholder="Push, Pull, Upper, Lower…" value={day.dayName} onChange={(e) => patchDay(dayKey, { dayName: e.target.value })} />
                      </div>
                      {day.sections.map((section) => (
                        <div className="tr-section" key={section.id}>
                          <div className="tr-section-head">
                            <input className="tr-sectionname" value={section.name} onChange={(e) => patchSection(dayKey, section.id, { name: e.target.value })} />
                            <button type="button" className="il-icon-btn" aria-label="Delete section" onClick={() => removeSection(dayKey, section.id)}><Trash2 size={14} /></button>
                          </div>
                          {section.exercises.length === 0 && <div className="il-empty"><p>No exercises yet.</p></div>}
                          {section.exercises.map((pe, exIdx) => {
                            const entry = catalogById(catalog, pe.exerciseId);
                            const next = section.exercises[exIdx + 1];
                            return (
                              <ExerciseCard
                                key={pe.id}
                                entry={entry}
                                programExercise={pe}
                                variant="editor"
                                ownedEquipment={ownedEquipment}
                                canMoveUp={exIdx > 0}
                                canMoveDown={exIdx < section.exercises.length - 1}
                                onMoveUp={() => moveExercise(dayKey, section.id, exIdx, -1)}
                                onMoveDown={() => moveExercise(dayKey, section.id, exIdx, 1)}
                                onSwap={() => setModal({ dayKey, sectionId: section.id, swapExIdx: exIdx })}
                                onRemove={() => removeExercise(dayKey, section.id, exIdx)}
                                onSetsRepsChange={(patch) => updateExercise(dayKey, section.id, exIdx, patch)}
                                supersetBelow={next ? !!pe.supersetWithNextId : undefined}
                                onToggleSuperset={() => toggleSuperset(dayKey, section.id, exIdx)}
                              />
                            );
                          })}
                          <button type="button" className="il-addbtn full" onClick={() => setModal({ dayKey, sectionId: section.id })}>+ Add Exercise</button>
                        </div>
                      ))}
                      <div className="tr-dayactions">
                        <button type="button" className="il-btn ghost small" onClick={() => addSection(dayKey)}>+ Add Section</button>
                        <button type="button" className="il-btn ghost small tr-autoorg" onClick={() => autoOrganize(dayKey)}><Zap size={13} /> Auto-Organize</button>
                      </div>
                      <p className="il-modalnote">Not sure how to split things up? Auto-Organize sorts your exercises into Main Lifts and Accessories by movement type.</p>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {modal && (
        <AddExerciseModal
          catalog={catalog}
          ownedEquipment={ownedEquipment}
          mode={modal.swapExIdx !== undefined ? "swap" : "add"}
          onClose={() => setModal(null)}
          onAdd={(ids) => { addExercises(modal.dayKey, modal.sectionId, ids); setModal(null); }}
          onSwapPick={(id) => swapExercise(modal.dayKey, modal.sectionId, modal.swapExIdx, id)}
        />
      )}
    </div>
  );
}

function ProgramDetail({ program, catalog, onBack, onEdit, onSetActive, onDelete }) {
  const trainingDays = DAY_KEYS.filter((k) => program.days[k].type === "training");
  return (
    <div className="il-page">
      <EyebrowHeader eyebrow="My Program" title={program.name} sub={`${computeDaysPerWeek(program)} days/wk`} onBack={onBack} />
      <button type="button" className="il-btn full" disabled={program.isActive} onClick={onSetActive} style={{ marginBottom: 8 }}>
        {program.isActive ? "Currently Active" : "Set Active"}
      </button>
      <button type="button" className="il-btn ghost full" onClick={onEdit} style={{ marginBottom: 8 }}>Edit Program</button>
      <button type="button" className="il-btn danger full" onClick={onDelete} style={{ marginBottom: 20 }}>Delete Program</button>

      <div className="il-section" style={{ marginTop: 0 }}>
        <div className="il-section-head" style={{ marginTop: 0 }}>
          <h2>Weekly Schedule</h2>
          <button type="button" className="il-textbtn" onClick={onEdit}>Edit Days</button>
        </div>
        <div className="tr-weekpills">
          {DAY_KEYS.map((k) => (
            <div className={`tr-weekpill ${program.days[k].type === "training" ? "training" : ""}`} key={k}>
              <span>{DAY_LABELS[k]}</span>
              <span className="il-dim">{program.days[k].type === "training" ? (program.days[k].dayName || "Training") : "Rest"}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="il-section">
        <div className="il-section-head" style={{ marginTop: 0 }}><h2>Training Days</h2></div>
        {trainingDays.length === 0 ? (
          <div className="il-empty"><p>No training days set yet.</p></div>
        ) : (
          <div className="tr-proglist">
            {trainingDays.map((k) => {
              const day = program.days[k];
              const count = day.sections.reduce((n, s) => n + s.exercises.length, 0);
              return (
                <CollapsibleRow key={k} header={day.dayName || "Training"} sub={`${count} exercise${count === 1 ? "" : "s"}`}>
                  {day.sections.map((s) => (
                    <div key={s.id} style={{ marginBottom: 8 }}>
                      <div className="il-setslabel">{s.name}</div>
                      {s.exercises.map((pe) => (
                        <ExerciseCard key={pe.id} entry={catalogById(catalog, pe.exerciseId)} programExercise={pe} variant="summary" />
                      ))}
                    </div>
                  ))}
                </CollapsibleRow>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function CollapsibleRow({ header, sub, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="il-ctile">
      <div className="il-ctile-head">
        <button type="button" className="il-ctile-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <ChevronRightIcon open={open} />
          <span className="il-ctile-headtext">
            <span className="il-row-main">{header}</span>
            {sub && <span className="il-row-sub">{sub}</span>}
          </span>
        </button>
      </div>
      {open && <div className="il-ctile-body">{children}</div>}
    </div>
  );
}
function ChevronRightIcon({ open }) {
  return <ChevronDown size={16} className={`il-ctile-chevron ${open ? "open" : ""}`} style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }} strokeWidth={2.25} />;
}

/* ---------------------------------- Today tab ---------------------------------- */

export function TodayTab({
  programs, catalog, ownedEquipment, workoutEntries, records, unit,
  onLogSets, onSetNote, view, onViewChange,
}) {
  const [selectedDate, setSelectedDate] = useState(today());
  const activeProgram = programs.find((p) => p.isActive);

  const currentDayKey = dayKeyFor(selectedDate);
  const day = activeProgram?.days[currentDayKey];

  const weekNumber = useMemo(() => {
    if (!activeProgram?.lengthWeeks) return null;
    // Rough week count from program creation isn't tracked, so approximate
    // from the current week relative to today — good enough for a light tracker.
    return null;
  }, [activeProgram]);

  function nextTrainingDayLabel() {
    if (!activeProgram) return null;
    for (let i = 1; i <= 7; i++) {
      const d = addDays(selectedDate, i);
      const k = dayKeyFor(d);
      const dd = activeProgram.days[k];
      if (dd.type === "training") return { date: d, name: dd.dayName || "Training" };
    }
    return null;
  }

  if (!activeProgram) {
    return (
      <div className="il-page">
        <EyebrowHeader eyebrow="Today" title="No Active Program" sub="Set a program active from the Programs tab to see it here." />
        {view === "progress" && <ProgressPanel records={records} catalog={catalog} entries={workoutEntries} unit={unit} />}
      </div>
    );
  }

  const weekDates = DAY_KEYS.map((k, i) => addDays(weekStart(selectedDate), i));
  const next = nextTrainingDayLabel();

  return (
    <div className="il-page">
      <EyebrowHeader eyebrow="Active Program" title={activeProgram.name} sub={`${computeDaysPerWeek(activeProgram)} days/wk`} />
      <SegTabs options={[{ id: "today", label: "Today" }, { id: "progress", label: "Progress" }]} value={view} onChange={onViewChange} />

      {view === "progress" ? (
        <ProgressPanel records={records} catalog={catalog} entries={workoutEntries} unit={unit} />
      ) : (
        <>
          <div className="tr-daystriphead">
            <span>{fmtDateFull(selectedDate)}</span>
            {selectedDate !== today() && <button type="button" className="il-textbtn" onClick={() => setSelectedDate(today())}>Jump to today</button>}
          </div>
          <div className="tr-daystrip">
            <button type="button" className="il-icon-btn" aria-label="Previous day" onClick={() => setSelectedDate((d) => addDays(d, -1))}><ChevronLeft size={16} /></button>
            <div className="tr-daystrip-cells">
              {DAY_KEYS.map((k, i) => {
                const d = weekDates[i];
                const dd = activeProgram.days[k];
                return (
                  <button
                    type="button"
                    key={k}
                    className={`tr-daycell ${d === selectedDate ? "active" : ""} ${dd.type === "rest" ? "rest" : ""}`}
                    onClick={() => setSelectedDate(d)}
                  >
                    <span className="tr-dayabbr">{DAY_LABELS[k]}</span>
                    <span className="tr-daycell-name">{dd.type === "training" ? (dd.dayName || "Train") : "Rest"}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" className="il-icon-btn" aria-label="Next day" onClick={() => setSelectedDate((d) => addDays(d, 1))}><ChevronRight size={16} /></button>
          </div>

          {day?.type === "rest" ? (
            <div className="tr-restday">
              <Moon size={30} />
              <div className="tr-restday-title">Rest</div>
              <p>Light walk, mobility, foam rolling. Let the muscles repair.</p>
              {next && <button type="button" className="il-btn ghost" onClick={() => setSelectedDate(next.date)}>Next Session · {next.name.toUpperCase()} <ChevronRight size={14} /></button>}
            </div>
          ) : (
            <TrainingDay
              day={day} catalog={catalog} ownedEquipment={ownedEquipment}
              date={selectedDate} workoutEntries={workoutEntries} unit={unit}
              onLogSets={onLogSets} onSetNote={onSetNote}
            />
          )}
        </>
      )}
    </div>
  );
}

function TrainingDay({ day, catalog, ownedEquipment, date, workoutEntries, unit, onLogSets, onSetNote }) {
  const totalLifts = day.sections.reduce((n, s) => n + s.exercises.length, 0);
  return (
    <>
      <div className="tr-trainhead">
        <div className="tr-title" style={{ fontSize: 18 }}>{day.dayName || "Training"}</div>
        <div className="il-dim">{totalLifts} lift{totalLifts === 1 ? "" : "s"}</div>
      </div>
      {day.sections.map((section) => (
        <div key={section.id} className="tr-section">
          <div className="il-setslabel" style={{ marginBottom: 8 }}>{section.name}</div>
          {section.exercises.map((pe) => {
            const entry = catalogById(catalog, pe.exerciseId);
            if (!entry) return null;
            return (
              <TodayExerciseCard
                key={pe.id}
                entry={entry} programExercise={pe} ownedEquipment={ownedEquipment}
                date={date} workoutEntries={workoutEntries} unit={unit}
                onLogSets={onLogSets} onSetNote={onSetNote}
              />
            );
          })}
        </div>
      ))}
    </>
  );
}

function TodayExerciseCard({ entry, programExercise, ownedEquipment, date, workoutEntries, unit, onLogSets, onSetNote }) {
  const [open, setOpen] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [showNote, setShowNote] = useState(false);

  const todayEntry = workoutEntries.find((e) => e.date === date && e.exercise.toLowerCase() === entry.name.toLowerCase());
  const lastEntry = useMemo(() => {
    return [...workoutEntries].filter((e) => e.exercise.toLowerCase() === entry.name.toLowerCase() && e.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
  }, [workoutEntries, entry.name, date]);

  const targetReps = typeof programExercise.reps === "object" ? programExercise.reps.min : programExercise.reps;
  const setCount = Math.max(programExercise.sets, todayEntry?.sets?.length || 0);

  const [rows, setRows] = useState(() =>
    Array.from({ length: setCount }, (_, i) => {
      const logged = todayEntry?.sets?.[i];
      const prior = lastEntry?.sets?.[i];
      return {
        reps: logged ? String(logged.reps) : "",
        weight: logged ? String(logged.weight) : prior ? String(prior.weight) : "",
        done: !!logged,
      };
    })
  );

  function updateRow(i, patch) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function addSet() {
    setRows((r) => [...r, { reps: String(targetReps || ""), weight: r[r.length - 1]?.weight || "", done: false }]);
  }
  function removeSet() {
    setRows((r) => (r.length > 1 ? r.slice(0, -1) : r));
  }
  function toggleDone(i) {
    const nextRows = rows.map((row, idx) => (idx === i ? { ...row, done: !row.done } : row));
    setRows(nextRows);
    const cleanSets = nextRows.filter((r) => r.done && r.reps && r.weight).map((r) => ({ reps: Number(r.reps), weight: Number(r.weight), warmup: false }));
    onLogSets(date, entry.name, entry.group, cleanSets);
  }

  const missing = missingEquipment(entry, ownedEquipment);

  return (
    <ExerciseCard entry={entry} programExercise={programExercise} variant="today" ownedEquipment={ownedEquipment} onInfo={() => setOpen((o) => !o)}>
      {missing.length > 0 && <Badge tone="danger">MISSING {missing[0].toUpperCase()} · SWAP</Badge>}
      <button type="button" className="il-textbtn" style={{ marginTop: 6 }} onClick={() => setOpen((o) => !o)}>
        {open ? "Hide sets" : "Log sets"}
      </button>
      {open && (
        <div className="tr-todaybody">
          <div className="tr-todayactions">
            <button type="button" className="il-btn ghost small" onClick={() => setShowCalc(true)}><CalculatorIcon size={13} /> Plate Calculator</button>
            <RestTimerButton seconds={180} />
          </div>
          {rows.map((row, i) => (
            <div className={`tr-setrow ${row.done ? "done" : ""}`} key={i}>
              <span className="il-setnum">{i + 1}</span>
              <input type="number" min="0" inputMode="decimal" placeholder="0" value={row.weight} onChange={(e) => updateRow(i, { weight: e.target.value })} />
              <span className="tr-x">LBS</span>
              <span className="tr-x">×</span>
              <input type="number" min="0" inputMode="numeric" placeholder="0" value={row.reps} onChange={(e) => updateRow(i, { reps: e.target.value })} />
              <button type="button" className={`tr-checkbtn ${row.done ? "active" : ""}`} aria-label="Mark set complete" onClick={() => toggleDone(i)}>
                <Check size={14} strokeWidth={3} />
              </button>
            </div>
          ))}
          <div className="tr-dayactions">
            <button type="button" className="il-addbtn" onClick={addSet}><Plus size={13} /> Add Set</button>
            <button type="button" className="il-addbtn" onClick={removeSet}>− Remove Set</button>
          </div>
          {showNote ? (
            <textarea
              className="tr-notearea" placeholder="Note for today…" defaultValue={todayEntry?.note || ""}
              onBlur={(e) => onSetNote(date, entry.name, entry.group, e.target.value)}
            />
          ) : (
            <button type="button" className="il-textbtn" onClick={() => setShowNote(true)}>Add a note for today</button>
          )}
        </div>
      )}
      {showCalc && (
        <PlateCalculatorModal targetWeight={Number(rows[0]?.weight) || 0} unit={unit} onClose={() => setShowCalc(false)} />
      )}
    </ExerciseCard>
  );
}

/* ---------------------------------- Progress panel (volume / progression / records) ---------------------------------- */

function groupFor(exerciseName, catalog) {
  const hit = catalog.find((c) => c.name.toLowerCase() === exerciseName.toLowerCase());
  return hit ? hit.group : UNCATEGORIZED;
}
function bucketByGroup(items, getName, catalog) {
  const byGroup = {};
  for (const item of items) {
    const g = groupFor(getName(item), catalog);
    if (!byGroup[g]) byGroup[g] = [];
    byGroup[g].push(item);
  }
  const ordered = [...MUSCLE_GROUPS.filter((g) => byGroup[g]), ...Object.keys(byGroup).filter((g) => !MUSCLE_GROUPS.includes(g))];
  return ordered.map((g) => ({ group: g, items: byGroup[g] }));
}
const setVolume = (s) => (Number(s.weight) || 0) * (Number(s.reps) || 0);
function weeklyVolumeByGroup(workoutEntries, catalog) {
  const byWeek = {};
  for (const entry of workoutEntries) {
    const wk = weekStart(entry.date);
    const g = groupFor(entry.exercise, catalog);
    if (!byWeek[wk]) byWeek[wk] = {};
    const vol = entry.sets.filter((s) => !s.warmup).reduce((sum, s) => sum + setVolume(s), 0);
    byWeek[wk][g] = (byWeek[wk][g] || 0) + vol;
  }
  return byWeek;
}

function ProgressPanel({ records, catalog, entries, unit }) {
  const [chartExercise, setChartExercise] = useState("");
  const [volumeGroup, setVolumeGroup] = useState("");

  const allExerciseNames = useMemo(() => Array.from(new Set(entries.map((e) => e.exercise))).sort(), [entries]);
  const groupedProgressionOptions = useMemo(() => bucketByGroup(allExerciseNames, (n) => n, catalog), [allExerciseNames, catalog]);
  const groupedRecords = useMemo(() => bucketByGroup(records, (r) => r.exercise, catalog), [records, catalog]);
  const volumeByWeek = useMemo(() => weeklyVolumeByGroup(entries, catalog), [entries, catalog]);
  const weekKeys = useMemo(() => Object.keys(volumeByWeek).sort(), [volumeByWeek]);
  const currentWeekKey = weekStart(today());
  const thisWeekVolume = volumeByWeek[currentWeekKey] || {};
  const groupsWithVolume = useMemo(() => MUSCLE_GROUPS.filter((g) => weekKeys.some((wk) => volumeByWeek[wk][g])), [weekKeys, volumeByWeek]);
  const volumeChartData = useMemo(() => {
    if (!volumeGroup) return [];
    const last = weekKeys.slice(-8);
    return last.map((wk) => ({ week: fmtDate(wk), volume: Math.round(volumeByWeek[wk][volumeGroup] || 0) }));
  }, [weekKeys, volumeByWeek, volumeGroup]);

  useEffect(() => {
    if (allExerciseNames.length && !allExerciseNames.includes(chartExercise)) setChartExercise(allExerciseNames[0]);
    if (!allExerciseNames.length) setChartExercise("");
  }, [allExerciseNames]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (groupsWithVolume.length && !groupsWithVolume.includes(volumeGroup)) setVolumeGroup(groupsWithVolume[0]);
    if (!groupsWithVolume.length) setVolumeGroup("");
  }, [groupsWithVolume]); // eslint-disable-line react-hooks/exhaustive-deps

  const progressionData = useMemo(() => {
    if (!chartExercise) return [];
    return entries
      .filter((e) => e.exercise === chartExercise)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => {
        const working = e.sets.filter((s) => !s.warmup);
        if (!working.length) return null;
        const top = working.reduce((best, s) => (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps) ? s : best), null);
        return { date: fmtDate(e.date), weight: top.weight, est1rm: epley(top.weight, top.reps) };
      })
      .filter(Boolean);
  }, [entries, chartExercise]);

  return (
    <>
      <div className="il-section" style={{ marginTop: 18 }}>
        <div className="il-section-head" style={{ marginTop: 0 }}>
          <h2>Weekly volume</h2>
          {groupsWithVolume.length > 0 && (
            <select className="il-select" aria-label="Volume group" value={volumeGroup} onChange={(e) => setVolumeGroup(e.target.value)}>
              {groupsWithVolume.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
        </div>
        {groupsWithVolume.length === 0 ? (
          <div className="il-empty"><p>Log a few working sets to see weekly volume by muscle group.</p></div>
        ) : (
          <>
            <div className="il-chartcard">
              <div className="il-chartlabel">{volumeGroup} · working sets only, weight × reps</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={volumeChartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="week" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "var(--text)" }} cursor={{ fill: "var(--fill-hover)" }} />
                  <Bar dataKey="volume" fill="var(--accent)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="il-volumerow">
              {MUSCLE_GROUPS.filter((g) => thisWeekVolume[g]).map((g) => (
                <div className="il-volumechip" key={g}>
                  <span>{g}</span>
                  <strong>{Math.round(thisWeekVolume[g]).toLocaleString()} {unit}</strong>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="il-section">
        <div className="il-section-head">
          <h2>Progression</h2>
          {allExerciseNames.length > 0 && (
            <select className="il-select" aria-label="Progression exercise" value={chartExercise} onChange={(e) => setChartExercise(e.target.value)}>
              {groupedProgressionOptions.map((bucket) => (
                <optgroup key={bucket.group} label={bucket.group}>
                  {bucket.items.map((n) => <option key={n} value={n}>{n}</option>)}
                </optgroup>
              ))}
            </select>
          )}
        </div>
        {progressionData.length > 1 ? (
          <div className="il-chartcard">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={progressionData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} domain={["dataMin - 5", "dataMax + 5"]} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "var(--text)" }} />
                <Line type="monotone" dataKey="weight" stroke="var(--accent)" strokeWidth={2} dot={{ r: 2.5, fill: "var(--accent)" }} />
                <Line type="monotone" dataKey="est1rm" stroke="var(--accent-soft)" strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2, fill: "var(--accent-soft)" }} />
              </LineChart>
            </ResponsiveContainer>
            <div className="il-legend">
              <span><i style={{ background: "var(--accent)" }} /> Top set weight</span>
              <span><i style={{ background: "var(--accent-soft)" }} /> Estimated 1RM</span>
            </div>
          </div>
        ) : (
          <div className="il-empty"><p>{allExerciseNames.length ? "Log this exercise twice to see progression." : "Log a lift to see progression here."}</p></div>
        )}
      </div>

      <div className="il-section">
        <div className="il-section-head" style={{ marginTop: 0 }}><h2>Records</h2></div>
        {records.length === 0 ? (
          <div className="il-empty"><p>No records yet — log your first lift on Today.</p></div>
        ) : (
          <div className="il-grouplist">
            {groupedRecords.map((bucket) => (
              <CollapsibleRow key={bucket.group} defaultOpen header={bucket.group} sub={`${bucket.items.length} lift${bucket.items.length === 1 ? "" : "s"}`}>
                <div className="il-list">
                  {bucket.items.map((r) => (
                    <div className="il-row" key={r.exercise}>
                      <div className="il-row-main">{r.exercise}</div>
                      <div className="il-row-meta">{r.weight} {unit} × {r.reps} <span className="il-dim">({r.est1rm} {unit})</span></div>
                      <div className="il-row-date">{fmtDate(r.date)}</div>
                    </div>
                  ))}
                </div>
              </CollapsibleRow>
            ))}
          </div>
        )}
      </div>
    </>
  );
}