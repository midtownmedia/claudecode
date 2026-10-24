/** Who this phone is, the device token, and what the server is running. */

import { h, clear, pageHeader, group, row, banner, button, toast } from '../ui.js';
import { api, prefs } from '../api.js';

export async function settingsView(app, root) {
  clear(root);
  const status = h('div');
  const deviceInput = h('input', { class: 'text-input', value: prefs.device, placeholder: 'e.g. Sam (LVT) or Dr. Patel', autocomplete: 'off', oninput: (e) => { prefs.device = e.target.value.trim(); } });
  const tokenInput = h('input', { class: 'text-input', type: 'password', value: prefs.token, placeholder: 'from the practice admin', autocomplete: 'off', oninput: (e) => { prefs.token = e.target.value.trim(); } });

  const check = async () => {
    clear(status);
    try {
      const hlth = await api.health();
      status.append(
        group({ header: 'Server' },
          row('Practice', hlth.practiceName),
          row('Scribe model', hlth.model),
          row('Transcription', hlth.transcriber),
          row('Practice system', hlth.pims),
          row('Device token', hlth.authRequired ? 'required' : 'not required')),
        ...hlth.warnings.map((w) => banner('warn', w)),
      );
      app.health = hlth;
    } catch (e) {
      status.append(banner(e.status === 401 ? 'warn' : 'danger', e.status === 401 ? 'The token was not accepted.' : e.message));
    }
  };

  root.append(
    pageHeader('Settings'),
    group({ header: 'This phone', footer: 'The name is written on every segment this phone records and on the notes it signs.' },
      row('Your name', deviceInput),
      row('Device token', tokenInput)),
    h('div', { class: 'btn-row' }, button('Check connection', check, { kind: 'tinted' })),
    status,
    group({ header: 'Using it' },
      h('div', { class: 'row' }, h('p', { class: 'small muted' }, 'Add this page to the home screen so it opens full-screen. On the visit screen, tap Tech intake before you start talking to the owner, Doctor exam when the doctor walks in, and Voice note for anything after. The note redrafts itself after each one.'))),
  );
  await check();
}
