/** The app shell: state, navigation, saving and the saved file. */

import { h, clear, icon, toast, ask, button, banner } from './ui.js';
import {
  loadLocal, saveLocal, merge, added, toFile, fromFile, fileName, emptyState, browserStorage, KEY,
} from './store.js';
import {
  support, saveCopy, pickFile, linkedHandle, forgetLinked, linkNew, openLinkable, remember,
  permission, readHandle, write,
} from './file.js';
import { todayView } from './views/today.js';
import { calculatorView } from './views/calculator.js';
import { progressView } from './views/progress.js';
import { settingsView } from './views/settings.js';

const ROUTES = [
  { id: 'today', label: 'Today', icon: 'today', view: todayView },
  { id: 'calc', label: 'Calculator', icon: 'calc', view: calculatorView },
  { id: 'progress', label: 'Progress', icon: 'progress', view: progressView },
  { id: 'settings', label: 'Settings', icon: 'settings', view: settingsView },
];

const routeFromHash = () => ROUTES.find((r) => r.id === location.hash.slice(1))?.id ?? 'today';

const app = {
  state: loadLocal(),
  ui: {},
  example: null,
  route: routeFromHash(),
  file: { state: 'none', name: null, handle: null },
  storageOk: true,

  go(id) {
    if (this.route !== id) {
      this.route = id;
      try {
        if (location.hash.slice(1) !== id) history.replaceState(null, '', `#${id}`);
      } catch { /* some embedded views refuse history changes; the tab still switches */ }
      window.scrollTo(0, 0);
    }
    this.render();
  },

  render(opts) { render(opts); },

  /**
   * Every change goes through here: apply it, stamp it, save it on this
   * device, queue it for the linked file, redraw.
   * @returns {boolean} whether this device actually kept it.
   */
  commit(mutate, { settingsOnly = false } = {}) {
    mutate(this.state);
    if (!settingsOnly) this.state.changedAt = new Date().toISOString();
    const ok = persist();
    if (!settingsOnly) schedulePush();
    this.render();
    return ok;
  },

  /** Never tell someone something was logged when it was not kept. */
  afterSave(ok, text, undo) {
    if (ok || this.file.state === 'ok') {
      toast(text, { actionLabel: 'Undo', onAction: undo });
    } else {
      toast('Logged for now, but this browser is not keeping it. Save a file before you close the app.',
        { tone: 'error', actionLabel: 'Save', onAction: () => this.saveFile(), ms: 10000 });
    }
  },

  async saveFile() {
    if (!support.save) return previewOnly();
    if (this.file.state === 'ok') return pushLinked(true);
    if (support.link) return this.linkFile();
    try {
      const how = await saveCopy(toFile(this.state), fileName());
      if (how === 'cancelled') return undefined;
      markSaved();
      toast(how === 'shared' ? 'Saved' : 'Saved to Downloads');
    } catch {
      toast('The file could not be saved. Try again.', { tone: 'error' });
    }
    return undefined;
  },

  async linkFile() {
    if (!support.save) return previewOnly();
    try {
      const handle = await linkNew(toFile(this.state), 'Peptide Log.json');
      this.file = { state: 'ok', name: handle.name, handle };
      markSaved(handle.name);
      toast(`Saving to “${handle.name}”`);
    } catch (err) {
      if (err?.name !== 'AbortError') toast('That file could not be created. Try another folder.', { tone: 'error' });
    }
    return undefined;
  },

  async reconnectFile() {
    const f = this.file;
    if (!f.handle) return;
    if ((await permission(f.handle, true)) === 'granted') {
      f.state = 'ok';
      await pullAndPush();
      toast(`Saving to “${f.name}” again`);
    } else {
      toast('The browser did not allow access to that file.', { tone: 'error' });
    }
    this.render();
  },

  async unlinkFile() {
    await forgetLinked();
    this.file = { state: 'none', name: null, handle: null };
    this.render();
    toast('Stopped. The file stays where it is.');
  },

  async openFile() {
    let picked = null;
    try {
      picked = support.link ? await openLinkable() : await pickFile();
    } catch (err) {
      if (err?.name !== 'AbortError') toast('That file could not be opened.', { tone: 'error' });
      return;
    }
    if (picked) await importText(picked.text, picked.name, picked.handle ?? null);
  },

  eraseAll() {
    forgetLinked();
    this.file = { state: 'none', name: null, handle: null };
    const keep = this.state.settings;
    this.state = emptyState();
    this.state.settings.acknowledgedAt = keep.acknowledgedAt;
    this.state.settings.weightUnit = keep.weightUnit;
    this.example = null;
    try {
      browserStorage()?.setItem(KEY, JSON.stringify(this.state));
    } catch { /* nothing stored to erase */ }
    this.render();
  },
};

