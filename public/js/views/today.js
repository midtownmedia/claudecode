/**
 * Today.
 *
 * The daily question is "how many units do I draw?" and nothing else. Everything
 * needed to answer it was already entered when the protocol was set up, so this
 * screen has no inputs at all: a number, a picture of the syringe, and a button
 * to say it is done.
 *
 * Anything that is not that -- volumes, concentrations, the arithmetic, the
 * running cost -- lives a tap away on the calculator, not here.
 */

import { el, banner, fmtNum, fmtDate } from '../ui/dom.js';
import { syringeCard } from '../ui/syringe.js';
import { peptide } from '../data/peptides.js';
import { syringe } from '../data/syringes.js';
import { doseToUnits, splitDraw } from '../lib/calc.js';
import { checkDose, checkFirstDose } from '../lib/safety.js';
import { nextDoseAt, vialExpiry, frequency } from '../lib/schedule.js';
import { costBreakdown, formatMoneyExact } from '../lib/cost.js';
import { formatMass } from '../lib/units.js';

const HOUR = 3600000;

function dueStatus(pr, logs) {
  const last = logs[0];
  if (!last) return { text: 'Not logged yet', due: true };
  const next = nextDoseAt(last.at, pr.frequency);
  if (!next) return { text: `Last dose ${fmtDate(last.at)}`, due: false };
  const ms = next.getTime() - Date.now();
  if (ms <= 0) return { text: 'Due now', due: true };
  if (ms < 20 * HOUR) return { text: `Next dose in ${Math.max(1, Math.round(ms / HOUR))} hours`, due: false };
  return { text: `Next dose ${fmtDate(next)}`, due: false };
}

export function todayView(ctx) {
  const active = ctx.state.protocols.filter((pr) => pr.active);

  if (!active.length) {
    return el('section', { class: 'view' },
      el('div', { class: 'card empty' },
        el('h2', {}, 'Nothing set up yet'),
        el('p', { class: 'lede' },
          'Add what you are taking once, and this screen will just tell you how many units to draw each time.'),
        el('button', {
          type: 'button', class: 'btn btn-primary btn-lg',
          onclick: () => { ctx.go('protocols'); },
        }, 'Set up what I am taking'),
        el('button', {
          type: 'button', class: 'btn btn-ghost btn-lg',
          onclick: () => { ctx.go('calc'); },
        }, 'Just do one calculation')));
  }

  return el('section', { class: 'view' },
    active.map((pr) => doseCard(ctx, pr)));
}

function doseCard(ctx, pr) {
  const p = peptide(pr.peptideId);
  const syr = syringe(pr.syringeId);
  const calc = doseToUnits({
    strength: pr.strength, strengthUnit: p?.strengthUnit ?? 'mg', diluentMl: pr.diluentMl,
    dose: pr.dose, doseUnit: 'mg', unitsPerMl: syr.unitsPerMl, roundTo: 0.5,
  });

  const logs = ctx.state.logs
    .filter((l) => l.protocolId === pr.id)
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  const status = dueStatus(pr, logs);
  const exp = vialExpiry({ openedAt: pr.openedAt });

  // Only the things that would actually stop someone injecting reach this screen.
  const hasHistory = logs.length > 0;
  const urgent = [
    ...checkDose(calc.requestedDose, p).filter((w) => w.level === 'danger'),
    ...checkFirstDose(calc.requestedDose, p, { hasHistory }).filter((w) => w.level === 'danger'),
  ];

  const split = p?.splitDose
    ? splitDraw({ units: calc.roundedUnits, dose: calc.actualDose, parts: p.splitDose.parts })
    : null;

  const spend = pr.cost?.vialPrice > 0
    ? costBreakdown({ ...pr.cost, diluentMl: pr.diluentMl, dosesPerVial: calc.dosesPerVial, freqId: pr.frequency })
    : null;

  return el('div', { class: `card dosecard${status.due ? ' dosecard-due' : ''}` },
    el('div', { class: 'dose-head' },
      el('span', { class: 'dose-name' }, pr.nickname || p?.name || 'Protocol'),
      el('span', { class: `dose-when${status.due ? ' dose-when-due' : ''}` }, status.text)),

    syringeCard({
      units: calc.roundedUnits, syringe: syr,
      tone: urgent.length ? 'danger' : 'ok',
      caption: syr.label,
    }),

    el('div', { class: 'dose-answer' },
      el('div', { class: 'dose-units' }, `${fmtNum(calc.roundedUnits, 2)} units`),
      // The dose the protocol asks for, not the fractionally different amount
      // a rounded mark delivers. "1.02 mg" is noise on a screen meant to be
      // glanced at; the exact figure is on the calculator for anyone checking.
      el('div', { class: 'dose-sub' },
        `${formatMass(calc.requestedDose)} of ${p?.name ?? 'it'} · ${frequency(pr.frequency).label.toLowerCase()}`)),

    split
      ? el('div', { class: 'dose-split' },
        `Or split it: ${fmtNum(split.perPartUnits, 2)} units this morning and ${fmtNum(split.perPartUnits, 2)} again tonight, if it makes you feel sick.`)
      : null,

    urgent.length ? el('div', { class: 'warnings' }, urgent.map((w) => banner('danger', w.message))) : null,
    exp?.expired
      ? banner('danger', `This vial was mixed ${exp.budDays}+ days ago (${fmtDate(pr.openedAt)}). Time for a fresh one.`)
      : exp && exp.daysLeft <= 5
        ? banner('warn', `${exp.daysLeft} days left on this vial.`)
        : null,

    el('button', {
      type: 'button', class: 'btn btn-primary btn-lg',
      onclick: () => ctx.logDose(pr, calc),
    }, 'I took this dose'),

    el('div', { class: 'dose-foot' },
      spend ? el('span', {}, `${formatMoneyExact(spend.perDose, ctx.state.settings.currency ?? 'USD')} a dose`) : null,
      el('button', {
        type: 'button', class: 'linkbtn',
        onclick: () => {
          ctx.ui.calc = {
            peptideId: pr.peptideId, strength: pr.strength, diluentMl: pr.diluentMl,
            dose: pr.dose, syringeId: pr.syringeId, vialPrice: pr.cost?.vialPrice ?? null,
          };
          ctx.go('calc');
        },
      }, 'Check the maths')));
}
