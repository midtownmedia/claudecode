import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { tempStore, testConfig, TECH_TRANSCRIPT } from './helpers.js';

async function boot(cfgOverrides = {}) {
  const { store, cleanup } = await tempStore();
  const app = await createApp(testConfig(cfgOverrides), { store, log: () => {} });
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const j = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, res };
  };
  return { app, base, j, close: async () => { await new Promise((r) => app.server.close(r)); await cleanup(); } };
}

test('the API runs a visit end to end over HTTP', async () => {
  const { app, base, j, close } = await boot();
  try {
    const h = await j('GET', '/api/health');
    assert.equal(h.status, 200);
    assert.equal(h.data.ai.provider, 'mock');
    assert.ok(h.data.warnings.length >= 1);

    const sched = await j('GET', '/api/schedule?date=2026-10-24');
    assert.equal(sched.data.appointments.length, 8);
    const brief = await j('GET', '/api/appointments/appt-1004/brief?date=2026-10-24');
    assert.match(brief.data.briefing.text, /Chronic kidney disease/);

    assert.equal((await j('POST', '/api/visits', {})).status, 400);
    const v = (await j('POST', '/api/visits', { appointmentId: 'appt-1001', date: '2026-10-24', startedBy: 'Sam' })).data;
    assert.ok(v.id);
    const seg = (await j('POST', `/api/visits/${v.id}/segments`, { role: 'tech', mime: 'audio/webm' })).data;
    for (const part of ['aaaa', 'bbbb']) {
      const r = await fetch(`${base}/api/visits/${v.id}/segments/${seg.id}/audio`, { method: 'PUT', body: part, headers: { 'content-type': 'application/octet-stream' } });
      assert.equal(r.status, 200);
    }
    assert.equal((await j('GET', `/api/visits/${v.id}`)).data.segments[0].bytes, 8);
    const fin = await j('POST', `/api/visits/${v.id}/segments/${seg.id}/finish`, { liveTranscript: TECH_TRANSCRIPT });
    assert.equal(fin.status, 200);
    assert.equal(fin.data.processing, true);
    await app.visits.whenIdle(v.id);
    const cur = (await j('GET', `/api/visits/${v.id}`)).data;
    assert.equal(cur.processing, false);
    assert.equal(cur.soap.objective.vitals.weight.value, 39.4);

    const note = await j('GET', `/api/visits/${v.id}/note.txt`);
    assert.equal(note.res.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.match(note.data, /SUBJECTIVE/);

    assert.equal((await j('PUT', `/api/visits/${v.id}/draft`, { noteText: 'edited' })).status, 200);
    assert.equal((await j('GET', `/api/visits/${v.id}/note.txt`)).data, 'edited');
    assert.equal((await j('POST', `/api/visits/${v.id}/redraft`)).data.processing, true);
    await app.visits.whenIdle(v.id);
    assert.match((await j('GET', `/api/visits/${v.id}/note.txt`)).data, /SUBJECTIVE/);

    const done = await j('POST', `/api/visits/${v.id}/finalize`, { signedBy: 'Dr. Patel' });
    assert.equal(done.data.status, 'finalized');
    assert.equal(app.pims.notes.length, 1);
    assert.equal((await j('POST', `/api/visits/${v.id}/segments`, { role: 'doctor' })).status, 409);
    assert.equal((await j('GET', '/api/visits/nope')).status, 404);
    assert.equal((await j('GET', '/api/nothing')).status, 404);
    assert.equal((await j('GET', '/api/visits')).data.visits.length, 1);
  } finally { await close(); }
});

test('a device token, when set, guards the API but not the app shell', async () => {
  const { base, j, close } = await boot({ authToken: 'clinic-1' });
  try {
    assert.equal((await j('GET', '/api/health')).status, 401);
    assert.equal((await j('GET', '/api/health', undefined, { authorization: 'Bearer clinic-1' })).status, 200);
    assert.equal((await j('GET', '/api/health?token=clinic-1')).status, 200);
    assert.equal((await fetch(`${base}/`)).status, 200);
  } finally { await close(); }
});

test('static files are served and paths cannot escape public/', async () => {
  const { base, close } = await boot();
  try {
    const idx = await fetch(`${base}/`);
    assert.equal(idx.status, 200);
    assert.match(idx.headers.get('content-type'), /text\/html/);
    assert.equal((await fetch(`${base}/visit/abc`)).status, 200, 'app routes fall back to the shell');
    assert.equal((await fetch(`${base}/missing.png`)).status, 404);
    assert.equal((await fetch(`${base}/..%2F..%2Fpackage.json`)).status, 404);
    assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
    const css = await fetch(`${base}/css/app.css`);
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /text\/css/);
  } finally { await close(); }
});
