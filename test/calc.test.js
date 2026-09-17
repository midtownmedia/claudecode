import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  concentration, doseToUnits, unitsToDose, diluentForTargetUnits,
  compareVials, rescaleLadder, describeScale, suggestDiluents,
  drawWarnings, unitsToMl, mlToUnits,
} from '../public/js/lib/calc.js';
import { convert, formatMass } from '../public/js/lib/units.js';

const close = (a, b, tol = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} to be within ${tol} of ${b}`);

test('units of water convert to mL at 100 units per mL', () => {
  close(unitsToMl(200), 2);
  close(unitsToMl(300), 3);
  close(unitsToMl(400), 4);
  close(mlToUnits(4), 400);
});

test('mass conversion stays exact across mcg and mg', () => {
  close(convert(250, 'mcg', 'mg'), 0.25);
  close(convert(2.4, 'mg', 'mcg'), 2400);
  assert.equal(formatMass(0.25), '250 mcg');
  assert.equal(formatMass(2.4), '2.4 mg');
});

test('mg and IU refuse to convert into one another', () => {
  assert.throws(() => convert(10, 'mg', 'iu'), /different unit families/);
});

// Figures below are taken from protocol sheets that stated both the unit count
// and the resulting dose, so they double as a check on the sheets themselves.
test('Melanotan I 10 mg in 2 mL matches the sheet', () => {
  const vial = { strength: 10, diluentMl: 2 };
  close(concentration({ strength: 10, diluentMl: 2 }), 5);
  close(unitsToDose({ ...vial, units: 5 }), 0.25);
  close(unitsToDose({ ...vial, units: 10 }), 0.5);
  close(unitsToDose({ ...vial, units: 15 }), 0.75);
  close(unitsToDose({ ...vial, units: 20 }), 1);
});

test('SS-31 50 mg in 3 mL matches the sheet', () => {
  const vial = { strength: 50, diluentMl: 3 };
  close(unitsToDose({ ...vial, units: 30 }), 5, 1e-9);
  close(unitsToDose({ ...vial, units: 60 }), 10, 1e-9);
});

test('MOTS-c 10 mg in 3 mL matches the sheet', () => {
  const vial = { strength: 10, diluentMl: 3 };
  for (const [units, mg] of [[6, 0.2], [12, 0.4], [18, 0.6], [24, 0.8], [30, 1.0]]) {
    close(unitsToDose({ ...vial, units }), mg, 1e-9);
  }
});

test('dose to units reports what the rounded mark really delivers', () => {
  const r = doseToUnits({ strength: 60, diluentMl: 4, dose: 1, roundTo: 1 });
  close(r.units, 6.666666, 1e-5);
  assert.equal(r.roundedUnits, 7);
  close(r.actualDose, 1.05, 1e-9);
  close(r.errorPct, 5, 1e-6);
});

test('a 60 mg bottle in 6 mL puts one unit at exactly 0.1 mg', () => {
  const r = doseToUnits({ strength: 60, diluentMl: 6, dose: 1 });
  close(r.perUnit, 0.1);
  close(r.units, 10);
  for (const [mg, units] of [[2, 20], [3, 30], [4, 40], [6, 60], [8, 80]]) {
    close(doseToUnits({ strength: 60, diluentMl: 6, dose: mg }).units, units);
  }
});

test('solving for a target mark inverts the dose calculation', () => {
  const ml = diluentForTargetUnits({ strength: 60, dose: 1, targetUnits: 10 });
  close(ml, 6);
  close(doseToUnits({ strength: 60, diluentMl: ml, dose: 1 }).units, 10);
});

test('retatrutide 10 mg to 60 mg is a six-fold overdose at the same units', () => {
  const r = compareVials({
    dose: 1,
    oldVial: { strength: 10, diluentMl: 4 },
    newVial: { strength: 60, diluentMl: 4 },
  });
  close(r.old.roundedUnits, 40);
  close(r.doseIfUnitsUnchanged, 6, 1e-9);
  close(r.foldChange, 6, 1e-9);
  close(r.concentrationRatio, 6, 1e-9);
});

test('MOTS-c 10 mg to 40 mg is a four-fold overdose at the same units', () => {
  const r = compareVials({
    dose: 1,
    oldVial: { strength: 10, diluentMl: 3 },
    newVial: { strength: 40, diluentMl: 3 },
  });
  close(r.foldChange, 4, 1e-9);
});

test('the Wolverine blend 10 mg to 20 mg doubles the dose', () => {
  const r = compareVials({
    dose: 1,
    oldVial: { strength: 10, diluentMl: 3 },
    newVial: { strength: 20, diluentMl: 3 },
  });
  close(r.foldChange, 2, 1e-9);
});

test('rescaling a ladder keeps the dose and changes only the units', () => {
  const r = rescaleLadder({
    ladder: [0.2, 0.4, 0.6, 0.8, 1.0],
    sheet: { strength: 10, diluentMl: 3 },
    bottle: { strength: 40, diluentMl: 3 },
    roundTo: 0.5,
  });
  close(r.unitScale, 0.25);
  close(r.strengthRatio, 4);
  assert.deepEqual(r.steps.map((s) => s.sheetUnits), [6, 12, 18, 24, 30]);
  assert.deepEqual(r.steps.map((s) => s.roundedUnits), [1.5, 3, 4.5, 6, 7.5]);
  for (const s of r.steps) close(s.actualDose, s.dose, 1e-9);
});

test('a four-fold stronger bottle is described as a quarter of the units', () => {
  assert.equal(describeScale(0.25).text, 'a quarter');
  assert.equal(describeScale(0.5).text, 'half');
  assert.equal(describeScale(2).text, '2x');
  assert.equal(describeScale(1).text, 'the same');
});

test('diluent recommender prefers volumes that land the ladder on whole marks', () => {
  const [best] = suggestDiluents({
    strength: 40, doses: [0.2, 0.4, 0.6, 0.8, 1.0],
    vialCapacityMl: 5, syringeCapacityUnits: 100,
  });
  close(best.diluentMl, 4);
  close(best.perUnit, 0.1);
  assert.equal(best.wholeCount, 5);
});

test('recommender will not suggest more than the vial holds', () => {
  const recs = suggestDiluents({
    strength: 60, doses: [1, 2, 4], vialCapacityMl: 3, syringeCapacityUnits: 100,
  });
  assert.ok(recs.every((r) => r.diluentMl <= 3));
});

test('draw warnings catch slivers, overfilled syringes and rounding drift', () => {
  const syringe = { capacityUnits: 50, label: '0.5 mL / 50 unit' };
  const tiny = drawWarnings({ units: 1.2, roundedUnits: 1, errorPct: -16, syringe });
  assert.ok(tiny.some((w) => w.code === 'too-small'));
  assert.ok(tiny.some((w) => w.code === 'rounding'));

  const over = drawWarnings({ units: 80, roundedUnits: 80, errorPct: 0, syringe });
  assert.ok(over.some((w) => w.code === 'over-capacity' && w.level === 'danger'));

  const fine = drawWarnings({ units: 20, roundedUnits: 20, errorPct: 0, syringe });
  assert.equal(fine.length, 0);
});

test('a mismatched unit family is refused rather than guessed at', () => {
  assert.throws(
    () => doseToUnits({ strength: 5000, strengthUnit: 'iu', diluentMl: 2, dose: 1, doseUnit: 'mg' }),
    /different kinds of unit/
  );
});
