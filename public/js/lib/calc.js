/**
 * Reconstitution math.
 *
 * The whole app turns on one relationship:
 *
 *     concentration (strength per mL) = vial strength / diluent volume
 *     volume per dose (mL)            = dose / concentration
 *     syringe units                   = volume (mL) x units per mL
 *
 * "Units" always means marks on an insulin syringe, never a biological unit.
 * On a U-100 syringe one unit is 0.01 mL, so 100 units = 1 mL. This is why a
 * protocol written only in units is meaningless on its own -- the same 20 units
 * is 1 mg from one vial and 4 mg from another.
 */

import { toBase, baseUnitFor, convert, sameFamily } from './units.js';

/** A unit mark on a U-100 syringe is 0.01 mL. */
export const ML_PER_UNIT_U100 = 0.01;

/** Convert "add 300 units of water" (how most protocol sheets are written) to mL. */
export function unitsToMl(units, unitsPerMl = 100) {
  return units / unitsPerMl;
}

export function mlToUnits(ml, unitsPerMl = 100) {
  return ml * unitsPerMl;
}

/**
 * Strength of the solution after reconstitution, in <strengthUnit> per mL.
 */
export function concentration({ strength, diluentMl }) {
  if (!(strength > 0) || !(diluentMl > 0)) return NaN;
  return strength / diluentMl;
}

/**
 * The amount of compound sitting in a single syringe unit.
 * This is the number people should actually memorise for a given vial.
 */
export function perUnit({ strength, strengthUnit, diluentMl, unitsPerMl = 100 }) {
  const conc = concentration({ strength, diluentMl });
  if (!Number.isFinite(conc)) return NaN;
  return conc / unitsPerMl;
}

/**
 * Core solve: given a vial and a target dose, how far do you pull the plunger?
 *
 * Returns volume in mL, the syringe units, and -- critically -- what you will
 * ACTUALLY receive once you round to a mark you can physically see.
 */
export function doseToUnits({
  strength,
  strengthUnit = 'mg',
  diluentMl,
  dose,
  doseUnit = 'mg',
  unitsPerMl = 100,
  roundTo = 1,
}) {
  if (!sameFamily(strengthUnit, doseUnit)) {
    throw new Error(
      `Vial is measured in ${strengthUnit} but the dose is in ${doseUnit}. ` +
        `Those are different kinds of unit and cannot be compared directly.`
    );
  }
  const base = baseUnitFor(strengthUnit);
  const strengthBase = toBase(strength, strengthUnit);
  const doseBase = toBase(dose, doseUnit);

  const concBase = concentration({ strength: strengthBase, diluentMl });
  const perUnitBase = Number.isFinite(concBase) ? concBase / unitsPerMl : NaN;

  const volumeMl = Number.isFinite(concBase) && concBase > 0 ? doseBase / concBase : NaN;
  const units = Number.isFinite(volumeMl) ? volumeMl * unitsPerMl : NaN;

  const roundedUnits = Number.isFinite(units) && roundTo > 0
    ? Math.round(units / roundTo) * roundTo
    : units;

  // What the rounded mark actually delivers -- the honest number.
  const actualDoseBase = Number.isFinite(roundedUnits) ? roundedUnits * perUnitBase : NaN;
  const errorPct = doseBase > 0 && Number.isFinite(actualDoseBase)
    ? ((actualDoseBase - doseBase) / doseBase) * 100
    : NaN;

  return {
    baseUnit: base,
    concentration: concBase, // per mL, in base unit
    perUnit: perUnitBase, // per syringe unit, in base unit
    volumeMl,
    units,
    roundedUnits,
    requestedDose: doseBase,
    actualDose: actualDoseBase,
    errorPct,
    dosesPerVial: doseBase > 0 ? Math.floor(strengthBase / doseBase) : NaN,
    totalUnitsInVial: Number.isFinite(diluentMl) ? diluentMl * unitsPerMl : NaN,
  };
}

/**
 * The reverse question, which is the one worth asking BEFORE you add water:
 * "how much diluent makes my dose land on a round, easy-to-read mark?"
 *
 *   units = dose * diluentMl * unitsPerMl / strength
 *   => diluentMl = targetUnits * strength / (dose * unitsPerMl)
 */
