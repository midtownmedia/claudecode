/** Dose history, site rotation and adherence. */

import { el, banner, fmtDate, fmtNum, stat, select } from '../ui/dom.js';
import { peptide } from '../data/peptides.js';
import { SITES, suggestSite } from '../lib/store.js';
import { formatMass } from '../lib/units.js';
import { dosesPerWeek, DAY_MS } from '../lib/schedule.js';

export function logView(ctx) {
  const logs = [...ctx.state.logs].sort((a, b) => new Date(b.at) - new Date(a.at));
  const next = suggestSite(logs);
  const since = Date.now() - 28 * DAY_MS;
  // Numerator and denominator must describe the same protocols, or the ratio is
  // meaningless -- orphaned logs from a deleted protocol were inflating it.
  const scheduled = ctx.state.protocols.filter((p) => p.active && dosesPerWeek(p.frequency) > 0);
  const scheduledIds = new Set(scheduled.map((p) => p.id));
  const recent = logs.filter((l) => new Date(l.at).getTime() >= since);
  const counted = recent.filter((l) => scheduledIds.has(l.protocolId));
  const expected = scheduled.reduce((s, p) => s + dosesPerWeek(p.frequency) * 4, 0);
  const adherence = expected > 0 ? (counted.length / expected) * 100 : NaN;

  return el('section', { class: 'view' },
    el('div', { class: 'card' },
      el('h2', {}, 'History'),
      el('div', { class: 'stats' },
        stat('Doses in last 28 days', recent.length),
        stat('Against plan', Number.isFinite(adherence) ? `${fmtNum(adherence, 0)}%` : '--',
          expected > 0 ? `${counted.length} of ${fmtNum(expected, 0)} expected` : 'nothing scheduled'),
        stat('Next site', next, 'least recently used'),
        stat('Total logged', logs.length))),

    logs.length === 0
      ? banner('info', 'Nothing logged yet. Use "Log a dose now" on a protocol, and the site rotation will start suggesting where to go next.')
      : el('div', { class: 'card' },
        el('table', { class: 'table' },
          el('thead', {}, el('tr', {},
            el('th', {}, 'When'), el('th', {}, 'What'), el('th', {}, 'Dose'),
            el('th', {}, 'Units'), el('th', {}, 'Site'), el('th', {}, ''))),
          el('tbody', {}, logs.slice(0, 200).map((l) => {
            const p = peptide(l.peptideId);
            return el('tr', {},
              el('td', {}, fmtDate(l.at)),
              el('td', {}, l.label || p?.name || '--'),
              el('td', {}, Number.isFinite(l.doseMg) ? formatMass(l.doseMg) : '--'),
              el('td', {}, Number.isFinite(l.units) ? `${fmtNum(l.units, 2)} u` : '--'),
              el('td', {},
                select(SITES.map((s) => ({ value: s, label: s })), l.site ?? SITES[0],
                  (v) => { l.site = v; ctx.save(); ctx.render(); }, { class: 'slim' })),
              el('td', {}, el('button', {
                type: 'button', class: 'btn btn-danger-ghost slim',
                onclick: () => {
                  ctx.state.logs = ctx.state.logs.filter((x) => x.id !== l.id);
                  ctx.markDeleted('logs', l.id);
                  ctx.save(); ctx.render();
                },
              }, 'Remove')));
          })))));
}
