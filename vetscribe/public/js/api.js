/** The server, and the two things this phone remembers about itself. */

const KEYS = { token: 'vetscribe.token', device: 'vetscribe.device', provider: 'vetscribe.provider' };

function read(k) { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } }
function write(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }

export const prefs = {
  get token() { return read(KEYS.token); }, set token(v) { write(KEYS.token, v); },
  get device() { return read(KEYS.device); }, set device(v) { write(KEYS.device, v); },
  get provider() { return read(KEYS.provider); }, set provider(v) { write(KEYS.provider, v); },
};

export class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

async function call(method, path, body, { raw = false } = {}) {
  const headers = {};
  if (prefs.token) headers.authorization = `Bearer ${prefs.token}`;
  if (body !== undefined && !raw) headers['content-type'] = 'application/json';
  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'No connection to the server.');
  }
  const text = await res.text();
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
  const data = isJson && text ? JSON.parse(text) : text;
  if (!res.ok) throw new ApiError(res.status, (isJson && data.error) || `Server error ${res.status}`, isJson ? data.code : null);
  return data;
}

export const api = {
  health: () => call('GET', '/api/health'),
  schedule: (date) => call('GET', `/api/schedule${date ? `?date=${date}` : ''}`),
  brief: (id, date) => call('GET', `/api/appointments/${id}/brief${date ? `?date=${date}` : ''}`),
  visits: () => call('GET', '/api/visits'),
  openVisit: (appointmentId, date) => call('POST', '/api/visits', { appointmentId, date, startedBy: prefs.device }),
  visit: (id) => call('GET', `/api/visits/${id}`),
  startSegment: (id, role, mime) => call('POST', `/api/visits/${id}/segments`, { role, speaker: prefs.device, mime }),
  appendAudio: (id, sid, blob) => call('PUT', `/api/visits/${id}/segments/${sid}/audio`, blob, { raw: true }),
  finishSegment: (id, sid, body) => call('POST', `/api/visits/${id}/segments/${sid}/finish`, body),
  removeSegment: (id, sid) => call('DELETE', `/api/visits/${id}/segments/${sid}`),
  setTranscript: (id, sid, transcript) => call('PUT', `/api/visits/${id}/segments/${sid}/transcript`, { transcript }),
  redraft: (id) => call('POST', `/api/visits/${id}/redraft`),
  updateDraft: (id, patch) => call('PUT', `/api/visits/${id}/draft`, patch),
  noteText: (id) => call('GET', `/api/visits/${id}/note.txt`),
  finalize: (id, actions) => call('POST', `/api/visits/${id}/finalize`, { signedBy: prefs.device, actions }),
  reopen: (id) => call('POST', `/api/visits/${id}/reopen`),
};
