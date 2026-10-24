import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testService, TECH_TRANSCRIPT, DOCTOR_TRANSCRIPT, NOTE_TRANSCRIPT } from './helpers.js';

test('a visit goes intake -> exam -> voice note -> finalize, and the PIMS gets the note', async () => {
  const { visits, pims, cleanup } = await testService();
  try {
    const sched = await visits.schedule({ date: '2026-10-24' });
    assert.equal(sched[0].visit, null);
    assert.ok(sched[0].briefing.flags.length > 0);

    const v = await visits.open({ appointmentId: 'appt-1001', date: '2026-10-24', startedBy: 'Sam' });
    assert.equal(v.status, 'open');
    assert.equal((await visits.open({ appointmentId: 'appt-1001', date: '2026-10-24' })).id, v.id, 'opening twice returns the same visit');
    assert.equal((await visits.schedule({ date: '2026-10-24' }))[0].visit.id, v.id);
    assert.equal((await pims.getAppointment('appt-1001', { date: '2026-10-24' })).status, 'in_room');

    const s1 = await visits.startSegment(v.id, { role: 'tech', speaker: 'Sam' });
    await visits.appendAudio(v.id, s1.id, Buffer.from('chunk1'));
    await visits.appendAudio(v.id, s1.id, Buffer.from('chunk2'));
    await visits.finishSegment(v.id, s1.id, { liveTranscript: TECH_TRANSCRIPT });
    await assert.rejects(() => visits.appendAudio(v.id, s1.id, Buffer.from('late')), /no longer recording/);
    await visits.whenIdle(v.id);
    let cur = await visits.get(v.id);
    assert.equal(cur.processing, false);
    assert.equal(cur.stage, 'tech_intake');
    assert.equal(cur.segments[0].status, 'done');
    assert.equal(cur.segments[0].bytes, 12);
    assert.equal(cur.segments[0].transcriptSource, 'browser');
    assert.equal(cur.soap.assessment.doctor_exam_pending, true);
    assert.equal(cur.drafts.length, 1);

    const s2 = await visits.startSegment(v.id, { role: 'doctor', speaker: 'Dr. Patel' });
    await visits.finishSegment(v.id, s2.id, { liveTranscript: DOCTOR_TRANSCRIPT });
    await visits.whenIdle(v.id);
    cur = await visits.get(v.id);
    assert.equal(cur.stage, 'doctor_exam');
    assert.equal(cur.soap.assessment.doctor_exam_pending, false);

    await visits.updateDraft(v.id, { noteText: 'Hand-written final note' });
    assert.equal(visits.noteText(await visits.get(v.id)), 'Hand-written final note');

    const s3 = await visits.startSegment(v.id, { role: 'addendum' });
    await visits.finishSegment(v.id, s3.id, { typedTranscript: NOTE_TRANSCRIPT });
    await visits.whenIdle(v.id);
    cur = await visits.get(v.id);
    assert.equal(cur.stage, 'addendum');
    assert.equal(cur.segments[2].transcriptSource, 'typed');
    assert.equal(cur.noteOverride, null, 'a redraft replaces the hand edit');
    assert.ok(cur.soap.changes_from_previous.length > 0);

    const actions = cur.soap.pims_actions.filter((a) => a.kind !== 'declined_recommendation');
    const done = await visits.finalize(v.id, { signedBy: 'Dr. Patel', actions });
    assert.equal(done.status, 'finalized');
    assert.equal(done.pimsResult.accepted, true);
    assert.equal(pims.notes.length, 1);
    assert.equal(pims.notes[0].patientId, 'pt-3301');
    assert.equal(pims.notes[0].actions.length, actions.length);
    assert.match(pims.notes[0].text, /Finalized .* by Dr\. Patel/);
    assert.match(pims.notes[0].text, /Galliprant/);
    assert.equal((await pims.getAppointment('appt-1001', { date: '2026-10-24' })).status, 'complete');

    await assert.rejects(() => visits.startSegment(v.id, { role: 'doctor' }), /finalized/);
    await assert.rejects(() => visits.updateDraft(v.id, { noteText: 'x' }), /finalized/);
    assert.equal((await visits.finalize(v.id)).status, 'finalized', 'finalizing twice is a no-op');
    assert.equal((await visits.reopen(v.id)).status, 'open');
  } finally { await cleanup(); }
});

test('a transcript with no text leaves the visit idle and without a draft', async () => {
  const { visits, cleanup } = await testService();
  try {
    const v = await visits.open({ appointmentId: 'appt-1002', date: '2026-10-24' });
    const s = await visits.startSegment(v.id, { role: 'tech' });
    await visits.finishSegment(v.id, s.id, { liveTranscript: '   ' });
    await visits.whenIdle(v.id);
    const cur = await visits.get(v.id);
    assert.equal(cur.processing, false);
    assert.equal(cur.soap, null);
    assert.match(cur.segments[0].warning, /No live captions/);
    await assert.rejects(() => visits.finalize(v.id), /no note/);
  } finally { await cleanup(); }
});

test('a scribe failure is recorded on the visit instead of crashing the queue', async () => {
  const { visits, cleanup } = await testService();
  try {
    visits.scribe = { draft: async () => { throw new Error('model down'); } };
    const v = await visits.open({ appointmentId: 'appt-1003', date: '2026-10-24' });
    const s = await visits.startSegment(v.id, { role: 'tech' });
    await visits.finishSegment(v.id, s.id, { liveTranscript: 'Puppy here for boosters, 6.8 kg.' });
    await visits.whenIdle(v.id);
    const cur = await visits.get(v.id);
    assert.equal(cur.processing, false);
    assert.equal(cur.lastError, 'model down');
    assert.equal(cur.segments[0].transcript, 'Puppy here for boosters, 6.8 kg.');
  } finally { await cleanup(); }
});

test('editing a transcript redrafts; bad roles are refused', async () => {
  const { visits, cleanup } = await testService();
  try {
    const v = await visits.open({ appointmentId: 'appt-1007', date: '2026-10-24' });
    await assert.rejects(() => visits.startSegment(v.id, { role: 'owner' }), /role must be/);
    const s = await visits.startSegment(v.id, { role: 'tech' });
    await visits.finishSegment(v.id, s.id, { liveTranscript: 'Limping right front. Temp 101.' });
    await visits.whenIdle(v.id);
    await visits.setTranscript(v.id, s.id, 'Limping right front since Saturday. Temp 102.4, heart rate 110, resp 30. Weighs 19.9 kg.');
    await visits.whenIdle(v.id);
    const cur = await visits.get(v.id);
    assert.equal(cur.segments[0].transcriptSource, 'edited');
    assert.equal(cur.soap.objective.vitals.temperature_f, 102.4);
    assert.equal(cur.drafts.length, 2);
  } finally { await cleanup(); }
});