/* ------------------------------------------------------------------ *
 * Saving
 * ------------------------------------------------------------------ */

function persist() {
  const stored = saveLocal(app.state);
  app.storageOk = !!stored;
  if (stored) app.state = stored;
  return !!stored;
}

function markSaved(name) {
  app.state.settings.fileSavedAt = new Date().toISOString();
  if (name) app.state.settings.fileName = name;
  persist();
  if (app.route === 'settings' || app.route === 'today') render({ soft: true });
}

let pushTimer = null;
function schedulePush() {
  if (app.file.state !== 'ok') return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushLinked(false), 500);
}

async function pushLinked(announce) {
  const f = app.file;
  if (f.state !== 'ok') return;
  try {
    await write(f.handle, toFile(app.state));
    markSaved(f.name);
    if (announce) toast(`Saved to “${f.name}”`);
  } catch {
    f.state = 'prompt';
    render({ soft: true });
  }
}

/** A linked file can be edited elsewhere (a synced folder), so read before writing. */
async function pullAndPush() {
  try {
    const text = await readHandle(app.file.handle);
    if (text.trim()) {
      app.state = merge(app.state, fromFile(text));
      persist();
    }
  } catch { /* unreadable: overwrite it with what is here */ }
  await pushLinked(false);
}

async function restoreLinked() {
  const handle = await linkedHandle();
  if (!handle) return;
  const p = await permission(handle, false);
  app.file = { state: p === 'granted' ? 'ok' : 'prompt', name: handle.name, handle };
  if (app.file.state === 'ok') await pullAndPush();
  render({ soft: true });
}

async function importText(text, name, handle) {
  let incoming;
  try {
    incoming = fromFile(text);
  } catch (err) {
    await ask({ title: 'That file did not open', message: err.message, actions: [{ label: 'OK', value: true, style: 'bold' }] });
    return;
  }

  const before = app.state;
  const blank = !before.protocols.length && !before.doses.length && !before.weights.length;
  const next = merge(before, incoming);
  if (blank) next.settings = { ...before.settings, weightUnit: incoming.settings.weightUnit };
  const gained = added(before, next);
  const extraHere = added(incoming, next);
  app.state = next;
  app.example = null;
  persist();

  if (handle && support.link && (await permission(handle, true)) === 'granted') {
    await remember(handle);
    app.file = { state: 'ok', name: handle.name, handle };
    await pushLinked(false);
  } else if (!extraHere.doses && !extraHere.weights && !extraHere.protocols) {
    // The file already holds everything that is here, so it counts as saved.
    markSaved(name);
  }

  const parts = [
    gained.doses && `${gained.doses} dose${gained.doses === 1 ? '' : 's'}`,
    gained.weights && `${gained.weights} weigh-in${gained.weights === 1 ? '' : 's'}`,
    gained.protocols && `${gained.protocols} peptide${gained.protocols === 1 ? '' : 's'}`,
  ].filter(Boolean);
  toast(parts.length ? `Added ${parts.join(', ')}` : 'Everything in that file is already here');
  app.go('progress');
}

function previewOnly() {
  return ask({
    title: 'Saving needs the app',
    message: 'This preview cannot create files. Open the app from its web address or your home screen to save your log.',
    actions: [{ label: 'OK', value: true, style: 'bold' }],
  });
}

/* ------------------------------------------------------------------ *
 * Drawing
 * ------------------------------------------------------------------ */

function isTyping() {
  const a = document.activeElement;
  return !!a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName);
}

let shell = null;

