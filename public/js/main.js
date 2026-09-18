/** App shell: state, tabs, first-run acknowledgement, backup. */

import { el, $, clear, banner, captureFocus, restoreFocus } from './ui/dom.js';
import { load, save, uid, exportJson, importJson, DEFAULT_STATE, suggestSite } from './lib/store.js';
import { calculatorView } from './views/calculator.js';
import { swapView } from './views/swap.js';
import { protocolsView } from './views/protocols.js';
import { logView } from './views/log.js';
import { costView } from './views/cost.js';
import { orderView } from './views/order.js';
import { referenceView } from './views/reference.js';
import { peptide } from './data/peptides.js';

const TABS = [
  { id: 'calc', label: 'Draw', view: calculatorView },
  { id: 'swap', label: 'Bottle changed', view: swapView },
  { id: 'protocols', label: 'Protocols', view: protocolsView },
  { id: 'log', label: 'Log', view: logView },
  { id: 'cost', label: 'Cost', view: costView },
  { id: 'order', label: 'Order', view: orderView },
  { id: 'reference', label: 'Reference', view: referenceView },
];

const ctx = {
  state: load(),
  ui: {},
  tab: location.hash.slice(1) || 'calc',
  save() { save(this.state); },
  render() { render(); },
  logDose(pr, calc) {
    const p = peptide(pr.peptideId);
    this.state.logs.push({
      id: uid(), protocolId: pr.id, peptideId: pr.peptideId,
      label: pr.nickname || p?.name, at: new Date().toISOString(),
      doseMg: calc.requestedDose, units: calc.roundedUnits,
      site: suggestSite(this.state.logs),
    });
    this.save();
    this.tab = 'log';
    location.hash = 'log';
    this.render();
  },
  exportData() {
    const blob = new Blob([exportJson(this.state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `peptide-tracker-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  async importData(file) {
    if (!file) return;
    try {
      this.state = importJson(await file.text());
      this.save(); this.render();
    } catch (err) {
      alert(err.message);
    }
  },
  reset() {
    this.state = structuredClone(DEFAULT_STATE);
    this.state.settings.acknowledgedAt = new Date().toISOString();
    this.save(); this.render();
  },
};

function gate() {
  return el('div', { class: 'gate' },
    el('div', { class: 'card gate-card' },
      el('h1', {}, 'Before you use this'),
      el('ul', { class: 'gate-list' },
        el('li', {}, 'This works out how far to pull a syringe plunger. It cannot tell you whether a compound is safe for you, and it does not know anything about your health.'),
        el('li', {}, el('strong', {}, 'Units are not a dose.'), ' A number of units only means something for one exact bottle strength and one exact amount of water. Change either and the same units are a different dose.'),
        el('li', {}, 'Read the bottle label every single time. Bottles that look identical have shipped at four and six times the old strength.'),
        el('li', {}, 'Several compounds here have never been approved for people at any dose. Some have never been given to people in a trial at all.'),
        el('li', {}, 'Check the arithmetic against someone else before you inject something new. This app shows its working so you can.')),
      el('button', {
        type: 'button', class: 'btn btn-primary btn-lg',
        onclick: () => {
          ctx.state.settings.acknowledgedAt = new Date().toISOString();
          ctx.save(); render();
        },
      }, 'I understand')));
}

function render() {
  const root = $('#app');
  // Rebuilding the whole tree destroys the focused field, so the caret is
  // captured first and put back once the new tree is in place.
  const focus = captureFocus();
  clear(root);

  if (!ctx.state.settings.acknowledgedAt) {
    root.append(gate());
    return;
  }

  const tab = TABS.find((t) => t.id === ctx.tab) ?? TABS[0];

  root.append(
    el('header', { class: 'topbar' },
      el('div', { class: 'brand' },
        el('span', { class: 'brand-mark' }, '⌀'),
        el('span', {}, 'Peptide dosing')),
      el('nav', { class: 'tabs' },
        TABS.map((t) => el('a', {
          href: `#${t.id}`, class: `tab${t.id === tab.id ? ' tab-on' : ''}`,
          onclick: () => { ctx.tab = t.id; },
        }, t.label)))),
    el('main', { class: 'main' }, tab.view(ctx)),
    el('footer', { class: 'foot' },
      el('p', {},
        'Not medical advice. Nothing here leaves your browser. ',
        el('a', { href: '#reference', onclick: () => { ctx.tab = 'reference'; } }, 'Red flags and handling')),
    ));

  restoreFocus(focus);
}

window.addEventListener('hashchange', () => {
  ctx.tab = location.hash.slice(1) || 'calc';
  render();
});

render();

// Offline support, registered after the first paint. The app works without it;
// it just will not survive losing signal, which is exactly when it gets used.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
