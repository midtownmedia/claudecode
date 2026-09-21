import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  load, save, migrate, importJson, exportJson, mergeWithStored, markDeleted,
  recentDuplicate, storageAvailable, DEFAULT_STATE, DUPLICATE_WINDOW_MS,
} from '../public/js/lib/store.js';

const KEY = 'pdt.state.v1';

/** A localStorage stand-in that can be told to misbehave. */
function fakeStorage({ failWrites = false, throwOnAccess = false } = {}) {
  const map = new Map();
  return {
    get throws() { return throwOnAccess; },
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (failWrites) {
        const e = new Error('QuotaExceededError');
        e.name = 'QuotaExceededError';
        throw e;
      }
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

function withStorage(ls, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const prev = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });
  try {
    return fn();
  } finally {
    if (had) globalThis.localStorage = prev;
    else delete globalThis.localStorage;
  }
}

const stateWith = (over = {}) => ({ ...structuredClone(DEFAULT_STATE), ...over });

test('save reports failure instead of swallowing it', () => {
  withStorage(fakeStorage({ failWrites: true }), () => {
    const ok = save(stateWith({ logs: [{ id: 'a', protocolId: 'p', at: new Date().toISOString() }] }));
    assert.equal(ok, false, 'a write that did not land must report false');
  });
  withStorage(fakeStorage(), () => {
    assert.equal(save(stateWith()), true);
  });
});

test('save with no storage at all reports failure rather than throwing', () => {
  withStorage(undefined, () => {
    assert.equal(save(stateWith()), false);
  });
});

test('storageAvailable detects a browser that blocks writes', () => {
  withStorage(fakeStorage({ failWrites: true }), () => assert.equal(storageAvailable(), false));
  withStorage(fakeStorage(), () => assert.equal(storageAvailable(), true));
});

test('a stale copy of the app cannot erase a dose logged by another copy', () => {
  const ls = fakeStorage();
  withStorage(ls, () => {
    // Morning: both copies start from the same state.
    const morning = stateWith({ protocols: [{ id: 'p1', nickname: 'Reta' }] });
    assert.equal(save(morning), true);

    // Copy B logs the evening dose.
    const copyB = load();
    copyB.logs.push({ id: 'dose-evening', protocolId: 'p1', at: '2026-01-01T18:00:00.000Z' });
    assert.equal(save(copyB), true);

    // Copy A has been open since the morning and knows nothing about it, then
    // the user edits a label there. This used to overwrite the evening dose.
    morning.protocols[0].nickname = 'Retatrutide';
    assert.equal(save(morning), true);

    const final = load();
    assert.equal(final.logs.length, 1, 'the evening dose must survive the stale write');
    assert.equal(final.logs[0].id, 'dose-evening');
    assert.equal(final.protocols[0].nickname, 'Retatrutide', 'the edit still applies');
  });
});

test('the merge also brings the other copy up to date in memory', () => {
  const ls = fakeStorage();
  withStorage(ls, () => {
    const a = stateWith();
    save(a);
    const b = load();
    b.logs.push({ id: 'x', protocolId: 'p', at: '2026-01-01T00:00:00.000Z' });
    save(b);

    save(a); // a knew nothing of x
    assert.equal(a.logs.length, 1, 'after saving, this copy reflects what is stored');
    assert.equal(a.logs[0].id, 'x');
  });
});

test('a deletion is not resurrected by a merge', () => {
  const ls = fakeStorage();
  withStorage(ls, () => {
    const a = stateWith({ logs: [{ id: 'd1', protocolId: 'p', at: '2026-01-01T00:00:00.000Z' }] });
    save(a);

    const b = load();
    b.logs = b.logs.filter((l) => l.id !== 'd1');
    markDeleted(b, 'logs', 'd1');
    assert.equal(save(b), true);

    // `a` still holds the deleted record and writes afterwards.
    assert.equal(save(a), true);
    assert.equal(load().logs.length, 0, 'a tombstone must outrank a stale copy holding the record');
  });
});

