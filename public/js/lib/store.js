/**
 * Persistence.
 *
 * Everything lives in this browser's localStorage. Nothing is uploaded, there
 * is no account and no server to leak. The cost is that this is the only copy,
 * so losing a write is losing medical history -- and a dose that silently fails
 * to save is worse than an error, because the app then tells the user they
 * never took it.
 *
 * Two rules follow:
 *   1. save() reports whether it actually wrote. Callers must check.
 *   2. save() merges rather than overwrites. The app can be open twice (a tab
 *      and a home-screen copy), and each holds its own snapshot loaded at
 *      startup. Writing that snapshot wholesale destroys anything the other
 *      copy recorded in the meantime.
 */

const KEY = 'pdt.state.v1';
const CORRUPT_PREFIX = 'pdt.state.v1.corrupt.';
export const PREIMPORT_KEY = 'pdt.state.v1.preimport';

export const DEFAULT_STATE = {
  version: 1,
  rev: 0,
  settings: {
    currency: 'USD',
    acknowledgedAt: null,
    unitsPerMl: 100,
    syringeId: 'u100-10',
  },
  protocols: [],
  logs: [],
  purchases: [],
  // Deletions have to travel with the data. Without them a merge would treat a
  // record deleted here as one created by the other copy and resurrect it.
  deleted: { protocols: [], logs: [], purchases: [] },
};

