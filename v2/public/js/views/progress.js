/**
 * Progress: weight and doses over time, from what was logged here or from a
 * saved file someone opens.
 *
 * One range control sits above everything and scopes every chart and the
 * history below it, so the numbers always agree with each other.
 */

import { h, pageHeader, roundButton, segmented, button, banner, icon, dayWord, time, toast } from '../ui.js';
import { weightIn, mass, num } from '../math.js';
import { peptide } from '../data.js';
import { mountChart } from '../chart.js';
import { makeExample } from '../example.js';
import { seriesKey } from '../model.js';
import { uid } from '../store.js';
import { weightSheet } from './sheets.js';

const DAY = 86400000;
const RANGES = [
  { value: '1m', label: '1M', days: 30 },
  { value: '3m', label: '3M', days: 91 },
  { value: '6m', label: '6M', days: 182 },
  { value: '1y', label: '1Y', days: 365 },
  { value: 'all', label: 'All', days: null },
];

export function progressView(app) {
  const data = app.example ?? app.state;
  const unit = app.state.settings.weightUnit;
  app.ui.range ??= '3m';

  const view = h('div', { class: 'view view-progress' },
    pageHeader('Progress', {
      subtitle: app.example ? 'Example' : 'Weight and doses over time',
      actions: [roundButton('upload', 'Open a saved file', () => app.openFile())],
    }));

  if (app.example) {
    view.append(banner('info', 'This is example data to show what the charts look like. None of it is yours.',
      h('button', { type: 'button', class: 'linkish', onclick: () => { app.example = null; app.render(); } }, 'Close')));
  }

  if (!data.doses.length && !data.weights.length) {
    view.append(h('section', { class: 'card empty' },
      h('div', { class: 'empty-icon', 'aria-hidden': 'true' }, icon('progress')),
      h('h2', {}, 'See your progress'),
      h('p', {}, 'Log doses and your weight, or open a file you saved, and they show up here as charts.'),
      h('div', { class: 'empty-actions' },
        button('Open Saved File', () => app.openFile(), { iconName: 'upload' }),
        button('See an Example', () => { app.example = makeExample(); app.render(); }, { kind: 'gray' }),
        button('Log Weight', () => weightSheet(app), { kind: 'plain' }))));
    return view;
  }

  const range = RANGES.find((r) => r.value === app.ui.range) ?? RANGES[1];
  const now = Date.now();
  const stamps = [...data.doses, ...data.weights].map((x) => new Date(x.at).getTime());
  const earliest = Math.min(...stamps);
  let from = range.days ? now - range.days * DAY : earliest;
  if (now - from < 7 * DAY) from = now - 7 * DAY;
  const domain = [from, now];
  const inRange = (x) => new Date(x.at).getTime() >= from;

  const weights = data.weights.filter(inRange).sort((a, b) => new Date(a.at) - new Date(b.at));
  const doses = data.doses.filter(inRange).sort((a, b) => new Date(a.at) - new Date(b.at));

  view.append(
    h('div', { class: 'range-bar' }, segmented({
      id: 'range', label: 'Time range', value: range.value, options: RANGES,
      onChange: (v) => { app.ui.range = v; app.render(); },
    })),
    h('div', { class: 'progress-grid' },
      weightPanel(app, weights, unit, domain),
      ...dosePanels(doses, domain)),
    historyPanel(app, data, doses, weights, unit));
  return view;
}

/* ------------------------------------------------------------------ *
 * Weight
 * ------------------------------------------------------------------ */

function weightPanel(app, weights, unit, domain) {
  const card = h('section', { class: 'card chart-card chart-card-wide' });
  const head = h('div', { class: 'chart-head' },
    h('h2', { class: 'chart-title' }, h('span', { class: 'key key-weight', 'aria-hidden': 'true' }), 'Weight'),
    app.example ? null : h('button', { type: 'button', class: 'linkish', onclick: () => weightSheet(app) }, 'Log'));
  card.append(head);

  if (!weights.length) {
    card.append(h('p', { class: 'chart-empty' }, 'No weigh-ins in this range.'));
    return card;
  }

  const first = weights[0];
  const last = weights[weights.length - 1];
  const change = weightIn(last, unit) - weightIn(first, unit);
  const lastT = new Date(last.at).getTime();

  card.append(h('div', { class: 'stat-row' },
    stat('Latest', `${num(weightIn(last, unit), 1)}`, unit, dayWord(lastT)),
    weights.length > 1
      ? stat('Change', `${change < 0 ? '−' : change > 0 ? '+' : ''}${num(Math.abs(change), 1)}`, unit,
        `since ${new Date(first.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`)
      : null,
    null));

  const host = h('div', { class: 'chart-host' });
  card.append(host);
  queueMicrotask(() => mountChart(host, {
    points: weights.map((w) => ({ t: new Date(w.at).getTime(), v: weightIn(w, unit) })),
    kind: 'line',
    tone: 'weight',
    domain,
    fmtY: (v) => `${num(v, 1)}`,
    tip: (p) => [`${num(p.v, 1)} ${unit}`, new Date(p.t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })],
    label: `Weight from ${num(weightIn(first, unit), 1)} to ${num(weightIn(last, unit), 1)} ${unit}`,
    height: 190,
  }));
  return card;
}

function stat(label, value, unit, sub) {
  return h('div', { class: 'stat' },
    h('span', { class: 'stat-label' }, label),
    h('span', { class: 'stat-value' }, value, unit ? h('small', {}, ` ${unit}`) : null),
    h('span', { class: 'stat-sub' }, sub));
}

