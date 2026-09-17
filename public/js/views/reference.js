/** Compound reference and the safety material worth having on the same phone. */

import { el, banner, fmtNum } from '../ui/dom.js';
import { PEPTIDES, EVIDENCE, sheetFor } from '../data/peptides.js';
import { RED_FLAGS, SHARP_SAFETY } from '../lib/safety.js';
import { DILUENTS } from '../lib/schedule.js';
import { formatMass } from '../lib/units.js';
import { toBase } from '../lib/units.js';

const EVIDENCE_LABEL = {
  [EVIDENCE.APPROVED]: { text: 'Approved somewhere', tone: 'ok' },
  [EVIDENCE.TRIAL]: { text: 'Human trials, not approved', tone: 'warn' },
  [EVIDENCE.PRECLINICAL]: { text: 'Preclinical only', tone: 'danger' },
  [EVIDENCE.ANECDOTAL]: { text: 'Anecdotal', tone: 'danger' },
};

export function referenceView(ctx) {
  const st = ctx.ui.ref ??= { q: '' };
  const term = st.q.trim().toLowerCase();
  const list = PEPTIDES.filter((p) =>
    !term || [p.name, p.className, ...(p.aka ?? [])].join(' ').toLowerCase().includes(term));

  return el('section', { class: 'view' },
    el('div', { class: 'card' },
      el('h2', {}, 'Reference'),
      el('p', { class: 'lede' },
        'Ranges below describe what these compounds are commonly given at, drawn from trial protocols where they exist and circulated sheets where they do not. They describe what is done, not what you should do.'),
      el('input', {
        type: 'search', class: 'search', placeholder: 'Search compounds',
        value: st.q, oninput: (e) => { st.q = e.target.value; ctx.render(); },
      })),

    list.map((p) => {
      const ev = EVIDENCE_LABEL[p.evidence] ?? EVIDENCE_LABEL[EVIDENCE.ANECDOTAL];
      const d = p.dosing ?? {};
      const sheet = sheetFor(p.id);
      return el('div', { class: 'card compound' },
        el('div', { class: 'row-between' },
          el('h3', {}, p.name, p.aka?.length ? el('span', { class: 'aka' }, ` · ${p.aka.join(', ')}`) : null),
          el('span', { class: `badge badge-${ev.tone}` }, ev.text)),
        el('p', { class: 'muted' }, p.className),
        p.strengthChanged
          ? banner('danger',
            `Bottles for this changed from ${p.strengthChanged.from} mg to ${p.strengthChanged.to} mg. ` +
            `Any sheet written for the old bottle now gives ${fmtNum(p.strengthChanged.to / p.strengthChanged.from, 2)}x the intended dose. Use the bottle swap screen before your next draw.`)
          : null,
        p.strengthUnconfirmed ? banner('warn', 'Bottle strength unconfirmed for this one. Read the label.') : null,
        p.awaitingSheet ? banner('info', 'No protocol sheet for this yet. The ladder shown is a placeholder.') : null,
        el('dl', { class: 'deflist' },
          el('dt', {}, 'Usual range'),
          el('dd', {}, Number.isFinite(d.typicalLow)
            ? `${formatMass(toBase(d.typicalLow, d.unit ?? 'mg'))} – ${formatMass(toBase(d.typicalHigh, d.unit ?? 'mg'))} per dose`
            : 'not established'),
          el('dt', {}, 'Ceiling seen anywhere'),
          el('dd', {}, Number.isFinite(d.redline) ? formatMass(toBase(d.redline, d.unit ?? 'mg')) : 'not established'),
          el('dt', {}, 'Bottle sizes'),
          el('dd', {}, (p.strengthOptions ?? []).map((s) => `${s} ${p.strengthUnit}`).join(', ')),
          d.minDaysBetweenIncreases
            ? [el('dt', {}, 'Hold each step'), el('dd', {}, `at least ${d.minDaysBetweenIncreases} days`)] : null,
          p.cycle ? [el('dt', {}, 'Cycle'), el('dd', {}, p.cycle.label)] : null),
        p.notes?.length ? el('ul', { class: 'notes' }, p.notes.map((n) => el('li', {}, n))) : null,
        p.risks?.length
          ? el('div', { class: 'risks' },
            el('h4', {}, 'Risks'),
            el('ul', {}, p.risks.map((r) => el('li', {}, r))))
          : null,
        sheet?.note ? el('p', { class: 'sheet-note' }, sheet.note) : null);
    }),

    el('div', { class: 'card' },
      el('h3', {}, 'When to stop and get help'),
      RED_FLAGS.map((g) => el('div', { class: `flags${g.urgent ? ' flags-urgent' : ''}` },
        el('h4', {}, g.group),
        el('ul', {}, g.items.map((i) => el('li', {}, i))))),
      banner('info',
        'In the US, Poison Control is 1-800-222-1222 and takes calls about accidental overdoses around the clock. Otherwise call your local emergency number. Taking too much of something is a normal thing to phone about, and they do not need a name.')),

    el('div', { class: 'card' },
      el('h3', {}, 'Handling'),
      el('ul', { class: 'notes' }, SHARP_SAFETY.map((s) => el('li', {}, s))),
      el('h4', {}, 'Diluents'),
      el('ul', { class: 'notes' }, DILUENTS.map((d) =>
        el('li', {}, el('strong', {}, d.label), ` — ${d.note}`)))),

    el('div', { class: 'card' },
      el('h3', {}, 'Your data'),
      el('p', { class: 'muted' },
        'Everything stays in this browser. There is no account and nothing is uploaded. Clearing site data erases it, so export a backup if it matters.'),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn', onclick: () => ctx.exportData() }, 'Export backup'),
        el('label', { class: 'btn' }, 'Import backup',
          el('input', {
            type: 'file', accept: 'application/json', hidden: true,
            onchange: (e) => ctx.importData(e.target.files?.[0]),
          })),
        el('button', {
          type: 'button', class: 'btn btn-danger-ghost',
          onclick: () => {
            if (!confirm('Erase all protocols, logs and purchases from this browser?')) return;
            ctx.reset();
          },
        }, 'Erase everything'))));
}
