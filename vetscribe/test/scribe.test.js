import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testService, TECH_TRANSCRIPT, DOCTOR_TRANSCRIPT, NOTE_TRANSCRIPT } from './helpers.js';
import { AnthropicModel } from '../server/ai/client.js';
import { Scribe, stageFor } from '../server/ai/scribe.js';
import { buildDraftRequest, scribeSystemPrompt } from '../server/ai/prompts.js';
import { DRAFT_SCHEMA, emptySoap, emptyIntake } from '../server/ai/schemas.js';
import { renderSoapText } from '../server/ai/render.js';
import { buildBriefing } from '../server/ai/context.js';
import { seedDay } from '../server/pims/mock.js';

const appt = seedDay(new Date('2026-10-24T12:00:00'))[0];
const visitWith = (segments, extra = {}) => ({ id: 'v', appointment: appt, briefing: buildBriefing(appt), segments, soap: null, intake: null, soapEditedAt: null, ...extra });
const seg = (role, transcript, id = role) => ({ id, role, transcript, startedAt: '08:00', endedAt: '08:10', transcriptSource: 'browser' });

test('the request puts the briefing first with its own cache breakpoint, then the labelled transcripts', () => {
  const v = visitWith([seg('tech', TECH_TRANSCRIPT), seg('doctor', DOCTOR_TRANSCRIPT)]);
  const blocks = buildDraftRequest({ briefing: v.briefing, visit: v, stage: 'doctor_exam' });
  assert.equal(blocks.length, 2);
  assert.match(blocks[0].text, /^<briefing>/);
  assert.deepEqual(blocks[0].cache_control, { type: 'ephemeral' });
  assert.match(blocks[1].text, /<segment id="tech" role="tech"/);
  assert.match(blocks[1].text, /<segment id="doctor" role="doctor"/);
  assert.match(blocks[1].text, /stage="doctor_exam"/);
  assert.doesNotMatch(blocks[1].text, /<previous_draft/);
  const redo = buildDraftRequest({ briefing: v.briefing, visit: v, stage: 'addendum', previousDraft: { intake: emptyIntake(), soap: emptySoap() }, previousEdited: true });
  assert.match(redo[1].text, /<previous_draft edited_by_human="true">/);
});

test('stage follows the roles present', () => {
  assert.equal(stageFor(visitWith([seg('tech', 'x')])), 'tech_intake');
  assert.equal(stageFor(visitWith([seg('tech', 'x'), seg('doctor', 'y')])), 'doctor_exam');
  assert.equal(stageFor(visitWith([seg('tech', 'x')]), { reason: 'addendum' }), 'addendum');
  assert.equal(stageFor(visitWith([seg('tech', ''), seg('doctor', '  ')])), 'tech_intake');
});

test('the system prompt states the rules the practice cares about', () => {
  const s = scribeSystemPrompt({ practiceName: 'Midtown Vet' });
  for (const must of ['Midtown Vet', 'DOCUMENT, DO NOT INVENT', 'null', 'discrepancy_with_record', 'CLIENT COMMUNICATION', 'PIMS ACTIONS', 'changes_from_previous', 'doctor_exam_pending']) {
    assert.ok(s.includes(must), must);
  }
});

test('mock scribe: a technician intake yields S and O with the assessment pending', async () => {
  const { scribe, cleanup } = await testService();
  try {
    const d = await scribe.draft({ visit: visitWith([seg('tech', TECH_TRANSCRIPT)]) });
    assert.equal(d.meta.stage, 'tech_intake');
    assert.equal(d.soap.assessment.doctor_exam_pending, true);
    assert.deepEqual(d.soap.objective.vitals.weight, { value: 39.4, unit: 'kg' });
    assert.equal(d.soap.objective.vitals.temperature_f, 101.8);
    assert.equal(d.soap.objective.vitals.heart_rate, 96);
    assert.equal(d.soap.objective.vitals.resp_rate, 24);
    assert.equal(d.soap.objective.vitals.mucous_membranes, 'pink');
    assert.equal(d.soap.objective.vitals.bcs_9, 7);
    assert.equal(d.intake.vitals.weight.value, 39.4);
    assert.ok(d.intake.owner_concerns.some((c) => /thyroid/i.test(c)));
    assert.ok(d.intake.tech_observations.some((c) => /favouring/i.test(c)));
    assert.ok(d.soap.subjective.pertinent_record_history.some((l) => /hip radiographs/i.test(l)), 'last plan carried forward');
    assert.ok(d.soap.pims_actions.some((a) => a.kind === 'vitals_update'));
    assert.equal(d.soap.plan.medications_prescribed.length, 0);
  } finally { await cleanup(); }
});

