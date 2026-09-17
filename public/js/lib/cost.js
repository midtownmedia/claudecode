/**
 * What this actually costs.
 *
 * The headline number is cost per day, because a per-vial price hides how fast
 * a vial empties. A cheap vial dosed daily can cost far more per month than an
 * expensive one dosed weekly.
 */

import { dosesPerWeek } from './schedule.js';

export const DAYS_PER_MONTH = 30.436875;
export const DAYS_PER_YEAR = 365.2425;

/**
 * @param {object} p
 * @param {number} p.vialPrice        price of one vial
 * @param {number} p.vialsPerOrder    vials in the order the shipping applied to
 * @param {number} p.shipping         shipping for that order
 * @param {number} p.bacPrice         price of a bottle of bacteriostatic water
 * @param {number} p.bacBottleMl      size of that bottle in mL
 * @param {number} p.diluentMl        mL drawn from it per peptide vial
 * @param {number} p.syringeBoxPrice  price of a box of syringes
 * @param {number} p.syringesPerBox   count in that box
 * @param {number} p.syringesPerDose  usually 1, or 2 if you draw water separately
 * @param {number} p.otherPerDose     swabs, sharps bin amortised, anything else
 * @param {number} p.dosesPerVial     from the reconstitution maths
 * @param {string} p.freqId           dosing frequency id
 */
export function costBreakdown({
  vialPrice = 0,
  vialsPerOrder = 1,
  shipping = 0,
  bacPrice = 0,
  bacBottleMl = 30,
  diluentMl = 0,
  syringeBoxPrice = 0,
  syringesPerBox = 100,
  syringesPerDose = 1,
  otherPerDose = 0,
  dosesPerVial = 0,
  freqId = 'qd',
}) {
  const shipPerVial = vialsPerOrder > 0 ? shipping / vialsPerOrder : 0;
  const landedVial = vialPrice + shipPerVial;

  const bacPerMl = bacBottleMl > 0 ? bacPrice / bacBottleMl : 0;
  const bacPerVial = bacPerMl * diluentMl;

  const syringeEach = syringesPerBox > 0 ? syringeBoxPrice / syringesPerBox : 0;
  const consumablesPerDose = syringeEach * syringesPerDose + otherPerDose;

  const perVialTotal = landedVial + bacPerVial;
  const vialPartPerDose = dosesPerVial > 0 ? perVialTotal / dosesPerVial : NaN;
  const perDose = Number.isFinite(vialPartPerDose) ? vialPartPerDose + consumablesPerDose : NaN;

  const perWeekDoses = dosesPerWeek(freqId);
  const perDay = Number.isFinite(perDose) && perWeekDoses > 0 ? (perDose * perWeekDoses) / 7 : NaN;

  return {
    shipPerVial,
    landedVial,
    bacPerVial,
    consumablesPerDose,
    perVialTotal,
    vialPartPerDose,
    perDose,
    perWeek: Number.isFinite(perDay) ? perDay * 7 : NaN,
    perDay,
    perMonth: Number.isFinite(perDay) ? perDay * DAYS_PER_MONTH : NaN,
    perYear: Number.isFinite(perDay) ? perDay * DAYS_PER_YEAR : NaN,
    dosesPerVial,
    dosesPerWeek: perWeekDoses,
  };
}

/** Roll several protocols into one daily burn rate. */
export function totalBurn(breakdowns = []) {
  const live = breakdowns.filter((b) => Number.isFinite(b?.perDay));
  const perDay = live.reduce((sum, b) => sum + b.perDay, 0);
  return {
    count: live.length,
    perDay,
    perWeek: perDay * 7,
    perMonth: perDay * DAYS_PER_MONTH,
    perYear: perDay * DAYS_PER_YEAR,
  };
}

