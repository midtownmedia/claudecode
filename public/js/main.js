/** App shell: state, tabs, first-run acknowledgement, backup. */

import { el, $, clear, banner, captureFocus, restoreFocus } from './ui/dom.js';
import { load, save, uid, exportJson, importJson, DEFAULT_STATE, suggestSite,
  markDeleted, recentDuplicate, storageAvailable, PREIMPORT_KEY, storage } from './lib/store.js';
import { calculatorView } from './views/calculator.js';
import { swapView } from './views/swap.js';
import { protocolsView } from './views/protocols.js';
import { logView } from './views/log.js';
import { costView } from './views/cost.js';
import { orderView } from './views/order.js';
import { referenceView } from './views/reference.js';
import { todayView } from './views/today.js';
import { moreView } from './views/more.js';
import { peptide } from './data/peptides.js';

/**
 * Four tabs, not seven.
 *
 * Only the screens someone touches routinely get a permanent place. Setup and
 * reference are reached through More -- still one tap, but not competing for
 * attention with the thing you open the app to do.
 */
const VIEWS = [
  { id: 'today', label: 'Today', view: todayView, primary: true },
  { id: 'calc', label: 'Calculator', view: calculatorView, primary: true },
  { id: 'swap', label: 'Bottle changed', view: swapView, primary: true },
  { id: 'more', label: 'More', view: moreView, primary: true },
  { id: 'protocols', label: 'What I am taking', view: protocolsView },
  { id: 'log', label: 'History', view: logView },
  { id: 'cost', label: 'What it costs', view: costView },
  { id: 'order', label: 'Plan an order', view: orderView },
  { id: 'reference', label: 'Safety and reference', view: referenceView },
];
const TABS = VIEWS.filter((v) => v.primary);

const ctx = {
  state: load(),
  ui: {},
  tab: location.hash.slice(1) || 'today',
  // Returns false when the write did not land. Anything that tells the user
  // something was recorded has to check this.
  save() { return save(this.state); },
  markDeleted(kind, id) { markDeleted(this.state, kind, id); },
  render() { render(); },
  go(id) {
    this.tab = id;
    location.hash = id;
    render();
  },
  logDose(pr, calc) {
    const p = peptide(pr.peptideId);
    const dupe = recentDuplicate(this.state.logs, pr.id);
    if (dupe) {
      const mins = Math.max(1, Math.round((Date.now() - new Date(dupe.at).getTime()) / 60000));
      if (!confirm(`You logged this ${mins} minute${mins === 1 ? '' : 's'} ago. Log another dose?`)) return;
    }

    const entry = {
      id: uid(), protocolId: pr.id, peptideId: pr.peptideId,
      label: pr.nickname || p?.name, at: new Date().toISOString(),
      doseMg: calc.requestedDose, units: calc.roundedUnits,
      site: suggestSite(this.state.logs),
    };
    this.state.logs.push(entry);

    if (!this.save()) {
      // Never leave the user believing a dose was recorded when it was not:
      // the next launch would show it as still due and invite a second one.
      this.state.logs = this.state.logs.filter((l) => l.id !== entry.id);
      this.saveFailed = 'That dose was NOT saved. This browser is out of storage or is blocking it. Write the dose down before you forget it.';
      this.render();
      return;
    }
    this.saveFailed = null;
    this.go('today');
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
    let incoming;
    try {
      incoming = importJson(await file.text());
    } catch (err) {
      alert(err.message);
      return;
    }

    // Import replaces everything and cannot be undone, so say what is being
    // traded for what before doing it.
    const here = `${this.state.protocols.length} protocol${this.state.protocols.length === 1 ? '' : 's'} and ${this.state.logs.length} logged dose${this.state.logs.length === 1 ? '' : 's'}`;
    const there = `${incoming.protocols.length} protocol${incoming.protocols.length === 1 ? '' : 's'} and ${incoming.logs.length} logged dose${incoming.logs.length === 1 ? '' : 's'}`;
    if (!confirm(`Replace ${here} on this device with ${there} from the file?\n\nThis cannot be undone.`)) return;

    const previous = this.state;
    try {
      storage()?.setItem(PREIMPORT_KEY, exportJson(previous));
    } catch { /* best effort */ }

    this.state = incoming;
    if (!this.save()) {
      this.state = previous;
      this.saveFailed = 'The backup could not be written to this browser, so nothing was changed.';
      this.render();
      return;
    }
    this.saveFailed = null;
    this.render();
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

  const tab = VIEWS.find((t) => t.id === ctx.tab) ?? VIEWS[0];
  const onSecondary = !tab.primary;

  root.append(
    el('header', { class: 'topbar' },
      el('div', { class: 'brand' },
        el('span', { class: 'brand-mark' }, '⌀'),
        el('span', {}, 'Peptide dosing')),
      el('nav', { class: 'tabs' },
        TABS.map((t) => el('a', {
          href: `#${t.id}`,
          class: `tab${t.id === tab.id || (onSecondary && t.id === 'more') ? ' tab-on' : ''}`,
          onclick: () => { ctx.tab = t.id; },
        }, t.label)))),
    el('main', { class: 'main' },
      ctx.saveFailed ? banner('danger', ctx.saveFailed) : null,
      ctx.state.loadFailed
        ? banner('danger',
          'Your saved data could not be read and could not be recovered automatically. '
          + 'A copy of the unreadable file has been kept in this browser in case it can be repaired. '
          + 'Nothing has been overwritten yet.')
        : null,
      ctx.storageBlocked
        ? banner('warn',
          'This browser is not letting the app save anything, so doses will not be remembered. '
          + 'Private browsing usually causes this.')
        : null,
      // A screen reached through More is not in the tab bar, so it needs its
      // own way back or people get stranded on it.
      onSecondary
        ? el('div', { class: 'crumb' },
          el('button', { type: 'button', class: 'linkbtn', onclick: () => ctx.go('more') }, '‹ More'),
          el('span', { class: 'crumb-title' }, tab.label))
        : null,
      tab.view(ctx)),
    el('footer', { class: 'foot' },
      el('p', {},
        'Not medical advice. Nothing here leaves your browser. ',
        el('a', { href: '#reference', onclick: () => { ctx.tab = 'reference'; } }, 'Warning signs and handling')),
    ));

  restoreFocus(focus);
}

// The app can be open twice -- a browser tab and a home-screen copy. Each holds
// its own snapshot, so re-read whenever the other one writes or when this copy
// comes back to the foreground. Without this, a stale copy shows a dose that was
// already taken as still due.
function refreshFromStorage() {
  const before = JSON.stringify([ctx.state.logs.length, ctx.state.protocols.length, ctx.state.rev]);
  ctx.state = load();
  if (JSON.stringify([ctx.state.logs.length, ctx.state.protocols.length, ctx.state.rev]) !== before) render();
}

window.addEventListener('storage', (e) => {
  if (e.key === null || e.key === 'pdt.state.v1') refreshFromStorage();
});
// The storage event does not fire in the tab that wrote, and does not fire at
// all between a standalone PWA and a browser tab on some platforms.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshFromStorage();
});

window.addEventListener('hashchange', () => {
  ctx.tab = location.hash.slice(1) || 'today';
  render();
});

ctx.storageBlocked = !storageAvailable();
render();

// Offline support, registered after the first paint. The app works without it;
// it just will not survive losing signal, which is exactly when it gets used.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
