import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  draw, unitsToMg, smallestDose, sheetFactor, suggestWater, checks, dueStatus, bottleStatus,
  nextStep, cost, splitDraw, suggestSite, weightIn, mass, MAX_WATER_ML, DAY, waterProblem,
} from '../public/js/math.js';
import { PEPTIDES, peptide, SITES, frequency, FREQUENCIES } from '../public/js/data.js';

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `expected ${a} ≈ ${b}`);

test('units come from the bottle, not the protocol', () => {
  const d = draw({ strength: 50, waterMl: 3, doseMg: 5 });
  close(d.units, 30); // SS-31: the sheet's "30 units = 5 mg" only works at 50 mg in 3 mL
  assert.equal(d.rounded, 30);
  close(d.ml, 0.3);
  assert.equal(d.dosesPerBottle, 10);

  // The same 30 units from a bottle twice as strong is twice the dose.
  close(unitsToMg({ strength: 100, waterMl: 3, units: 30 }), 10);
});

test('MOTS-c at 4 mL makes one unit exactly 0.1 mg', () => {
  const d = draw({ strength: 40, waterMl: 4, doseMg: 0.2, syringeUnits: 30 });
  close(d.mgPerUnit, 0.1);
  assert.equal(d.rounded, 2);
  close(draw({ strength: 40, waterMl: 4, doseMg: 1 }).rounded, 10);
});

test('the rounded mark is reported honestly', () => {
  // Retatrutide 60 mg in 5 mL: 0.5 mg is 4.17 units, drawn as 4.
  const d = draw({ strength: 60, waterMl: 5, doseMg: 0.5, syringeUnits: 30 });
  close(d.units, 4.1666667, 1e-6);
  assert.equal(d.rounded, 4);
  close(d.actualMg, 0.48);
  assert.ok(d.errorPct < 0 && d.errorPct > -5);
});

test('a 30 unit syringe reads half marks, bigger ones whole marks', () => {
  assert.equal(draw({ strength: 60, waterMl: 5, doseMg: 0.3, syringeUnits: 30 }).rounded, 2.5);
  assert.equal(draw({ strength: 60, waterMl: 5, doseMg: 0.3, syringeUnits: 100 }).rounded, 3);
});

test('a strength change is spelled out as a multiple of the dose', () => {
  // MOTS-c sheet: 10 mg in 3 mL. Now 40 mg in 4 mL: old units give 3x the dose.
  close(sheetFactor({ fromStrength: 10, fromWaterMl: 3, toStrength: 40, toWaterMl: 4 }), 3);
  close(sheetFactor({ fromStrength: 10, fromWaterMl: 3, toStrength: 20, toWaterMl: 3 }), 2);
});

test('the suggested water matches the bottles set up for readability', () => {
  for (const id of ['retatrutide', 'mots-c', 'epitalon']) {
    const p = peptide(id);
    const s = suggestWater({ strength: p.strength, doses: p.ladder.map((x) => x.dose), vialMl: p.vialMl });
    assert.equal(s.waterMl, p.waterMl, `${p.name}: suggested ${s.waterMl} mL, set up with ${p.waterMl} mL`);
  }
});

test('water is only questioned when it causes a real problem', () => {
  // SS-31 at the 3 mL its sheet uses: 5 mg is 30 units, 10 mg is 60. Leave it.
  assert.equal(waterProblem({ strength: 50, waterMl: 3, doses: [5, 10] }), false);
  // Retatrutide at 3 mL: 0.5 mg is 2.5 units, too few marks to measure.
  assert.equal(waterProblem({ strength: 60, waterMl: 3, doses: [0.5, 1, 2] }), true);
  // A dose that will not fit the syringe.
  assert.equal(waterProblem({ strength: 10, waterMl: 5, doses: [3], syringeUnits: 100 }), true);
  // More than a bottle holds.
  assert.equal(waterProblem({ strength: 50, waterMl: 6, doses: [5] }), true);
});

test('the suggestion never goes past what a bottle holds', () => {
  const s = suggestWater({ strength: 60, doses: [0.25], vialMl: 10 });
  assert.ok(s.waterMl <= MAX_WATER_ML);
});

test('a 60 mg retatrutide bottle cannot measure 0.25 mg', () => {
  const p = peptide('retatrutide');
  close(smallestDose({ strength: 60, waterMl: 5 }), 0.48);
  const d = draw({ strength: 60, waterMl: 5, doseMg: 0.25, syringeUnits: 30 });
  const list = checks({ p, doseMg: 0.25, d, syringeUnits: 30, waterMl: 5, hasHistory: true });
  const hit = list.find((w) => /too small to measure/.test(w.text));
  assert.ok(hit, 'expected an unmeasurable warning');
  assert.equal(hit.level, 'danger');
  assert.match(hit.text, /0\.48 mg/);
});

