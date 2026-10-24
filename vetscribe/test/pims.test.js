import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockPims, seedDay } from '../server/pims/mock.js';
import { BridgePims } from '../server/pims/bridge.js';
import { normalizeAppointment, weightTrend, ageText } from '../server/pims/normalize.js';

test('the seeded day is a normalised schedule with history on every patient', async () => {
  const day = seedDay(new Date('2026-10-24T12:00:00'));
  assert.ok(day.length >= 6);
  for (const a of day) {
    assert.ok(a.id && a.start && a.patient.name && a.client.name, a.id);
    assert.ok(a.patient.weightHistory.length >= 1, `${a.patient.name} has a weight`);
    assert.ok(a.patient.recentVisits.length >= 1, `${a.patient.name} has a prior visit`);
    assert.ok(a.patient.weightHistory.every((w, i, arr) => i === 0 || arr[i - 1].date >= w.date), 'weights newest first');
  }
});

test('the mock PIMS accepts notes and status changes', async () => {
  const pims = new MockPims({ now: () => new Date('2026-10-24T14:00:00Z') });
  const appt = (await pims.getSchedule({ date: '2026-10-24' }))[0];
  await pims.setAppointmentStatus(appt.id, 'in_room');
  assert.equal((await pims.getAppointment(appt.id, { date: '2026-10-24' })).status, 'in_room');
  const r = await pims.postNote({ appointmentId: appt.id, patientId: appt.patient.id, text: 'SOAP', soap: {}, vitals: null, actions: [] });
  assert.equal(r.accepted, true);
  assert.equal(pims.notes.length, 1);
});

test('normalisation fills gaps instead of throwing', () => {
  const a = normalizeAppointment({ id: 7, patient: { name: 'Rex', sex: 'dog', weight: { value: '12', unit: 'lb' } } });
  assert.equal(a.id, '7');
  assert.equal(a.patient.sex, 'U');
  assert.deepEqual(a.patient.weight, { value: 12, unit: 'lb', date: '' });
  assert.equal(a.patient.weightHistory.length, 1);
  assert.deepEqual(a.patient.vaccines, []);
  assert.equal(a.durationMin, 30);
});

test('weight trend and age helpers', () => {
  const t = weightTrend([{ value: 3.4, unit: 'kg', date: '2026-07-01' }, { value: 3.7, unit: 'kg', date: '2026-04-01' }]);
  assert.ok(t.pct < -8 && t.pct > -9);
  assert.equal(weightTrend([{ value: 3.4, unit: 'kg', date: '2026-07-01' }]), null);
  assert.equal(ageText('2017-09-10', new Date('2026-10-24')), '9 y 1 mo');
  assert.equal(ageText('2026-07-18', new Date('2026-10-24')), '3 mo');
  assert.equal(ageText(null), 'age unknown');
});

test('the bridge adapter speaks the documented contract', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, auth: init.headers.authorization, body: init.body ? JSON.parse(init.body) : null });
    if (url.endsWith('/schedule?date=2026-10-24')) return new Response(JSON.stringify({ appointments: [{ id: 'x1', start: '2026-10-24T09:00:00Z', patient: { id: 'p1', name: 'Ace' }, client: { name: 'Kim' } }] }));
    if (url.endsWith('/appointments/x1')) return new Response(JSON.stringify({ id: 'x1', patient: { name: 'Ace' } }));
    if (url.endsWith('/appointments/x1/note')) return new Response(JSON.stringify({ noteId: 'n9', accepted: true }));
    return new Response('nope', { status: 500 });
  };
  const bridge = new BridgePims({ baseUrl: 'http://pims.local/', token: 'secret', fetchImpl });
  const list = await bridge.getSchedule({ date: '2026-10-24' });
  assert.equal(list[0].patient.name, 'Ace');
  assert.equal(calls[0].auth, 'Bearer secret');
  assert.equal((await bridge.getAppointment('x1')).id, 'x1');
  const r = await bridge.postNote({ appointmentId: 'x1', patientId: 'p1', text: 'note', soap: {}, vitals: null, actions: [] });
  assert.equal(r.noteId, 'n9');
  assert.equal(calls.at(-1).body.text, 'note');
  await assert.rejects(() => bridge.setAppointmentStatus('zz', 'complete'), /500/);
});