/* ------------------------------------------------------------------ *
 * Doses, one chart per compound
 * ------------------------------------------------------------------ */

function dosePanels(doses, domain) {
  const groups = new Map();
  for (const d of doses) {
    const k = seriesKey(d);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }
  return [...groups.values()].map((list) => {
    const first = list[0];
    const p = peptide(first.peptideId);
    const name = p && p.id !== 'other' ? p.name : (first.name || 'Other');
    const mcg = !!p?.mcg && list.every((d) => d.doseMg < 1);
    const last = list[list.length - 1];
    const week = list.filter((d) => Date.now() - new Date(d.at).getTime() < 7 * DAY).length;

    const card = h('section', { class: 'card chart-card' },
      h('div', { class: 'chart-head' },
        h('h2', { class: 'chart-title' }, h('span', { class: 'key key-dose', 'aria-hidden': 'true' }), name)),
      h('div', { class: 'stat-row' },
        stat('Current dose', mass(last.doseMg, { mcg }).split(' ')[0], mcg ? 'mcg' : 'mg', dayWord(new Date(last.at).getTime())),
        stat('Doses', String(list.length), '', `${week} in the last 7 days`)));
    const host = h('div', { class: 'chart-host' });
    card.append(host);
    queueMicrotask(() => mountChart(host, {
      points: list.map((d) => ({ t: new Date(d.at).getTime(), v: mcg ? d.doseMg * 1000 : d.doseMg, units: d.units })),
      kind: 'step',
      tone: 'dose',
      zero: true,
      domain,
      fmtY: (v) => `${num(v, 2)}`,
      tip: (pt) => [
        `${num(pt.v, 3)} ${mcg ? 'mcg' : 'mg'}${Number.isFinite(pt.units) ? ` · ${num(pt.units)} units` : ''}`,
        `${new Date(pt.t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, ${time(pt.t)}`,
      ],
      label: `${name} dose over time, now ${mass(last.doseMg, { mcg })}`,
      height: 150,
    }));
    return card;
  });
}

/* ------------------------------------------------------------------ *
 * History: the same entries as a list, which is also the chart's table view
 * ------------------------------------------------------------------ */

function historyPanel(app, data, doses, weights, unit) {
  const editing = !!app.ui.editHistory && !app.example;
  const rows = [
    ...doses.map((d) => ({ kind: 'dose', rec: d, t: new Date(d.at).getTime() })),
    ...weights.map((w) => ({ kind: 'weight', rec: w, t: new Date(w.at).getTime() })),
  ].sort((a, b) => b.t - a.t);
  const limit = app.ui.historyAll ? rows.length : 15;

  const list = h('div', { class: 'history' });
  let lastDay = null;
  for (const r of rows.slice(0, limit)) {
    const day = dayWord(r.t);
    if (day !== lastDay) {
      list.append(h('h3', { class: 'history-day' }, day));
      lastDay = day;
    }
    list.append(historyRow(app, r, unit, editing));
  }

  const panel = h('section', { class: 'history-panel' },
    h('div', { class: 'section-head' },
      h('h2', {}, 'History'),
      app.example || !rows.length ? null : h('button', {
        type: 'button', class: 'linkish',
        onclick: () => { app.ui.editHistory = !editing; app.render(); },
      }, editing ? 'Done' : 'Edit')),
    rows.length ? list : h('p', { class: 'chart-empty' }, 'Nothing logged in this range.'),
    rows.length > limit
      ? h('button', { type: 'button', class: 'linkish show-all', onclick: () => { app.ui.historyAll = true; app.render(); } }, `Show all ${rows.length}`)
      : null);
  return panel;
}

function historyRow(app, r, unit, editing) {
  const del = editing
    ? h('button', {
      type: 'button', class: 'row-delete', 'aria-label': 'Delete',
      onclick: () => removeEntry(app, r),
    }, 'Delete')
    : null;

  if (r.kind === 'weight') {
    return h('div', { class: 'history-row' },
      h('span', { class: 'key key-weight', 'aria-hidden': 'true' }),
      h('span', { class: 'history-main' }, h('strong', {}, 'Weight'), h('span', {}, `${num(weightIn(r.rec, unit), 1)} ${unit}`)),
      h('span', { class: 'history-time' }, time(r.t)),
      del);
  }
  const d = r.rec;
  const p = peptide(d.peptideId);
  const name = p && p.id !== 'other' ? p.name : (d.name || 'Dose');
  const bits = [mass(d.doseMg, { mcg: !!p?.mcg }), Number.isFinite(d.units) ? `${num(d.units)} units` : null, d.site].filter(Boolean);
  return h('div', { class: 'history-row' },
    h('span', { class: 'key key-dose', 'aria-hidden': 'true' }),
    h('span', { class: 'history-main' }, h('strong', {}, name), h('span', {}, bits.join(' · '))),
    h('span', { class: 'history-time' }, time(r.t)),
    del);
}

function removeEntry(app, r) {
  const kind = r.kind === 'weight' ? 'weights' : 'doses';
  const rec = r.rec;
  app.commit((st) => {
    st[kind] = st[kind].filter((x) => x.id !== rec.id);
    st.deleted[kind].push(rec.id);
  });
  toast('Deleted', {
    actionLabel: 'Undo',
    onAction: () => app.commit((st) => {
      // A fresh id: the old one is marked deleted, and a merge honours that.
      st[kind].push({ ...rec, id: uid(), updatedAt: new Date().toISOString() });
    }),
  });
}

