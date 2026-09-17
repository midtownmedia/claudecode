/**
 * Unit handling.
 *
 * Two unit families exist and they never convert into each other automatically:
 *   mass -- mcg / mg
 *   iu   -- international units (HCG, somatropin, HMG)
 *
 * The mg<->IU bridge is compound specific (somatropin is ~3 IU per mg, HCG has
 * no mass equivalent at all), so a blind conversion is exactly the kind of
 * mistake this app exists to prevent. Compound specific bridges live in the
 * peptide library and are always shown explicitly, never applied silently.
 */

export const FAMILY = { MASS: 'mass', IU: 'iu' };

export const UNITS = {
  mcg: { id: 'mcg', label: 'mcg', family: FAMILY.MASS, perMg: 1000 },
  mg: { id: 'mg', label: 'mg', family: FAMILY.MASS, perMg: 1 },
  iu: { id: 'iu', label: 'IU', family: FAMILY.IU, perMg: null },
};

export function familyOf(unit) {
  const u = UNITS[unit];
  if (!u) throw new Error(`Unknown unit: ${unit}`);
  return u.family;
}

export function sameFamily(a, b) {
  return familyOf(a) === familyOf(b);
}

/**
 * Convert a quantity between units of the same family.
 * Throws across families -- callers must handle that deliberately.
 */
export function convert(value, from, to) {
  if (!Number.isFinite(value)) return NaN;
  if (from === to) return value;
  if (!sameFamily(from, to)) {
    throw new Error(
      `Cannot convert ${from} to ${to}: different unit families. ` +
        `A mg<->IU conversion depends on the specific compound.`
    );
  }
  if (familyOf(from) === FAMILY.IU) return value;
  // Normalise through mg.
  const mg = value / UNITS[from].perMg;
  return mg * UNITS[to].perMg;
}

/** Convert to the canonical unit of the family ("mg" for mass, "iu" for IU). */
export function toBase(value, unit) {
  return familyOf(unit) === FAMILY.IU ? value : convert(value, unit, 'mg');
}

export function baseUnitFor(unit) {
  return familyOf(unit) === FAMILY.IU ? 'iu' : 'mg';
}

/**
 * Pick the unit a human would actually say out loud.
 * 0.25 mg reads better as 250 mcg; 2400 mcg reads better as 2.4 mg.
 */
export function friendlyMass(mg) {
  if (!Number.isFinite(mg)) return { value: NaN, unit: 'mg' };
  if (mg === 0) return { value: 0, unit: 'mg' };
  return Math.abs(mg) < 1 ? { value: mg * 1000, unit: 'mcg' } : { value: mg, unit: 'mg' };
}

/** Round to a sane number of significant decimals without trailing zero noise. */
export function tidy(value, maxDecimals = 3) {
  if (!Number.isFinite(value)) return '--';
  const rounded = Number(value.toFixed(maxDecimals));
  return String(rounded);
}

export function formatQty(value, unit, maxDecimals = 3) {
  return `${tidy(value, maxDecimals)} ${UNITS[unit]?.label ?? unit}`;
}

/** Format a mass in mg using whichever of mcg/mg reads more naturally. */
export function formatMass(mg, maxDecimals = 3) {
  const f = friendlyMass(mg);
  return formatQty(f.value, f.unit, maxDecimals);
}
