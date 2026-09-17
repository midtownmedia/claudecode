import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderTotal, bottlesForDuration, daysOfSupply, formatMoney } from '../public/js/lib/cost.js';
import { PEPTIDES, peptide } from '../public/js/data/peptides.js';

const close = (a, b, tol = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} to be within ${tol} of ${b}`);

test('bottles needed covers the period without under-ordering', () => {
  // Retatrutide 4 mg every 6 days for 12 weeks from 60 mg bottles.
  const n = bottlesForDuration({ doseMg: 4, freqId: 'q6d', days: 84, vialStrengthMg: 60 });
  assert.equal(n, 1);
  const got = daysOfSupply({ bottles: n, vialStrengthMg: 60, doseMg: 4, freqId: 'q6d' });
  assert.ok(got >= 84, `1 bottle should cover 12 weeks, covers ${got}`);
});

test('a 20 day Epitalon course needs two 50 mg bottles', () => {
  assert.equal(bottlesForDuration({ doseMg: 5, freqId: 'qd', days: 20, vialStrengthMg: 50 }), 2);
  close(daysOfSupply({ bottles: 2, vialStrengthMg: 50, doseMg: 5, freqId: 'qd' }), 20);
});

test('daily high-dose compounds empty a bottle fast', () => {
  close(daysOfSupply({ bottles: 1, vialStrengthMg: 50, doseMg: 10, freqId: 'qd' }), 5);
  close(daysOfSupply({ bottles: 1, vialStrengthMg: 40, doseMg: 1, freqId: 'qd' }), 40);
});

test('order total prices lines, shipping and the span it covers', () => {
  const o = orderTotal([
    { id: 'reta', qty: 1, unitPrice: 200, strength: 60, doseMg: 4, freqId: 'q6d' },
    { id: 'ss31', qty: 2, unitPrice: 230, strength: 50, doseMg: 10, freqId: 'qd' },
    { id: 'skip', qty: 0, unitPrice: 999, strength: 10, doseMg: 1, freqId: 'qd' },
  ], { shipping: 25 });

  assert.equal(o.lines.length, 2, 'zero-quantity lines are dropped');
  assert.equal(o.bottles, 3);
  close(o.subtotal, 660);
  close(o.total, 685);

  // SS-31 at 10 mg daily is the line that runs dry first.
  close(o.coversDays, 10);
  close(o.longestDays, 90);
  const ss = o.lines.find((l) => l.id === 'ss31');
  close(ss.perDay, 46);
  close(ss.costPerMg, 4.6);
});

test('an empty order is zero rather than NaN', () => {
  const o = orderTotal([], { shipping: 0 });
  assert.equal(o.total, 0);
  assert.equal(o.bottles, 0);
  assert.ok(Number.isNaN(o.coversDays));
});

test('every priced compound can be ordered end to end', () => {
  const lines = PEPTIDES.filter((p) => p.pricing).map((p) => ({
    id: p.id, qty: 1, unitPrice: p.pricing.vialPrice, strength: p.pricing.strength,
    doseMg: p.ladder[p.ladder.length - 1].dose, freqId: p.defaultFrequency,
  }));
  const o = orderTotal(lines);
  assert.equal(o.lines.length, lines.length);
  assert.ok(o.total > 0);
  for (const l of o.lines) {
    assert.ok(Number.isFinite(l.days) && l.days > 0, `${l.id}: no supply duration`);
    assert.ok(Number.isFinite(l.perDay), `${l.id}: no per-day cost`);
  }
});

test('money formatting degrades gracefully', () => {
  assert.equal(formatMoney(NaN), '--');
  assert.match(formatMoney(6.875, 'USD', 'en-US'), /^\$6\.8[78]$/);
});
