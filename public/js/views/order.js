/**
 * Order calculator.
 *
 * A bottle price on its own says nothing. What matters is the lump sum at the
 * checkout and how many days that pile actually covers, which depends entirely
 * on the dose and how often it is taken.
 */

import { el, field, number, select, banner, stat, fmtNum } from '../ui/dom.js';
import { PEPTIDES, peptide } from '../data/peptides.js';
import { FREQUENCIES } from '../lib/schedule.js';
import { orderTotal, bottlesForDuration, formatMoney } from '../lib/cost.js';
import { formatMass } from '../lib/units.js';

const PRICED = PEPTIDES.filter((p) => p.pricing);

export function orderView(ctx) {
  const st = ctx.ui.order ??= { qty: {}, dose: {}, freq: {}, shipping: 0, weeks: 12 };
  const cur = ctx.state.settings.currency ?? 'USD';
  const money = (v) => formatMoney(v, cur);

  const lines = PRICED.map((p) => {
    const topStep = p.ladder[p.ladder.length - 1];
    const doseMg = st.dose[p.id] ?? topStep.dose;
    const freqId = st.freq[p.id] ?? p.defaultFrequency;
    return {
      id: p.id, name: p.name, strength: p.pricing.strength,
      unitPrice: p.pricing.vialPrice, qty: st.qty[p.id] ?? 0,
      doseMg, freqId, peptide: p,
    };
  });

  const order = orderTotal(lines, { shipping: st.shipping ?? 0 });
  const chosen = order.lines;

  return el('section', { class: 'view' },
    el('div', { class: 'card' },
      el('h2', {}, 'Order calculator'),
      el('p', { class: 'lede' },
        'Set how many bottles of each and this prices the whole order, then tells you how many days it actually covers at the dose you plan to take.'),
      el('div', { class: 'row' },
        field('Plan for', el('div', { class: 'row' },
          number(st.weeks, (v) => { st.weeks = v ?? 0; ctx.render(); }, { min: 1, step: 1, class: 'narrow' }),
          el('span', { class: 'suffix' }, 'weeks'))),
        el('button', {
          type: 'button', class: 'btn',
          onclick: () => {
            for (const l of lines) {
              st.qty[l.id] = bottlesForDuration({
                doseMg: l.doseMg, freqId: l.freqId,
                days: (st.weeks ?? 12) * 7, vialStrengthMg: l.strength,
              }) || 0;
            }
            ctx.render();
          },
        }, 'Fill quantities to cover that'),
        el('button', {
          type: 'button', class: 'btn btn-ghost',
          onclick: () => { st.qty = {}; ctx.render(); },
        }, 'Clear'))),

    el('div', { class: 'card' },
      el('table', { class: 'table table-order' },
        el('thead', {}, el('tr', {},
          el('th', {}, 'Compound'),
          el('th', {}, 'Dose'),
          el('th', {}, 'How often'),
          el('th', {}, 'Bottles'),
          el('th', {}, 'Line total'),
          el('th', {}, 'Covers'))),
        el('tbody', {}, lines.map((l) => {
          const priced = chosen.find((c) => c.id === l.id);
          return el('tr', { class: l.qty > 0 ? 'row-on' : '' },
            el('td', {},
              el('div', { class: 'strong' }, l.name),
              el('div', { class: 'muted' },
                `${l.strength} mg · ${money(l.unitPrice)} · ${money(l.unitPrice / l.strength)}/mg`),
              l.peptide.strengthUnconfirmed
                ? el('div', { class: 'muted warn-text' }, 'strength unconfirmed') : null),
            el('td', {},
              el('div', { class: 'row' },
                number(l.doseMg, (v) => { st.dose[l.id] = v ?? 0; ctx.render(); },
                  { min: 0, step: 'any', class: 'narrow', 'aria-label': `${l.name} dose`, dataset: { fkey: `order|dose|${l.id}` } }),
                el('span', { class: 'suffix' }, 'mg'))),
            el('td', {},
              select(FREQUENCIES.filter((f) => f.perWeek > 0).map((f) => ({ value: f.id, label: f.label })),
                l.freqId, (v) => { st.freq[l.id] = v; ctx.render(); }, { class: 'slim' })),
            el('td', {},
              number(l.qty, (v) => { st.qty[l.id] = Math.max(0, v ?? 0); ctx.render(); },
                { min: 0, step: 1, class: 'narrow', 'aria-label': `${l.name} bottles`, dataset: { fkey: `order|qty|${l.id}` } })),
            el('td', { class: 'strong' }, l.qty > 0 ? money(l.qty * l.unitPrice) : '--'),
            el('td', {},
              priced && Number.isFinite(priced.days)
                ? el('span', {}, `${fmtNum(priced.days, 0)} days`,
                  el('div', { class: 'muted' }, `${money(priced.perDay)}/day`))
                : '--'));
        }))),
      el('div', { class: 'row' },
        field('Shipping', number(st.shipping ?? 0, (v) => { st.shipping = v ?? 0; ctx.render(); },
          { min: 0, step: 'any', class: 'narrow' })))),

    el('div', { class: `card result result-${order.total > 1000 ? 'warn' : 'ok'}` },
      el('div', { class: 'headline' },
        el('div', { class: 'headline-kicker' }, 'Order total'),
        el('div', { class: 'headline-main' }, money(order.total)),
        el('div', { class: 'headline-sub' },
          order.bottles > 0
            ? `${order.bottles} bottle${order.bottles === 1 ? '' : 's'}${order.shipping ? `, including ${money(order.shipping)} shipping` : ''}`
            : 'Nothing selected yet')),
      order.bottles > 0
        ? el('div', { class: 'stats' },
          stat('Subtotal', money(order.subtotal)),
          stat('Runs out in', Number.isFinite(order.coversDays) ? `${fmtNum(order.coversDays, 0)} days` : '--',
            'shortest line'),
          stat('Longest line', Number.isFinite(order.longestDays) ? `${fmtNum(order.longestDays, 0)} days` : '--'),
          stat('Averaged per day', Number.isFinite(order.coversDays) && order.coversDays > 0
            ? money(order.total / order.coversDays) : '--', 'across the order'))
        : null,
      order.bottles > 0 && Number.isFinite(order.coversDays) && Number.isFinite(order.longestDays)
        && order.longestDays > order.coversDays * 2
        ? banner('info',
          `These do not run out together. The shortest lasts ${fmtNum(order.coversDays, 0)} days and the longest ${fmtNum(order.longestDays, 0)}, so some of this will sit unused while you reorder the rest.`)
        : null,
      chosen.some((l) => l.peptide?.cycle)
        ? banner('info', 'Course-based compounds here are priced across continuous dosing. If you only run them a few weeks a year the yearly figure on the Cost screen is the honest one.')
        : null),

    el('div', { class: 'card' },
      el('h3', {}, 'Cost per mg'),
      el('p', { class: 'muted' },
        'Useful when the same compound shows up at several bottle sizes: the bigger bottle is usually cheaper per mg, but only if the dose is big enough to finish it before its beyond-use date.'),
      el('table', { class: 'table' },
        el('tbody', {}, [...chosen].sort((a, b) => a.costPerMg - b.costPerMg).map((l) =>
          el('tr', {},
            el('td', {}, l.name),
            el('td', {}, `${l.strength} mg`),
            el('td', { class: 'strong' }, `${money(l.costPerMg)}/mg`))))),
      chosen.length === 0 ? el('p', { class: 'muted' }, 'Add some bottles above.') : null));
}
