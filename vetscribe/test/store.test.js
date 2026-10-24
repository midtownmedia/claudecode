import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tempStore } from './helpers.js';

test('records round-trip and missing ones read as null', async () => {
  const { store, cleanup } = await tempStore();
  try {
    assert.equal(await store.get('visits', 'nope'), null);
    await store.put('visits', 'a', { id: 'a', n: 1 });
    assert.deepEqual(await store.get('visits', 'a'), { id: 'a', n: 1 });
    assert.equal((await store.list('visits')).length, 1);
  } finally { await cleanup(); }
});

test('concurrent updates to one record are serialised', async () => {
  const { store, cleanup } = await tempStore();
  try {
    await store.put('visits', 'a', { id: 'a', n: 0 });
    await Promise.all(Array.from({ length: 20 }, () => store.update('visits', 'a', (r) => { r.n += 1; })));
    assert.equal((await store.get('visits', 'a')).n, 20);
  } finally { await cleanup(); }
});

test('audio chunks append in order', async () => {
  const { store, cleanup } = await tempStore();
  try {
    await store.appendAudio('v1', 's1', Buffer.from('abc'), 'webm');
    const size = await store.appendAudio('v1', 's1', Buffer.from('def'), 'webm');
    assert.equal(size, 6);
    assert.equal((await store.readAudio('v1', 's1', 'webm')).toString(), 'abcdef');
    assert.equal(await store.readAudio('v1', 'missing', 'webm'), null);
  } finally { await cleanup(); }
});

test('ids that could escape the data directory are refused', async () => {
  const { store, cleanup } = await tempStore();
  try {
    await assert.rejects(() => store.get('visits', '../etc'), /bad id/);
    assert.throws(() => store.audioPath('v', '../x'), /bad id/);
  } finally { await cleanup(); }
});