export function diluentForTargetUnits({
  strength,
  strengthUnit = 'mg',
  dose,
  doseUnit = 'mg',
  targetUnits,
  unitsPerMl = 100,
}) {
  if (!sameFamily(strengthUnit, doseUnit)) {
    throw new Error(`Vial (${strengthUnit}) and dose (${doseUnit}) use different unit families.`);
  }
  const strengthBase = toBase(strength, strengthUnit);
  const doseBase = toBase(dose, doseUnit);
  if (!(strengthBase > 0) || !(doseBase > 0) || !(targetUnits > 0)) return NaN;
  return (targetUnits * strengthBase) / (doseBase * unitsPerMl);
}

/**
 * Read a protocol that is written in units (the common case) back into a real dose.
 * This is the "what am I actually injecting?" direction.
 */
export function unitsToDose({
  strength,
  strengthUnit = 'mg',
  diluentMl,
  units,
  unitsPerMl = 100,
}) {
  const strengthBase = toBase(strength, strengthUnit);
  const concBase = concentration({ strength: strengthBase, diluentMl });
  if (!Number.isFinite(concBase)) return NaN;
  return (units / unitsPerMl) * concBase;
}

/**
 * Compare the same written dose across two vials.
 *
 * `foldChange` is the headline: draw your old number of units from the new
 * vial and this is the multiple of your intended dose you actually get.
 */
export function compareVials({
  dose,
  doseUnit = 'mg',
  oldVial, // { strength, strengthUnit, diluentMl }
  newVial,
  unitsPerMl = 100,
  roundTo = 1,
}) {
  const oldCalc = doseToUnits({ ...oldVial, dose, doseUnit, unitsPerMl, roundTo });
  const newCalc = doseToUnits({ ...newVial, dose, doseUnit, unitsPerMl, roundTo });

  // If you keep drawing the OLD unit count from the NEW vial:
  const doseIfUnitsUnchanged = unitsToDose({
    ...newVial,
    units: oldCalc.roundedUnits,
    unitsPerMl,
  });
  const foldChange = oldCalc.requestedDose > 0
    ? doseIfUnitsUnchanged / oldCalc.requestedDose
    : NaN;

  return {
    old: oldCalc,
    new: newCalc,
    doseIfUnitsUnchanged,
    foldChange,
    concentrationRatio: oldCalc.concentration > 0
      ? newCalc.concentration / oldCalc.concentration
      : NaN,
  };
}

/**
 * Practical sanity checks on a draw. These are measurement-quality checks --
 * separate from the clinical dose-range checks in safety.js.
 */
export function drawWarnings({ units, roundedUnits, errorPct, syringe, volumeMl, diluentMl, vialCapacityMl }) {
  // Quote the mark the person will actually pull to, so the warning and the
  // headline above it do not show two different numbers.
  const shown = Number.isFinite(roundedUnits) ? roundedUnits : units;
  const out = [];
  if (!Number.isFinite(units)) {
    out.push({ level: 'info', code: 'incomplete', message: 'Fill in the vial strength, diluent volume and dose.' });
    return out;
  }
  if (units <= 0) {
    out.push({ level: 'danger', code: 'nonpositive', message: 'That works out to zero or less. Check your numbers.' });
    return out;
  }
  if (syringe && units > syringe.capacityUnits) {
    out.push({
      level: 'danger',
      code: 'over-capacity',
      message: `${round(shown)} units will not fit in a ${syringe.label}. Use less diluent, or split the dose across more than one injection.`,
    });
  }
  if (units < 2) {
    out.push({
      level: 'warn',
      code: 'too-small',
      message: `${round(shown)} units is a sliver of liquid and very hard to measure accurately. Use more bac water so the dose lands on a bigger mark.`,
    });
  } else if (units < 5) {
    out.push({
      level: 'info',
      code: 'small',
      message: `${round(shown)} units is a small draw. A little more bac water would make it easier to read.`,
    });
  }
  if (Number.isFinite(errorPct) && Math.abs(errorPct) >= 5) {
    out.push({
      level: 'warn',
      code: 'rounding',
      message: `Rounding to ${round(roundedUnits)} units puts you ${errorPct > 0 ? 'over' : 'under'} your target by ${Math.abs(errorPct).toFixed(1)}%.`,
    });
  }
  if (Number.isFinite(diluentMl) && Number.isFinite(vialCapacityMl) && diluentMl > vialCapacityMl) {
    out.push({
      level: 'warn',
      code: 'overfill',
      message: `${diluentMl} mL may overfill a ${vialCapacityMl} mL vial. Check the vial size before you add this much.`,
    });
  }
  return out;
}

