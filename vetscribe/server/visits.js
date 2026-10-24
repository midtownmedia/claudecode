/**
 * A visit's life: opened from an appointment with a snapshot of the record,
 * fed audio segments (technician intake, doctor exam, voice notes), each of
 * which is transcribed and redrafts the note, edited by people, and finally
 * written back to the practice management system.
 */

import { buildBriefing } from './ai/context.js';
import { renderSoapText } from './ai/render.js';
import { emptyIntake, emptySoap } from './ai/schemas.js';

const ROLES = new Set(['tech', 'doctor', 'addendum']);

function httpError(status, message) { return Object.assign(new Error(message), { status }); }

export class VisitService {
  constructor({ store, pims, scribe, transcriber, now = () => new Date(), log = () => {}, keepAudio = true }) {
    this.store = store;
    this.keepAudio = keepAudio;
    this.pims = pims;
    this.scribe = scribe;
    this.transcriber = transcriber;
    this.now = now;
    this.log = log;
    this.jobs = new Map(); // visitId -> promise chain, so one visit's work runs in order
  }

  /* ---------- schedule ---------- */

  async schedule({ date } = {}) {
    const appts = await this.pims.getSchedule({ date });
    const visits = await this.store.list('visits');
    const byAppt = new Map(visits.map((v) => [v.appointmentId, v]));
    return appts
      .sort((a, b) => (a.start < b.start ? -1 : 1))
      .map((a) => {
        const v = byAppt.get(a.id);
        const briefing = buildBriefing(a);
        return {
          ...a,
          briefing: { headline: briefing.headline, flags: briefing.flags },
          visit: v ? { id: v.id, status: v.status, stage: v.stage, segments: v.segments.length, updatedAt: v.updatedAt, processing: v.processing } : null,
        };
      });
  }

  async brief(appointmentId, { date } = {}) {
    const appt = await this.pims.getAppointment(appointmentId, { date });
    if (!appt) throw httpError(404, 'Appointment not found');
    return { appointment: appt, briefing: buildBriefing(appt) };
  }

  /* ---------- visits ---------- */

  async open({ appointmentId, date, startedBy = '' }) {
    const existing = (await this.store.list('visits')).find((v) => v.appointmentId === appointmentId);
    if (existing) return existing;
    const appt = await this.pims.getAppointment(appointmentId, { date });
    if (!appt) throw httpError(404, 'Appointment not found');
    const t = this.now().toISOString();
    // The visit keeps what the note and the screen need, not the client's
    // contact details; those stay in the practice system.
    const snapshot = { ...appt, client: { ...appt.client, phone: '', email: '' } };
    const visit = {
      id: this.store.newId(),
      appointmentId,
      appointment: snapshot,
      briefing: buildBriefing(appt),
      status: 'open',
      stage: 'none',
      startedBy,
      createdAt: t,
      updatedAt: t,
      segments: [],
      intake: emptyIntake(),
      soap: null,
      soapEditedAt: null,
      noteOverride: null,
      drafts: [],
      processing: false,
      lastError: null,
      finalizedAt: null,
      pimsResult: null,
    };
    await this.store.put('visits', visit.id, visit);
    try { await this.pims.setAppointmentStatus?.(appointmentId, 'in_room'); } catch (e) { this.log('warn', `status update failed: ${e.message}`); }
    return visit;
  }

  async get(id) {
    const v = await this.store.get('visits', id);
    if (!v) throw httpError(404, 'Visit not found');
    return v;
  }

