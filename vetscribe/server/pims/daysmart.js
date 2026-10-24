/**
 * DaySmart Vet (formerly Vetter Software) adapter.
 *
 * Built from the public API reference at sandbox.vettersoftware.com/docs,
 * which documents:
 *   - OAuth2 client credentials: POST /oauth/access_token (form data:
 *     grant_type=client_credentials, client_id, client_secret, scope) with an
 *     x-api-key header; response { access_token, token_type: "Bearer",
 *     expires_in: 3600 }.
 *   - Every request carries Authorization: Bearer, x-api-key, and the clinic
 *     ID in a header. The reference does not show the header's exact name, so
 *     it is configurable (DAYSMART_CLINIC_HEADER, default x-clinic-id).
 *   - Paths under https://{domain}/api/1.0.0/{apiKey}/ for appointments,
 *     appointment-types, appointment-providers, clients, patients and
 *     communications. Lists paginate with page and perPage (max 200) and wrap
 *     results as { response: { message, meta, resources: [...] } }.
 *   - Appointment resources carry id, reason, start, end, type, status (text,
 *     e.g. "Checked in"), provider { id, first_name, last_name }, client,
 *     patient and location. Patient resources carry name, species, color,
 *     sex, breeds, birthdate, chip, status and deceased/inactive dates; weight
 *     is not on the patient.
 *
 * Not documented there: an endpoint that writes a medical record or SOAP
 * note, and where weights, vaccines and prior visit notes live. So:
 *   - Reads map every field name the docs mention, plus the camelCase and
 *     snake_case variants, and leave the rest empty (the briefing says "none
 *     recorded" rather than guessing).
 *   - DAYSMART_RECORDS_PATH, if set (e.g. "patients/{id}/records"), is fetched
 *     per patient and mined for weights, vaccines and notes by field name.
 *   - Write-back defaults to an outbox: the finished note is saved under
 *     DATA_DIR/outbox and the phone shows a Copy button to paste it into the
 *     Vetter SOAP. DAYSMART_NOTE_MODE=communication instead POSTs it as an
 *     in-person communication entry on the client record.
 *
 * Run `node scripts/daysmart-probe.mjs` with real credentials to dump the
 * live shapes and confirm the mapping before relying on it.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeAppointment } from './normalize.js';

const pick = (obj, ...keys) => {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== '') return obj[k];
  }
  return undefined;
};
const nameOf = (o) => {
  if (!o) return '';
  if (typeof o === 'string') return o;
  return pick(o, 'name', 'full_name', 'fullName') ?? [pick(o, 'first_name', 'firstName'), pick(o, 'last_name', 'lastName')].filter(Boolean).join(' ');
};
const idOf = (o) => (o == null ? '' : typeof o === 'object' ? String(pick(o, 'id', 'uuid', 'ID') ?? '') : String(o));
const dateOnly = (v) => (v ? String(v).slice(0, 10) : null);

function sexCode(raw) {
  const s = String(raw ?? '').toLowerCase();
  if (!s) return 'U';
  const neutered = /neuter|spay|castrat|altered|\bmn\b|\bfs\b|\bsf\b|\bnm\b/.test(s);
  if (/^f|female/.test(s)) return neutered ? 'FS' : 'F';
  if (/^m|male/.test(s)) return neutered ? 'MN' : 'M';
  return 'U';
}

function toIso(v) {
  if (!v) return '';
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  const d = new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

/** Looks through free-form record items for the things the briefing wants. */
export function harvestRecords(items = []) {
  const out = { weightHistory: [], vaccines: [], recentVisits: [], labs: [], medications: [], problems: [] };
  for (const r of items) {
    if (!r || typeof r !== 'object') continue;
    const date = dateOnly(pick(r, 'date', 'created_at', 'createdAt', 'visit_date', 'start'));
    const kind = String(pick(r, 'type', 'category', 'record_type', 'kind', 'name') ?? '').toLowerCase();
    const text = pick(r, 'notes', 'note', 'text', 'description', 'body', 'content', 'summary');
    const weight = pick(r, 'weight', 'weight_value', 'weightValue');
    if (weight != null && Number.isFinite(Number(weight))) {
      const unit = String(pick(r, 'weight_unit', 'weightUnit', 'unit') ?? 'lb').toLowerCase().startsWith('k') ? 'kg' : 'lb';
      out.weightHistory.push({ value: Number(weight), unit, date: date ?? '' });
    }
    if (/vacc|immuni/.test(kind)) {
      out.vaccines.push({ name: pick(r, 'name', 'vaccine', 'product', 'title') ?? kind, given: date, due: dateOnly(pick(r, 'due', 'due_date', 'dueDate', 'next_due')) });
    } else if (/lab|result|diagnostic/.test(kind)) {
      out.labs.push({ name: pick(r, 'name', 'test', 'title') ?? kind, date: date ?? '', summary: String(text ?? '') });
    } else if (/soap|exam|visit|medical|note|history/.test(kind) && text) {
      out.recentVisits.push({
        date: date ?? '', reason: pick(r, 'reason', 'title', 'complaint') ?? kind,
        assessment: pick(r, 'assessment') ?? String(text).slice(0, 600), plan: pick(r, 'plan') ?? '',
      });
    } else if (/prescri|medic|rx/.test(kind)) {
      out.medications.push({ name: pick(r, 'name', 'product', 'drug', 'title') ?? kind, dose: pick(r, 'dose', 'strength') ?? '', frequency: pick(r, 'frequency', 'sig', 'instructions') ?? '', since: date });
    } else if (/problem|diagnos|condition/.test(kind)) {
      out.problems.push({ name: pick(r, 'name', 'problem', 'diagnosis', 'title') ?? String(text ?? kind), status: /resolv/.test(String(pick(r, 'status') ?? '')) ? 'resolved' : 'active', since: date });
    }
  }
  out.weightHistory.sort((a, b) => (a.date < b.date ? 1 : -1));
  out.recentVisits.sort((a, b) => (a.date < b.date ? 1 : -1));
  return out;
}

