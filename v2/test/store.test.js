import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState, merge, added, saveLocal, loadLocal, toFile, fromFile, unsaved, normalize, KEY, fileName,
} from '../public/js/store.js';
import { makeExample } from '../public/js/example.js';
import { draw } from '../public/js/math.js';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

const dose = (id, at, extra = {}) => ({ id, at, protocolId: 'p', peptideId: 'retatrutide', doseMg: 1, units: 8, ...extra });

test('merging keeps entries from both sides', () => {
  const a = { ...emptyState(), doses: [dose('1', '2026-09-01T08:00:00Z')] };
  const b = { ...emptyState(), doses: [dose('2', '2026-09-08T08:00:00Z')] };
  const m = merge(a, b);
  assert.deepEqual(m.doses.map((d) => d.id).sort(), ['1', '2']);
  assert.deepEqual(added(a, m), { protocols: 0, doses: 1, weights: 0 });
});

test('the newer edit of the same record wins', () => {
  const old = { id: 'p', doseMg: 1, updatedAt: '2026-09-01T00:00:00Z' };
  const edited = { id: 'p', doseMg: 2, updatedAt: '2026-09-10T00:00:00Z' };
  assert.equal(merge({ ...emptyState(), protocols: [old] }, { ...emptyState(), protocols: [edited] }).protocols[0].doseMg, 2);
  assert.equal(merge({ ...emptyState(), protocols: [edited] }, { ...emptyState(), protocols: [old] }).protocols[0].doseMg, 2);
});

test('a deletion on either side is not undone by a merge', () => {
  const a = { ...emptyState(), doses: [] , deleted: { protocols: [], doses: ['1'], weights: [] } };
  const b = { ...emptyState(), doses: [dose('1', '2026-09-01T08:00:00Z')] };
  assert.equal(merge(a, b).doses.length, 0);
  assert.equal(merge(b, a).doses.length, 0);
});

test('saving merges with what another open copy already stored', () => {
  const ls = memoryStorage();
  const tab = { ...emptyState(), doses: [dose('tab', '2026-09-01T08:00:00Z')] };
  const home = { ...emptyState(), doses: [dose('home', '2026-09-02T08:00:00Z')] };
  assert.ok(saveLocal(tab, ls));
  const stored = saveLocal(home, ls);
  assert.deepEqual(stored.doses.map((d) => d.id).sort(), ['home', 'tab']);
  assert.equal(loadLocal(ls).doses.length, 2);
});

test('a failed write is reported, not hidden', () => {
  const broken = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } };
  assert.equal(saveLocal(emptyState(), broken), null);
  assert.equal(saveLocal(emptyState(), null), null);
});

test('unreadable storage loads as empty instead of crashing', () => {
  const ls = memoryStorage();
  ls.setItem(KEY, '{not json');
  assert.deepEqual(loadLocal(ls).doses, []);
});

test('a saved file opens back to the same log', () => {
  const s = makeExample(Date.UTC(2026, 8, 23));
  s.settings.weightUnit = 'kg';
  const back = fromFile(toFile(s));
  assert.equal(back.doses.length, s.doses.length);
  assert.equal(back.weights.length, s.weights.length);
  assert.equal(back.protocols.length, s.protocols.length);
  assert.equal(back.settings.weightUnit, 'kg');
});

test('files that are not a log are refused with a readable reason', () => {
  assert.throws(() => fromFile('hello'), /could not be read/);
  assert.throws(() => fromFile('{"a":1}'), /not a peptide log/);
  assert.throws(() => fromFile('[1,2]'), /not a peptide log/);
  assert.throws(() => fromFile(JSON.stringify({ app: 'peptides', format: 99 })), /newer version/);
});

test('backups from the first version of the app open too', () => {
  const old = {
    version: 1,
    settings: { currency: 'USD' },
    protocols: [{
      id: 'x', peptideId: 'mots-c', nickname: '', strength: 40, diluentMl: 4, dose: 0.4,
      frequency: 'qd', syringeId: 'u100-03', openedAt: '2026-09-01', startDate: '2026-08-20', active: true,
      cost: { vialPrice: 275 },
    }],
    logs: [{ id: 'l1', protocolId: 'x', peptideId: 'mots-c', label: 'MOTS-c', at: '2026-09-02T08:00:00Z', doseMg: 0.4, units: 4, site: 'Left thigh' }],
    purchases: [],
    deleted: { protocols: [], logs: ['gone'], purchases: [] },
  };
  const s = fromFile(JSON.stringify(old));
  assert.equal(s.protocols[0].waterMl, 4);
  assert.equal(s.protocols[0].doseMg, 0.4);
  assert.equal(s.protocols[0].syringe, 30);
  assert.equal(s.protocols[0].price, 275);
  assert.equal(s.doses[0].units, 4);
  assert.deepEqual(s.deleted.doses, ['gone']);
});

test('the log knows when it has changes that are not in a file', () => {
  const s = emptyState();
  assert.equal(unsaved(s), false);
  s.changedAt = '2026-09-10T00:00:00Z';
  assert.equal(unsaved(s), true);
  s.settings.fileSavedAt = '2026-09-11T00:00:00Z';
  assert.equal(unsaved(s), false);
});

test('junk records are dropped when loading', () => {
  const s = normalize({ doses: [null, { id: 'a' }, dose('b', '2026-01-01')], weights: [{ id: 'w', at: 'x', value: 'heavy' }] });
  assert.deepEqual(s.doses.map((d) => d.id), ['b']);
  assert.equal(s.weights.length, 0);
});

test('file names carry the date', () => {
  assert.match(fileName(new Date(2026, 8, 23, 10)), /^Peptide Log 2026-09-23\.json$/);
});

test('the example is clearly marked and never looks like real data', () => {
  const ex = makeExample();
  assert.equal(ex.example, true);
  assert.ok(ex.weights.length > 20 && ex.doses.length > 40);
  assert.ok(ex.doses.every((d) => d.id.startsWith('ex-')));
  // Its peptides are set up correctly: every current draw fits its syringe.
  for (const pr of ex.protocols) {
    assert.ok(draw({ strength: pr.strength, waterMl: pr.waterMl, doseMg: pr.doseMg, syringeUnits: pr.syringe }).rounded <= pr.syringe, pr.id);
  }
});
