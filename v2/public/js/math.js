/**
 * The arithmetic. No DOM in here, so all of it runs under `node --test`.
 *
 *   mg per mL   = bottle mg / bac water mL
 *   mg per unit = mg per mL / 100          (U-100: 100 units = 1 mL)
 *   units       = dose mg / mg per unit
 */

import { frequency, syringe, BOTTLE_DAYS } from './data.js';

export const MAX_WATER_ML = 5;
export const DAY = 86400000;
const EPS = 1e-9;

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

/**
 * How far to pull the plunger for a dose, and what the nearest readable mark
 * really delivers. The rounded figure is the one people draw, so it is the one
 * every other number on screen is based on.
 */
export function draw({ strength, waterMl, doseMg, syringeUnits = 100 }) {
  const mgPerMl = strength > 0 && waterMl > 0 ? strength / waterMl : NaN;
  const mgPerUnit = mgPerMl / 100;
  const units = doseMg > 0 && mgPerUnit > 0 ? doseMg / mgPerUnit : NaN;
  const step = syringe(syringeUnits).step;
  const rounded = Number.isFinite(units) ? Math.round(units / step + EPS) * step : NaN;
  const actualMg = rounded * mgPerUnit;
  return {
    mgPerMl,
    mgPerUnit,
    units,
    rounded,
    ml: rounded / 100,
    actualMg,
    errorPct: doseMg > 0 && Number.isFinite(actualMg) ? ((actualMg - doseMg) / doseMg) * 100 : NaN,
    dosesPerBottle: doseMg > 0 && strength > 0 ? Math.floor(strength / doseMg + EPS) : NaN,
  };
}

/** The other direction: a sheet says "6 units", what dose is that? */
export function unitsToMg({ strength, waterMl, units }) {
  if (!(strength > 0) || !(waterMl > 0) || !(units >= 0)) return NaN;
  return (units / 100) * (strength / waterMl);
}

/** Below a few marks you are guessing, not measuring. */
export function smallestDose({ strength, waterMl, minUnits = 4 }) {
  if (!(strength > 0) || !(waterMl > 0)) return NaN;
  return (strength / waterMl / 100) * minUnits;
}

/** How many units the same draw moves by when the bottle changes. */
export function sheetFactor({ fromStrength, fromWaterMl, toStrength, toWaterMl }) {
  const before = fromStrength / fromWaterMl;
  const after = toStrength / toWaterMl;
  return before > 0 && after > 0 ? after / before : NaN;
}

/* ------------------------------------------------------------------ *
 * Choosing how much bac water to add
 * ------------------------------------------------------------------ */

const CLEAN_PER_UNIT = [0.001, 0.002, 0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10];

function cleanliness(mgPerUnit) {
  const hit = CLEAN_PER_UNIT.find((c) => near(mgPerUnit, c));
  if (hit == null) return 0;
  return Number.isInteger(Math.log10(hit)) ? 2 : 1;
}

/**
 * The amount of water that makes a schedule easiest to draw: every step fits
 * the syringe, lands on a readable mark, ideally on a whole mark, and one unit
 * is a round number. A first dose that cannot be measured is disqualifying
 * rather than something to trade off, so it is filtered first.
 */
export function suggestWater({ strength, doses = [], vialMl = MAX_WATER_ML, syringeUnits = 100 }) {
  const list = doses.filter((d) => d > 0).sort((a, b) => a - b);
  if (!(strength > 0) || !list.length) return null;
  const cap = Math.min(vialMl || MAX_WATER_ML, MAX_WATER_ML);

  const candidates = [];
  for (let i = 1; i * 0.5 <= cap + EPS; i += 1) {
    const ml = i * 0.5;
    const mgPerUnit = strength / ml / 100;
    const units = list.map((d) => d / mgPerUnit);
    const n = units.length;
    const fit = units.filter((u) => u <= syringeUnits + EPS).length / n;
    const readable = units.filter((u) => u >= 8 - EPS).length / n;
    const whole = units.filter((u) => near(u, Math.round(u))).length / n;
    const half = units.filter((u) => near(u * 2, Math.round(u * 2))).length / n;
    const clean = cleanliness(mgPerUnit);
    candidates.push({
      waterMl: ml,
      mgPerUnit,
      firstUnits: units[0],
      clean,
      score: fit * 40 + readable * 35 + whole * 25 + half * 5 + clean * 8 - ml * 0.12,
    });
  }

  const measurable = candidates.filter((c) => c.firstUnits >= 4 - EPS);
  const pool = measurable.length ? measurable : candidates;
  return [...pool].sort((a, b) => b.score - a.score)[0];
}

/**
 * Whether the water in this bottle causes a real problem for these doses: the
 * smallest lands on too few marks, the largest will not fit the syringe, or
 * the bottle cannot hold it. Only then is a different amount worth suggesting;
 * otherwise the amount on the person's sheet stays.
 */
