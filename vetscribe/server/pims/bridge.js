/**
 * The HTTP bridge: a small JSON contract a practice implements once against
 * whatever PIMS it runs (ezyVet, Cornerstone, AVImark, Shepherd, Pulse,
 * Vetspire, Digitail...). The app only ever talks to the bridge, so swapping
 * the PIMS means rewriting the bridge, not the app.
 *
 *   GET  {base}/schedule?date=YYYY-MM-DD        -> { appointments: Appointment[] }
 *   GET  {base}/appointments/{id}               -> Appointment
 *   POST {base}/appointments/{id}/status        <- { status }
 *   POST {base}/appointments/{id}/note          <- { patientId, text, soap, vitals, actions }
 *                                               -> { noteId, accepted: true }
 *
 * Shapes are the ones in normalize.js. Fields the bridge can't source may be
 * omitted; they normalize to empty, and the briefing says so instead of
 * guessing.
 */

import { normalizeAppointment } from './normalize.js';

export class BridgePims {
  constructor({ baseUrl, token = '', fetchImpl = globalThis.fetch, timeoutMs = 15000 }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  name() { return 'bridge'; }

  async call(method, path, body) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetch(this.baseUrl + path, {
        method,
        headers: {
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (!res.ok) throw Object.assign(new Error(`PIMS bridge ${method} ${path} -> ${res.status}: ${text.slice(0, 200)}`), { status: 502 });
      return text ? JSON.parse(text) : {};
    } finally {
      clearTimeout(t);
    }
  }

  async getSchedule({ date } = {}) {
    const q = date ? `?date=${encodeURIComponent(date)}` : '';
    const out = await this.call('GET', `/schedule${q}`);
    return (out.appointments ?? out ?? []).map(normalizeAppointment);
  }

  async getAppointment(id) {
    const out = await this.call('GET', `/appointments/${encodeURIComponent(id)}`);
    return out ? normalizeAppointment(out) : null;
  }

  async setAppointmentStatus(id, status) {
    return this.call('POST', `/appointments/${encodeURIComponent(id)}/status`, { status });
  }

  async postNote(note) {
    const out = await this.call('POST', `/appointments/${encodeURIComponent(note.appointmentId)}/note`, note);
    return { noteId: out.noteId ?? null, accepted: out.accepted !== false, raw: out };
  }
}