test('mergeWithStored unions records and honours both sides of a deletion', () => {
  const mine = stateWith({
    logs: [{ id: 'm1', at: '2026-01-02T00:00:00.000Z' }],
    deleted: { protocols: [], logs: ['gone'], purchases: [] },
  });
  const stored = stateWith({
    logs: [{ id: 's1', at: '2026-01-01T00:00:00.000Z' }, { id: 'gone', at: '2026-01-01T00:00:00.000Z' }],
  });
  const merged = mergeWithStored(mine, stored);
  const ids = merged.logs.map((l) => l.id).sort();
  assert.deepEqual(ids, ['m1', 's1']);
});

test('unreadable stored data is preserved rather than silently replaced', () => {
  const ls = fakeStorage();
  ls.setItem(KEY, '{"protocols":[{"id":"p1"} TRUNCATED');
  withStorage(ls, () => {
    const state = load();
    assert.equal(state.loadFailed, true, 'the app must know the load failed');
    assert.equal(state.protocols.length, 0);
    const sidecar = [...ls._map.keys()].find((k) => k.startsWith('pdt.state.v1.corrupt.'));
    assert.ok(sidecar, 'the unreadable original must be kept for recovery');
    assert.match(ls._map.get(sidecar), /TRUNCATED/);
  });
});

test('an absent key is a fresh install, not a failure', () => {
  withStorage(fakeStorage(), () => {
    const state = load();
    assert.equal(state.loadFailed, undefined);
    assert.deepEqual(state.protocols, []);
  });
});

test('importing a partial backup is refused instead of wiping the other half', () => {
  // Only logs: this used to import "successfully" and erase every protocol.
  assert.throws(() => importJson('{"logs":[{"id":"a"}]}'), /incomplete|missing/i);
  // Only protocols: used to erase the entire dose history.
  assert.throws(() => importJson('{"protocols":[{"id":"a"}]}'), /incomplete|missing/i);
  // Right keys, wrong shape.
  assert.throws(() => importJson('{"protocols":[],"logs":{"2026-01-01":{}}}'), /incomplete|missing/i);
  // Still rejects something that is not a backup at all.
  assert.throws(() => importJson('{"a":1}'), /does not look like a backup/);
  assert.throws(() => importJson('{'), /not valid JSON/);
});

test('a complete backup still round-trips', () => {
  const state = stateWith({
    protocols: [{ id: 'p1', peptideId: 'retatrutide' }],
    logs: [{ id: 'l1', protocolId: 'p1', at: '2026-01-01T00:00:00.000Z' }],
    purchases: [{ id: 'x1', at: '2026-01-01', label: 'Reta', amount: 200 }],
  });
  const back = importJson(exportJson(state));
  assert.equal(back.protocols.length, 1);
  assert.equal(back.logs.length, 1);
  assert.equal(back.purchases[0].amount, 200);
});

test('a double tap is caught before it becomes a second dose', () => {
  const now = Date.parse('2026-01-01T12:00:00.000Z');
  const logs = [{ id: 'l1', protocolId: 'p1', at: '2026-01-01T11:59:30.000Z' }];
  assert.ok(recentDuplicate(logs, 'p1', now), 'a dose 30 seconds ago is a double tap');
  assert.equal(recentDuplicate(logs, 'p2', now), null, 'a different protocol is not');
  const old = [{ id: 'l1', protocolId: 'p1', at: new Date(now - DUPLICATE_WINDOW_MS - 1000).toISOString() }];
  assert.equal(recentDuplicate(old, 'p1', now), null, 'a genuinely earlier dose is not');
});

test('migration still tolerates junk and keeps what it can', () => {
  assert.deepEqual(migrate(null), DEFAULT_STATE);
  assert.deepEqual(migrate({ protocols: 'nope' }).protocols, []);
  const kept = migrate({ protocols: [{ id: 'a' }], settings: { currency: 'GBP' } });
  assert.equal(kept.settings.currency, 'GBP');
  assert.deepEqual(kept.deleted, { protocols: [], logs: [], purchases: [] });
});