/** Actual money out of the door, from the purchase log. */
export function spendSummary(purchases = [], sinceDays = null) {
  const now = Date.now();
  const rows = purchases.filter((p) => {
    if (!Number.isFinite(p?.amount)) return false;
    if (sinceDays == null) return true;
    const t = new Date(p.at).getTime();
    return Number.isFinite(t) && now - t <= sinceDays * 86400000;
  });
  const total = rows.reduce((s, p) => s + p.amount, 0);
  const stamps = rows.map((p) => new Date(p.at).getTime()).filter(Number.isFinite);
  const first = stamps.length ? Math.min(...stamps) : null;
  const spanDays = first ? Math.max(1, (now - first) / 86400000) : null;
  return {
    total,
    count: rows.length,
    first: first ? new Date(first) : null,
    spanDays,
    averagePerDay: spanDays ? total / spanDays : NaN,
  };
}

export function formatMoney(value, currency = 'USD', locale = undefined) {
  if (!Number.isFinite(value)) return '--';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: Math.abs(value) < 10 ? 2 : 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

/**
 * Compounds run in courses rather than continuously.
 *
 * A course that costs a fortune while you are on it can still be cheap spread
 * over the year, and the reverse is true of anything dosed daily. Both numbers
 * matter, so report both rather than picking one.
 */
export function amortiseCycle({ perDay, cycle }) {
  if (!Number.isFinite(perDay) || !cycle?.daysOn || !cycle?.everyDays) return null;
  const perCycle = perDay * cycle.daysOn;
  const cyclesPerYear = DAYS_PER_YEAR / cycle.everyDays;
  const perYear = perCycle * cyclesPerYear;
  return {
    perCycle,
    cyclesPerYear,
    perYear,
    amortisedPerDay: perYear / DAYS_PER_YEAR,
    duringCyclePerDay: perDay,
    daysOn: cycle.daysOn,
  };
}

/** Bottles needed to finish one course. */
export function vialsPerCycle({ doseMg, daysOn, vialStrengthMg }) {
  if (!(doseMg > 0) || !(daysOn > 0) || !(vialStrengthMg > 0)) return NaN;
  return Math.ceil((doseMg * daysOn) / vialStrengthMg);
}

/* ------------------------------------------------------------------ *
 * Ordering
 * ------------------------------------------------------------------ */

/** Bottles needed to cover a stretch of time at a given dose and cadence. */
export function bottlesForDuration({ doseMg, freqId, days, vialStrengthMg }) {
  const perWeek = dosesPerWeek(freqId);
  if (!(doseMg > 0) || !(days > 0) || !(vialStrengthMg > 0) || !(perWeek > 0)) return NaN;
  const doses = Math.ceil((perWeek * days) / 7);
  return Math.ceil((doses * doseMg) / vialStrengthMg);
}

/** The reverse: how long a pile of bottles actually lasts. */
export function daysOfSupply({ bottles, vialStrengthMg, doseMg, freqId }) {
  const perWeek = dosesPerWeek(freqId);
  if (!(bottles > 0) || !(vialStrengthMg > 0) || !(doseMg > 0) || !(perWeek > 0)) return NaN;
  const doses = Math.floor((bottles * vialStrengthMg) / doseMg);
  return (doses / perWeek) * 7;
}

/**
 * Price out a whole order.
 * Lines carry their own dose and cadence so the total can also say how long
 * the order lasts, which is the number that actually matters.
 */
export function orderTotal(lines = [], { shipping = 0 } = {}) {
  const priced = lines
    .filter((l) => l.qty > 0)
    .map((l) => {
      const lineTotal = l.qty * (l.unitPrice ?? 0);
      const days = daysOfSupply({
        bottles: l.qty, vialStrengthMg: l.strength, doseMg: l.doseMg, freqId: l.freqId,
      });
      return {
        ...l,
        lineTotal,
        days,
        perDay: Number.isFinite(days) && days > 0 ? lineTotal / days : NaN,
        costPerMg: l.strength > 0 ? (l.unitPrice ?? 0) / l.strength : NaN,
      };
    });
  const subtotal = priced.reduce((s, l) => s + l.lineTotal, 0);
  const bottles = priced.reduce((s, l) => s + l.qty, 0);
  const spans = priced.map((l) => l.days).filter((d) => Number.isFinite(d) && d > 0);
  return {
    lines: priced,
    bottles,
    subtotal,
    shipping,
    total: subtotal + shipping,
    // The order runs out when its shortest line does.
    coversDays: spans.length ? Math.min(...spans) : NaN,
    longestDays: spans.length ? Math.max(...spans) : NaN,
  };
}
