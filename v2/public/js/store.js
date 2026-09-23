/**
 * Saving.
 *
 * Two places hold the log:
 *   1. This browser (localStorage), written on every change.
 *   2. A file the person saves and keeps. That is the copy that survives a new
 *      phone, a cleared browser or Safari clearing storage for a site that has
 *      not been opened in a while.
 *
 * Opening a file merges it with what is here rather than replacing it, so
 * opening an old file can never wipe newer entries. Records are matched by id,
 * the newer edit wins, and deletions travel with the data so a merge cannot
 * bring back something that was deleted.
 */

export const KEY = 'peptides.v2';
export const FILE_APP = 'peptides';
export const FILE_FORMAT = 1;
const KINDS = ['protocols', 'doses', 'weights'];

export function emptyState() {
  return {
    v: 2,
    settings: { weightUnit: 'lb', acknowledgedAt: null, fileSavedAt: null, fileName: null },
    protocols: [],
    doses: [],
    weights: [],
    deleted: { protocols: [], doses: [], weights: [] },
    changedAt: null,
  };
}

export function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);

export function normalize(raw) {
  const base = emptyState();
  if (!isObj(raw)) return base;
  const d = isObj(raw.deleted) ? raw.deleted : {};
  return {
    ...base,
    settings: { ...base.settings, ...(isObj(raw.settings) ? raw.settings : {}) },
    protocols: arr(raw.protocols).filter((r) => isObj(r) && r.id),
    doses: arr(raw.doses).filter((r) => isObj(r) && r.id && r.at),
    weights: arr(raw.weights).filter((r) => isObj(r) && r.id && r.at && Number.isFinite(r.value)),
    deleted: {
      protocols: arr(d.protocols),
      doses: arr(d.doses),
      weights: arr(d.weights),
    },
    changedAt: raw.changedAt ?? null,
  };
}

const stamp = (r) => new Date(r.updatedAt ?? r.at ?? 0).getTime() || 0;

function unionById(mine, theirs, gone) {
  const out = new Map();
  for (const r of theirs) if (!gone.has(r.id)) out.set(r.id, r);
  for (const r of mine) {
    if (gone.has(r.id)) continue;
    const other = out.get(r.id);
    if (!other || stamp(r) >= stamp(other)) out.set(r.id, r);
  }
  return [...out.values()];
}

/**
 * Fold `incoming` into `state`. Settings stay as they are on this device.
 */
export function merge(state, incoming) {
  const out = { ...state, deleted: {} };
  for (const k of KINDS) {
    const gone = new Set([...(state.deleted?.[k] ?? []), ...(incoming.deleted?.[k] ?? [])]);
    out.deleted[k] = [...gone];
    out[k] = unionById(state[k] ?? [], incoming[k] ?? [], gone);
  }
  const times = [state.changedAt, incoming.changedAt].filter(Boolean).map((t) => new Date(t).getTime());
  out.changedAt = times.length ? new Date(Math.max(...times)).toISOString() : null;
  return out;
}

/** How many records `after` has that `before` did not. */
export function added(before, after) {
  const count = (k) => {
    const had = new Set(before[k].map((r) => r.id));
    return after[k].filter((r) => !had.has(r.id)).length;
  };
  return { protocols: count('protocols'), doses: count('doses'), weights: count('weights') };
}

/* ------------------------------------------------------------------ *
 * This browser
 * ------------------------------------------------------------------ */

export function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadLocal(ls = browserStorage()) {
  try {
    const raw = ls?.getItem(KEY);
    if (!raw) return emptyState();
    return normalize(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

/**
 * Merge into whatever is stored, then write. The app can be open twice (a tab
 * and a home screen copy), and writing one copy's snapshot over the other
 * would lose what the other recorded.
 *
 * @returns {object|null} the state as stored, or null if the write failed.
 */
export function saveLocal(state, ls = browserStorage()) {
  if (!ls) return null;
  try {
    const raw = ls.getItem(KEY);
    const stored = raw ? normalize(JSON.parse(raw)) : null;
    const merged = stored ? merge(state, stored) : state;
    merged.settings = state.settings;
    ls.setItem(KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * The saved file
 * ------------------------------------------------------------------ */

export function toFile(state, now = new Date()) {
  return JSON.stringify({
    app: FILE_APP,
    format: FILE_FORMAT,
    savedAt: now.toISOString(),
    note: 'Peptide log. Open this file in the app to restore your history or see your progress.',
    weightUnit: state.settings.weightUnit,
    protocols: state.protocols,
    doses: state.doses,
    weights: state.weights,
    deleted: state.deleted,
    changedAt: state.changedAt,
  }, null, 2);
}

const SYRINGE_FROM_OLD = { 'u100-03': 30, 'u100-05': 50, 'u100-10': 100 };

/**
 * Backups from the first version of this app use different names for the
 * same things. Reading them means nobody has to start their history again.
 */
function fromOldApp(raw) {
  return {
    protocols: arr(raw.protocols).filter((r) => isObj(r) && r.id).map((r) => ({
      id: r.id,
      peptideId: r.peptideId,
      name: r.nickname || '',
      strength: Number(r.strength),
      waterMl: Number(r.diluentMl),
      doseMg: Number(r.dose),
      freq: r.frequency ?? 'qd',
      syringe: SYRINGE_FROM_OLD[r.syringeId] ?? 100,
      price: Number(r.cost?.vialPrice) || null,
      mixedAt: r.openedAt ?? null,
      doseSince: r.startDate ?? null,
      active: r.active !== false,
    })),
    doses: arr(raw.logs).filter((r) => isObj(r) && r.id && r.at).map((r) => ({
      id: r.id,
      protocolId: r.protocolId,
      peptideId: r.peptideId,
      name: r.label ?? '',
      at: r.at,
      doseMg: Number(r.doseMg),
      units: Number(r.units),
      site: r.site ?? null,
    })),
    weights: [],
    deleted: {
      protocols: arr(raw.deleted?.protocols),
      doses: arr(raw.deleted?.logs),
      weights: [],
    },
  };
}

/**
 * Read a saved file. Throws an Error with a message fit to show the person.
 */
export function fromFile(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file could not be read. Choose the .json file this app saved.');
  }
  if (!isObj(raw)) throw new Error('That file is not a peptide log.');

  if (raw.app === FILE_APP) {
    if (raw.format > FILE_FORMAT) {
      throw new Error('That file was saved by a newer version of the app. Update the app, then open it again.');
    }
    const s = normalize(raw);
    if (raw.weightUnit === 'kg' || raw.weightUnit === 'lb') s.settings.weightUnit = raw.weightUnit;
    return s;
  }
  // First version: { protocols, logs, settings, ... }
  if (Array.isArray(raw.protocols) && Array.isArray(raw.logs)) {
    return normalize(fromOldApp(raw));
  }
  throw new Error('That file is not a peptide log.');
}

export function fileName(now = new Date()) {
  const d = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return `Peptide Log ${d}.json`;
}

/** True when the log has changes that are not in a saved file yet. */
export function unsaved(state) {
  if (!state.changedAt) return false;
  const saved = state.settings.fileSavedAt;
  return !saved || new Date(state.changedAt) > new Date(saved);
}

export function entryCount(state) {
  return state.doses.length + state.weights.length;
}