export function mapPatient(p = {}, records = null) {
  const breeds = pick(p, 'breeds', 'breed');
  const breed = Array.isArray(breeds) ? breeds.map((b) => nameOf(b)).filter(Boolean).join(' / ') : nameOf(breeds);
  const h = records ? harvestRecords(records) : null;
  const weight = pick(p, 'weight', 'current_weight', 'currentWeight');
  const weightHistory = h?.weightHistory ?? [];
  if (weight != null && Number.isFinite(Number(weight)) && !weightHistory.length) {
    weightHistory.push({ value: Number(weight), unit: String(pick(p, 'weight_unit', 'weightUnit') ?? 'lb').toLowerCase().startsWith('k') ? 'kg' : 'lb', date: dateOnly(pick(p, 'weight_date', 'weightDate', 'updated_at')) ?? '' });
  }
  return {
    id: idOf(p),
    name: nameOf(p),
    species: nameOf(pick(p, 'species', 'species_name', 'speciesName')),
    breed,
    sex: sexCode(nameOf(pick(p, 'sex', 'gender'))),
    dob: dateOnly(pick(p, 'birthdate', 'birth_date', 'birthDate', 'dob', 'date_of_birth')),
    color: nameOf(pick(p, 'color', 'colour', 'markings')),
    microchip: pick(p, 'chip', 'microchip', 'microchip_number', 'microchipNumber', 'chip_number') ?? null,
    weightHistory,
    alerts: [pick(p, 'alert', 'alerts', 'warning', 'notes_alert')].flat().filter(Boolean).map(String),
    problems: h?.problems ?? [],
    medications: h?.medications ?? [],
    allergies: [pick(p, 'allergies', 'allergy')].flat().filter(Boolean).map((a) => nameOf(a) || String(a)),
    vaccines: h?.vaccines ?? [],
    preventives: [],
    labs: h?.labs ?? [],
    recentVisits: h?.recentVisits ?? [],
    openRecommendations: [],
  };
}

export function mapClient(c = {}) {
  return {
    id: idOf(c),
    name: nameOf(c),
    phone: pick(c, 'phone', 'mobile', 'cell', 'phone_number', 'phoneNumber', 'home_phone') ?? '',
    email: pick(c, 'email', 'email_address', 'emailAddress') ?? '',
    preferredContact: nameOf(pick(c, 'preferred_contact', 'preferredContact', 'contact_preference')) || 'phone',
    notes: pick(c, 'notes', 'note', 'alert') ?? '',
  };
}

