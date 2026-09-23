/** Helpers over the saved records. No DOM. */

import { peptide, OTHER, SYRINGES } from './data.js';
import { mass, draw } from './math.js';

export function peptideOf(pr) {
  return peptide(pr?.peptideId) ?? OTHER;
}

export function nameOf(pr) {
  if (pr?.name) return pr.name;
  const p = peptide(pr?.peptideId);
  return p && p.id !== 'other' ? p.name : 'Peptide';
}

/** Show a dose the way people talk about that compound. */
export function doseText(pr, mg) {
  return mass(mg, { mcg: !!peptideOf(pr).mcg });
}

export function dosesOf(state, protocolId) {
  return state.doses
    .filter((d) => d.protocolId === protocolId)
    .sort((a, b) => new Date(b.at) - new Date(a.at));
}

/**
 * Someone with a logged dose or a saved protocol for this compound is not on
 * their first dose. Counting only the log would warn every experienced person
 * on a fresh phone, and a warning that cries wolf teaches people to ignore it.
 */
export function hasHistory(state, peptideId, exceptProtocolId = null) {
  if (!peptideId || peptideId === 'other') return true;
  return state.doses.some((d) => d.peptideId === peptideId)
    || state.protocols.some((p) => p.peptideId === peptideId && p.id !== exceptProtocolId);
}

/** The smallest barrel that holds the draw: its marks are the furthest apart. */
export function bestSyringe(units) {
  return (SYRINGES.find((s) => units <= s.units + 1e-9) ?? SYRINGES[SYRINGES.length - 1]).units;
}

export function newProtocol(p, now = new Date()) {
  const first = p.firstDose?.recommended ?? p.ladder?.[0]?.dose ?? null;
  const units = draw({ strength: p.strength, waterMl: p.waterMl, doseMg: first }).units;
  return {
    id: null,
    peptideId: p.id,
    name: '',
    strength: p.strength,
    waterMl: p.waterMl,
    doseMg: first,
    freq: p.freq,
    syringe: Number.isFinite(units) ? bestSyringe(units) : 100,
    price: p.price ?? null,
    mixedAt: now.toISOString(),
    doseSince: now.toISOString(),
    active: true,
  };
}

/** A stable key for charting doses of the same thing together. */
export function seriesKey(d) {
  return d.peptideId && d.peptideId !== 'other' ? d.peptideId : `other:${(d.name || '').toLowerCase()}`;
}