function round(n, d = 1) {
  return Number.isFinite(n) ? Number(n.toFixed(d)) : n;
}

/* ------------------------------------------------------------------ *
 * Diluent recommender
 * ------------------------------------------------------------------ */

/** Values of "mg per unit" that make mental arithmetic trivial. */
const CLEAN_PER_UNIT = [0.001, 0.002, 0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10];

function isNear(a, b, tol = 1e-9) {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
}

function cleanliness(perUnitBase) {
  for (const c of CLEAN_PER_UNIT) {
    if (isNear(perUnitBase, c, 1e-6)) {
      // Powers of ten are the nicest: the conversion is just a decimal shift.
      const log = Math.log10(c);
      return Number.isInteger(log) ? 2 : 1;
    }
  }
  return 0;
}

/**
 * Score candidate diluent volumes for a vial against the doses actually planned.
 *
 * A good volume makes every step of the ladder land on a mark you can see,
 * keeps the biggest dose inside one syringe, and ideally makes one unit worth
 * a round number so "units -> mg" is mental arithmetic rather than a calculator.
 */
export function suggestDiluents({
  strength,
  strengthUnit = 'mg',
  doses = [],
  doseUnit = 'mg',
  unitsPerMl = 100,
  syringeCapacityUnits = 100,
  vialCapacityMl = 5,
  minUnits = 8,
  step = 0.5,
  maxCandidates = 4,
  criticalDose = null,
  minCriticalUnits = 4,
}) {
  const strengthBase = toBase(strength, strengthUnit);
  const doseList = doses.map((d) => toBase(d, doseUnit)).filter((d) => d > 0).sort((a, b) => a - b);
  if (!(strengthBase > 0) || doseList.length === 0) return [];

  const candidates = [];
  for (let ml = step; ml <= vialCapacityMl + 1e-9; ml += step) {
    const volume = Number(ml.toFixed(3));
    const perUnitBase = strengthBase / volume / unitsPerMl;
    const unitList = doseList.map((d) => d / perUnitBase);

    const n = doseList.length;
    const fitCount = unitList.filter((u) => u <= syringeCapacityUnits + 1e-9).length;
    const readableCount = unitList.filter((u) => u >= minUnits - 1e-9).length;
    const allFit = fitCount === n;
    const allReadable = readableCount === n;
    const wholeCount = unitList.filter((u) => isNear(u, Math.round(u), 1e-6)).length;
    const halfCount = unitList.filter((u) => isNear(u * 2, Math.round(u * 2), 1e-6)).length;
    const clean = cleanliness(perUnitBase);

    // Scored per dose rather than all-or-nothing: one awkward dose at the very
    // top of a ladder should not disqualify a volume that makes every earlier
    // step clean, since a single large dose can be split across two injections.
    const score =
      (fitCount / n) * 40 +
      (readableCount / n) * 35 +
      (wholeCount / n) * 25 +
      (halfCount / n) * 5 +
      clean * 8 -
      volume * 0.12; // bacteriostatic water is cheap next to the peptide, so
                     // volume is only a faint tiebreaker -- dilute freely when
                     // it buys a draw you can actually read.

    candidates.push({
      diluentMl: volume,
      perUnit: perUnitBase,
      unitsPerDose: doseList.map((d, i) => ({ dose: d, units: unitList[i] })),
      allFit,
      allReadable,
      wholeCount,
      totalDoses: doseList.length,
      clean,
      score,
      note: clean === 2
        ? `1 unit = ${trimNum(perUnitBase)} ${baseUnitFor(strengthUnit)} exactly, so units and dose differ only by a decimal point.`
        : clean === 1
          ? `1 unit = ${trimNum(perUnitBase)} ${baseUnitFor(strengthUnit)}, a round number that is easy to hold in your head.`
          : null,
    });
  }

  // A starting dose that cannot be measured is not a trade-off to be scored
  // against tidiness -- it is disqualifying. Only fall back to the full list if
  // no volume can deliver it at all.
  let pool = candidates;
  if (criticalDose > 0) {
    const critBase = toBase(criticalDose, doseUnit);
    const viable = candidates.filter((c) => critBase / c.perUnit >= minCriticalUnits - 1e-9);
    if (viable.length) pool = viable;
  }

  const sorted = [...pool].sort((a, b) => b.score - a.score);

  // De-duplicate near-identical concentrations so the list stays useful.
  const picked = [];
  for (const c of sorted) {
    if (picked.some((p) => isNear(p.perUnit, c.perUnit, 1e-3))) continue;
    picked.push(c);
    if (picked.length >= maxCandidates) break;
  }
  return picked;
}