export function mapAppointment(a = {}, { patient, client, records } = {}) {
  const start = toIso(pick(a, 'start', 'start_time', 'startTime', 'starts_at', 'date_time', 'datetime'));
  const end = toIso(pick(a, 'end', 'end_time', 'endTime', 'ends_at'));
  const durationMin = start && end ? Math.max(5, Math.round((new Date(end) - new Date(start)) / 60000)) : Number(pick(a, 'duration', 'length') ?? 30);
  const rawPatient = patient ?? pick(a, 'patient', 'pet');
  const rawClient = client ?? pick(a, 'client', 'owner', 'customer');
  const provider = pick(a, 'provider', 'doctor', 'veterinarian', 'resource');
  const type = pick(a, 'type', 'appointment_type', 'appointmentType', 'category');
  return normalizeAppointment({
    id: idOf(a),
    start,
    durationMin,
    type: nameOf(type) || 'Appointment',
    reason: pick(a, 'reason', 'description', 'notes', 'complaint') ?? '',
    status: String(nameOf(pick(a, 'status', 'state')) || 'scheduled').toLowerCase().replace(/\s+/g, '_'),
    room: nameOf(pick(a, 'location', 'room', 'resource_name')),
    provider: { id: idOf(provider), name: nameOf(provider) },
    technician: { id: idOf(pick(a, 'technician', 'tech', 'assistant')), name: nameOf(pick(a, 'technician', 'tech', 'assistant')) },
    patient: mapPatient(typeof rawPatient === 'object' ? rawPatient : { id: rawPatient }, records),
    client: mapClient(typeof rawClient === 'object' ? rawClient : { id: rawClient }),
    notes: pick(a, 'comments', 'internal_notes', 'note') ?? '',
  });
}

export class DaySmartPims {
  constructor({
    domain = 'app.vettersoftware.com', apiKey, clientId, clientSecret, clinicId, clinicHeader = 'x-clinic-id', scope = '',
    tokenPath = '/oauth/access_token', staticToken = '', recordsPath = '', noteMode = 'outbox', communicationType = 2,
    dataDir = './data', fetchImpl = globalThis.fetch, now = () => new Date(), timeoutMs = 20000, maxPages = 10,
  }) {
    if (!apiKey) throw new Error('DAYSMART_API_KEY is required');
    Object.assign(this, { domain, apiKey, clientId, clientSecret, clinicId, clinicHeader, scope, tokenPath, staticToken, recordsPath, noteMode, communicationType, dataDir, fetch: fetchImpl, now, timeoutMs, maxPages });
    this.base = `https://${domain}/api/1.0.0/${apiKey}`;
    this.tokenCache = null;
    this.cache = new Map();
  }

  name() { return `daysmart:${this.domain}`; }

