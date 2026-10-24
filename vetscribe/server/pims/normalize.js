/**
 * The one record shape the rest of the app understands, whatever the practice
 * management system calls things. Every adapter returns these; nothing
 * downstream knows which PIMS is behind them.
 *
 * Design rule: everything in here exists because a SOAP note is better for
 * having it. Signalment goes in the header. Weight history turns a number into
 * a trend. Problems, medications and allergies keep the plan from
 * contradicting the record. The last visit's assessment and plan tell the
 * doctor what this visit is a follow-up to. Open recommendations are the
 * things the client said no to last time and may say yes to today.
 *
 * @typedef {Object} Weight
 * @property {number} value
 * @property {'kg'|'lb'} unit
 * @property {string} date  ISO date
 *
 * @typedef {Object} Patient
 * @property {string} id
 * @property {string} name
 * @property {string} species           e.g. Canine, Feline
 * @property {string} breed
 * @property {'M'|'MN'|'F'|'FS'|'U'} sex   N = neutered, S = spayed
 * @property {string|null} dob          ISO date
 * @property {string} color
 * @property {string|null} microchip
 * @property {Weight|null} weight       most recent
 * @property {Weight[]} weightHistory   newest first
 * @property {string[]} alerts          "Muzzle for nail trims", "Fear Free: gabapentin 2h before"
 * @property {{name:string,status:'active'|'resolved'|'chronic',since:string|null}[]} problems
 * @property {{name:string,dose:string,frequency:string,since:string|null}[]} medications
 * @property {string[]} allergies       drugs, foods, vaccine reactions
 * @property {{name:string,given:string|null,due:string|null}[]} vaccines
 * @property {{name:string,lastGiven:string|null,due:string|null}[]} preventives   HW/flea/tick, HW test, fecal
 * @property {{name:string,date:string,summary:string}[]} labs
 * @property {{date:string,reason:string,assessment:string,plan:string}[]} recentVisits   newest first
 * @property {string[]} openRecommendations   declined or pending items
 *
 * @typedef {Object} Client
 * @property {string} id
 * @property {string} name
 * @property {string} phone
 * @property {string} email
 * @property {string} preferredContact
 * @property {string} notes
 *
 * @typedef {Object} Appointment
 * @property {string} id
 * @property {string} start      ISO datetime
 * @property {number} durationMin
 * @property {string} type       e.g. Wellness, Sick, Recheck, Surgery consult
 * @property {string} reason     the complaint as the front desk typed it
 * @property {string} status     scheduled | checked_in | in_room | complete | no_show
 * @property {string} room
 * @property {{id:string,name:string}} provider
 * @property {{id:string,name:string}} technician
 * @property {Patient} patient
 * @property {Client} client
 * @property {string} notes      front-desk notes for this booking
 */

const SEXES = new Set(['M', 'MN', 'F', 'FS', 'U']);

function str(v, d = '') { return v == null ? d : String(v); }
function arr(v) { return Array.isArray(v) ? v : []; }

export function normalizeWeight(w) {
  if (!w || !Number.isFinite(Number(w.value))) return null;
  return { value: Number(w.value), unit: w.unit === 'lb' ? 'lb' : 'kg', date: str(w.date) };
}

export function normalizePatient(p = {}) {
  const history = arr(p.weightHistory).map(normalizeWeight).filter(Boolean)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const weight = normalizeWeight(p.weight) ?? history[0] ?? null;
  return {
    id: str(p.id),
    name: str(p.name),
    species: str(p.species),
    breed: str(p.breed),
    sex: SEXES.has(p.sex) ? p.sex : 'U',
    dob: p.dob ? str(p.dob) : null,
    color: str(p.color),
    microchip: p.microchip ? str(p.microchip) : null,
    weight,
    weightHistory: history.length ? history : (weight ? [weight] : []),
    alerts: arr(p.alerts).map((a) => str(a)),
    problems: arr(p.problems).map((x) => ({ name: str(x.name), status: str(x.status, 'active'), since: x.since ? str(x.since) : null })),
    medications: arr(p.medications).map((x) => ({ name: str(x.name), dose: str(x.dose), frequency: str(x.frequency), since: x.since ? str(x.since) : null })),
    allergies: arr(p.allergies).map((a) => str(a)),
    vaccines: arr(p.vaccines).map((x) => ({ name: str(x.name), given: x.given ? str(x.given) : null, due: x.due ? str(x.due) : null })),
    preventives: arr(p.preventives).map((x) => ({ name: str(x.name), lastGiven: x.lastGiven ? str(x.lastGiven) : null, due: x.due ? str(x.due) : null })),
    labs: arr(p.labs).map((x) => ({ name: str(x.name), date: str(x.date), summary: str(x.summary) })),
    recentVisits: arr(p.recentVisits).map((x) => ({ date: str(x.date), reason: str(x.reason), assessment: str(x.assessment), plan: str(x.plan) }))
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    openRecommendations: arr(p.openRecommendations).map((a) => str(a)),
  };
}

export function normalizeClient(c = {}) {
  return {
    id: str(c.id), name: str(c.name), phone: str(c.phone), email: str(c.email),
    preferredContact: str(c.preferredContact, 'phone'), notes: str(c.notes),
  };
}

export function normalizeAppointment(a = {}) {
  return {
    id: str(a.id),
    start: str(a.start),
    durationMin: Number(a.durationMin) || 30,
    type: str(a.type, 'Appointment'),
    reason: str(a.reason),
    status: str(a.status, 'scheduled'),
    room: str(a.room),
    provider: { id: str(a.provider?.id), name: str(a.provider?.name) },
    technician: { id: str(a.technician?.id), name: str(a.technician?.name) },
    patient: normalizePatient(a.patient),
    client: normalizeClient(a.client),
    notes: str(a.notes),
  };
}

/* ---- Small helpers the briefing and the UI both want ---- */

export function toKg(w) {
  if (!w) return null;
  return w.unit === 'lb' ? w.value * 0.45359237 : w.value;
}

export function toLb(w) {
  if (!w) return null;
  return w.unit === 'kg' ? w.value / 0.45359237 : w.value;
}

export function ageText(dob, now = new Date()) {
  if (!dob) return 'age unknown';
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return 'age unknown';
  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) months -= 1;
  if (months < 0) return 'age unknown';
  if (months < 12) return `${months} mo`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${y} y ${m} mo` : `${y} y`;
}

export function sexText(sex) {
  return { M: 'male intact', MN: 'male neutered', F: 'female intact', FS: 'female spayed', U: 'sex unknown' }[sex] ?? 'sex unknown';
}

/** Percentage change between the latest weight and the previous one, both in kg. */
export function weightTrend(history) {
  if (!history || history.length < 2) return null;
  const [latest, prev] = history;
  const a = toKg(latest); const b = toKg(prev);
  if (!a || !b) return null;
  return { pct: ((a - b) / b) * 100, from: prev, to: latest };
}
