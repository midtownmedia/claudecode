/**
 * Persistence.
 *
 * Everything lives in this browser's localStorage. Nothing is uploaded, there
 * is no account and no server to leak. The cost is that clearing site data
 * wipes it, so export is a first-class feature rather than an afterthought.
 */

const KEY = 'pdt.state.v1';

export const DEFAULT_STATE = {
  version: 1,
  settings: {
    currency: 'USD',
    acknowledgedAt: null,
    unitsPerMl: 100,
    syringeId: 'u100-10',
  },
  protocols: [],
  logs: [],
  purchases: [],
};

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function load() {
  if (typeof localStorage === 'undefined') return structuredClone(DEFAULT_STATE);
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
  const parsed = raw ? safeParse(raw) : null;
  return migrate(parsed);
}

export function migrate(parsed) {
  if (!parsed || typeof parsed !== 'object') return structuredClone(DEFAULT_STATE);
  return {
    ...structuredClone(DEFAULT_STATE),
    ...parsed,
    settings: { ...DEFAULT_STATE.settings, ...(parsed.settings ?? {}) },
    protocols: Array.isArray(parsed.protocols) ? parsed.protocols : [],
    logs: Array.isArray(parsed.logs) ? parsed.logs : [],
    purchases: Array.isArray(parsed.purchases) ? parsed.purchases : [],
  };
}

export function save(state) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
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