  async token() {
    if (this.staticToken) return this.staticToken;
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 30000) return this.tokenCache.token;
    const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: this.clientId ?? '', client_secret: this.clientSecret ?? '' });
    if (this.scope) body.set('scope', this.scope);
    const res = await this.fetch(`https://${this.domain}${this.tokenPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', 'x-api-key': this.clientSecret ?? '' },
      body: body.toString(),
    });
    const text = await res.text();
    if (!res.ok) throw Object.assign(new Error(`DaySmart token request failed (${res.status}): ${text.slice(0, 200)}`), { status: 502 });
    const json = JSON.parse(text);
    const token = json.access_token ?? json.response?.access_token;
    if (!token) throw Object.assign(new Error('DaySmart token response had no access_token'), { status: 502 });
    this.tokenCache = { token, expiresAt: Date.now() + (Number(json.expires_in ?? 3600) * 1000) };
    return token;
  }

  async request(method, path, { query, body } = {}) {
    const url = new URL(`${this.base}/${path.replace(/^\/+/, '')}`);
    for (const [k, v] of Object.entries(query ?? {})) if (v != null && v !== '') url.searchParams.set(k, String(v));
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetch(url.toString(), {
        method,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${await this.token()}`,
          'x-api-key': this.clientSecret ?? this.apiKey,
          ...(this.clinicId ? { [this.clinicHeader]: String(this.clinicId) } : {}),
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (res.status === 401 && !this.staticToken) this.tokenCache = null;
      if (!res.ok) throw Object.assign(new Error(`DaySmart ${method} ${path} -> ${res.status}: ${text.slice(0, 200)}`), { status: 502 });
      return text ? JSON.parse(text) : {};
    } finally {
      clearTimeout(t);
    }
  }

  /** Unwraps { response: { resources } } or a bare array/object. */
  static resources(json) {
    const r = json?.response ?? json;
    if (Array.isArray(r)) return r;
    if (Array.isArray(r?.resources)) return r.resources;
    if (Array.isArray(r?.data)) return r.data;
    if (r?.resource) return [r.resource];
    return r && typeof r === 'object' && r.id != null ? [r] : [];
  }

  async listAll(path, query = {}) {
    const out = [];
    for (let page = 1; page <= this.maxPages; page += 1) {
      const json = await this.request('GET', path, { query: { ...query, page, perPage: 200 } });
      const items = DaySmartPims.resources(json);
      out.push(...items);
      const meta = json?.response?.meta ?? json?.meta ?? {};
      const total = Number(meta.pagination?.total_pages ?? meta.total_pages ?? meta.totalPages ?? meta.pagination?.totalPages ?? 0);
      if (items.length < 200 || (total && page >= total)) break;
    }
    return out;
  }

  async cached(key, fn) {
    if (!this.cache.has(key)) this.cache.set(key, fn().catch((e) => { this.cache.delete(key); throw e; }));
    return this.cache.get(key);
  }

  async patient(id) {
    if (!id) return null;
    return this.cached(`patient:${id}`, async () => DaySmartPims.resources(await this.request('GET', `patients/${encodeURIComponent(id)}`))[0] ?? null);
  }

  async client(id) {
    if (!id) return null;
    return this.cached(`client:${id}`, async () => DaySmartPims.resources(await this.request('GET', `clients/${encodeURIComponent(id)}`))[0] ?? null);
  }

  async records(patientId) {
    if (!this.recordsPath || !patientId) return null;
    return this.cached(`records:${patientId}`, async () => {
      try { return await this.listAll(this.recordsPath.replace('{id}', encodeURIComponent(patientId))); } catch { return null; }
    });
  }

  async enrich(raw) {
    const pid = idOf(pick(raw, 'patient', 'pet'));
    const cid = idOf(pick(raw, 'client', 'owner', 'customer'));
    const [patient, client, records] = await Promise.all([
      this.patient(pid).catch(() => null), this.client(cid).catch(() => null), this.records(pid),
    ]);
    const inlinePatient = typeof pick(raw, 'patient', 'pet') === 'object' ? pick(raw, 'patient', 'pet') : {};
    const inlineClient = typeof pick(raw, 'client', 'owner', 'customer') === 'object' ? pick(raw, 'client', 'owner', 'customer') : {};
    return mapAppointment(raw, { patient: { ...inlinePatient, ...(patient ?? {}) }, client: { ...inlineClient, ...(client ?? {}) }, records: records ?? undefined });
  }

  async getSchedule({ date } = {}) {
    const day = date ?? this.now().toISOString().slice(0, 10);
    // The reference documents page/perPage/category but not a date filter, so
    // the day is selected client-side. DAYSMART_SCHEDULE_QUERY can add one.
    const extra = this.scheduleQuery ? Object.fromEntries(new URLSearchParams(this.scheduleQuery.replaceAll('{date}', day))) : {};
    const all = await this.listAll('appointments', { category: 'medical', ...extra });
    const todays = all.filter((a) => toIso(pick(a, 'start', 'start_time', 'startTime', 'starts_at', 'date_time', 'datetime')).slice(0, 10) === day);
    const mapped = [];
    for (const raw of todays) mapped.push(await this.enrich(raw));
    return mapped.sort((a, b) => (a.start < b.start ? -1 : 1));
  }

  async getAppointment(id, { date } = {}) {
    try {
      const raw = DaySmartPims.resources(await this.request('GET', `appointments/${encodeURIComponent(id)}`))[0];
      if (raw) return this.enrich(raw);
    } catch { /* fall through to the day's list */ }
    return (await this.getSchedule({ date })).find((a) => a.id === String(id)) ?? null;
  }

  /** The reference documents no status write; the schedule status is left to the front desk. */
  async setAppointmentStatus() { return null; }

  async postNote(note) {
    if (this.noteMode === 'communication') {
      const json = await this.request('POST', 'communications', {
        body: {
          client: note.clientId ?? null, patient: note.patientId, date: this.now().toISOString(), type: this.communicationType,
          notes: note.text, description: `VetScribe SOAP${note.signedBy ? ` (${note.signedBy})` : ''}`,
        },
      });
      const created = DaySmartPims.resources(json)[0] ?? json;
      return { noteId: idOf(created) || null, accepted: true, manual: false, message: 'Logged as a communication on the client record. Paste the SOAP into the medical record.' };
    }
    const dir = join(this.dataDir, 'outbox');
    await mkdir(dir, { recursive: true });
    const id = `outbox-${note.appointmentId}-${this.now().toISOString().replace(/[:.]/g, '-')}`;
    await writeFile(join(dir, `${id}.txt`), note.text);
    await writeFile(join(dir, `${id}.json`), JSON.stringify(note, null, 2));
    return { noteId: id, accepted: true, manual: true, message: 'DaySmart Vet has no documented endpoint for writing a SOAP. Copy the note into the Vetter medical record; a copy is in the outbox.' };
  }
}
