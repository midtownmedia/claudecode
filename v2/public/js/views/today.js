/**
 * Today: how many units, drawn on a syringe, and a button to log it.
 *
 * Everything needed to answer "how much tonight" was entered once when the
 * peptide was added, so this screen has no inputs at all.
 */

import { h, pageHeader, roundButton, button, banner, icon, dayWord, relativeAgo, ask, toast } from '../ui.js';
import { draw, checks, dueStatus, bottleStatus, nextStep, cost, money, num, splitDraw, weightIn } from '../math.js';
import { frequency, syringe } from '../data.js';
import { syringeSvg } from '../syringe.js';
import { nameOf, peptideOf, dosesOf, doseText, hasHistory, bestSyringe } from '../model.js';
import { protocolSheet, doseSheet, weightSheet, warningList } from './sheets.js';
import { unsaved, entryCount } from '../store.js';

export function todayView(app) {
  const { state } = app;
  const active = state.protocols.filter((p) => p.active !== false);
  const now = Date.now();

  const cards = active
    .map((pr) => ({ pr, status: dueStatus({ freq: pr.freq, lastAt: dosesOf(state, pr.id)[0]?.at, now }) }))
    .sort((a, b) => rank(a.status) - rank(b.status));

  return h('div', { class: 'view view-today' },
    pageHeader('Today', {
      subtitle: new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
      actions: [roundButton('plus', 'Add a peptide', () => protocolSheet(app))],
    }),
    backupNudge(app),
    active.length
      ? h('div', { class: 'dose-grid' }, cards.map(({ pr, status }) => doseCard(app, pr, status)))
      : emptyToday(app),
    weightCard(app));
}

function rank(st) {
  return { due: 0, new: 1, later: 2, prn: 3, done: 4 }[st.state] ?? 5;
}

function emptyToday(app) {
  return h('section', { class: 'card empty' },
    h('div', { class: 'empty-art', 'aria-hidden': 'true' }, syringeSvg({ units: 40, capacity: 100 })),
    h('h2', {}, 'Add what you take'),
    h('p', {}, 'Enter your bottle, the water you added and your dose once. From then on this screen shows exactly where to draw to.'),
    h('div', { class: 'empty-actions' },
      button('Add a Peptide', () => protocolSheet(app), { iconName: 'plus' }),
      button('Just Calculate', () => app.go('calc'), { kind: 'gray' })));
}

function statusPill(pr, st) {
  const f = frequency(pr.freq);
  switch (st.state) {
    case 'new': return h('span', { class: 'pill pill-tint' }, 'Ready');
    case 'due': return h('span', { class: 'pill pill-orange' }, st.lateDays > 0 ? `Due · ${st.lateDays} day${st.lateDays === 1 ? '' : 's'} late` : 'Due today');
    case 'done': return h('span', { class: 'pill pill-green' }, icon('check'), 'Done today');
    case 'prn': return h('span', { class: 'pill' }, f.label);
    default: return h('span', { class: 'pill' }, `Next: ${dayWord(st.next)}`);
  }
}

function doseCard(app, pr, st) {
  const { state } = app;
  const p = peptideOf(pr);
  const d = draw({ strength: pr.strength, waterMl: pr.waterMl, doseMg: pr.doseMg, syringeUnits: pr.syringe });
  const history = dosesOf(state, pr.id);

  // Only what would stop someone injecting reaches this screen.
  const urgent = checks({
    p, doseMg: pr.doseMg, d, syringeUnits: pr.syringe, waterMl: pr.waterMl,
    hasHistory: history.length > 0 || hasHistory(state, pr.peptideId, pr.id),
  }).filter((w) => w.level === 'danger');

  const bottle = bottleStatus({ protocol: pr, doses: state.doses });
  const step = nextStep({ p, doseMg: pr.doseMg, since: pr.doseSince });
  const price = cost({ price: pr.price, strength: pr.strength, doseMg: pr.doseMg, freq: pr.freq });
  const split = p.split ? splitDraw({ rounded: d.rounded, step: syringe(pr.syringe).step }) : null;

  const facts = [];
  if (bottle) {
    const low = bottle.expired || bottle.dosesLeft <= 2 || bottle.daysLeft <= 3;
    facts.push(h('li', { class: low ? 'fact-warn' : '' },
      icon('bottle'),
      bottle.expired
        ? h('span', {}, 'Bottle is past 28 days. Mix a new one.')
        : h('span', {},
          bottle.dosesLeft > 0 ? `About ${bottle.dosesLeft} dose${bottle.dosesLeft === 1 ? '' : 's'} left` : 'Bottle is about empty',
          ` · use within ${bottle.daysLeft} day${bottle.daysLeft === 1 ? '' : 's'}`),
      low ? h('button', { type: 'button', class: 'linkish', onclick: () => newBottle(app, pr) }, 'New bottle') : null));
  }
  if (price) facts.push(h('li', {}, icon('dollar'), h('span', {}, `${money(price.perDose)} a dose · about ${money(price.perMonth)} a month`)));

  return h('article', { class: `card dose-card${st.state === 'due' ? ' is-due' : ''}` },
    h('button', { type: 'button', class: 'dose-head', onclick: () => protocolSheet(app, pr), 'aria-label': `Edit ${nameOf(pr)}` },
      h('span', { class: 'dose-name' }, nameOf(pr)),
      statusPill(pr, st),
      icon('chevron', 'icon chevron')),

    h('div', { class: 'dose-answer' },
      h('div', { class: 'dose-units' },
        h('span', { class: 'dose-num' }, num(d.rounded)),
        h('span', { class: 'dose-unit' }, d.rounded === 1 ? 'unit' : 'units')),
      h('p', { class: 'dose-sub' }, `${doseText(pr, pr.doseMg)} · ${frequency(pr.freq).label.toLowerCase()} · ${syringe(pr.syringe).label} syringe`)),

    h('div', { class: 'dose-syringe' }, syringeSvg({ units: d.rounded, capacity: pr.syringe, tone: urgent.length ? 'danger' : 'ok' })),

    split && p.split
      ? h('p', { class: 'dose-tip' }, `Feeling sick on it? Split it: ${num(split.half)} units in the morning and ${num(split.half)} at night. Same total.`)
      : null,

    warningList(urgent),

    step?.ready
      ? h('div', { class: 'step-up' },
        h('p', {}, `${step.weeks} week${step.weeks === 1 ? '' : 's'} at ${doseText(pr, pr.doseMg)} done. The usual next step is ${doseText(pr, step.dose)}. Only move up if this dose sits well.`),
        h('button', { type: 'button', class: 'linkish', onclick: () => stepUp(app, pr, step) }, `Move to ${doseText(pr, step.dose)}`))
      : null,

    button(st.state === 'done' ? 'Log Another Dose' : 'Log Dose', () => doseSheet(app, pr),
      { kind: st.state === 'done' ? 'tinted' : 'filled' }),

    facts.length ? h('ul', { class: 'dose-facts' }, facts) : null);
}