test('first dose ceiling only applies with no history', () => {
  const p = peptide('retatrutide');
  const d = draw({ strength: 60, waterMl: 5, doseMg: 2 });
  const fresh = checks({ p, doseMg: 2, d, waterMl: 5, hasHistory: false });
  assert.ok(fresh.some((w) => w.level === 'danger' && /first/.test(w.text)));
  const known = checks({ p, doseMg: 2, d, waterMl: 5, hasHistory: true });
  assert.ok(!known.some((w) => /first/.test(w.text)));
});

test('the top of a schedule is not flagged as over the limit', () => {
  const p = peptide('semaglutide');
  const d = draw({ strength: p.strength, waterMl: p.waterMl, doseMg: 2.4 });
  assert.ok(!checks({ p, doseMg: 2.4, d, waterMl: p.waterMl, hasHistory: true }).some((w) => w.level === 'danger'));
  const over = draw({ strength: p.strength, waterMl: p.waterMl, doseMg: 24 });
  assert.ok(checks({ p, doseMg: 24, d: over, waterMl: p.waterMl, hasHistory: true }).some((w) => w.level === 'danger'));
});

test('a draw that will not fit the syringe is caught', () => {
  const p = peptide('nad');
  const d = draw({ strength: 500, waterMl: 3, doseMg: 100, syringeUnits: 50 });
  assert.equal(d.rounded, 60);
  assert.ok(checks({ p, doseMg: 100, d, syringeUnits: 50, waterMl: 3, hasHistory: true }).some((w) => /will not fit/.test(w.text)));
});

test('doubling from the last dose is flagged', () => {
  const p = peptide('retatrutide');
  const d = draw({ strength: 60, waterMl: 5, doseMg: 4 });
  assert.ok(checks({ p, doseMg: 4, d, waterMl: 5, hasHistory: true, previousMg: 2 }).some((w) => w.level === 'danger' && /last dose/.test(w.text)));
  const small = draw({ strength: 60, waterMl: 5, doseMg: 3 });
  assert.ok(!checks({ p, doseMg: 3, d: small, waterMl: 5, hasHistory: true, previousMg: 2 }).some((w) => w.level === 'danger'));
});

test('more than 5 mL of water is refused', () => {
  const d = draw({ strength: 60, waterMl: 6, doseMg: 1 });
  assert.ok(checks({ p: peptide('retatrutide'), doseMg: 1, d, waterMl: 6, hasHistory: true }).some((w) => /at most 5 mL/.test(w.text)));
});

test('every schedule works with its own default bottle', () => {
  for (const p of PEPTIDES) {
    assert.ok(p.strengths.includes(p.strength), `${p.name}: default bottle is not in its list`);
    assert.ok(p.waterMl <= p.vialMl && p.waterMl <= MAX_WATER_ML, `${p.name}: default water does not fit`);
    assert.ok(FREQUENCIES.some((f) => f.id === p.freq), `${p.name}: unknown frequency`);
    for (const step of p.ladder) {
      const d = draw({ strength: p.strength, waterMl: p.waterMl, doseMg: step.dose });
      assert.ok(d.rounded <= 100, `${p.name} ${step.dose} mg does not fit a 1 mL syringe`);
      assert.ok(!(step.dose > p.dosing.redline), `${p.name} ${step.dose} mg is past its own limit`);
    }
  }
});

test('due status follows the calendar, not the clock', () => {
  const now = new Date(2026, 8, 23, 8, 0).getTime();
  const lastNight = new Date(2026, 8, 22, 21, 0).toISOString();
  assert.equal(dueStatus({ freq: 'qd', lastAt: lastNight, now }).state, 'due');
  assert.equal(dueStatus({ freq: 'qd', lastAt: new Date(2026, 8, 23, 7, 0).toISOString(), now }).state, 'done');
  const weekly = dueStatus({ freq: 'qw', lastAt: new Date(2026, 8, 20, 8, 0).toISOString(), now });
  assert.equal(weekly.state, 'later');
  assert.equal(new Date(weekly.next).getDate(), 27);
  assert.equal(dueStatus({ freq: 'qd', lastAt: null, now }).state, 'new');
  assert.equal(dueStatus({ freq: 'prn', lastAt: lastNight, now }).state, 'prn');
  const late = dueStatus({ freq: 'qd', lastAt: new Date(2026, 8, 20, 8, 0).toISOString(), now });
  assert.equal(late.lateDays, 2);
});

