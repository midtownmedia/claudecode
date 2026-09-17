/** Saved protocols: one per person-and-compound, with the live vial on it. */

import { el, field, select, number, banner, fmtDate, fmtNum, stat } from '../ui/dom.js';
import { PEPTIDES, peptide } from '../data/peptides.js';
import { SYRINGES, syringe } from '../data/syringes.js';
import { FREQUENCIES, vialExpiry, titrationStatus, vialDuration, nextDoseAt } from '../lib/schedule.js';
import { doseToUnits } from '../lib/calc.js';
import { dailyTotal } from '../lib/cost.js';
import { dosesPerWeek } from '../lib/schedule.js';
import { checkDose } from '../lib/safety.js';
import { formatMass } from '../lib/units.js';
import { uid } from '../lib/store.js';

function blank() {
  const p = PEPTIDES[0];
  return {
    id: uid(), peptideId: p.id, nickname: '', active: true,
    strength: p.defaultStrength, diluentMl: p.defaultDiluentMl ?? 3,
    openedAt: new Date().toISOString().slice(0, 10),
    dose: p.ladder?.[0]?.dose ?? 1, frequency: p.defaultFrequency ?? 'qd',
    syringeId: 'u100-10', startDate: new Date().toISOString().slice(0, 10),
    useLadder: true,
    cost: { vialPrice: 0, vialsPerOrder: 1, shipping: 0, bacPrice: 0, bacBottleMl: 30,
      syringeBoxPrice: 0, syringesPerBox: 100, otherPerDose: 0 },
  };
}

export function protocolsView(ctx) {
  const list = ctx.state.protocols;
  return el('section', { class: 'view' },
    el('div', { class: 'card row-between' },
      el('h2', {}, 'Protocols'),
      el('button', {
        type: 'button', class: 'btn btn-primary',
        onclick: () => { ctx.state.protocols.push(blank()); ctx.save(); ctx.render(); },
      }, 'Add protocol')),
    list.length === 0
      ? banner('info', 'No protocols yet. Add one to track a vial, its expiry, the next dose and what it costs per day.')
      : list.map((pr) => protocolCard(ctx, pr)));
}