async function stepUp(app, pr, step) {
  const ok = await ask({
    title: `Move to ${doseText(pr, step.dose)}?`,
    message: 'Your draw will change on the next dose. If nausea has not settled at the current dose, stay where you are.',
    actions: [{ label: 'Not Yet', value: false }, { label: 'Move Up', value: true, style: 'bold' }],
  });
  if (!ok) return;
  app.commit((st) => {
    const x = st.protocols.find((r) => r.id === pr.id);
    if (!x) return;
    x.doseMg = step.dose;
    x.doseSince = new Date().toISOString();
    const units = draw({ strength: x.strength, waterMl: x.waterMl, doseMg: x.doseMg }).units;
    if (units > x.syringe) x.syringe = bestSyringe(units);
    x.updatedAt = x.doseSince;
  });
  toast(`Dose is now ${doseText(pr, step.dose)}`);
}

async function newBottle(app, pr) {
  const ok = await ask({
    title: 'Mixed a new bottle?',
    message: `${pr.strength} mg with ${num(pr.waterMl)} mL of bac water, mixed today. If the bottle strength changed, edit the peptide instead.`,
    actions: [{ label: 'Cancel', value: false }, { label: 'New Bottle', value: true, style: 'bold' }],
  });
  if (!ok) return;
  app.commit((st) => {
    const x = st.protocols.find((r) => r.id === pr.id);
    if (!x) return;
    x.mixedAt = new Date().toISOString();
    x.updatedAt = x.mixedAt;
  });
  toast('New bottle started');
}

function weightCard(app) {
  const unit = app.state.settings.weightUnit;
  const ws = [...app.state.weights].sort((a, b) => new Date(a.at) - new Date(b.at));
  const last = ws[ws.length - 1];
  const monthAgo = Date.now() - 30 * 86400000;
  const base = ws.find((w) => new Date(w.at).getTime() >= monthAgo) ?? null;
  const change = last && base && base !== last ? weightIn(last, unit) - weightIn(base, unit) : null;

  return h('section', { class: 'card weight-card' },
    h('div', { class: 'weight-head' },
      h('span', { class: 'weight-icon', 'aria-hidden': 'true' }, icon('scale')),
      h('h2', {}, 'Weight'),
      h('button', { type: 'button', class: 'linkish', onclick: () => weightSheet(app) }, last ? 'Log' : 'Start logging')),
    last
      ? h('button', { type: 'button', class: 'weight-body', onclick: () => app.go('progress') },
        h('span', { class: 'weight-num' }, num(weightIn(last, unit), 1), h('small', {}, ` ${unit}`)),
        h('span', { class: 'weight-meta' },
          change != null && Math.abs(change) >= 0.05
            ? `${change < 0 ? '↓' : '↑'} ${num(Math.abs(change), 1)} ${unit} in 30 days`
            : dayWord(new Date(last.at).getTime()),
          icon('chevron', 'icon chevron')))
      : h('p', { class: 'weight-empty' }, 'Log your weight now and then to see it on a chart next to your doses.'));
}

function backupNudge(app) {
  const { state } = app;
  if (app.file.state === 'prompt') {
    return banner('info', `Your file ${app.file.name ? `“${app.file.name}” ` : ''}needs a tap to keep saving.`,
      h('button', { type: 'button', class: 'linkish', onclick: () => app.reconnectFile() }, 'Reconnect'));
  }
  if (app.file.state === 'ok' || entryCount(state) < 3 || !unsaved(state)) return null;
  const saved = state.settings.fileSavedAt;
  if (saved && Date.now() - new Date(saved).getTime() < 7 * 86400000) return null;
  return banner('info',
    saved ? `Last saved to a file ${relativeAgo(saved)}. Save again so a lost phone does not lose your log.`
      : 'Save your log to a file. It is your copy if this phone is lost or the browser is cleared.',
    h('button', { type: 'button', class: 'linkish', onclick: () => app.saveFile() }, 'Save'));
}
