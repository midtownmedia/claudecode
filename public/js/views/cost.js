/** What this costs per day, per month, and per year. */

import { el, field, number, banner, stat, fmtNum, fmtDate, select, detailsBox } from '../ui/dom.js';
import { peptide } from '../data/peptides.js';
import { syringe } from '../data/syringes.js';
import { doseToUnits } from '../lib/calc.js';
import { costBreakdown, totalBurn, formatMoney, amortiseCycle, spendSummary, vialsPerCycle, dailyTotal } from '../lib/cost.js';
import { dosesPerWeek } from '../lib/schedule.js';
import { formatMass } from '../lib/units.js';
import { costLines } from '../ui/costlines.js';
import { uid } from '../lib/store.js';

const CURRENCIES = ['USD', 'CAD', 'GBP', 'EUR', 'AUD'];

export function costView(ctx) {
  const cur = ctx.state.settings.currency ?? 'USD';
  const money = (v) => formatMoney(v, cur);
  const active = ctx.state.protocols.filter((p) => p.active);

  const rows = active.map((pr) => {
    const p = peptide(pr.peptideId);
    const syr = syringe(pr.syringeId);
    const calc = doseToUnits({
      strength: pr.strength, strengthUnit: p?.strengthUnit ?? 'mg', diluentMl: pr.diluentMl,
      dose: pr.dose, doseUnit: 'mg', unitsPerMl: syr.unitsPerMl, roundTo: 0.5,
    });
    const c = pr.cost ?? {};
    const breakdown = costBreakdown({
      ...c, diluentMl: pr.diluentMl, dosesPerVial: calc.dosesPerVial, freqId: pr.frequency,
    });
    const cyc = p?.cycle ? amortiseCycle({ perDay: breakdown.perDay, cycle: p.cycle }) : null;
    return { pr, p, calc, breakdown, cyc };
  });

  const burn = totalBurn(rows.map((r) => (r.cyc ? { perDay: r.cyc.amortisedPerDay } : r.breakdown)));
  const spend = spendSummary(ctx.state.purchases);

  return el('section', { class: 'view' },
    el('div', { class: 'card' },
      el('div', { class: 'row-between' },
        el('h2', {}, 'What it costs'),
        field('Currency', select(CURRENCIES.map((c) => ({ value: c, label: c })), cur,
          (v) => { ctx.state.settings.currency = v; ctx.save(); ctx.render(); }))),
      el('div', { class: 'stats stats-big' },
        stat('Per day', money(burn.perDay), `${burn.count} active`),
        stat('Per week', money(burn.perWeek)),
        stat('Per month', money(burn.perMonth)),
        stat('Per year', money(burn.perYear))),
      rows.some((r) => r.cyc)
        ? banner('info', 'Course-based compounds are averaged across the whole year here, not just the days you are dosing. Each one shows both numbers below.')
        : null,
      active.length === 0 ? banner('info', 'Add a protocol and fill in what you paid to see this fill in.') : null),

    rows.map(({ pr, p, calc, breakdown, cyc }) => {
      const c = pr.cost ??= {};
      const set = (k, v) => { c[k] = v; ctx.save(); ctx.render(); };
      const suggested = p?.pricing;
      return el('div', { class: 'card' },
        el('div', { class: 'row-between' },
          el('h3', {}, pr.nickname || p?.name || 'Protocol'),
          suggested && !c.vialPrice
            ? el('button', {
              type: 'button', class: 'linkbtn',
              onclick: () => { c.vialPrice = suggested.vialPrice; ctx.save(); ctx.render(); },
            }, `use ${formatMoney(suggested.vialPrice, cur)}`)
            : null),
        el('div', { class: 'grid' },
          field('Bottle price', number(c.vialPrice ?? 0, (v) => set('vialPrice', v ?? 0), { min: 0, step: 'any' }), pr.id),
          field('Bottles per order', number(c.vialsPerOrder ?? 1, (v) => set('vialsPerOrder', v ?? 1), { min: 1, step: 1 }), pr.id),
          field('Shipping on that order', number(c.shipping ?? 0, (v) => set('shipping', v ?? 0), { min: 0, step: 'any' }), pr.id),
          field('Bac water bottle', number(c.bacPrice ?? 0, (v) => set('bacPrice', v ?? 0), { min: 0, step: 'any' }), pr.id),
          field('Bac bottle size (mL)', number(c.bacBottleMl ?? 30, (v) => set('bacBottleMl', v ?? 30), { min: 1, step: 'any' }), pr.id),
          field('Syringe box price', number(c.syringeBoxPrice ?? 0, (v) => set('syringeBoxPrice', v ?? 0), { min: 0, step: 'any' }), pr.id),
          field('Syringes per box', number(c.syringesPerBox ?? 100, (v) => set('syringesPerBox', v ?? 100), { min: 1, step: 1 }), pr.id),
          field('Other per dose', number(c.otherPerDose ?? 0, (v) => set('otherPerDose', v ?? 0), { min: 0, step: 'any' }), 'Swabs, sharps bin', pr.id)),
        el('div', { class: 'stats' },
          stat('Per dose', money(breakdown.perDose), `${formatMass(calc.requestedDose)}, ${fmtNum(dosesPerWeek(pr.frequency), 2)}x weekly`),
          stat('Per day', money(breakdown.perDay), cyc ? 'while on course' : null),
          stat('Per month', money(breakdown.perMonth)),
          stat('Doses per bottle', Number.isFinite(calc.dosesPerVial) ? calc.dosesPerVial : '--')),
        detailsBox(ctx, `cost-spend-${pr.id}`, 'Where that goes', { class: 'spend-detail' },
          costLines({
            breakdown, currency: cur, dosesPerVial: calc.dosesPerVial,
            strength: pr.strength, strengthUnit: p?.strengthUnit ?? 'mg', diluentMl: pr.diluentMl,
          })),
        cyc
          ? banner('info',
            `${p.cycle.label}: ${money(cyc.duringCyclePerDay)} a day while dosing, ` +
            `${money(cyc.perCycle)} per course, ` +
            `${money(cyc.perYear)} a year — which averages ${money(cyc.amortisedPerDay)} a day. ` +
            `Each course needs about ${vialsPerCycle({ doseMg: pr.dose, daysOn: p.cycle.daysOn, vialStrengthMg: pr.strength, freqId: pr.frequency })} bottles.`)
          : null,
        breakdown.perDay > 20
          ? banner('warn', `That is ${money(breakdown.perMonth)} a month from this one compound alone.`)
          : null);
    }),

    el('div', { class: 'card' },
      el('h3', {}, 'What you have actually spent'),
      el('div', { class: 'stats' },
        stat('Logged total', money(spend.total), `${spend.count} purchases`),
        stat('Since', spend.first ? fmtDate(spend.first) : '--'),
        stat('Average per day', Number.isFinite(spend.averagePerDay) ? money(spend.averagePerDay) : '--',
          spend.spanDays ? `over ${fmtNum(spend.spanDays, 0)} days` : null)),
      el('form', {
        class: 'row inline-form',
        onsubmit: (e) => {
          e.preventDefault();
          const f = new FormData(e.target);
          const amount = Number(f.get('amount'));
          if (!Number.isFinite(amount) || amount <= 0) return;
          ctx.state.purchases.push({
            id: uid(), at: f.get('at') || new Date().toISOString().slice(0, 10),
            label: String(f.get('label') || 'Purchase'), amount,
          });
          ctx.save(); ctx.render();
        },
      },
        el('input', { type: 'text', name: 'label', placeholder: 'What did you buy?' }),
        el('input', { type: 'number', name: 'amount', placeholder: 'Amount', step: 'any', min: 0, required: true }),
        el('input', { type: 'date', name: 'at', value: new Date().toISOString().slice(0, 10) }),
        el('button', { type: 'submit', class: 'btn btn-primary' }, 'Add')),
      ctx.state.purchases.length
        ? el('table', { class: 'table' },
          el('tbody', {}, [...ctx.state.purchases].sort((a, b) => new Date(b.at) - new Date(a.at)).map((x) =>
            el('tr', {},
              el('td', {}, fmtDate(x.at)),
              el('td', {}, x.label),
              el('td', { class: 'strong' }, money(x.amount)),
              el('td', {}, el('button', {
                type: 'button', class: 'btn btn-danger-ghost slim',
                onclick: () => {
                  ctx.state.purchases = ctx.state.purchases.filter((y) => y.id !== x.id);
                  ctx.save(); ctx.render();
                },
              }, 'Remove'))))))
        : null));
}
