/** The shell: routes, the tab bar, health and polling. */

import { h, clear, icon, banner } from './ui.js';
import { api, prefs } from './api.js';
import { scheduleView } from './views/schedule.js';
import { visitView } from './views/visit.js';
import { settingsView } from './views/settings.js';

const root = document.getElementById('app');
const tabs = document.getElementById('tabs');

const app = {
  health: null,
  get device() { return prefs.device; },
  pollTimer: null,

  go(hash) {
    if (location.hash.slice(1) !== hash) location.hash = hash; else this.render();
  },

  /** Views register one poller; navigating away clears it. */
  poll(fn, ms) {
    clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(async () => {
      if (document.visibilityState !== 'visible') return this.poll(fn, ms);
      await fn();
    }, ms);
  },

  async render() {
    clearTimeout(this.pollTimer);
    const [name, id] = location.hash.replace(/^#\/?/, '').split('/');
    const route = name || 'schedule';
    for (const b of tabs.querySelectorAll('.tab')) b.toggleAttribute('aria-current', b.dataset.route === route) || b.setAttribute('aria-current', b.dataset.route === route ? 'page' : 'false');
    window.scrollTo(0, 0);
    if (route === 'visit' && id) return visitView(this, root, id);
    if (route === 'settings') return settingsView(this, root);
    return scheduleView(this, root);
  },
};

function tab(route, label, iconName) {
  return h('button', { type: 'button', class: 'tab', 'data-route': route, onclick: () => app.go(route) }, icon(iconName), label);
}
tabs.append(tab('schedule', 'Schedule', 'calendar'), tab('settings', 'Settings', 'settings'));

window.addEventListener('hashchange', () => app.render());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') app.render(); });

(async () => {
  if (!prefs.device) location.hash = 'settings';
  await app.render();
  try {
    app.health = await api.health();
    if (app.health.warnings.length && location.hash !== '#settings') {
      const note = h('div', { id: 'health-note' }, banner('warn', app.health.warnings.join(' ')));
      root.prepend(note);
    }
  } catch { /* the schedule view reports connection problems itself */ }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