test('mock scribe: the doctor segment completes the note and its PIMS actions', async () => {
  const { scribe, cleanup } = await testService();
  try {
    const d = await scribe.draft({ visit: visitWith([seg('tech', TECH_TRANSCRIPT), seg('doctor', DOCTOR_TRANSCRIPT)]) });
    assert.equal(d.meta.stage, 'doctor_exam');
    assert.equal(d.soap.assessment.doctor_exam_pending, false);
    assert.ok(d.soap.objective.physical_exam.some((e) => e.system === 'Cardiovascular' && !e.abnormal));
    assert.ok(d.soap.objective.physical_exam.some((e) => e.system === 'Musculoskeletal' && e.abnormal));
    assert.ok(d.soap.assessment.problems.some((p) => /osteoarthritis/i.test(p.problem)));
    assert.ok(d.soap.plan.medications_prescribed.some((m) => /Galliprant/.test(m.name) && m.dose === '60 mg' && m.route === 'PO'));
    assert.ok(d.soap.plan.diagnostics_ordered.some((x) => /bloodwork/i.test(x)));
    assert.match(d.soap.plan.follow_up.recheck, /2 weeks/i);
    assert.ok(d.soap.plan.client_communication.recommendations_declined.some((x) => /declined the radiographs/i.test(x)));
    const kinds = d.soap.pims_actions.map((a) => a.kind);
    for (const k of ['vaccine_given', 'lab_order', 'prescription', 'declined_recommendation', 'recheck_booking']) assert.ok(kinds.includes(k), k);
    assert.ok(d.soap.flags.some((f) => f.kind === 'open_recommendation_not_addressed'), 'untouched open recommendation flagged');
  } finally { await cleanup(); }
});

test('mock scribe: a voice note lists what changed', async () => {
  const { scribe, cleanup } = await testService();
  try {
    const d = await scribe.draft({ visit: visitWith([seg('tech', TECH_TRANSCRIPT), seg('doctor', DOCTOR_TRANSCRIPT), seg('addendum', NOTE_TRANSCRIPT)]), reason: 'addendum' });
    assert.equal(d.meta.stage, 'addendum');
    assert.ok(d.soap.changes_from_previous.some((c) => /approved the hip radiographs/i.test(c)));
  } finally { await cleanup(); }
});

test('the Claude call is shaped for structured output, caching and fallback', async () => {
  let captured = null;
  const fake = { beta: { messages: { parse: async (params) => { captured = params; return { stop_reason: 'end_turn', parsed_output: { intake: emptyIntake(), soap: emptySoap() }, usage: { input_tokens: 10, output_tokens: 5, iterations: [] }, model: 'claude-sonnet-5-5' }; } } } };
  const model = new AnthropicModel({ model: 'claude-sonnet-5-5', effort: 'medium', client: fake });
  const scribe = new Scribe({ model, practiceName: 'Test Vet' });
  const d = await scribe.draft({ visit: visitWith([seg('tech', TECH_TRANSCRIPT)]) });
  assert.equal(d.meta.model, 'claude-sonnet-5-5');
  assert.equal(captured.model, 'claude-sonnet-5-5');
  assert.equal(captured.max_tokens, 16000);
  assert.deepEqual(captured.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(captured.fallbacks, 'default');
  assert.equal(captured.output_config.effort, 'medium');
  assert.equal(captured.output_config.format.type, 'json_schema');
  assert.deepEqual(Object.keys(captured.output_config.format.schema.properties), ['intake', 'soap']);
  assert.deepEqual(captured.system[0].cache_control, { type: 'ephemeral' });
  assert.equal(captured.messages[0].role, 'user');
  assert.equal('thinking' in captured, false, 'thinking is left to the model default');
  assert.equal('temperature' in captured, false);
});

test('refusals and truncation surface as errors, not empty notes', async () => {
  const mk = (resp) => new AnthropicModel({ model: 'm', effort: 'low', client: { beta: { messages: { parse: async () => resp } } } });
  await assert.rejects(() => mk({ stop_reason: 'refusal', stop_details: { category: 'general_harms' }, parsed_output: null }).generate({ system: '', user: [], schema: DRAFT_SCHEMA }), /declined/);
  await assert.rejects(() => mk({ stop_reason: 'max_tokens', parsed_output: null }).generate({ system: '', user: [], schema: DRAFT_SCHEMA }), /output limit/);
  await assert.rejects(() => mk({ stop_reason: 'end_turn', parsed_output: null }).generate({ system: '', user: [], schema: DRAFT_SCHEMA }), /schema/);
});

test('the rendered note reads as a SOAP and warns when the doctor has not seen the patient', () => {
  const soap = emptySoap();
  soap.subjective.presenting_complaint = 'Limping';
  soap.objective.vitals.weight = { value: 20, unit: 'kg' };
  soap.objective.vitals.temperature_f = 101.2;
  soap.plan.medications_prescribed.push({ name: 'Carprofen', dose: '75 mg', route: 'PO', frequency: 'q12h', duration: '7 days', instructions: 'with food' });
  soap.flags.push({ kind: 'missing_vital', detail: 'No heart rate stated.' });
  const text = renderSoapText(soap, { appointment: appt, briefing: buildBriefing(appt) });
  assert.match(text, /^Biscuit, 9 y 1 mo male neutered Labrador Retriever \| Owner: Maria Alvarez/);
  assert.match(text, /TECHNICIAN INTAKE DRAFT: doctor exam pending/);
  assert.match(text, /SUBJECTIVE\nCC: Limping/);
  assert.match(text, /Vitals: Wt 20\.0 kg \(44\.1 lb\), T 101\.2 F/);
  assert.match(text, /Rx:\n- Carprofen 75 mg PO q12h 7 days - with food/);
  assert.match(text, /REVIEW FLAGS\n- \[missing_vital\]/);
  soap.assessment.doctor_exam_pending = false;
  assert.doesNotMatch(renderSoapText(soap, { appointment: appt }), /doctor exam pending/);
});