function trimNum(n) {
  if (!Number.isFinite(n)) return '--';
  return String(Number(n.toPrecision(6)));
}

/* ------------------------------------------------------------------ *
 * Bottle swapping
 * ------------------------------------------------------------------ */

/**
 * Re-express a protocol written for one bottle in terms of the bottle you
 * actually have. The dose in mg is the real instruction and never changes --
 * only the number of units on the syringe does.
 *
 * With the same diluent volume, units scale by the inverse of strength:
 * a bottle 4x as strong means a quarter of the units for the same dose.
 */
export function rescaleLadder({
  ladder = [],
  ladderUnit = 'mg',
  sheet, // { strength, strengthUnit, diluentMl } the protocol was written for
  bottle, // { strength, strengthUnit, diluentMl } you actually have
  unitsPerMl = 100,
  roundTo = 1,
}) {
  const steps = ladder.map((step) => {
    const dose = typeof step === 'number' ? step : step.dose;
    const before = sheet
      ? doseToUnits({ ...sheet, dose, doseUnit: ladderUnit, unitsPerMl, roundTo })
      : null;
    const after = doseToUnits({ ...bottle, dose, doseUnit: ladderUnit, unitsPerMl, roundTo });
    return {
      ...(typeof step === 'object' ? step : {}),
      dose,
      doseUnit: ladderUnit,
      sheetUnits: before ? before.units : null,
      units: after.units,
      roundedUnits: after.roundedUnits,
      actualDose: after.actualDose,
      errorPct: after.errorPct,
      exact: Number.isFinite(after.units) && Math.abs(after.units - Math.round(after.units)) < 1e-6,
    };
  });

  // The headline ratio: multiply the numbers on the sheet by this.
  const unitScale = sheet ? scaleBetween(sheet, bottle, unitsPerMl) : null;

  return { steps, unitScale, strengthRatio: sheet ? bottleRatio(sheet, bottle) : null };
}

function bottleRatio(sheet, bottle) {
  const s = toBase(sheet.strength, sheet.strengthUnit ?? 'mg');
  const b = toBase(bottle.strength, bottle.strengthUnit ?? 'mg');
  return s > 0 ? b / s : NaN;
}

/**
 * Factor to apply to a unit count written for `sheet` to get the unit count
 * for `bottle`. Accounts for a different diluent volume too, not just strength.
 */
export function scaleBetween(sheet, bottle, unitsPerMl = 100) {
  const sConc = concentration({
    strength: toBase(sheet.strength, sheet.strengthUnit ?? 'mg'),
    diluentMl: sheet.diluentMl,
  });
  const bConc = concentration({
    strength: toBase(bottle.strength, bottle.strengthUnit ?? 'mg'),
    diluentMl: bottle.diluentMl,
  });
  if (!(bConc > 0) || !Number.isFinite(sConc)) return NaN;
  return sConc / bConc;
}

/** Render a scale factor the way a person would say it: "a quarter", "4x". */
export function describeScale(scale) {
  if (!Number.isFinite(scale)) return null;
  if (isNear(scale, 1, 1e-6)) return { text: 'the same', plain: 'Your unit counts do not change.' };
  const inv = 1 / scale;
  const fracs = [
    [2, 'half'], [3, 'a third'], [4, 'a quarter'], [5, 'a fifth'],
    [6, 'a sixth'], [8, 'an eighth'], [10, 'a tenth'],
  ];
  if (scale < 1) {
    const hit = fracs.find(([d]) => isNear(inv, d, 1e-6));
    return {
      text: hit ? hit[1] : `${scale.toFixed(3)}x`,
      plain: hit
        ? `Draw ${hit[1]} the units written on the sheet.`
        : `Multiply the units on the sheet by ${scale.toFixed(3)}.`,
    };
  }
  return {
    text: `${trimNum(scale)}x`,
    plain: `Multiply the units on the sheet by ${trimNum(scale)}.`,
  };
}

