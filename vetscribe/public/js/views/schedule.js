/** Today's appointments, with what the record says before anyone walks in. */

import { h, clear, pageHeader, roundButton, chip, segmented, time, dateWord, isoDate, toast, banner } from '../ui.js';
import { api, ApiError } from '../api.js';

const STATUS = {
  open: ['In progress', 'low'], finalized: ['Sent to PIMS', 'green'],
};

function visitChip(v) {
  if (!v) return null;
  if (v.processing) return chip('Drafting…', 'purple', 'sparkle');
  if (v.status === 'finalized') return chip('Done', 'green', 'check');
  if (v.stage === 'doctor_exam' || v.stage === 'addendum') return chip('Draft ready', 'purple');
  if (v.stage === 'tech_intake') return chip('Intake done', 'low');
  return chip(STATUS[v.status]?.[0] ?? v.status, STATUS[v.status]?.[1] ?? '');
}

export async function scheduleView(app, root) {
  clear(root);
  const date = isoDate();
  const list = h('div');
  const filter = h('div');
  root.append(
    pageHeader('Schedule', { subtitle: dateWord(), actions: [roundButton('refresh', 'Refresh', () => load())] }),
    filter, list,
  );

  let data = null;
  let provider = 'all';

  const render = () => {
    clear(list);
    if (!data) return list.append(h('p', { class: 'empty' }, 'Loading the day…'));
    const appts = data.appointments.filter((a) => provider === 'all' || a.provider.id === provider);
    if (!appts.length) return list.append(h('p', { class: 'empty' }, 'Nothing on the book.'));
    for (const a of appts) {
      const flags = a.briefing.flags.filter((f) => f.severity !== 'low').slice(0, 3);
      const more = a.briefing.flags.length - flags.length;
      list.append(h('button', {
        type: 'button', class: 'appt',
        onclick: async () => {
          if (a.visit) return app.go(`visit/${a.visit.id}`);
          try {
            const v = await api.openVisit(a.id, date);
            app.go(`visit/${v.id}`);
          } catch (e) { toast(e.message, { tone: 'error' }); }
        },
      },
      h('span', { class: 'appt-time' }, time(a.start), h('small', {}, `${a.durationMin} min`)),
      h('span', { class: 'appt-main' },
        h('span', { class: 'appt-name' }, a.patient.name, visitChip(a.visit)),
        h('span', { class: 'appt-sig' }, a.briefing.headline.replace(`${a.patient.name}, `, ''), ' · ', a.client.name),
        h('span', { class: 'appt-reason' }, a.reason || a.type),
        flags.length ? h('span', { class: 'chips' }, flags.map((f) => chip(f.text, f.severity)), more > 0 ? chip(`+${more}`) : null) : null,
        h('span', { class: 'appt-meta' }, `${a.type} · ${a.provider.name}${a.room ? ` · Room ${a.room}` : ''}${a.technician.name ? ` · ${a.technician.name}` : ''}`))));
    }
  };

  const load = async () => {
    try {
      data = await api.schedule(date);
      const providers = [...new Map(data.appointments.map((a) => [a.provider.id, a.provider.name])).entries()];
      clear(filter);
      if (providers.length > 1) {
        filter.append(segmented({
          label: 'Provider', value: provider,
          options: [{ value: 'all', label: 'Everyone' }, ...providers.map(([id, name]) => ({ value: id, label: name }))],
          onChange: (v) => { provider = v; render(); },
        }));
      }
      render();
    } catch (e) {
      clear(list);
      if (e instanceof ApiError && e.status === 401) list.append(banner('warn', 'This phone needs the practice device token.', h('button', { class: 'linkish', onclick: () => app.go('settings') }, 'Settings')));
      else list.append(banner('danger', e.message));
    }
  };
  render();
  await load();
  app.poll(load, 30000);
}
