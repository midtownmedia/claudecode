import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costBreakdown, totalBurn, amortiseCycle, vialsPerCycle, spendSummary } from '../public/js/lib/cost.js';
import { dosesPerWeek, nextDoseAt, titrationStatus, vialExpiry, vialDuration, BAC_WATER, STERILE_WATER_CAUTION } from '../public/js/lib/schedule.js';
import { migrate, suggestSite, importJson, exportJson, DEFAULT_STATE, SITES } from '../public/js/lib/store.js';
import { checkDose, checkEscalation, checkFirstDose } from '../public/js/lib/safety.js';
import { doseToUnits, smallestMeasurableDose, MAX_BAC_WATER_ML } from '../public/js/lib/calc.js';
import { peptide, PEPTIDES, sheetFor } from '../public/js/data/peptides.js';
import { bestSyringeFor } from '../public/js/data/syringes.js';

const close = (a, b, tol = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} to be within ${tol} of ${b}`);

test('cost per day follows how often you dose, not just the bottle price', () => {
  const daily = costBreakdown({ vialPrice: 275, dosesPerVial: 40, freqId: 'qd' });
  close(daily.perDose, 6.875);
  close(daily.perDay, 6.875);

  const weekly = costBreakdown({ vialPrice: 275, dosesPerVial: 40, freqId: 'qw' });
  close(weekly.perDose, 6.875);
  close(weekly.perDay, 6.875 / 7);
});

test('shipping and consumables land in the per-dose price', () => {
  const b = costBreakdown({
    vialPrice: 200, vialsPerOrder: 2, shipping: 20,
    bacPrice: 30, bacBottleMl: 30, diluentMl: 3,
    syringeBoxPrice: 20, syringesPerBox: 100, syringesPerDose: 1,
    otherPerDose: 0.05, dosesPerVial: 10, freqId: 'qd',
  });
  close(b.shipPerVial, 10);
  close(b.landedVial, 210);
  close(b.bacPerVial, 3);
  close(b.consumablesPerDose, 0.25);
  close(b.perDose, (210 + 3) / 10 + 0.25);
});

test('SS-31 at the top of its ladder is over a thousand a month', () => {
  const p = peptide('ss-31');
  // The sheet stated both units and mg; 30 units = 5 mg only resolves at 50 mg in 3 mL.
  assert.equal(p.pricing.strength, 50);
  assert.ok(!p.strengthUnconfirmed);
  const calc = doseToUnits({ strength: 50, diluentMl: 3, dose: 10 });
  assert.equal(calc.dosesPerVial, 5);
  const b = costBreakdown({ vialPrice: 230, dosesPerVial: 5, freqId: 'qd' });
  close(b.perDay, 46);
  assert.ok(b.perMonth > 1300, `expected over 1300/month, got ${b.perMonth}`);
  assert.equal(p.pricing.vialPrice, 230);
});

test('a course-based compound reports both the on-cycle and averaged cost', () => {
  const p = peptide('epitalon');
  const perDay = costBreakdown({ vialPrice: 170, dosesPerVial: 10, freqId: 'qd' }).perDay;
  close(perDay, 17);
  const a = amortiseCycle({ perDay, cycle: p.cycle });
  close(a.perCycle, 340);          // two 50 mg bottles per 20 day course
  close(a.cyclesPerYear, 2, 0.01);
  close(a.perYear, 680, 5);
  assert.ok(a.amortisedPerDay < 2, 'averaged over a year it should be under 2 a day');
  assert.equal(vialsPerCycle({ doseMg: 5, daysOn: 20, vialStrengthMg: 50 }), 2);
});

test('daily burn adds up across protocols', () => {
  const t = totalBurn([{ perDay: 6.875 }, { perDay: 46 }, { perDay: NaN }]);
  assert.equal(t.count, 2);
  close(t.perDay, 52.875);
  close(t.perYear, 52.875 * 365.2425, 1e-4);
});

test('spend summary averages actual purchases over their span', () => {
  const at = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const s = spendSummary([
    { at: at(10), amount: 100 }, { at: at(0), amount: 200 }, { at: at(5), amount: null },
  ]);
  assert.equal(s.count, 2);
  close(s.total, 300);
  assert.ok(s.averagePerDay > 0 && s.averagePerDay < 100);
});

test('frequency drives doses per week and the next due date', () => {
  close(dosesPerWeek('qd'), 7);
  close(dosesPerWeek('q6d'), 7 / 6);
  close(dosesPerWeek('2xw'), 2);
  assert.equal(dosesPerWeek('prn'), 0);

  const next = nextDoseAt('2026-01-01T09:00:00.000Z', 'q6d');
  assert.equal(next.toISOString().slice(0, 10), '2026-01-07');
  assert.equal(nextDoseAt('2026-01-01T09:00:00.000Z', 'prn'), null);
});

test('titration reports the current step and when the next one is due', () => {
  const ladder = peptide('tirzepatide').ladder;
  const start = '2026-01-01T00:00:00.000Z';
  const early = titrationStatus({ ladder, startDate: start, on: new Date('2026-01-15T00:00:00.000Z') });
  assert.equal(early.step.dose, 2.5);
  assert.equal(early.nextStep.dose, 5);
  assert.equal(early.daysUntilNextStep, 14);

  const later = titrationStatus({ ladder, startDate: start, on: new Date('2026-03-01T00:00:00.000Z') });
  assert.equal(later.step.dose, 7.5);

  const top = titrationStatus({ ladder, startDate: start, on: new Date('2027-01-01T00:00:00.000Z') });
  assert.equal(top.atTop, true);
  assert.equal(top.step.dose, 15);
});

test('bac water is the diluent and gets 28 days from first puncture', () => {
  assert.equal(BAC_WATER.budDays, 28);
  // Sterile water is documented as a caution, not offered as an alternative.
  assert.equal(STERILE_WATER_CAUTION.budDays, 1);

  const opened = new Date(Date.now() - 30 * 86400000).toISOString();
  assert.equal(vialExpiry({ openedAt: opened }).expired, true);

  const fresh = vialExpiry({ openedAt: new Date().toISOString() });
  assert.equal(fresh.expired, false);
  assert.ok(fresh.daysLeft >= 27);
  assert.equal(fresh.diluent.label, 'Bacteriostatic water');
});

test('vial duration converts doses into days at a given cadence', () => {
  close(vialDuration({ dosesPerVial: 40, freqId: 'qd' }).days, 40);
  close(vialDuration({ dosesPerVial: 10, freqId: 'q6d' }).days, 60);
});

test('dose checks flag a reconstitution error rather than a choice', () => {
  const reta = peptide('retatrutide');
  assert.equal(checkDose(2, reta).length, 0);
  assert.equal(checkDose(10, reta)[0].level, 'warn');
  const bad = checkDose(6, reta);
  assert.equal(bad.length, 0, '6 mg is inside the described range');
  const way = checkDose(24, reta);
  assert.equal(way[0].level, 'danger');
  assert.match(way[0].message, /reconstitution error/);
});

test('escalation checks catch doubling and rushing', () => {
  const p = peptide('tirzepatide');
  const jump = checkEscalation({ previousDoseMg: 2.5, nextDoseMg: 5, daysSincePrevious: 28, peptide: p });
  assert.equal(jump[0].level, 'danger');
  const soon = checkEscalation({ previousDoseMg: 5, nextDoseMg: 7.5, daysSincePrevious: 7, peptide: p });
  assert.ok(soon.some((w) => w.code === 'too-soon'));
  const fine = checkEscalation({ previousDoseMg: 5, nextDoseMg: 7.5, daysSincePrevious: 30, peptide: p });
  assert.equal(fine.length, 0);
});

test('site rotation returns the least recently used spot', () => {
  const logs = SITES.slice(0, 3).map((site, i) => ({
    site, at: new Date(Date.now() - i * 86400000).toISOString(),
  }));
  const next = suggestSite(logs);
  assert.ok(!SITES.slice(0, 3).includes(next) || next === SITES[2]);
  assert.equal(suggestSite([]), SITES[0]);
});

test('state migration tolerates junk and preserves what it can', () => {
  assert.deepEqual(migrate(null), DEFAULT_STATE);
  assert.deepEqual(migrate({ protocols: 'nope' }).protocols, []);
  const kept = migrate({ protocols: [{ id: 'a' }], settings: { currency: 'GBP' } });
  assert.equal(kept.protocols.length, 1);
  assert.equal(kept.settings.currency, 'GBP');
  assert.equal(kept.settings.unitsPerMl, 100);
});

test('export round-trips through import', () => {
  const state = { ...DEFAULT_STATE, purchases: [{ id: 'p', at: '2026-01-01', label: 'x', amount: 10 }] };
  const back = importJson(exportJson(state));
  assert.equal(back.purchases[0].amount, 10);
  assert.throws(() => importJson('{'), /not valid JSON/);
  assert.throws(() => importJson('{"a":1}'), /does not look like a backup/);
});

test('the narrowest syringe that fits is the one suggested', () => {
  assert.equal(bestSyringeFor(8).capacityUnits, 30);
  assert.equal(bestSyringeFor(45).capacityUnits, 50);
  assert.equal(bestSyringeFor(90).capacityUnits, 100);
  assert.equal(bestSyringeFor(200), null);
});

test('every compound is internally consistent', () => {
  for (const p of PEPTIDES) {
    assert.ok(p.strengthOptions.includes(p.defaultStrength), `${p.name}: default strength not in its bottle list`);
    assert.ok(p.defaultDiluentMl > 0, `${p.name}: missing default diluent`);
    assert.ok(p.defaultDiluentMl <= p.vialCapacityMl, `${p.name}: default diluent exceeds vial capacity`);
    assert.ok(p.ladder.length > 0, `${p.name}: empty ladder`);
    for (const step of p.ladder) {
      const checks = checkDose(step.dose, p);
      assert.ok(!checks.some((c) => c.level === 'danger'), `${p.name}: ladder step ${step.dose} trips its own redline`);
    }
    if (p.pricing) {
      assert.ok(p.strengthOptions.includes(p.pricing.strength), `${p.name}: priced strength not a listed bottle`);
    }
  }
});

test('sheets that were written for a superseded bottle are marked as such', () => {
  for (const p of PEPTIDES.filter((x) => x.strengthChanged)) {
    const sheet = sheetFor(p.id);
    assert.ok(sheet, `${p.name}: strength changed but no sheet recorded`);
    assert.equal(sheet.sheetStrength, p.strengthChanged.from,
      `${p.name}: sheet should be pinned to the old bottle strength`);
  }
});

test('retatrutide starts at a dose its bottle can actually measure', () => {
  const p = peptide('retatrutide');
  const first = p.ladder[0].dose;
  assert.equal(first, 0.5);
  assert.equal(p.firstDose.max, 1);
  assert.equal(p.highRisk, true);

  // 60 mg at the full 5 mL of bac water must put that first dose on a readable mark.
  const floor = smallestMeasurableDose({ strength: 60, diluentMl: 5, minUnits: 4 });
  assert.ok(first >= floor - 1e-9, `first dose ${first} is below the bottle floor ${floor}`);

  // And the first-dose guard must reject anything above 1 mg with no history.
  assert.equal(checkFirstDose(0.5, p).length, 0);
  assert.equal(checkFirstDose(2, p)[0].level, 'danger');
  assert.match(checkFirstDose(2, p)[0].message, /never exceed 1 mg|ceiling for a first dose/);
  // Once there is history the guard steps aside.
  assert.equal(checkFirstDose(4, p, { hasHistory: true }).length, 0);
});

test('no bottle is asked to hold more than 5 mL of bac water', () => {
  for (const p of PEPTIDES) {
    assert.ok(p.vialCapacityMl <= MAX_BAC_WATER_ML, `${p.name}: capacity over ${MAX_BAC_WATER_ML} mL`);
    assert.ok(p.defaultDiluentMl <= MAX_BAC_WATER_ML, `${p.name}: default water over ${MAX_BAC_WATER_ML} mL`);
  }
});
