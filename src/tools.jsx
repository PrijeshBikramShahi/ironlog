import React, { useMemo, useEffect, useState } from "react";
import { Activity, Flame, Percent, Scale, Target, Utensils } from "lucide-react";

/* ------------------------------------------------------------------ helpers */

const round0 = (n) => Math.round(n);
const round1 = (n) => Math.round(n * 10) / 10;
const num = (s) => {
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const lbToKg = (v) => Math.round(v * 0.453592 * 10) / 10;
const kgToLb = (v) => Math.round((v / 0.453592) * 10) / 10;
const inToCm = (v) => Math.round(v * 2.54 * 10) / 10;
const cmToIn = (v) => Math.round((v / 2.54) * 10) / 10;
const today = () => new Date().toISOString().slice(0, 10);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Interprets the shared input strings (in the user's units) as metric numbers.
function derive(inputs, units) {
  const weight = num(inputs.weight);
  const height = num(inputs.height);
  return {
    kg: units.weight === "kg" ? weight : lbToKg(weight),
    cm: units.measure === "cm" ? height : inToCm(height),
    age: num(inputs.age),
    bf: num(inputs.bodyFat),
    neck: units.measure === "cm" ? num(inputs.neck) : inToCm(num(inputs.neck)),
    waist: units.measure === "cm" ? num(inputs.waist) : inToCm(num(inputs.waist)),
    hip: units.measure === "cm" ? num(inputs.hip) : inToCm(num(inputs.hip)),
    sex: inputs.sex,
  };
}
const dispKg = (kg, unit) => (unit === "lb" ? kgToLb(kg) : kg);

function ageFromBirthDate(bd) {
  if (!bd) return null;
  const birth = new Date(bd);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age > 0 && age < 120 ? age : null;
}
function birthDateFromAge(years) {
  const dt = new Date();
  if (years > 0) dt.setFullYear(dt.getFullYear() - years);
  return dt.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ BMI */

export function bmiValue(kg, cm) {
  if (!(kg > 0) || !(cm > 0)) return null;
  const m = cm / 100;
  return kg / (m * m);
}
const BMI_TIERS = [
  { up: 16, label: "Severe thinness", tier: 0 },
  { up: 17, label: "Moderate thinness", tier: 0 },
  { up: 18.5, label: "Mild thinness", tier: 0 },
  { up: 25, label: "Normal", tier: 1 },
  { up: 30, label: "Overweight", tier: 2 },
  { up: 35, label: "Obesity I", tier: 3 },
  { up: 40, label: "Obesity II", tier: 3 },
  { up: Infinity, label: "Obesity III", tier: 3 },
];
export function bmiCategory(v) {
  if (v === null || typeof v !== "number") return null;
  return BMI_TIERS.find((t) => v < t.up);
}
export function healthyWeightRange(cm) {
  if (!(cm > 0)) return null;
  const m = cm / 100;
  return [round1(18.5 * m * m), round1(25 * m * m)];
}
export const bmiPrime = (v) => (v && Number.isFinite(v) ? v / 25 : null);
export const ponderal = (kg, cm) => (cm > 0 ? kg / Math.pow(cm / 100, 3) : null);

/* ------------------------------------------------------------------ BMR / TDEE */

export const FORMULA_OPTIONS = [
  { id: "mifflin", label: "Mifflin-St Jeor" },
  { id: "hb", label: "Revised Harris-Benedict" },
  { id: "katch", label: "Katch-McArdle" },
];

export const ACTIVITY_LEVELS = [
  { id: "sedentary", label: "Sedentary", sub: "little or no exercise", factor: 1.2 },
  { id: "light", label: "Light", sub: "exercise 1–3 times/week", factor: 1.375 },
  { id: "moderate", label: "Moderate", sub: "exercise 4–5 times/week", factor: 1.465 },
  { id: "active", label: "Active", sub: "daily exercise or intense 3–4×/wk", factor: 1.55 },
  { id: "very", label: "Very active", sub: "intense exercise 6–7 times/week", factor: 1.725 },
  { id: "extra", label: "Extra active", sub: "very intense daily or physical job", factor: 1.9 },
];
const activityById = (id) => ACTIVITY_LEVELS.find((a) => a.id === id) || ACTIVITY_LEVELS[2];
const formulaLabel = (id) => (FORMULA_OPTIONS.find((f) => f.id === id) || FORMULA_OPTIONS[0]).label;

// W in kg, H in cm, A in years, BF in % (Katch only).
export function bmrCalc({ kg, cm, age, bf }, sex, formula) {
  if (!(kg > 0) || !(cm > 0) || !(age > 0)) return null;
  if (formula === "katch") {
    if (!(bf > 0)) return null;
    return 370 + 21.6 * (kg * (1 - bf / 100));
  }
  if (formula === "hb") {
    return sex === "male"
      ? 13.397 * kg + 4.799 * cm - 5.677 * age + 88.362
      : 9.247 * kg + 3.098 * cm - 4.33 * age + 447.593;
  }
  return sex === "male" ? 10 * kg + 6.25 * cm - 5 * age + 5 : 10 * kg + 6.25 * cm - 5 * age - 161;
}
export const tdeeCalc = (bmr, activityId) => (bmr != null ? bmr * activityById(activityId).factor : null);

/* ------------------------------------------------------------------ body fat */

// U.S. Navy method — all circumferential values in cm. Returns % or null.
export function navyBodyFat(d, sex) {
  if (!(d.cm > 0)) return null;
  if (sex === "male") {
    if (d.waist <= 0 || d.neck <= 0) return null;
    const diff = d.waist - d.neck;
    if (!(diff > 0)) return null;
    return 495 / (1.0324 - 0.19077 * Math.log10(diff) + 0.15456 * Math.log10(d.cm)) - 450;
  }
  if (sex === "female") {
    if (d.waist <= 0 || d.neck <= 0 || d.hip <= 0) return null;
    const diff = d.waist + d.hip - d.neck;
    if (!(diff > 0)) return null;
    return 495 / (1.29579 - 0.35004 * Math.log10(diff) + 0.221 * Math.log10(d.cm)) - 450;
  }
  return null;
}

// Deurenberg BMI method — needs the BMI value and age.
export function bmiBodyFat(bmi, age, sex) {
  if (bmi == null || !(age > 0)) return null;
  return 1.2 * bmi + 0.23 * age - (sex === "male" ? 16.2 : 5.4);
}

// American Council on Exercise categories.
export function aceCategory(sex, bf) {
  if (!sex || bf == null) return null;
  if (sex === "male") {
    if (bf < 6) return "Essential fat";
    if (bf <= 13) return "Athletes";
    if (bf <= 17) return "Fitness";
    if (bf <= 24) return "Average";
    return "Obese";
  }
  if (bf < 14) return "Essential fat";
  if (bf <= 20) return "Athletes";
  if (bf <= 24) return "Fitness";
  if (bf <= 31) return "Average";
  return "Obese";
}

const JP_IDEAL = [
  { age: 20, m: 8.5, f: 17.7 },
  { age: 25, m: 10.5, f: 18.4 },
  { age: 30, m: 12.7, f: 19.3 },
  { age: 35, m: 13.7, f: 21.5 },
  { age: 40, m: 15.3, f: 22.2 },
  { age: 45, m: 16.4, f: 22.9 },
  { age: 50, m: 18.9, f: 25.2 },
  { age: 55, m: 20.9, f: 26.3 },
];
export function idealBodyFat(sex, age) {
  if (!sex || !(age > 0)) return null;
  const key = sex === "male" ? "m" : "f";
  if (age <= 20) return JP_IDEAL[0][key];
  if (age >= 55) return JP_IDEAL[JP_IDEAL.length - 1][key];
  for (let i = 1; i < JP_IDEAL.length; i++) {
    if (age <= JP_IDEAL[i].age) {
      const a = JP_IDEAL[i - 1];
      const b = JP_IDEAL[i];
      const t = (age - a.age) / (b.age - a.age);
      return a[key] + (b[key] - a[key]) * t;
    }
  }
  return JP_IDEAL[JP_IDEAL.length - 1][key];
}

/* ------------------------------------------------------------------ ideal weight */

export function idealWeights(sex, cm) {
  const inches = cm / 2.54;
  const over = Math.max(0, inches - 60);
  return sex === "male"
    ? { hamwi: 48 + 2.7 * over, devine: 50 + 2.3 * over, robinson: 52 + 1.9 * over, miller: 56.2 + 1.41 * over }
    : { hamwi: 45.5 + 2.2 * over, devine: 45.5 + 2.3 * over, robinson: 49 + 1.7 * over, miller: 53.1 + 1.36 * over };
}

/* ------------------------------------------------------------------ macros */

export const MACRO_PLANS = [
  { id: "balanced", label: "Balanced", p: 30, c: 40, f: 30, meta: "30% protein · 40% carbs · 30% fat" },
  { id: "lowcarb", label: "Low-carb", p: 35, c: 20, f: 45, meta: "35% protein · 20% carbs · 45% fat" },
  { id: "highprotein", label: "High-protein", p: 40, c: 35, f: 25, meta: "40% protein · 35% carbs · 25% fat" },
  { id: "keto", label: "Keto", p: 25, c: 5, f: 70, meta: "25% protein · 5% carbs · 70% fat" },
];
// Grams/day for a calorie target; protein floored at 1.6 g/kg bodyweight.
export function macroSplit(calories, planId, weightKg) {
  const plan = MACRO_PLANS.find((p) => p.id === planId) || MACRO_PLANS[0];
  let protein = (calories * plan.p) / 100 / 4;
  const fat = (calories * plan.f) / 100 / 9;
  if (weightKg > 0) protein = Math.max(protein, 1.6 * weightKg);
  const carbs = Math.max(0, (calories - protein * 4 - fat * 9) / 4);
  return { protein, carbs, fat };
}

export const GOALS = [
  { id: "maintain", label: "Maintain", d: 0 },
  { id: "lose25", label: "Lose 0.25 kg/wk", d: -250 },
  { id: "lose50", label: "Lose 0.5 kg/wk", d: -500 },
  { id: "lose100", label: "Lose 1 kg/wk", d: -1000 },
  { id: "gain25", label: "Gain 0.25 kg/wk", d: 250 },
  { id: "gain50", label: "Gain 0.5 kg/wk", d: 500 },
];

/* ------------------------------------------------------------------ tools registry */

export const TOOLS = [
  { id: "bmi", label: "BMI", icon: Scale },
  { id: "bodyfat", label: "Body Fat", icon: Percent },
  { id: "bmr", label: "BMR", icon: Activity },
  { id: "calories", label: "Calories", icon: Flame },
  { id: "macros", label: "Macros", icon: Utensils },
  { id: "ideal", label: "Ideal Weight", icon: Target },
];

// Which shared input fields each calculator needs. A "bodyFat" field is
// appended automatically when the Katch-McArdle BMR formula is selected.
/* ------------------------------------------------------------------ shared UI bits */

function Field({ label, value, onChange, placeholder }) {
  return (
    <div className="il-field">
      <label>{label}</label>
      <input
        type="number"
        step="0.1"
        min="0"
        inputMode="decimal"
        placeholder={placeholder || "0.0"}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

function ResultCard({ label, primary, unit, sub, children }) {
  return (
    <div className="il-resultcard">
      <div className="il-result-label">{label}</div>
      <div className="il-result-hero">
        {primary}
        {unit && <span className="il-result-unit">{unit}</span>}
      </div>
      {sub && <div className="il-result-sub">{sub}</div>}
      {children && <div className="il-result-rows">{children}</div>}
    </div>
  );
}
const R = ({ k, v }) => (
  <div className="il-result-row">
    <span>{k}</span>
    <span>{v}</span>
  </div>
);

function ResultEmpty({ text }) {
  return (
    <div className="il-empty" style={{ marginTop: 16 }}>
      <p>{text}</p>
    </div>
  );
}

const TIER_COLORS = ["--tier-under", "--accent", "--tier-over", "--danger"];
function TierChip({ tier, label }) {
  const color = TIER_COLORS[tier] || "--text-muted";
  return (
    <span className="il-tag" style={{ color: `var(${color})`, fontWeight: 600, border: `1px solid var(${color})`, background: "transparent" }}>
      {label}
    </span>
  );
}

// Horizontal category band with a marker at `value`.
function CatBar({ domain, segments, value, labels }) {
  const [min, max] = domain;
  const range = max - min || 1;
  const stops = [];
  for (const s of segments) {
    const a = (((s.from - min) / range) * 100).toFixed(2);
    const b = Math.max(a, (((s.to - min) / range) * 100).toFixed(2));
    stops.push(`${s.color} ${a}%`, `${s.color} ${b}%`);
  }
  const marker = clamp(((value - min) / range) * 100, 0, 100);
  return (
    <div style={{ marginTop: 8 }}>
      <div className="il-catbar">
        <div className="il-catbar-fill" style={{ background: `linear-gradient(90deg, ${stops.join(",")})` }} />
        <div className="il-catmarker" style={{ left: `${marker}%` }} />
      </div>
      {labels && (
        <div className="il-cat-labels">
          {labels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ shared input fields */

// Which shared input fields each calculator needs. A "bodyFat" field is
// appended automatically when the Katch-McArdle BMR formula is selected.
const FIELDS_FOR = {
  bmi: ["weight", "height"],
  bodyfat: ["sex", "age", "weight", "height", "neck", "waist", "hip"],
  bmr: ["sex", "age", "weight", "height", "formula"],
  calories: ["sex", "age", "weight", "height", "formula", "activity"],
  macros: ["sex", "age", "weight", "height", "formula", "activity"],
  ideal: ["sex", "height"],
};

// Shared input form — only shows the fields the active calculator needs. All
// values live in one ToolsTab-level state object, so editing BMI's weight is
// reflected immediately in the BMR / Calorie / Macro cards and vice versa.
function InputsCard({ activeId, inputs, setInputs, units, formula, setFormula, activity, setActivity, onReload, onSaveProfile, showSaveProfile }) {
  const fields = FIELDS_FOR[activeId] || [];
  const set = (key) => (e) => setInputs((p) => ({ ...p, [key]: e.target.value }));

  return (
    <div className="il-form" style={{ marginBottom: 0 }}>
      <div className="il-inputs-head">
        <span className="il-setslabel">Your inputs</span>
        <span className="il-inputs-note" style={{ fontSize: 11 }}>
          pre-filled from your profile &amp; latest log
        </span>
      </div>
      <div className="il-inputgrid">
        {fields.map((f) => {
          if (f === "sex") {
            return (
              <div className="il-field" key="sex">
                <label>Sex</label>
                <div className="il-toggle">
                  {["male", "female"].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={inputs.sex === s ? "active" : ""}
                      onClick={() => setInputs((p) => ({ ...p, sex: s }))}
                    >
                      {s === "male" ? "Male" : "Female"}
                    </button>
                  ))}
                </div>
              </div>
            );
          }
          if (f === "formula") {
            return (
              <div className="il-field il-field-wide" key="formula">
                <label>BMR formula</label>
                <div className="il-katchrow">
                  <select value={formula} onChange={(e) => setFormula(e.target.value)}>
                    {FORMULA_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                  {formula === "katch" && (
                    <Field label="Body fat (%)" value={inputs.bodyFat} onChange={set("bodyFat")} />
                  )}
                </div>
              </div>
            );
          }
          if (f === "activity") {
            return (
              <div className="il-field il-field-wide" key="activity">
                <label>Activity level</label>
                <select value={activity} onChange={(e) => setActivity(e.target.value)}>
                  {ACTIVITY_LEVELS.map((a) => (
                    <option key={a.id} value={a.id}>{a.label} — {a.sub}</option>
                  ))}
                </select>
              </div>
            );
          }
          if (f === "weight") return <Field key="weight" label={`Weight (${units.weight})`} value={inputs.weight} onChange={set("weight")} placeholder="e.g. 72" />;
          if (f === "height") return <Field key="height" label={`Height (${units.measure})`} value={inputs.height} onChange={set("height")} placeholder="e.g. 178" />;
          if (f === "age") return <Field key="age" label="Age (years)" value={inputs.age} onChange={set("age")} placeholder="e.g. 32" />;
          if (f === "neck") return <Field key="neck" label={`Neck (${units.measure})`} value={inputs.neck} onChange={set("neck")} />;
          if (f === "waist") return <Field key="waist" label={`Waist (${units.measure})`} value={inputs.waist} onChange={set("waist")} />;
          if (f === "hip") {
            if (inputs.sex !== "female") return null;
            return <Field key="hip" label={`Hip (${units.measure})`} value={inputs.hip} onChange={set("hip")} />;
          }
          return null;
        })}
      </div>
      <div className="il-inputsfoot">
        <button type="button" className="il-textbtn" onClick={onReload}>Use latest from log</button>
        {showSaveProfile && (
          <span className="il-inputsfoot-right">
            <button type="button" className="il-textbtn" onClick={onSaveProfile}>Save height &amp; sex to profile</button>
          </span>
        )}
      </div>
    </div>
  );
}

// Range bar with a shaded healthy zone, tick marks and the current value.
function RangeBar({ domain, healthy, markers, current }) {
  const [min, max] = domain;
  const range = max - min || 1;
  const pct = (v) => clamp(((v - min) / range) * 100, 0, 100);
  const h0 = healthy ? pct(healthy[0]) : null;
  const h1 = healthy ? pct(healthy[1]) : null;
  return (
    <div className="il-rangebox">
      <div className="il-range-track">
        <div
          className="il-range-healthy"
          style={h0 === null ? undefined : { left: `${h0}%`, width: `${Math.max(0.4, h1 - h0)}%` }}
        />
        {markers.map((m) => (
          <div
            key={m.label}
            className="il-range-mark"
            title={`${m.label}: ${round1(m.v)}`}
            style={{ left: `${pct(m.v)}%` }}
          />
        ))}
        {current != null && <div className="il-range-current" style={{ left: `${pct(current)}%` }} />}
      </div>
      <div className="il-range-scale">
        <span>{round1(min)}</span>
        <span>{round1(max)}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ BMI card */

const BMI_DOMAIN = [14, 42];
const BMI_SEGMENTS = [
  { from: 14, to: 18.5, color: "var(--tier-under)" },
  { from: 18.5, to: 25, color: "var(--accent)" },
  { from: 25, to: 30, color: "var(--tier-over)" },
  { from: 30, to: 42, color: "var(--danger)" },
];

function BMICard({ d, units }) {
  const bmi = bmiValue(d.kg, d.cm);
  const cat = bmiCategory(bmi);
  const range = healthyWeightRange(d.cm);
  if (bmi === null) {
    return <ResultEmpty text="Enter your weight and height to calculate BMI." />;
  }
  return (
    <>
      <ResultCard
        label="Body mass index"
        primary={round1(bmi)}
        unit="kg/m²"
        sub={cat ? <TierChip tier={cat.tier} label={cat.label} /> : undefined}
      >
        {range && (
          <R
            k="Healthy weight for height"
            v={`${round1(dispKg(range[0], units.weight))} – ${round1(dispKg(range[1], units.weight))} ${units.weight}`}
          />
        )}
        <R k="Healthy BMI range" v="18.5 – 25" />
        <R k="BMI Prime" v={round1(bmiPrime(bmi))} />
        <R k="Ponderal index" v={round1(ponderal(d.kg, d.cm))} />
      </ResultCard>

      <CatBar
        domain={BMI_DOMAIN}
        segments={BMI_SEGMENTS}
        value={bmi}
        labels={["Under", "Normal", "Over", "Obese"]}
      />

      {d.age > 0 && d.age < 20 && (
        <p className="il-modalnote">Ages 2–19 use age-and-sex adjusted BMI percentiles (CDC). Adult categories shown for reference.</p>
      )}
      <p className="il-modalnote">BMI can't tell muscle from fat — combine it with the Body Fat calculator for the full picture.</p>
    </>
  );
}

/* ------------------------------------------------------------------ BMR card */

function BMRCard({ d, units, formula, onGo }) {
  const bmr = bmrCalc(d, d.sex, formula);
  if (bmr === null) {
    const needBf = formula === "katch" && !(d.bf > 0);
    return (
      <ResultEmpty
        text={
          needBf
            ? "Katch-McArdle needs your body fat — use the Body Fat calculator or type it in above."
            : "Enter your age, sex, height and weight to estimate BMR."
        }
      />
    );
  }
  return (
    <>
      <ResultCard
        label="Basal metabolic rate"
        primary={round0(bmr)}
        unit="kcal/day"
        sub={`${formulaLabel(formula)} formula`}
      >
        {ACTIVITY_LEVELS.map((a) => (
          <R key={a.id} k={`${a.label} — ${a.sub}`} v={`${round0(bmr * a.factor)} kcal`} />
        ))}
      </ResultCard>
      <p className="il-modalnote">Mifflin-St Jeor is the most accurate general estimate. Katch-McArdle can be better if you're lean and know your body fat.</p>
      <button type="button" className="il-textbtn" style={{ marginTop: 2 }} onClick={() => onGo("calories")}>Open calorie calculator →</button>
    </>
  );
}

/* ------------------------------------------------------------------ calories card */

const DELTA_ROWS = [
  { id: "lose100", label: "Lose 1 kg/week", d: -1000 },
  { id: "lose50", label: "Lose 0.5 kg/week", d: -500 },
  { id: "lose25", label: "Lose 0.25 kg/week", d: -250 },
  { id: "maintain", label: "Maintain", d: 0 },
  { id: "gain25", label: "Gain 0.25 kg/week", d: 250 },
  { id: "gain50", label: "Gain 0.5 kg/week", d: 500 },
];

function CaloriesCard({ d, units, formula, activity, onGo }) {
  const bmr = bmrCalc(d, d.sex, formula);
  const maint = bmr != null ? tdeeCalc(bmr, activity) : null;
  if (maint === null) {
    return <ResultEmpty text="BMR needs age, sex, height and weight — fill those in above." />;
  }
  return (
    <>
      <ResultCard
        label="Daily calorie needs (maintenance)"
        primary={round0(maint)}
        unit="kcal/day"
        sub={`${formulaLabel(formula)} BMR ${round0(bmr)} kcal × ${activityById(activity).factor}`}
      >
        {DELTA_ROWS.map((r) => (
          <R key={r.id} k={r.label} v={`${round0(maint + r.d)} kcal`} />
        ))}
      </ResultCard>
      <p className="il-modalnote">Roughly 3,500 kcal ≈ 0.45 kg (1 lb) of body fat, so a −500 kcal/day deficit ≈ 0.5 kg/week. Cutting more than 1,000 kcal/day is not recommended.</p>
      <button type="button" className="il-textbtn" style={{ marginTop: 2 }} onClick={() => onGo("macros")}>Turn this into macros →</button>
    </>
  );
}

/* ------------------------------------------------------------------ body fat card */

const BF_SEGMENTS = {
  male: { domain: [2, 42], segments: [
    { from: 2, to: 6, color: "var(--tier-under)" },
    { from: 6, to: 13, color: "var(--accent-soft)" },
    { from: 13, to: 18, color: "var(--accent)" },
    { from: 18, to: 25, color: "var(--tier-over)" },
    { from: 25, to: 42, color: "var(--danger)" },
  ] },
  female: { domain: [8, 48], segments: [
    { from: 8, to: 14, color: "var(--tier-under)" },
    { from: 14, to: 21, color: "var(--accent-soft)" },
    { from: 21, to: 25, color: "var(--accent)" },
    { from: 25, to: 32, color: "var(--tier-over)" },
    { from: 32, to: 48, color: "var(--danger)" },
  ] },
};
const BF_LABELS = ["Essential", "Athlete", "Fitness", "Average", "Obese"];

function BodyFatCard({ d, units, onUseForBmr, onLogBodyFat }) {
  const bmi = bmiValue(d.kg, d.cm);
  const navy = (() => {
    const raw = navyBodyFat(d, d.sex);
    return raw == null || !Number.isFinite(raw) ? null : clamp(raw, 2, 75);
  })();
  const bmiBf = bmiBodyFat(bmi, d.age, d.sex);

  if (navy === null && bmiBf === null) {
    return (
      <ResultEmpty
        text={
          d.sex === "female"
            ? "Add sex, height, weight and neck, waist & hip measurements to estimate body fat."
            : "Add sex, height, weight and neck & waist measurements to estimate body fat."
        }
      />
    );
  }
  if (navy === null) {
    return (
      <>
        <ResultCard
          label="Body fat estimate (BMI method)"
          primary={round1(bmiBf)}
          unit="%"
          sub="Enter neck & waist (and hip for women) measurements for the more accurate US Navy estimate."
        />
        <p className="il-modalnote">BMI-method estimate (Deurenberg): an approximation from weight, height and age.</p>
      </>
    );
  }

  const cat = aceCategory(d.sex, navy);
  const fatMass = (d.kg * navy) / 100;
  const leanMass = d.kg - fatMass;
  const ideal = idealBodyFat(d.sex, d.age);
  const toLose = ideal != null && navy > ideal ? round1(((navy - ideal) / 100) * d.kg) : null;
  const seg = BF_SEGMENTS[d.sex] || BF_SEGMENTS.male;

  return (
    <>
      <ResultCard
        label="Body fat (U.S. Navy)"
        primary={round1(navy)}
        unit="%"
        sub={<span className="il-tag" style={{ fontWeight: 600, border: "1px solid var(--accent)", color: "var(--accent)", background: "transparent" }}>{cat}</span>}
      >
        <R k="Fat mass" v={`${round1(dispKg(fatMass, units.weight))} ${units.weight}`} />
        <R k="Lean mass" v={`${round1(dispKg(leanMass, units.weight))} ${units.weight}`} />
        {ideal != null && <R k={`Ideal for age ~${num(d.age) || "?"}`} v={`${round1(ideal)}%`} />}
        {toLose != null && <R k="Body fat to lose to reach ideal" v={`${toLose} ${units.weight}`} />}
        {bmiBf != null && <R k="BMI method estimate" v={`${round1(bmiBf)}%`} />}
      </ResultCard>

      <CatBar domain={seg.domain} segments={seg.segments} value={navy} labels={BF_LABELS} />

      <div className="il-linkrow" style={{ marginTop: 12 }}>
        <button type="button" className="il-btn ghost small" onClick={() => onUseForBmr(navy)}>Use for BMR</button>
        <button type="button" className="il-btn small" onClick={() => onLogBodyFat(navy)}>Log to today's weight</button>
      </div>
      <p className="il-modalnote">The Navy method is only accurate with consistent, correct tape placement.</p>
    </>
  );
}

/* ------------------------------------------------------------------ macros card */

function MacroCard({ d, units, formula, activity, onSetTargets }) {
  const bmr = bmrCalc(d, d.sex, formula);
  const maint = bmr != null ? tdeeCalc(bmr, activity) : null;
  const [planId, setPlanId] = useState("balanced");
  const [goalId, setGoalId] = useState("maintain");
  const [manual, setManual] = useState("");
  const goal = GOALS.find((g) => g.id === goalId) || GOALS[0];
  const manualCals = num(manual);
  const target = manualCals > 0 ? manualCals : maint != null ? maint + goal.d : null;
  const split = target ? macroSplit(target, planId, d.kg) : null;
  const plan = MACRO_PLANS.find((p) => p.id === planId) || MACRO_PLANS[0];

  if (target == null || split == null) {
    return <ResultEmpty text="Fill in age, sex, height and weight to get your daily calorie and macro targets." />;
  }

  const pCals = split.protein * 4;
  const cCals = split.carbs * 4;
  const fCals = split.fat * 9;
  const totalCals = pCals + cCals + fCals;
  const lowWarning = target < 1200;

  return (
    <>
      <ResultCard
        label="Daily calorie target"
        primary={round0(target)}
        unit="kcal"
        sub={manualCals > 0 ? "custom calorie target" : `${plan.label} · ${goal.label}${goal.d ? ` (${goal.d > 0 ? "+" : ""}${goal.d} kcal)` : ""}`}
      >
        <R k="Protein (min 1.6 g/kg)" v={`${round1(split.protein)} g · ${round0(pCals)} kcal`} />
        <R k="Carbs" v={`${round1(split.carbs)} g · ${round0(cCals)} kcal`} />
        <R k="Fat" v={`${round1(split.fat)} g · ${round0(fCals)} kcal`} />
      </ResultCard>

      <div className="il-macrobar">
        <span style={{ width: `${(pCals / totalCals) * 100}%`, background: "var(--accent)" }} />
        <span style={{ width: `${(cCals / totalCals) * 100}%`, background: "var(--accent-soft)" }} />
        <span style={{ width: `${(fCals / totalCals) * 100}%`, background: "var(--text-muted)" }} />
      </div>
      <div className="il-legend">
        <span><i style={{ background: "var(--accent)" }} /> Protein</span>
        <span><i style={{ background: "var(--accent-soft)" }} /> Carbs</span>
        <span><i style={{ background: "var(--text-muted)" }} /> Fat</span>
      </div>

      <div className="il-toolsblock">
        <div className="il-setslabel">Plan</div>
        <div className="il-planpick">
          {MACRO_PLANS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`il-planbtn ${planId === p.id ? "active" : ""}`}
              onClick={() => setPlanId(p.id)}
            >
              <span className="il-planbtn-name">{p.label}</span>
              <span className="il-planbtn-meta">{p.meta}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="il-toolsblock">
        <div className="il-setslabel">Goal <span className="il-dim">(base: {round0(maint)} kcal maintenance)</span></div>
        <div className="il-goalchips">
          {GOALS.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`il-toolchip ${goalId === g.id ? "active" : ""}`}
              onClick={() => { setGoalId(g.id); setManual(""); }}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {lowWarning && (
        <p className="il-modalnote" style={{ color: "var(--danger)" }}>Diets below ~1,200 kcal/day are hard to sustain and not recommended without supervision.</p>
      )}

      <div className="il-formactions full" style={{ marginTop: 14 }}>
        <button type="button" className="il-btn full" onClick={() => onSetTargets(target, split)}>Set as daily targets</button>
      </div>
      <p className="il-modalnote">Saved targets show up in Nutrition's "Today vs target" bars.</p>
    </>
  );
}

/* ------------------------------------------------------------------ ideal weight card */

function IdealWeightCard({ d, units }) {
  if (!d.sex || d.cm <= 0) {
    return <ResultEmpty text="Enter your sex and height to estimate ideal weight." />;
  }
  const iw = idealWeights(d.sex, d.cm);
  const range = healthyWeightRange(d.cm);
  const entries = [
    { label: "Hamwi (1964)", v: iw.hamwi },
    { label: "Devine (1974)", v: iw.devine },
    { label: "Robinson (1983)", v: iw.robinson },
    { label: "Miller (1983)", v: iw.miller },
  ];
  const disp = (kg) => dispKg(kg, units.weight);
  const currentDisp = d.kg > 0 ? disp(d.kg) : null;
  const values = entries.map((e) => disp(e.v)).concat(range ? [disp(range[0]), disp(range[1])] : [], currentDisp != null ? [currentDisp] : []);
  const domain = [Math.floor(Math.min(...values) - 2), Math.ceil(Math.max(...values) + 2)];
  const markers = entries.map((e) => ({ label: e.label, v: disp(e.v) }));

  return (
    <>
      <ResultCard
        label="Ideal weight estimates"
        primary={round1(disp(iw.devine))}
        unit={units.weight}
        sub="Devine (1974) — the most widely used formula"
      >
        {entries.map((e) => (
          <R key={e.label} k={e.label} v={`${round1(disp(e.v))} ${units.weight}`} />
        ))}
        {range && (
          <R k="Healthy BMI range (18.5–25)" v={`${round1(disp(range[0]))} – ${round1(disp(range[1]))} ${units.weight}`} />
        )}
      </ResultCard>

      <RangeBar domain={domain} healthy={range ? [disp(range[0]), disp(range[1])] : null} markers={markers} current={currentDisp} />
      <p className="il-modalnote">Green = healthy BMI band · thin ticks = the four formulas · dark tick = your current weight.</p>
      <p className="il-modalnote">These formulas come from medical dosing research and assume a medium frame — they ignore muscle mass and build.</p>
    </>
  );
}

/* ------------------------------------------------------------------ tools tab */

function computePreviews(d, formula, activity, units) {
  const bmi = bmiValue(d.kg, d.cm);
  const bmr = bmrCalc(d, d.sex, formula);
  const maint = bmr != null ? tdeeCalc(bmr, activity) : null;
  const navy = (() => {
    const raw = navyBodyFat(d, d.sex);
    return raw == null || !Number.isFinite(raw) ? null : clamp(raw, 2, 75);
  })();
  const bf = navy ?? bmiBodyFat(bmi, d.age, d.sex);
  const ideal = d.sex && d.cm > 0 ? idealWeights(d.sex, d.cm) : null;
  const macro = maint ? macroSplit(maint, "balanced", d.kg) : null;
  const ok = (n) => n != null && Number.isFinite(n);
  return {
    bmi: ok(bmi) ? `${round1(bmi)}` : null,
    bodyfat: ok(bf) && bf > 0 ? `${round1(bf)}%` : null,
    bmr: ok(bmr) ? `${round0(bmr)} kcal` : null,
    calories: ok(maint) ? `${round0(maint)} kcal` : null,
    macros: macro ? `${round1(macro.protein)}g P · ${round1(macro.carbs)}g C` : null,
    ideal: ideal ? `${round1(dispKg(ideal.devine, units.weight))} ${units.weight}` : null,
  };
}

export default function ToolsTab({
  settings,
  weightEntries,
  measureEntries,
  onAddWeight,
  onUpdateWeight,
  onUpdateSettings,
  onToast,
  requested,
  onRequestHandled,
}) {
  const units = useMemo(() => ({ weight: settings.weightUnit, measure: settings.measureUnit }), [settings.weightUnit, settings.measureUnit]);
  const profile = settings.profile || {};

  function buildInputs() {
    const lastW = weightEntries[weightEntries.length - 1];
    const lastM =
      [...measureEntries].reverse().find((m) => m.neck !== undefined || m.waist !== undefined) ||
      measureEntries[measureEntries.length - 1];
    const lastBf = [...weightEntries].reverse().find((e) => e.bodyFat !== undefined && e.bodyFat !== "");
    const age = ageFromBirthDate(profile.birthDate);
    return {
      weight: lastW ? String(lastW.weight) : "",
      height: profile.height != null ? String(profile.height) : "",
      age: age != null ? String(age) : "",
      sex: profile.sex || "",
      bodyFat: lastBf && lastBf.bodyFat !== "" ? String(lastBf.bodyFat) : "",
      neck: lastM && lastM.neck !== undefined ? String(lastM.neck) : "",
      waist: lastM && lastM.waist !== undefined ? String(lastM.waist) : "",
      hip: lastM && lastM.hips !== undefined ? String(lastM.hips) : "",
    };
  }

  const [inputs, setInputs] = useState(buildInputs);
  const [active, setActive] = useState("bmi");
  const [formula, setFormula] = useState("mifflin");
  const [activity, setActivity] = useState("moderate");

  // Jump to a requested calculator (dashboard / contextual quick links).
  useEffect(() => {
    if (requested) {
      setActive(requested);
      onRequestHandled();
    }
  }, [requested]); // eslint-disable-line react-hooks/exhaustive-deps

  // When units change, logged values are re-interpreted — re-seed from the log.
  useEffect(() => {
    setInputs(buildInputs());
  }, [units.weight, units.measure]); // eslint-disable-line react-hooks/exhaustive-deps

  const d = useMemo(() => derive(inputs, units), [inputs, units]);
  const pref = useMemo(() => computePreviews(d, formula, activity, units), [d, formula, activity, units]);

  const heightDiffers = String(inputs.height || "") !== String(profile.height || "");
  const sexDiffers = (inputs.sex || "") !== (profile.sex || "");
  const showSaveProfile = (sexDiffers || heightDiffers) && (inputs.sex || num(inputs.height) > 0);

  function saveProfile() {
    onUpdateSettings({
      profile: {
        sex: inputs.sex || profile.sex || "",
        height: inputs.height || profile.height || "",
        birthDate: num(inputs.age) > 0 ? birthDateFromAge(num(inputs.age)) : profile.birthDate || "",
      },
    });
    onToast("Profile saved — it'll be pre-filled next time");
  }
  function reloadFromLog() {
    setInputs(buildInputs());
    onToast("Pre-filled from your latest log");
  }
  function useBodyFatForBmr(bf) {
    setInputs((p) => ({ ...p, bodyFat: String(round1(bf)) }));
    setFormula("katch");
    setActive("bmr");
    onToast("Body fat linked to Katch-McArdle BMR");
  }
  function logBodyFatToday(bf) {
    const val = round1(bf);
    const todays = weightEntries.find((e) => e.date === today());
    if (todays) {
      onUpdateWeight(todays.id, { bodyFat: val });
    } else {
      const lastW = weightEntries[weightEntries.length - 1];
      onAddWeight({ date: today(), weight: lastW ? lastW.weight : "", bodyFat: val });
    }
    onToast("Body fat logged for today");
  }
  function setMacroTargets(target, split) {
    onUpdateSettings({
      dailyTargets: {
        calories: String(round0(target)),
        protein: String(round1(split.protein)),
        carbs: String(round1(split.carbs)),
        fat: String(round1(split.fat)),
      },
    });
    onToast("Daily targets set — check Nutrition");
  }

  return (
    <div className="il-page">
      <div className="il-pagehead">
        <h1>Calculators</h1>
        <p>Fast body-composition and nutrition estimates — pre-filled from your log.</p>
      </div>

      <div className="il-toolgrid">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              className={`il-tooltile ${active === t.id ? "active" : ""}`}
              onClick={() => setActive(t.id)}
              aria-pressed={active === t.id}
            >
              <span className="il-tooltile-top">
                <Icon size={16} strokeWidth={1.9} className="il-tooltile-icon" />
                <span className="il-tooltile-name">{t.label}</span>
              </span>
              <span className="il-tooltile-preview">{pref[t.id] || "—"}</span>
            </button>
          );
        })}
      </div>

      <InputsCard
        activeId={active}
        inputs={inputs}
        setInputs={setInputs}
        units={units}
        formula={formula}
        setFormula={setFormula}
        activity={activity}
        setActivity={setActivity}
        onReload={reloadFromLog}
        onSaveProfile={saveProfile}
        showSaveProfile={showSaveProfile}
      />

      {active === "bmi" && <BMICard d={d} units={units} />}
      {active === "bmr" && <BMRCard d={d} units={units} formula={formula} onGo={setActive} />}
      {active === "calories" && <CaloriesCard d={d} units={units} formula={formula} activity={activity} onGo={setActive} />}
      {active === "bodyfat" && <BodyFatCard d={d} units={units} onUseForBmr={useBodyFatForBmr} onLogBodyFat={logBodyFatToday} />}
      {active === "macros" && <MacroCard d={d} units={units} formula={formula} activity={activity} onSetTargets={setMacroTargets} />}
      {active === "ideal" && <IdealWeightCard d={d} units={units} />}

      <p className="il-modalnote" style={{ marginTop: 18 }}>
        Estimates only — not a substitute for professional medical advice.
      </p>
    </div>
  );
}