test('twice a day is due again after most of the gap', () => {
  const now = new Date(2026, 8, 23, 20, 0).getTime();
  assert.equal(dueStatus({ freq: 'bid', lastAt: new Date(2026, 8, 23, 8, 0).toISOString(), now }).state, 'due');
  assert.equal(dueStatus({ freq: 'bid', lastAt: new Date(2026, 8, 23, 15, 0).toISOString(), now }).state, 'done');
});

test('the bottle counts down from the day it was mixed', () => {
  const now = new Date(2026, 8, 23, 12).getTime();
  const pr = { id: 'a', strength: 60, doseMg: 2, mixedAt: new Date(2026, 8, 9, 9).toISOString() };
  const doses = [
    { protocolId: 'a', doseMg: 2, at: new Date(2026, 8, 9, 10).toISOString() },
    { protocolId: 'a', doseMg: 2, at: new Date(2026, 8, 16, 10).toISOString() },
    { protocolId: 'a', doseMg: 1, at: new Date(2026, 8, 1, 10).toISOString() }, // an older bottle
    { protocolId: 'b', doseMg: 9, at: new Date(2026, 8, 16, 10).toISOString() },
  ];
  const b = bottleStatus({ protocol: pr, doses, now });
  close(b.leftMg, 56);
  assert.equal(b.dosesLeft, 28);
  assert.equal(b.daysLeft, 14);
  assert.equal(b.expired, false);
  assert.equal(bottleStatus({ protocol: pr, doses, now: now + 20 * DAY }).expired, true);
});

test('a step up is offered only after the step is held', () => {
  const p = peptide('retatrutide');
  const now = Date.now();
  const ready = nextStep({ p, doseMg: 0.5, since: new Date(now - 15 * DAY).toISOString(), now });
  assert.equal(ready.dose, 1);
  assert.equal(ready.ready, true);
  assert.equal(nextStep({ p, doseMg: 0.5, since: new Date(now - 3 * DAY).toISOString(), now }).ready, false);
  assert.equal(nextStep({ p, doseMg: 12, since: null, now }), null);
  assert.equal(nextStep({ p, doseMg: 0.7, since: null, now }), null);
  // TB-500 tapers down: that is not a step up.
  assert.equal(nextStep({ p: peptide('tb-500'), doseMg: 2.5, since: null, now }), null);
});

test('SS-31 at 10 mg a day is about $46 a dose and over $1,300 a month', () => {
  const c = cost({ price: 230, strength: 50, doseMg: 10, freq: 'qd' });
  close(c.perDose, 46);
  assert.ok(c.perMonth > 1300 && c.perMonth < 1500);
  assert.equal(cost({ price: null, strength: 50, doseMg: 10, freq: 'qd' }), null);
});

test('splitting a dose keeps the day the same', () => {
  // Epitalon 50 mg in 5 mL: 5 mg is 50 units, split 25 and 25.
  const d = draw({ strength: 50, waterMl: 5, doseMg: 5 });
  const s = splitDraw({ rounded: d.rounded });
  assert.equal(s.half, 25);
  assert.equal(s.exact, true);
});

test('the least recently used site is suggested', () => {
  const doses = SITES.slice(0, 5).map((site, i) => ({ site, at: new Date(2026, 0, i + 1).toISOString() }));
  assert.equal(suggestSite(doses, SITES), SITES[5]);
  const all = SITES.map((site, i) => ({ site, at: new Date(2026, 0, i + 1).toISOString() }));
  assert.equal(suggestSite(all, SITES), SITES[0]);
});

test('weight converts both ways', () => {
  close(weightIn({ value: 100, unit: 'kg' }, 'lb'), 220.46226218);
  close(weightIn({ value: 220.46226218, unit: 'lb' }, 'kg'), 100);
  assert.equal(weightIn({ value: 180, unit: 'lb' }, 'lb'), 180);
});

test('masses read the way people say them', () => {
  assert.equal(mass(0.5), '0.5 mg');
  assert.equal(mass(0.25, { mcg: true }), '250 mcg');
  assert.equal(mass(1.333), '1.333 mg');
  assert.equal(frequency('nope').id, 'qd');
});

test('a new peptide starts on the syringe that makes its draw easiest to read', async () => {
  const { newProtocol, bestSyringe } = await import('../public/js/model.js');
  assert.equal(newProtocol(peptide('retatrutide')).syringe, 30); // 4 units
  assert.equal(newProtocol(peptide('ss-31')).syringe, 30); // 30 units
  assert.equal(newProtocol(peptide('epitalon')).syringe, 50); // 50 units
  assert.equal(newProtocol(peptide('nad')).syringe, 30); // 50 mg in 500/3 = 30 units
  assert.equal(bestSyringe(80), 100);
  assert.equal(bestSyringe(150), 100);
});