/** Accessing localStorage itself can throw, so never touch it unguarded. */
export function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function storageAvailable() {
  const ls = storage();
  if (!ls) return false;
  try {
    const probe = '__pdt_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function load() {
  const ls = storage();
  if (!ls) return structuredClone(DEFAULT_STATE);

  let raw = null;
  try {
    raw = ls.getItem(KEY);
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
  if (!raw) return structuredClone(DEFAULT_STATE);

  const parsed = safeParse(raw);
  if (!parsed) {
    // Unreadable is not the same as absent. Set it aside before anything
    // overwrites it -- it may still be repairable by hand.
    try {
      ls.setItem(`${CORRUPT_PREFIX}${raw.length}`, raw);
    } catch { /* nothing more we can do */ }
    const fresh = structuredClone(DEFAULT_STATE);
    fresh.loadFailed = true;
    return fresh;
  }
  return migrate(parsed);
}

export function migrate(parsed) {
  if (!parsed || typeof parsed !== 'object') return structuredClone(DEFAULT_STATE);
  const d = parsed.deleted ?? {};
  return {
    ...structuredClone(DEFAULT_STATE),
    ...parsed,
    settings: { ...DEFAULT_STATE.settings, ...(parsed.settings ?? {}) },
    protocols: Array.isArray(parsed.protocols) ? parsed.protocols : [],
    logs: Array.isArray(parsed.logs) ? parsed.logs : [],
    purchases: Array.isArray(parsed.purchases) ? parsed.purchases : [],
    deleted: {
      protocols: Array.isArray(d.protocols) ? d.protocols : [],
      logs: Array.isArray(d.logs) ? d.logs : [],
      purchases: Array.isArray(d.purchases) ? d.purchases : [],
    },
  };
}

function unionById(mine = [], theirs = [], tombstones = []) {
  const gone = new Set(tombstones);
  const out = new Map();
  // Theirs first so my own edits to the same record win on top.
  for (const r of theirs) if (r?.id && !gone.has(r.id)) out.set(r.id, r);
  for (const r of mine) if (r?.id && !gone.has(r.id)) out.set(r.id, r);
  return [...out.values()];
}

function unionIds(a = [], b = []) {
  return [...new Set([...a, ...b])];
}

/**
 * Fold this copy's state into whatever is on disk, rather than replacing it.
 * Records are unioned by id; deletions are honoured from either side.
 */
export function mergeWithStored(state, stored) {
  if (!stored) return state;
  const deleted = {
    protocols: unionIds(state.deleted?.protocols, stored.deleted?.protocols),
    logs: unionIds(state.deleted?.logs, stored.deleted?.logs),
    purchases: unionIds(state.deleted?.purchases, stored.deleted?.purchases),
  };
  return {
    ...stored,
    ...state,
    settings: { ...(stored.settings ?? {}), ...(state.settings ?? {}) },
    protocols: unionById(state.protocols, stored.protocols, deleted.protocols),
    logs: unionById(state.logs, stored.logs, deleted.logs),
    purchases: unionById(state.purchases, stored.purchases, deleted.purchases),
    deleted,
    rev: Math.max(state.rev ?? 0, stored.rev ?? 0),
  };
}

/**
 * @returns {boolean} true only if the write actually landed. Callers must not
 * report success to the user without checking this.
 */
export function save(state) {
  const ls = storage();
  if (!ls) return false;
  try {
    const stored = migrateOrNull(ls.getItem(KEY));
    const merged = mergeWithStored(state, stored);
    merged.rev = (merged.rev ?? 0) + 1;
    ls.setItem(KEY, JSON.stringify(merged));

    // Bring this copy up to date with anything the merge pulled in, so the
    // screen reflects what is actually stored and the next save builds on it.
    state.rev = merged.rev;
    state.protocols = merged.protocols;
    state.logs = merged.logs;
    state.purchases = merged.purchases;
    state.deleted = merged.deleted;
    return true;
  } catch {
    return false;
  }
}

function migrateOrNull(raw) {
  if (!raw) return null;
  const parsed = safeParse(raw);
  return parsed ? migrate(parsed) : null;
}

/** Record a deletion so a merge cannot resurrect it. */
export function markDeleted(state, kind, id) {
  state.deleted ??= { protocols: [], logs: [], purchases: [] };
  state.deleted[kind] ??= [];
  if (!state.deleted[kind].includes(id)) state.deleted[kind].push(id);
  return state;
}

export function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function exportJson(state) {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
}

export function importJson(text) {
  const parsed = safeParse(text);
  if (!parsed) throw new Error('That file is not valid JSON.');
  if (!('protocols' in parsed) && !('logs' in parsed)) {
    throw new Error('That JSON does not look like a backup from this app.');
  }
  // A file carrying only one of the two used to pass, and migrate() would then
  // quietly replace the missing half with an empty array -- importing a partial
  // file wiped either every protocol or the entire dose history, with no error.
  if (!Array.isArray(parsed.protocols) || !Array.isArray(parsed.logs)) {
    throw new Error(
      'That backup is incomplete: it is missing its protocols or its dose history. ' +
      'Importing it would erase what is on this device, so nothing has been changed.'
    );
  }
  return migrate(parsed);
}

/** Injection sites, ordered so rotation moves across the body rather than around one spot. */
export const SITES = [
  'Abdomen - upper left', 'Abdomen - upper right',
  'Abdomen - lower left', 'Abdomen - lower right',
  'Left thigh', 'Right thigh',
  'Left upper arm', 'Right upper arm',
  'Left flank', 'Right flank',
];

/** Least recently used site, so the same spot is not hit twice in a row. */
export function suggestSite(logs = []) {
  const lastUsed = new Map();
  for (const log of logs) {
    if (!log?.site) continue;
    const t = new Date(log.at).getTime();
    if (!Number.isFinite(t)) continue;
    if (!lastUsed.has(log.site) || lastUsed.get(log.site) < t) lastUsed.set(log.site, t);
  }
  let best = SITES[0];
  let bestTime = Infinity;
  for (const site of SITES) {
    const t = lastUsed.has(site) ? lastUsed.get(site) : -Infinity;
    if (t < bestTime) {
      bestTime = t;
      best = site;
    }
  }
  return best;
}

/** A dose logged moments ago for the same protocol is almost certainly a double tap. */
export const DUPLICATE_WINDOW_MS = 3 * 60 * 1000;

export function recentDuplicate(logs, protocolId, at = Date.now()) {
  return logs.find((l) => {
    if (l.protocolId !== protocolId) return false;
    const t = new Date(l.at).getTime();
    return Number.isFinite(t) && at - t >= 0 && at - t < DUPLICATE_WINDOW_MS;
  }) ?? null;
}
