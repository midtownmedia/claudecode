/** Settings: the saved file, the peptides set up, preferences and safety. */

import { h, pageHeader, group, navRow, segmented, button, ask, toast, relativeAgo } from '../ui.js';
import { num } from '../math.js';
import { frequency } from '../data.js';
import { nameOf, doseText } from '../model.js';
import { unsaved } from '../store.js';
import { support } from '../file.js';
import { protocolSheet, safetySheet, handlingSheet } from './sheets.js';

export function settingsView(app) {
  const { state } = app;
  return h('div', { class: 'view view-settings' },
    pageHeader('Settings'),
    h('div', { class: 'settings-grid' },
      h('div', { class: 'settings-col' },
        fileGroup(app),
        peptidesGroup(app)),
      h('div', { class: 'settings-col' },
        group({ header: 'Preferences' },
          h('div', { class: 'row' },
            h('span', { class: 'row-label' }, 'Weight in'),
            h('span', { class: 'row-value' }, segmented({
              id: 'set-weight-unit', label: 'Weight unit', small: true, value: state.settings.weightUnit,
              options: [{ value: 'lb', label: 'Pounds' }, { value: 'kg', label: 'Kilograms' }],
              onChange: (v) => app.commit((st) => { st.settings.weightUnit = v; }, { settingsOnly: true }),
            })))),
        group({ header: 'Safety' },
          navRow({ title: 'Warning signs', iconName: 'shield', onClick: safetySheet }),
          navRow({ title: 'Safe handling', iconName: 'hand', onClick: handlingSheet })),
        group({ footer: 'This app does the syringe maths. It cannot tell you whether something is safe for you, and it is not medical advice. Several of these compounds are not approved for people at any dose.' },
          navRow({ title: 'Erase all data', tone: 'destructive', iconName: 'trash', onClick: () => eraseAll(app) })))));
}

function fileGroup(app) {
  const { state } = app;
  const f = app.file;
  const saved = state.settings.fileSavedAt;

  let status;
  if (f.state === 'ok') status = `Saving to “${f.name}” automatically.`;
  else if (f.state === 'prompt') status = `Linked to “${f.name}”. Tap Reconnect to keep saving to it.`;
  else if (saved) status = `Last saved ${relativeAgo(saved)}${unsaved(state) ? '. You have changes since then.' : '. Up to date.'}`;
  else status = 'Not saved to a file yet.';

  const counts = `${state.doses.length} dose${state.doses.length === 1 ? '' : 's'} and ${state.weights.length} weigh-in${state.weights.length === 1 ? '' : 's'} on this device.`;

  const actions = [];
  if (f.state === 'prompt') {
    actions.push(button('Reconnect File', () => app.reconnectFile(), { iconName: 'link' }));
  } else if (support.link && f.state !== 'ok') {
    actions.push(button('Save to a File', () => app.linkFile(), { iconName: 'download' }));
  } else if (f.state !== 'ok') {
    actions.push(button('Save a Copy', () => app.saveFile(), { iconName: 'download' }));
  }
  actions.push(button('Open Saved File', () => app.openFile(), { kind: 'gray', iconName: 'upload' }));
  if (f.state === 'ok' || f.state === 'prompt') {
    actions.push(button('Stop Using This File', () => app.unlinkFile(), { kind: 'plain' }));
  }

  const how = support.link
    ? 'Pick where the file lives once, like iCloud Drive, Dropbox or Documents. Every change is saved to it after that.'
    : 'On iPhone, choose Save to Files. Opening a file adds its entries to what is here. Nothing gets deleted.';

  return h('section', { class: 'group file-group' },
    h('h3', { class: 'group-header' }, 'Your data'),
    h('div', { class: 'group-body file-card' },
      h('div', { class: 'file-status' },
        h('span', { class: `file-dot${f.state === 'ok' || (saved && !unsaved(state)) ? ' is-ok' : ''}`, 'aria-hidden': 'true' }),
        h('div', {},
          h('strong', {}, status),
          h('span', {}, counts))),
      h('div', { class: 'file-actions' }, actions)),
    h('p', { class: 'group-footer' },
      'Your log is kept in this browser. A saved file is your copy for a new phone, a cleared browser or a lost phone. Open it here any time to see your charts. ', how));
}

function peptidesGroup(app) {
  const list = [...app.state.protocols].sort((a, b) => (b.active !== false) - (a.active !== false));
  return group({ header: 'My peptides', footer: list.length ? 'Paused peptides are hidden from Today. Their history is kept.' : null },
    list.map((pr) => navRow({
      title: nameOf(pr),
      detail: pr.active === false
        ? 'Paused'
        : `${doseText(pr, pr.doseMg)} · ${frequency(pr.freq).label.toLowerCase()}`,
      onClick: () => protocolSheet(app, pr),
    })),
    h('button', { type: 'button', class: 'row row-nav row-add', onclick: () => protocolSheet(app) },
      h('span', { class: 'row-label' }, 'Add a peptide')));
}

async function eraseAll(app) {
  const ok = await ask({
    title: 'Erase everything?',
    message: `This removes ${num(app.state.doses.length)} doses, ${num(app.state.weights.length)} weigh-ins and your peptides from this device. A file you saved is not touched.`,
    actions: [{ label: 'Cancel', value: false }, { label: 'Erase', value: true, style: 'destructive' }],
  });
  if (!ok) return;
  app.eraseAll();
  toast('Erased');
}
