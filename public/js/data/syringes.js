/**
 * Insulin syringes.
 *
 * "U-100" describes the SCALE, not the size: 100 marks per mL, so one unit is
 * 0.01 mL. A 0.3 mL syringe is still U-100 - it just stops at 30 units. The
 * smaller barrels are worth preferring for small draws because the same 1 unit
 * is physically further apart on the barrel and far easier to read.
 */
export const SYRINGES = [
  { id: 'u100-03', label: '0.3 mL / 30 unit', unitsPerMl: 100, capacityUnits: 30, markSpacing: 'widest' },
  { id: 'u100-05', label: '0.5 mL / 50 unit', unitsPerMl: 100, capacityUnits: 50, markSpacing: 'wide' },
  { id: 'u100-10', label: '1 mL / 100 unit', unitsPerMl: 100, capacityUnits: 100, markSpacing: 'narrow' },
  { id: 'u40-10', label: '1 mL U-40 (veterinary)', unitsPerMl: 40, capacityUnits: 40, markSpacing: 'wide' },
];

export const DEFAULT_SYRINGE = 'u100-10';

export function syringe(id) {
  return SYRINGES.find((s) => s.id === id) ?? SYRINGES.find((s) => s.id === DEFAULT_SYRINGE);
}

/** Smallest barrel that still holds the draw - the easiest one to read. */
export function bestSyringeFor(units) {
  if (!Number.isFinite(units) || units <= 0) return null;
  return SYRINGES.filter((s) => s.unitsPerMl === 100).find((s) => units <= s.capacityUnits) ?? null;
}