export function waterProblem({ strength, waterMl, doses = [], syringeUnits = 100, vialMl = MAX_WATER_ML }) {
  const list = doses.filter((d) => d > 0);
  if (!(strength > 0) || !(waterMl > 0) || !list.length) return false;
  if (waterMl > Math.min(vialMl || MAX_WATER_ML, MAX_WATER_ML) + EPS) return true;
  const perUnit = strength / waterMl / 100;
  return Math.min(...list) / perUnit < 4 - EPS || Math.max(...list) / perUnit > syringeUnits + EPS;
}

/* ------------------------------------------------------------------ *
 * Checks
 * ------------------------------------------------------------------ */

/**
 * Everything that should stop or slow someone before they inject.
 * Levels: 'danger' (do not draw this), 'warn' (look again), 'info'.
 */
export function checks({
  p, doseMg, d, syringeUnits = 100, waterMl, hasHistory = false, previousMg = null,
}) {
  const out = [];
  if (!(doseMg > 0) || !d || !Number.isFinite(d.units)) return out;
  const name = p?.name && p.id !== 'other' ? p.name : 'this';

  const dosing = p?.dosing;
  if (dosing) {
    // Strictly above: the top of a schedule is reachable, not an error.
    if (doseMg > dosing.redline + EPS) {
      const fold = doseMg / dosing.redline;
      out.push({
        level: 'danger',
        text: fold >= 1.5
          ? `${mass(doseMg)} is ${round1(fold)}× the highest dose ${name} is given at anywhere (${mass(dosing.redline)}). That is usually a mixing mistake. Check the bottle strength and the water.`
          : `${mass(doseMg)} is above the highest dose ${name} is given at anywhere (${mass(dosing.redline)}).`,
      });
    } else if (doseMg > dosing.high + EPS) {
      out.push({ level: 'warn', text: `${mass(doseMg)} is above the usual range for ${name} (${mass(dosing.low)} to ${mass(dosing.high)}).` });
    } else if (doseMg < dosing.low - EPS) {
      out.push({ level: 'info', text: `${mass(doseMg)} is below the usual range (${mass(dosing.low)} to ${mass(dosing.high)}). Fine when easing in. Check the decimal point.` });
    }
  }

  const fd = p?.firstDose;
  if (fd && !hasHistory) {
    if (doseMg > fd.max + EPS) {
      out.push({
        level: 'danger',
        text: `If this is your first ${name} dose, it is too much. Start at ${mass(fd.recommended)} and never above ${mass(fd.max)} for a first dose. Already working up the schedule? Log a dose and this goes away.`,
      });
    } else if (doseMg > fd.recommended + EPS) {
      out.push({ level: 'warn', text: `For a first dose, ${mass(fd.recommended)} is the place to start.` });
    }
  }

  const syr = syringe(syringeUnits);
  if (d.units > syr.units + EPS) {
    out.push({ level: 'danger', text: `${num(d.rounded)} units will not fit in a ${syr.units}-unit syringe. Use a bigger syringe or less water.` });
  }

  const floor = p?.highRisk ? 4 : 2;
  if (d.units < floor - EPS) {
    const tips = [];
    if (syr.units > 30) tips.push('Use a 30-unit syringe, where the marks are furthest apart.');
    if (waterMl < MAX_WATER_ML - EPS) tips.push('More bac water, up to 5 mL, spreads the dose over more marks.');
    else tips.push(`At the full 5 mL the smallest dose this bottle can measure is about ${mass(d.mgPerUnit * 4)}.`);
    out.push({
      level: p?.highRisk ? 'danger' : 'warn',
      text: `${num(d.units)} units is too small to measure reliably. ${tips.join(' ')}`,
    });
  } else if (Number.isFinite(d.errorPct) && Math.abs(d.errorPct) >= 5) {
    out.push({
      level: 'warn',
      text: `The nearest mark is ${num(d.rounded)} units, which gives ${mass(d.actualMg)}: ${Math.round(Math.abs(d.errorPct))}% ${d.errorPct > 0 ? 'more' : 'less'} than ${mass(doseMg)}.`,
    });
  }

  if (waterMl > MAX_WATER_ML + EPS) {
    out.push({ level: 'warn', text: 'A bottle holds at most 5 mL of bac water.' });
  } else if (p?.vialMl && waterMl > p.vialMl + EPS) {
    out.push({ level: 'warn', text: `${num(waterMl)} mL may overfill this ${p.vialMl} mL bottle.` });
  }

  if (previousMg > 0 && doseMg > previousMg + EPS) {
    const fold = doseMg / previousMg;
    if (fold >= 2) {
      out.push({ level: 'danger', text: `That is ${round1(fold)}× your last dose (${mass(previousMg)}). Doubling in one step is how most people end up badly sick.` });
    } else if (fold > 1.55) {
      out.push({ level: 'warn', text: `That is a ${Math.round((fold - 1) * 100)}% jump from your last dose. Most schedules move in smaller steps.` });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Schedule, bottle and money
 * ------------------------------------------------------------------ */

function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY);
}

/**
 * Where a protocol stands today.
 * state: 'new' | 'due' | 'done' | 'later' | 'prn'
 */
export function dueStatus({ freq, lastAt, now = Date.now() }) {
  const f = frequency(freq);
  if (!lastAt) return { state: 'new' };
  const last = new Date(lastAt).getTime();
  if (f.every == null) return { state: 'prn', lastAt: last };

  if (f.every < 1) {
    const next = last + f.every * DAY;
    // Morning and evening doses: due again after most of the gap has passed.
    if (now >= next - 2 * 3600000) return { state: 'due', next };
    return { state: daysBetween(last, now) === 0 ? 'done' : 'later', next };
  }

  const nextDay = startOfDay(last) + Math.round(f.every) * DAY;
  if (now >= nextDay) {
    return { state: 'due', next: nextDay, lateDays: daysBetween(nextDay, now) };
  }
  return { state: daysBetween(last, now) === 0 ? 'done' : 'later', next: nextDay };
}

/**
 * What is left in the bottle that is mixed right now: doses logged since it
 * was mixed come out of it, and it gets thrown away 28 days after mixing
 * whatever is left.
 */
export function bottleStatus({ protocol, doses = [], now = Date.now() }) {
  const { strength, doseMg, mixedAt } = protocol;
  if (!(strength > 0) || !mixedAt) return null;
  const mixed = new Date(mixedAt).getTime();
  const used = doses
    .filter((x) => x.protocolId === protocol.id && new Date(x.at).getTime() >= startOfDay(mixed))
    .reduce((sum, x) => sum + (x.doseMg || 0), 0);
  const leftMg = Math.max(0, strength - used);
  const discardAt = mixed + BOTTLE_DAYS * DAY;
  return {
    usedMg: used,
    leftMg,
    dosesLeft: doseMg > 0 ? Math.floor(leftMg / doseMg + EPS) : NaN,
    discardAt,
    daysLeft: daysBetween(now, discardAt),
    expired: now >= discardAt,
  };
}

/**
 * The next step on a schedule, if the current dose is one of its steps.
 * Nothing moves by itself: this only says when a step up is normally due.
 */
export function nextStep({ p, doseMg, since, now = Date.now() }) {
  const ladder = p?.ladder ?? [];
  const i = ladder.findIndex((s) => near(s.dose, doseMg, 1e-3));
  if (i < 0 || i === ladder.length - 1) return null;
  const next = ladder[i + 1];
  if (!(next.dose > doseMg)) return null;
  const from = since ? new Date(since).getTime() : now;
  const readyAt = from + ladder[i].weeks * 7 * DAY;
  return { weeks: ladder[i].weeks, dose: next.dose, readyAt, ready: now >= readyAt };
}

export function cost({ price, strength, doseMg, freq }) {
  if (!(price > 0) || !(strength > 0) || !(doseMg > 0)) return null;
  const perDose = (price * doseMg) / strength;
  const perWeek = perDose * frequency(freq).perWeek;
  return { perDose, perMonth: (perWeek / 7) * 30.44 };
}

/** Least recently used site, so the same spot is not hit twice in a row. */
export function suggestSite(doses, sites) {
  const last = new Map();
  for (const x of doses) {
    if (!x.site) continue;
    const t = new Date(x.at).getTime();
    if (!last.has(x.site) || last.get(x.site) < t) last.set(x.site, t);
  }
  let best = sites[0];
  let bestT = Infinity;
  for (const s of sites) {
    const t = last.has(s) ? last.get(s) : -Infinity;
    if (t < bestT) { bestT = t; best = s; }
  }
  return best;
}

/** Split a draw into halves for compounds that are easier to take that way. */
export function splitDraw({ rounded, step = 0.5 }) {
  if (!(rounded > 0)) return null;
  const half = Math.round(rounded / 2 / step) * step;
  return { half, exact: near(half * 2, rounded) };
}

/* ------------------------------------------------------------------ *
 * Weight
 * ------------------------------------------------------------------ */

export const LB_PER_KG = 2.2046226218;

export function weightIn(entry, unit) {
  if (!entry || !Number.isFinite(entry.value)) return NaN;
  if (entry.unit === unit) return entry.value;
  return unit === 'kg' ? entry.value / LB_PER_KG : entry.value * LB_PER_KG;
}

/* ------------------------------------------------------------------ *
 * Formatting shared with the views
 * ------------------------------------------------------------------ */

export function num(n, max = 2) {
  if (!Number.isFinite(n)) return '–';
  return String(Number(n.toFixed(max)));
}

function round1(n) {
  return num(n, 1);
}

/** mg, switching to mcg under 1 mg when the compound is usually talked about in mcg. */
export function mass(mg, { mcg = false } = {}) {
  if (!Number.isFinite(mg)) return '–';
  if (mcg && mg < 1) return `${num(mg * 1000, 1)} mcg`;
  return `${num(mg, 3)} mg`;
}

export function money(n) {
  if (!Number.isFinite(n)) return '–';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}