function buildShell(root) {
  const navItem = (r, cls) => h('a', {
    href: `#${r.id}`, class: cls, 'data-route': r.id,
    onclick: (e) => { e.preventDefault(); app.go(r.id); },
  }, icon(r.icon), h('span', {}, r.label));

  shell = {
    view: h('div', { id: 'view', class: 'page' }),
    links: [],
  };
  const side = h('aside', { class: 'sidebar' },
    h('div', { class: 'brand' },
      h('img', { src: 'icon.svg', alt: '', class: 'brand-icon', width: 32, height: 32 }),
      h('span', {}, 'Peptides')),
    h('nav', { class: 'side-nav', 'aria-label': 'Sections' }, ROUTES.map((r) => navItem(r, 'side-link'))),
    h('p', { class: 'side-foot' }, 'Stays on this device. Not medical advice.'));
  const tabs = h('nav', { class: 'tabbar', 'aria-label': 'Sections' }, ROUTES.map((r) => navItem(r, 'tab')));
  shell.links = [...side.querySelectorAll('a'), ...tabs.querySelectorAll('a')];
  clear(root).append(h('div', { class: 'shell' }, side, h('main', { class: 'main' }, shell.view), tabs));
}

function welcome() {
  const feature = (name, title, text) => h('li', { class: 'feature' },
    h('span', { class: 'feature-icon' }, icon(name)),
    h('div', {}, h('strong', {}, title), h('p', {}, text)));
  return h('div', { class: 'welcome' },
    h('div', { class: 'welcome-inner' },
      h('img', { src: 'icon.svg', alt: '', class: 'welcome-icon', width: 88, height: 88 }),
      h('h1', {}, 'Welcome to Peptides'),
      h('ul', { class: 'features' },
        feature('today', 'The right draw, every time', 'Enter your bottle and dose once. See exactly where to pull the plunger.'),
        feature('progress', 'Track doses and weight', 'Log in a tap and watch your progress on a chart.'),
        feature('file', 'Your log, your file', 'Everything stays on this device. Save a file to keep a copy, and open it any time.'),
        feature('shield', 'Not medical advice', 'This does the syringe maths. It cannot tell you whether something is safe for you. Several of these compounds are not approved for people.')),
      button('I Understand', () => {
        app.commit((st) => { st.settings.acknowledgedAt = new Date().toISOString(); }, { settingsOnly: true });
      }, { id: 'welcome-go' }),
      h('p', { class: 'welcome-fine' }, 'Always read the bottle label. Bottles that look the same have shipped at different strengths.')));
}

function render({ soft = false } = {}) {
  if (soft && isTyping()) return;
  const root = document.getElementById('app');
  if (!app.state.settings.acknowledgedAt) {
    shell = null;
    clear(root).append(welcome());
    return;
  }
  if (!shell || !root.contains(shell.view)) buildShell(root);

  const route = ROUTES.find((r) => r.id === app.route) ?? ROUTES[0];
  for (const a of shell.links) {
    const on = a.dataset.route === route.id;
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  document.title = route.id === 'today' ? 'Peptides' : `${route.label} · Peptides`;

  clear(shell.view).append(
    app.storageOk ? '' : banner('danger', 'This browser is not keeping your log. Private browsing usually causes this. Save a file before you close the app.',
      h('button', { type: 'button', class: 'linkish', onclick: () => app.saveFile() }, 'Save')),
    route.view(app));
}

/* ------------------------------------------------------------------ *
 * Start
 * ------------------------------------------------------------------ */

window.addEventListener('hashchange', () => app.go(routeFromHash()));

// The app can be open twice (a tab and a home screen copy). Pick up what the
// other one saved.
// When this browser is not keeping anything, what is in memory is the only
// copy, so it is never swapped for a reload.
function reloadFromStorage() {
  if (!app.storageOk) return;
  app.state = loadLocal();
  render({ soft: true });
}
window.addEventListener('storage', (e) => { if (e.key === KEY) reloadFromStorage(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') reloadFromStorage();
});

// Dropping a saved file anywhere on the window opens it.
window.addEventListener('dragover', (e) => { e.preventDefault(); });
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) await importText(await f.text(), f.name, null);
});

if (!browserStorage()) app.storageOk = false;
render();
restoreLinked();

// Ask the browser not to clear this site's storage on its own.
navigator.storage?.persist?.().catch(() => {});

if (support.save && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