/* ------------------------------------------------------------------ *
 * Secondary dilution
 * ------------------------------------------------------------------ */

/**
 * Make a weaker working vial from an over-concentrated one.
 *
 * NOT CURRENTLY SURFACED IN THE UI: this needs a spare empty sterile vial,
 * which nobody using this has to hand yet. Kept and tested so the screen can be
 * switched on once that changes.
 *
 * A large bottle cannot deliver a small starting dose: 0.25 mg from a 60 mg
 * bottle lands on about two marks however much water goes in, because the vial
 * will not hold the 24 mL it would take. The way out is to draw part of the
 * reconstituted solution into a second sterile vial and dilute that instead.
 *
 *   C1 x V1 = C2 x V2      (the peptide drawn across is conserved)
 *
 * @param {number} sourceConc   mg per mL in the vial you already mixed
 * @param {number} targetDose   the dose you want to be able to draw, in mg
 * @param {number} targetUnits  the mark you want that dose to land on
 * @param {number} drawMl       how much to move across into the new vial
 */
export function secondaryDilution({
  sourceConc,
  targetDose,
  targetUnits = 10,
  unitsPerMl = 100,
  drawMl = null,
  secondVialMl = 5,
}) {
  if (!(sourceConc > 0) || !(targetDose > 0) || !(targetUnits > 0)) return null;
  const targetConc = targetDose / (targetUnits / unitsPerMl);
  const factor = sourceConc / targetConc;
  if (!(factor > 1)) return null; // already weak enough, no second vial needed

  // The second vial has a capacity too. Pick how much to carry across so the
  // finished volume fits inside it, then round down to an amount that is easy
  // to draw accurately.
  let carry = drawMl;
  if (!(carry > 0)) {
    const maxCarry = secondVialMl / factor;
    const steps = [2, 1.5, 1, 0.75, 0.5, 0.4, 0.3, 0.25, 0.2, 0.1];
    carry = steps.find((v) => v <= maxCarry + 1e-9) ?? Number(maxCarry.toFixed(2));
  }
  if (!(carry > 0)) return null;

  const totalMl = carry * factor;
  return {
    targetConc,
    factor,
    drawMl: carry,
    addMl: totalMl - carry,
    totalMl,
    secondVialMl,
    fits: totalMl <= secondVialMl + 1e-9,
    perUnit: targetConc / unitsPerMl,
    dosesAvailable: Math.floor((carry * sourceConc) / targetDose),
    sourceUnitsToDraw: carry * unitsPerMl,
    targetUnits,
  };
}

/* ------------------------------------------------------------------ *
 * Practical limits
 * ------------------------------------------------------------------ */

/** A bottle will not take more than this much bac water. */
export const MAX_BAC_WATER_ML = 5;

/**
 * The smallest dose this bottle can actually deliver.
 *
 * Below a few marks you are estimating, not measuring, so there is a floor on
 * what any given bottle can do. Worth knowing before a protocol asks for a
 * starting dose the bottle cannot produce.
 */
export function smallestMeasurableDose({
  strength,
  strengthUnit = 'mg',
  diluentMl,
  unitsPerMl = 100,
  minUnits = 4,
}) {
  const strengthBase = toBase(strength, strengthUnit);
  const conc = concentration({ strength: strengthBase, diluentMl });
  if (!Number.isFinite(conc)) return NaN;
  return (conc / unitsPerMl) * minUnits;
}

/**
 * Split a dose into equal parts.
 *
 * Some compounds are better tolerated given in halves across the day. The
 * daily amount does not change -- this is a way of handling nausea, not a
 * different dose -- so it is derived from the full dose rather than stored.
 */
export function splitDraw({ units, dose, parts = 2, roundTo = 0.5 }) {
  if (!Number.isFinite(units) || !(parts > 1)) return null;
  const rawUnits = units / parts;
  const perPartUnits = roundTo > 0 ? Math.round(rawUnits / roundTo) * roundTo : rawUnits;
  const perUnitDose = units > 0 ? dose / units : NaN;
  return {
    parts,
    perPartUnits,
    perPartDose: perPartUnits * perUnitDose,
    totalUnits: perPartUnits * parts,
    totalDose: perPartUnits * parts * perUnitDose,
    exact: Math.abs(rawUnits - perPartUnits) < 1e-9,
  };
}
