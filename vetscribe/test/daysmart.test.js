import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DaySmartPims, mapAppointment, mapPatient, harvestRecords } from '../server/pims/daysmart.js';

// Shapes follow the public API reference (response envelope, resources array,
// provider with first/last name, patient with breeds/birthdate/chip).
const APPT = {
  id: 5011, reason: 'Vomiting x2 days', start: '2026-10-24 08:30:00', end: '2026-10-24 09:00:00', status: 'Checked in',
  type: { id: 3, name: 'Sick' }, provider: { id: 7, first_name: 'Anita', last_name: 'Patel' }, location: { id: 1, name: 'Exam 2' },
  client: { id: 310, first_name: 'Devon', last_name: 'Lee' }, patient: { id: 4410, name: 'Mochi' },
};
const PATIENT = { id: 4410, name: 'Mochi', species: { name: 'Feline' }, breeds: [{ name: 'Domestic Shorthair' }], sex: 'Female Spayed', birthdate: '2022-07-15', color: 'Calico', chip: '981020011112222', status: 'Active' };
const CLIENT = { id: 310, first_name: 'Devon', last_name: 'Lee', email: 'devon@example.com', phone: '555-0177' };

function fakeFetch(log, { records = null, fail = {} } = {}) {
  return async (url, init = {}) => {
    const u = new URL(url);
    log.push({ url: u.pathname + u.search, method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body });
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
    if (u.pathname === '/oauth/access_token') return fail.token ? new Response('nope', { status: 401 }) : json({ access_token: 'tok-1', token_type: 'Bearer', expires_in: 3600 });
    if (u.pathname.endsWith('/appointments')) {
      const page = Number(u.searchParams.get('page'));
      const yesterday = { ...APPT, id: 4999, start: '2026-10-23 10:00:00', end: '2026-10-23 10:30:00' };
      return json({ response: { message: 'ok', meta: { pagination: { total_pages: 1 } }, resources: page === 1 ? [yesterday, APPT] : [] } });
    }
    if (u.pathname.endsWith('/appointments/5011')) return json({ response: { resource: APPT } });
    if (u.pathname.endsWith('/patients/4410')) return json({ response: { resource: PATIENT } });
    if (u.pathname.endsWith('/clients/310')) return json({ response: { resource: CLIENT } });
    if (u.pathname.endsWith('/patients/4410/records')) return records ? json({ response: { resources: records } }) : new Response('not found', { status: 404 });
    if (u.pathname.endsWith('/communications') && init.method === 'POST') return json({ response: { resource: { id: 9001 } } });
    return new Response('not found', { status: 404 });
  };
}

function make(log, opts = {}) {
  return new DaySmartPims({
    domain: 'sandbox.vettersoftware.com', apiKey: 'KEY', clientId: 'cid', clientSecret: 'sec', clinicId: '42',
    recordsPath: opts.recordsPath ?? '', noteMode: opts.noteMode ?? 'outbox', dataDir: opts.dataDir ?? '/tmp',
    fetchImpl: fakeFetch(log, opts), now: () => new Date('2026-10-24T13:00:00Z'),
  });
}

test('authenticates with client credentials and sends the documented headers', async () => {
  const log = [];
  const pims = make(log);
  await pims.getSchedule({ date: '2026-10-24' });
  const tok = log[0];
  assert.equal(tok.url, '/oauth/access_token');
  assert.equal(tok.method, 'POST');
  assert.match(tok.body, /grant_type=client_credentials/);
  assert.match(tok.body, /client_id=cid/);
  assert.equal(tok.headers['x-api-key'], 'sec');
  const list = log[1];
  assert.match(list.url, /^\/api\/1\.0\.0\/KEY\/appointments\?/);
  assert.match(list.url, /perPage=200/);
  assert.match(list.url, /category=medical/);
  assert.equal(list.headers.authorization, 'Bearer tok-1');
  assert.equal(list.headers['x-api-key'], 'sec');
  assert.equal(list.headers['x-clinic-id'], '42');
  assert.equal(log.filter((l) => l.url === '/oauth/access_token').length, 1, 'token is cached');
});

test('the schedule is the requested day, enriched from the patient and client records', async () => {
  const log = [];
  const pims = make(log);
  const day = await pims.getSchedule({ date: '2026-10-24' });
  assert.equal(day.length, 1, 'yesterday is filtered out');
  const a = day[0];
  assert.equal(a.id, '5011');
  assert.equal(a.start, '2026-10-24T08:30:00.000Z'.replace('T08:30:00.000Z', new Date('2026-10-24T08:30:00').toISOString().slice(10)));
  assert.equal(a.durationMin, 30);
  assert.equal(a.type, 'Sick');
  assert.equal(a.status, 'checked_in');
  assert.equal(a.provider.name, 'Anita Patel');
  assert.equal(a.room, 'Exam 2');
  assert.equal(a.patient.name, 'Mochi');
  assert.equal(a.patient.species, 'Feline');
  assert.equal(a.patient.breed, 'Domestic Shorthair');
  assert.equal(a.patient.sex, 'FS');
  assert.equal(a.patient.dob, '2022-07-15');
  assert.equal(a.patient.microchip, '981020011112222');
  assert.deepEqual(a.patient.weightHistory, [], 'no weight invented when the API has none');
  assert.equal(a.client.name, 'Devon Lee');
  assert.equal(a.client.phone, '555-0177');
  assert.equal(log.filter((l) => l.url.endsWith('/patients/4410')).length, 1, 'patient fetched once');
});

