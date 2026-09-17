/** Dosing frequency, titration ladders, next-dose timing and vial expiry. */

export const DAY_MS = 86400000;

export const FREQUENCIES = [
  { id: 'qd', label: 'Once daily', perWeek: 7, intervalDays: 1 },
  { id: 'bid', label: 'Twice daily', perWeek: 14, intervalDays: 0.5 },
  { id: 'eod', label: 'Every other day', perWeek: 3.5, intervalDays: 2 },
  { id: 'q3d', label: 'Every 3 days', perWeek: 7 / 3, intervalDays: 3 },
  { id: 'q4d', label: 'Every 4 days', perWeek: 7 / 4, intervalDays: 4 },
  { id: 'q6d', label: 'Every 6 days', perWeek: 7 / 6, intervalDays: 6 },
  { id: '5on2off', label: '5 days on, 2 off', perWeek: 5, intervalDays: 1 },
  { id: '3xw', label: '3x per week', perWeek: 3, intervalDays: 7 / 3 },
  { id: '2xw', label: '2x per week', perWeek: 2, intervalDays: 3.5 },
  { id: 'qw', label: 'Once weekly', perWeek: 1, intervalDays: 7 },
  { id: 'q2w', label: 'Every 2 weeks', perWeek: 0.5, intervalDays: 14 },
  { id: 'prn', label: 'As needed', perWeek: 0, intervalDays: null },
];

export function frequency(id) {
  return FREQUENCIES.find((f) => f.id === id) ?? FREQUENCIES[0];
}

export function dosesPerWeek(id) {
  return frequency(id).perWeek;
}

export function nextDoseAt(lastDoseIso, freqId) {
  const f = frequency(freqId);
  if (!lastDoseIso || f.intervalDays == null) return null;
  const last = new Date(lastDoseIso).getTime();
  if (!Number.isFinite(last)) return null;
  return new Date(last + f.intervalDays * DAY_MS);
}

/**
 * Where a titration ladder puts you on a given date.
 * A ladder is [{ weeks, dose, unit }] walked in order from startDate.
 */
export function titrationStatus({ ladder = [], startDate, on = new Date() }) {
  if (!ladder.length || !startDate) return null;
  const start = new Date(startDate).getTime();
  const now = on instanceof Date ? on.getTime() : new Date(on).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(now)) return null;

  const daysIn = Math.max(0, Math.floor((now - start) / DAY_MS));
  let cursorDays = 0;
  for (let i = 0; i < ladder.length; i += 1) {
    const step = ladder[i];
    const stepDays = (step.weeks ?? 0) * 7;
    const isLast = i === ladder.length - 1;
    if (isLast || daysIn < cursorDays + stepDays) {
      const nextStep = isLast ? null : ladder[i + 1];
      return {
        index: i,
        step,
        nextStep,
        daysIn,
        weekOfStep: Math.floor((daysIn - cursorDays) / 7) + 1,
        daysUntilNextStep: isLast ? null : cursorDays + stepDays - daysIn,
        nextStepDate: isLast ? null : new Date(start + (cursorDays + stepDays) * DAY_MS),
        atTop: isLast,
      };
    }
    cursorDays += stepDays;
  }
  return null;
}

/**
 * Beyond-use date for a reconstituted vial.
 *
 * Bacteriostatic water contains benzyl alcohol and is multi-dose, commonly
 * treated as 28 days refrigerated once punctured. Plain sterile water has no
 * preservative at all and is a single-use product.
 */
export const DILUENTS = [
  {
    id: 'bacteriostatic',
    label: 'Bacteriostatic water (0.9% benzyl alcohol)',
    budDays: 28,
    note: 'Multi-dose. Commonly discarded 28 days after the first puncture, kept refrigerated.',
  },
  {
    id: 'sterile',
    label: 'Sterile water (no preservative)',
    budDays: 1,
    note: 'No preservative, so it does not hold back bacterial growth. Intended for single use - it is not a multi-dose diluent.',
  },
  {
    id: 'saline-bact',
    label: 'Bacteriostatic saline',
    budDays: 28,
    note: 'Multi-dose. Same 28 day convention as bacteriostatic water.',
  },
];

export function diluent(id) {
  return DILUENTS.find((d) => d.id === id) ?? DILUENTS[0];
}

export function vialExpiry({ openedAt, diluentId }) {
  const d = diluent(diluentId);
  if (!openedAt) return null;
  const opened = new Date(openedAt).getTime();
  if (!Number.isFinite(opened)) return null;
  const expires = new Date(opened + d.budDays * DAY_MS);
  const daysLeft = Math.ceil((expires.getTime() - Date.now()) / DAY_MS);
  return { expires, daysLeft, budDays: d.budDays, diluent: d, expired: daysLeft < 0 };
}

/** How long a vial lasts at a given dose and cadence. */
export function vialDuration({ dosesPerVial, freqId }) {
  const perWeek = dosesPerWeek(freqId);
  if (!(dosesPerVial > 0) || !(perWeek > 0)) return null;
  const days = (dosesPerVial / perWeek) * 7;
  return { days, weeks: days / 7 };
}
