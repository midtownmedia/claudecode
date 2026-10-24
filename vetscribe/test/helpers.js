import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { MockPims } from '../server/pims/mock.js';
import { MockModel } from '../server/ai/client.js';
import { Scribe } from '../server/ai/scribe.js';
import { BrowserTranscriber } from '../server/transcribe/index.js';
import { VisitService } from '../server/visits.js';
import { loadConfig } from '../server/config.js';

export const TECH_TRANSCRIPT = 'Hi Maria, we are here for Biscuit\'s annual. He has been slowing down on walks for about two months. Is it his thyroid? Temp is 101.8, heart rate 96, resp 24. He weighs 39.4 kg today. Gums are pink. BCS 7. He eats Purina Pro Plan kibble twice a day. He is on Simparica Trio monthly. I noticed he is favouring the left hind when he got up.';
export const DOCTOR_TRANSCRIPT = 'Heart and lungs auscult normal, no murmur. Abdomen soft, no pain on palpation. Pain on extension of both hips, worse on the left, with crepitus. Teeth have moderate calculus. I think this is likely hip osteoarthritis progressing versus a soft tissue injury. I recommend we run bloodwork with a thyroid panel today. Let\'s do hip radiographs. I\'m going to send him home with Galliprant 60 mg by mouth once a day for 14 days. We talked about the weight target of 34 kg. Recheck in 2 weeks. Call us if he stops eating. Rabies booster given today. Owner declined the radiographs today, wants to think about it.';
export const NOTE_TRANSCRIPT = 'Addendum: owner called back and approved the hip radiographs for Thursday.';

export async function tempStore() {
  const dir = await mkdtemp(join(tmpdir(), 'vetscribe-'));
  const store = await new Store(dir).init();
  return { store, dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

export function fixedNow(iso = '2026-10-24T13:05:00.000Z') {
  let t = new Date(iso).getTime();
  return () => new Date((t += 1000));
}

export async function testService() {
  const { store, cleanup } = await tempStore();
  const now = fixedNow();
  const pims = new MockPims({ now });
  const scribe = new Scribe({ model: new MockModel(), practiceName: 'Test Vet' });
  const visits = new VisitService({ store, pims, scribe, transcriber: new BrowserTranscriber(), now });
  return { store, pims, scribe, visits, cleanup, now };
}

export function testConfig(overrides = {}) {
  return loadConfig({ authToken: '', ai: { provider: 'mock', model: 'mock', effort: 'medium', hasKey: false }, transcribe: { provider: 'browser' }, pims: { adapter: 'mock' }, ...overrides });
}