function protocolCard(ctx, pr) {
  const p = peptide(pr.peptideId) ?? PEPTIDES[0];
  const syr = syringe(pr.syringeId);
  const calc = doseToUnits({
    strength: pr.strength, strengthUnit: p.strengthUnit, diluentMl: pr.diluentMl,
    dose: pr.dose, doseUnit: 'mg', unitsPerMl: syr.unitsPerMl, roundTo: 0.5,
  });
  const exp = vialExpiry({ openedAt: pr.openedAt });
  const tit = pr.useLadder ? titrationStatus({ ladder: p.ladder, startDate: pr.startDate }) : null;
  const dur = vialDuration({ dosesPerVial: calc.dosesPerVial, freqId: pr.frequency });
  const logs = ctx.state.logs.filter((l) => l.protocolId === pr.id).sort((a, b) => new Date(b.at) - new Date(a.at));
  const next = logs[0] ? nextDoseAt(logs[0].at, pr.frequency) : null;
  const warn = checkDose(calc.requestedDose, p);

  const set = (k, v) => { pr[k] = v; ctx.save(); ctx.render(); };

  return el('div', { class: `card protocol${pr.active ? '' : ' inactive'}` },
    el('div', { class: 'row-between' },
      el('h3', {}, pr.nickname || p.name),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => set('active', !pr.active) },
          pr.active ? 'Pause' : 'Resume'),
        el('button', {
          type: 'button', class: 'btn btn-danger-ghost',
          onclick: () => {
            if (!confirm(`Delete "${pr.nickname || p.name}"? Its dose history stays in the log.`)) return;
            ctx.state.protocols = ctx.state.protocols.filter((x) => x.id !== pr.id);
            ctx.save(); ctx.render();
          },
        }, 'Delete'))),

    el('div', { class: 'grid' },
      field('Label', el('input', {
        type: 'text', value: pr.nickname, placeholder: p.name,
        oninput: (e) => { pr.nickname = e.target.value; ctx.save(); },
      }), 'Whose protocol is this?'),
      field('Compound', select(PEPTIDES.map((x) => ({ value: x.id, label: x.name })), pr.peptideId,
        (v) => {
          const n = peptide(v);
          Object.assign(pr, { peptideId: v, strength: n.defaultStrength, diluentMl: n.defaultDiluentMl ?? 3,
            dose: n.ladder?.[0]?.dose ?? 1, frequency: n.defaultFrequency ?? 'qd' });
          ctx.save(); ctx.render();
        })),
      field('Bottle strength', el('div', { class: 'row' },
        select([...new Set([...(p.strengthOptions ?? []), pr.strength])].sort((a, b) => a - b)
          .map((v) => ({ value: v, label: `${v} ${p.strengthUnit}` })), pr.strength,
        (v) => set('strength', Number(v))),
        number(pr.strength, (v) => set('strength', v), { class: 'narrow', min: 0, step: 'any', 'aria-label': 'Custom strength' }))),
      field('Bac water', el('div', { class: 'row' },
        number(pr.diluentMl, (v) => set('diluentMl', v), { min: 0, step: 'any' }),
        el('span', { class: 'suffix' }, 'mL'))),
      field('Mixed on', el('input', {
        type: 'date', value: pr.openedAt ?? '', onchange: (e) => set('openedAt', e.target.value),
      })),
      field('Dose', el('div', { class: 'row' },
        number(pr.dose, (v) => set('dose', v), { min: 0, step: 'any' }),
        el('span', { class: 'suffix' }, 'mg'))),
      field('Frequency', select(FREQUENCIES.map((f) => ({ value: f.id, label: f.label })), pr.frequency,
        (v) => set('frequency', v))),
      field('Syringe', select(SYRINGES.map((s) => ({ value: s.id, label: s.label })), pr.syringeId,
        (v) => set('syringeId', v)))),

    el('div', { class: 'stats' },
      stat('Draw', `${fmtNum(calc.roundedUnits, 2)} units`,
        dosesPerWeek(pr.frequency) > 7
          ? `${formatMass(calc.actualDose)} per injection`
          : formatMass(calc.actualDose)),
      stat(dosesPerWeek(pr.frequency) > 7 ? 'Daily total' : '1 unit',
        dosesPerWeek(pr.frequency) > 7
          ? formatMass(dailyTotal({ doseMg: calc.requestedDose, freqId: pr.frequency }))
          : formatMass(calc.perUnit),
        dosesPerWeek(pr.frequency) > 7 ? `${fmtNum(dosesPerWeek(pr.frequency) / 7, 0)} injections a day` : null),
      stat('Doses left in vial', Number.isFinite(calc.dosesPerVial) ? calc.dosesPerVial : '--',
        dur ? `about ${fmtNum(dur.days, 0)} days` : null),
      stat('Next dose', next ? fmtDate(next) : 'not logged yet',
        logs[0] ? `last ${fmtDate(logs[0].at)}` : null)),

    exp
      ? banner(exp.expired ? 'danger' : exp.daysLeft <= 5 ? 'warn' : 'info',
        exp.expired
          ? `This vial passed its ${exp.budDays}-day beyond-use date on ${fmtDate(exp.expires)}.`
          : `Bac water: discard around ${fmtDate(exp.expires)} (${exp.daysLeft} days left). ${exp.diluent.note}`)
      : null,
    tit
      ? banner('info',
        tit.atTop
          ? `Ladder: at the top step, ${formatMass(tit.step.dose)}.`
          : `Ladder: week ${tit.weekOfStep} of ${formatMass(tit.step.dose)}. Next step ${formatMass(tit.nextStep.dose)} in ${tit.daysUntilNextStep} days (${fmtDate(tit.nextStepDate)}).`)
      : null,
    dosesPerWeek(pr.frequency) > 7
      ? banner('info',
        `Split across ${fmtNum(dosesPerWeek(pr.frequency) / 7, 0)} injections a day. You can draw them all in the morning and keep the later one capped in the fridge — one puncture of the vial instead of two. Let it warm up before injecting.`)
      : null,
    warn.length ? el('div', { class: 'warnings' }, warn.map((w) => banner(w.level, w.message))) : null,

    el('div', { class: 'row' },
      el('button', {
        type: 'button', class: 'btn btn-primary',
        onclick: () => { ctx.logDose(pr, calc); },
      }, 'Log a dose now')));
}
