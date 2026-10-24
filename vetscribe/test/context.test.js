import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedDay } from '../server/pims/mock.js';
import { buildBriefing } from '../server/ai/context.js';

const day = seedDay(new Date('2026-10-24T12:00:00'));
const by = (name) => day.find((a) => a.patient.name === name);

test('the briefing carries what the SOAP needs from the record', () => {
  const b = buildBriefing(by('Biscuit'));
  assert.match(b.text, /Reason for visit \(front desk\): Annual exam/);
  assert.match(b.text, /9 y 1 mo male neutered Labrador Retriever/);
  assert.match(b.text, /Simparica Trio/);
  assert.match(b.text, /DAPP: given .* \(OVERDUE\)/);
  assert.match(b.text, /Recommended hip radiographs \(declined, cost\)/);
  assert.match(b.text, /Open: |Hip radiographs \(declined last visit\)/);
  assert.match(b.text, /Prefers written estimates/);
  assert.equal(b.headline, 'Biscuit, 9 y 1 mo male neutered Labrador Retriever');
});

test('flags surface weight loss, overdue items, alerts and allergies, worst first', () => {
  const b = buildBriefing(by('Duchess'));
  const kinds = b.flags.map((f) => f.kind);
  assert.ok(kinds.includes('weight'), 'weight loss flagged');
  assert.match(b.flags.find((f) => f.kind === 'weight').text, /lost 8%/);
  assert.ok(kinds.includes('allergy'));
  assert.ok(kinds.includes('alert'));
  assert.ok(kinds.includes('problem'));
  assert.equal(b.flags[0].severity, 'high');
  const biscuit = buildBriefing(by('Biscuit'));
  assert.ok(biscuit.flags.some((f) => f.kind === 'overdue' && /DAPP/.test(f.text)));
});

test('the briefing is deterministic so the prompt cache can hit', () => {
  const a = buildBriefing(by('Mochi'));
  const b = buildBriefing(by('Mochi'));
  assert.equal(a.text, b.text);
  assert.doesNotMatch(a.text, /\d{2}:\d{2}:\d{2}/, 'no timestamps in the briefing');
});

test('an empty record says so instead of guessing', () => {
  const b = buildBriefing({ ...by('Nala'), patient: { ...by('Nala').patient, weightHistory: [], weight: null, vaccines: [], labs: [], recentVisits: [], openRecommendations: [], alerts: [], problems: [], medications: [], allergies: [], preventives: [] } });
  assert.match(b.text, /No weight on file/);
  assert.match(b.text, /## Allergies and adverse reactions\n- none recorded/);
  assert.equal(b.flags.length, 0);
});

test('the briefing never carries client contact details', () => {
  const b = buildBriefing(by('Biscuit'));
  assert.doesNotMatch(b.text, /555-0142/);
  assert.doesNotMatch(b.text, /maria@example\.com/);
  assert.doesNotMatch(b.text, /Alvarez/);
  assert.match(b.text, /## Client\nMaria; prefers text\./);
});