test('a single appointment lookup uses the direct endpoint', async () => {
  const log = [];
  const pims = make(log);
  const a = await pims.getAppointment('5011');
  assert.equal(a.patient.breed, 'Domestic Shorthair');
  assert.ok(log.some((l) => l.url.endsWith('/appointments/5011')));
});

test('optional patient records are mined for weights, vaccines and prior notes', async () => {
  const log = [];
  const pims = make(log, {
    recordsPath: 'patients/{id}/records',
    records: [
      { type: 'Exam', date: '2026-04-01', weight: 10.8, weight_unit: 'lb', notes: 'Healthy adult. Mild dental calculus.' },
      { type: 'Vaccination', name: 'FVRCP', date: '2026-04-01', due: '2027-04-01' },
      { type: 'Lab Result', name: 'Fecal', date: '2026-04-01', notes: 'Negative' },
      { type: 'Prescription', name: 'Revolution Plus', dose: '1 tube', frequency: 'monthly', date: '2026-04-01' },
    ],
  });
  const a = (await pims.getSchedule({ date: '2026-10-24' }))[0];
  assert.deepEqual(a.patient.weightHistory, [{ value: 10.8, unit: 'lb', date: '2026-04-01' }]);
  assert.equal(a.patient.vaccines[0].name, 'FVRCP');
  assert.equal(a.patient.labs[0].summary, 'Negative');
  assert.equal(a.patient.medications[0].name, 'Revolution Plus');
  assert.match(a.patient.recentVisits[0].assessment, /dental calculus/);
});

test('mapping tolerates camelCase and bare ids', () => {
  const a = mapAppointment({ id: 'A1', startTime: '2026-10-24T09:00:00Z', endTime: '2026-10-24T09:45:00Z', appointmentType: 'Wellness', doctor: 'Dr. Okafor', patient: 'P9', client: 'C9' });
  assert.equal(a.durationMin, 45);
  assert.equal(a.type, 'Wellness');
  assert.equal(a.provider.name, 'Dr. Okafor');
  assert.equal(a.patient.id, 'P9');
  assert.equal(a.client.id, 'C9');
  assert.equal(mapPatient({ sex: 'MN' }).sex, 'MN');
  assert.equal(mapPatient({ gender: 'Male' }).sex, 'M');
  assert.equal(mapPatient({ sex: 'Neutered Male' }).sex, 'MN');
  assert.equal(harvestRecords([{ kind: 'weight', weight: '4.2', unit: 'kg', date: '2026-01-01' }]).weightHistory[0].unit, 'kg');
});

test('finalizing writes to the outbox by default, or logs a communication when asked', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ds-'));
  try {
    const log = [];
    const pims = make(log, { dataDir: dir });
    const r = await pims.postNote({ appointmentId: '5011', patientId: '4410', clientId: '310', signedBy: 'Dr. Patel', text: 'SOAP text', soap: {}, actions: [] });
    assert.equal(r.manual, true);
    assert.match(r.noteId, /^outbox-5011-/);
    const files = await readdir(join(dir, 'outbox'));
    assert.equal(files.length, 2);
    assert.equal(await readFile(join(dir, 'outbox', files.find((f) => f.endsWith('.txt'))), 'utf8'), 'SOAP text');
    assert.equal(log.length, 0, 'no API call for the outbox');

    const log2 = [];
    const comm = make(log2, { dataDir: dir, noteMode: 'communication' });
    const r2 = await comm.postNote({ appointmentId: '5011', patientId: '4410', clientId: '310', signedBy: 'Dr. Patel', text: 'SOAP text', soap: {}, actions: [] });
    assert.equal(r2.manual, false);
    assert.equal(r2.noteId, '9001');
    const post = log2.find((l) => l.method === 'POST' && l.url.endsWith('/communications'));
    assert.equal(JSON.parse(post.body).notes, 'SOAP text');
    assert.equal(JSON.parse(post.body).type, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a failed token request is reported, not swallowed', async () => {
  const log = [];
  const pims = make(log, { fail: { token: true } });
  await assert.rejects(() => pims.getSchedule({ date: '2026-10-24' }), /token request failed \(401\)/);
});