  async list() {
    return (await this.store.list('visits')).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  /* ---------- segments ---------- */

  async startSegment(visitId, { role, speaker = '', mime = 'audio/webm' }) {
    if (!ROLES.has(role)) throw httpError(400, `role must be one of ${[...ROLES].join(', ')}`);
    const id = this.store.newId();
    const ext = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : 'webm';
    const seg = {
      id, role, speaker, mime, ext, bytes: 0,
      startedAt: this.now().toISOString(), endedAt: null,
      status: 'recording', transcript: '', transcriptSource: null, liveTranscript: '', warning: null, error: null,
    };
    await this.store.update('visits', visitId, (v) => {
      if (v.status === 'finalized') throw httpError(409, 'Visit is finalized');
      v.segments.push(seg);
      v.updatedAt = seg.startedAt;
    });
    return seg;
  }

  async appendAudio(visitId, segmentId, chunk) {
    const v = await this.get(visitId);
    const seg = v.segments.find((s) => s.id === segmentId);
    if (!seg) throw httpError(404, 'Segment not found');
    if (seg.status !== 'recording') throw httpError(409, 'Segment is no longer recording');
    const bytes = await this.store.appendAudio(visitId, segmentId, chunk, seg.ext);
    await this.store.update('visits', visitId, (vv) => { const s = vv.segments.find((x) => x.id === segmentId); if (s) s.bytes = bytes; });
    return { bytes };
  }

  /** Discard a segment that was cancelled or recorded by mistake. */
  async removeSegment(visitId, segmentId) {
    const v = await this.store.update('visits', visitId, (vv) => {
      if (vv.status === 'finalized') throw httpError(409, 'Visit is finalized');
      const i = vv.segments.findIndex((s) => s.id === segmentId);
      if (i < 0) throw httpError(404, 'Segment not found');
      vv.segments.splice(i, 1);
      vv.updatedAt = this.now().toISOString();
    });
    if (v.segments.some((s) => s.transcript?.trim())) this.enqueue(visitId, () => this.redraft(visitId, { reason: 'redraft' }));
    else await this.store.update('visits', visitId, (vv) => { vv.soap = null; vv.stage = 'none'; vv.noteOverride = null; });
    return this.get(visitId);
  }

  /**
   * The recording stopped. Transcribe it, then redraft. Returns immediately;
   * the visit carries `processing` until the draft lands.
   */
  async finishSegment(visitId, segmentId, { liveTranscript = '', typedTranscript = '' } = {}) {
    const endedAt = this.now().toISOString();
    const v = await this.store.update('visits', visitId, (vv) => {
      const s = vv.segments.find((x) => x.id === segmentId);
      if (!s) throw httpError(404, 'Segment not found');
      if (s.status !== 'recording') throw httpError(409, 'Segment already finished');
      s.status = 'transcribing';
      s.endedAt = endedAt;
      s.liveTranscript = liveTranscript;
      if (typedTranscript.trim()) {
        s.transcript = typedTranscript.trim();
        s.transcriptSource = 'typed';
        s.status = 'drafting';
      }
      vv.processing = true;
      vv.lastError = null;
      vv.updatedAt = endedAt;
    });
    const seg = v.segments.find((x) => x.id === segmentId);
    this.enqueue(visitId, async () => {
      if (seg.status === 'transcribing') await this.transcribeSegment(visitId, segmentId);
      await this.redraft(visitId, { reason: seg.role === 'addendum' ? 'addendum' : 'segment' });
    });
    return v;
  }

  enqueue(visitId, work) {
    const prev = this.jobs.get(visitId) ?? Promise.resolve();
    const next = prev.then(work).catch(async (e) => {
      this.log('error', `visit ${visitId}: ${e.stack ?? e.message}`);
      await this.store.update('visits', visitId, (v) => { v.lastError = e.message; v.processing = false; v.updatedAt = this.now().toISOString(); }).catch(() => {});
    });
    this.jobs.set(visitId, next);
    return next;
  }

  /** Tests and the finalize step wait here for the background work to settle. */
  async whenIdle(visitId) { await (this.jobs.get(visitId) ?? Promise.resolve()); }

  async transcribeSegment(visitId, segmentId) {
    const v = await this.get(visitId);
    const seg = v.segments.find((s) => s.id === segmentId);
    const audio = await this.store.readAudio(visitId, segmentId, seg.ext);
    const vocabulary = [v.appointment.patient.name, ...v.appointment.patient.medications.map((m) => m.name), ...v.appointment.patient.problems.map((p) => p.name)].join(', ');
    const r = await this.transcriber.transcribe({ audio, mime: seg.mime, liveTranscript: seg.liveTranscript, prompt: `Veterinary visit. ${vocabulary}` });
    await this.store.update('visits', visitId, (vv) => {
      const s = vv.segments.find((x) => x.id === segmentId);
      s.transcript = r.text;
      s.transcriptSource = r.source;
      s.warning = r.warning ?? null;
      s.status = r.text ? 'drafting' : 'done';
      s.audioDeleted = !this.keepAudio && Boolean(r.text);
      vv.updatedAt = this.now().toISOString();
    });
    if (!this.keepAudio && r.text) await this.store.removeAudio(visitId, segmentId, seg.ext);
  }

  async redraft(visitId, { reason = 'redraft' } = {}) {
    const v = await this.get(visitId);
    const hasText = v.segments.some((s) => s.transcript?.trim());
    if (!hasText) {
      await this.store.update('visits', visitId, (vv) => { vv.processing = false; vv.updatedAt = this.now().toISOString(); });
      return v;
    }
    const d = await this.scribe.draft({ visit: v, reason });
    return this.store.update('visits', visitId, (vv) => {
      vv.intake = d.intake;
      vv.soap = d.soap;
      vv.stage = d.meta.stage;
      vv.soapEditedAt = null;
      vv.noteOverride = null;
      vv.drafts.push(d.meta);
      for (const s of vv.segments) if (s.status === 'drafting') s.status = 'done';
      vv.processing = false;
      vv.lastError = null;
      vv.updatedAt = this.now().toISOString();
    });
  }

  /** Explicit "regenerate" from the phone. */
  async requestRedraft(visitId) {
    await this.store.update('visits', visitId, (v) => { if (v.status === 'finalized') throw httpError(409, 'Visit is finalized'); v.processing = true; });
    this.enqueue(visitId, () => this.redraft(visitId, { reason: 'redraft' }));
    return this.get(visitId);
  }

  async setTranscript(visitId, segmentId, text) {
    await this.store.update('visits', visitId, (v) => {
      const s = v.segments.find((x) => x.id === segmentId);
      if (!s) throw httpError(404, 'Segment not found');
      s.transcript = text;
      s.transcriptSource = 'edited';
      v.updatedAt = this.now().toISOString();
    });
    return this.requestRedraft(visitId);
  }

  /* ---------- the note ---------- */

  /**
   * People edit three things: the structured draft, the final note text
   * (kept as an override until the next redraft), and nothing else.
   */
  async updateDraft(visitId, { intake, soap, noteText }) {
    return this.store.update('visits', visitId, (v) => {
      if (v.status === 'finalized') throw httpError(409, 'Visit is finalized');
      if (intake) v.intake = intake;
      if (soap) { v.soap = soap; v.soapEditedAt = this.now().toISOString(); }
      if (noteText !== undefined) v.noteOverride = noteText === null || noteText === '' ? null : String(noteText);
      v.updatedAt = this.now().toISOString();
    });
  }

  noteText(v) {
    if (v.noteOverride) {
      const stamp = v.status === 'finalized' && v.finalizedAt ? `Finalized ${v.finalizedAt}${v.signedBy ? ` by ${v.signedBy}` : ''}\n` : '';
      return stamp + v.noteOverride;
    }
    return renderSoapText(v.soap ?? emptySoap(), { appointment: v.appointment, visit: v, briefing: v.briefing });
  }

  async finalize(visitId, { signedBy = '', actions = null } = {}) {
    await this.whenIdle(visitId);
    const v = await this.get(visitId);
    if (v.status === 'finalized') return v;
    if (v.processing) throw httpError(409, 'A draft is still being written; wait for it.');
    if (!v.soap) throw httpError(409, 'There is no note to send yet.');
    const finalizedAt = this.now().toISOString();
    const text = this.noteText({ ...v, status: 'finalized', finalizedAt, signedBy });
    const chosen = Array.isArray(actions) ? actions : v.soap.pims_actions;
    const result = await this.pims.postNote({
      appointmentId: v.appointmentId,
      patientId: v.appointment.patient.id,
      clientId: v.appointment.client.id,
      signedBy,
      text,
      soap: v.soap,
      intake: v.intake,
      vitals: v.soap.objective?.vitals ?? null,
      actions: chosen,
    });
    try { await this.pims.setAppointmentStatus?.(v.appointmentId, 'complete'); } catch (e) { this.log('warn', `status update failed: ${e.message}`); }
    return this.store.update('visits', visitId, (vv) => {
      vv.status = 'finalized';
      vv.finalizedAt = finalizedAt;
      vv.signedBy = signedBy;
      vv.pimsResult = result;
      vv.updatedAt = vv.finalizedAt;
    });
  }

  async reopen(visitId) {
    return this.store.update('visits', visitId, (v) => { v.status = 'open'; v.updatedAt = this.now().toISOString(); });
  }
}
