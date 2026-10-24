/**
 * One visit: the record's briefing, the recordings, the technician's intake,
 * the SOAP as it stands, and the button that sends it to the practice system.
 */

import { h, clear, icon, card, chip, button, banner, sheet, ask, toast, time, mmss, relativeAgo } from '../ui.js';
import { api } from '../api.js';
import { openBadge } from './badge.js';

const ROLE = { tech: 'Tech intake', doctor: 'Doctor exam', addendum: 'Voice note' };
const FLAG_TONE = { missing_vital: 'medium', discrepancy_with_record: 'high', unclear_audio: 'medium', needs_doctor_confirmation: 'high', safety: 'high', overdue_preventive: 'low', open_recommendation_not_addressed: 'low' };
const FLAG_LABEL = { missing_vital: 'Missing vital', discrepancy_with_record: 'Differs from record', unclear_audio: 'Unclear audio', needs_doctor_confirmation: 'Doctor to confirm', safety: 'Safety', overdue_preventive: 'Overdue', open_recommendation_not_addressed: 'Not addressed' };
const ACTION_LABEL = { vitals_update: 'Vitals', vaccine_given: 'Vaccine given', lab_order: 'Lab order', prescription: 'Prescription', treatment_charge: 'Charge', reminder: 'Reminder', problem_update: 'Problem list', recheck_booking: 'Book recheck', client_note: 'Client note', declined_recommendation: 'Declined' };

/** Turns the plain-text note into readable blocks without a second renderer. */
function noteNodes(text) {
  const out = [];
  let list = null;
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line) { list = null; continue; }
    if (/^[A-Z][A-Z /]+$/.test(line)) { list = null; out.push(h('h4', {}, line)); continue; }
    if (line.startsWith('- ')) {
      if (!list) { list = h('ul'); out.push(list); }
      list.append(h('li', {}, line.slice(2)));
      continue;
    }
    list = null;
    if (/^\*\*\*/.test(line)) { out.push(h('p', { class: 'warn' }, line.replace(/\*/g, '').trim())); continue; }
    const m = line.match(/^([A-Z][\w /-]{0,30}):\s?(.*)$/);
    if (m && m[2]) out.push(h('p', {}, h('span', { class: 'lbl' }, `${m[1]}: `), m[2]));
    else if (m) out.push(h('p', {}, h('span', { class: 'lbl' }, `${m[1]}:`)));
    else out.push(h('p', {}, line));
  }
  return out;
}

function briefCard(visit) {
  const b = visit.briefing;
  const p = visit.appointment.patient;
  const a = visit.appointment;
  const flags = b.flags ?? [];
  const li = (label, val) => (val ? h('li', {}, h('b', {}, `${label}: `), val) : null);
  const details = h('details', {},
    h('summary', {}, 'Show the record'),
    h('ul', { class: 'brief-list' },
      li('Reason', a.reason), li('Booking notes', a.notes),
      li('Weight', p.weightHistory.slice(0, 3).map((w) => `${w.value} ${w.unit} (${w.date})`).join(' · ') || 'none on file'),
      li('Problems', p.problems.map((x) => `${x.name} (${x.status})`).join('; ') || 'none'),
      li('Medications', p.medications.map((m) => `${m.name} ${m.dose} ${m.frequency}`).join('; ') || 'none'),
      li('Allergies', p.allergies.join('; ') || 'none recorded'),
      li('Vaccines', p.vaccines.map((v) => `${v.name} due ${v.due ?? '?'}`).join('; ') || 'none'),
      li('Preventives', p.preventives.map((v) => `${v.name} due ${v.due ?? '?'}`).join('; ') || 'none'),
      li('Labs', p.labs.map((l) => `${l.date} ${l.name}: ${l.summary}`).join(' · ') || 'none'),
      ...p.recentVisits.slice(0, 2).map((v) => li(`Visit ${v.date}`, `${v.reason}. A: ${v.assessment} P: ${v.plan}`)),
      li('Open', p.openRecommendations.join('; ') || 'none'),
      li('Client', `${a.client.name}, prefers ${a.client.preferredContact}${a.client.notes ? `. ${a.client.notes}` : ''}`)));
  return card('Before you walk in',
    flags.length ? h('div', { class: 'chips', style: 'margin-bottom:10px' }, flags.map((f) => chip(f.text, f.severity))) : h('p', { class: 'small muted' }, 'Nothing flagged in the record.'),
    details);
}

function segmentsCard(visit, reload) {
  const rows = visit.segments.map((s) => {
    const dur = s.endedAt ? mmss(new Date(s.endedAt) - new Date(s.startedAt)) : 'recording…';
    const state = s.status === 'done' ? (s.transcript ? `${s.transcript.length} chars` : 'no speech captured') : s.status;
    const trailing = ['transcribing', 'drafting', 'recording'].includes(s.status) ? h('span', { class: 'spinner' }) : icon('chevron', 'icon chevron');
    return h('button', {
      type: 'button', class: 'row row-nav', onclick: () => transcriptSheet(visit, s, reload),
    },
    h('span', { class: 'row-stack' },
      h('span', { class: `role-${s.role}` }, h('b', {}, ROLE[s.role]), h('span', { class: 'muted small' }, ` · ${time(s.startedAt)} · ${dur} · ${state}`)),
      s.warning ? h('span', { class: 'sub', style: 'color: var(--orange)' }, s.warning) : null,
      s.transcript ? h('span', { class: 'sub' }, s.transcript) : null),
    trailing);
  });
  return h('section', { class: 'group segments' }, h('h3', { class: 'group-header' }, 'Recordings'),
    h('div', { class: 'group-body' }, rows.length ? rows : h('p', { class: 'empty small' }, 'Nothing recorded yet.')));
}

function transcriptSheet(visit, seg, reload) {
  sheet({
    title: `${ROLE[seg.role]} transcript`,
    build: (close) => {
      const ta = h('textarea', { class: 'textarea', rows: 12 }, seg.transcript ?? '');
      return h('div', {},
        h('p', { class: 'tiny', style: 'margin-bottom:8px' }, `Source: ${seg.transcriptSource ?? 'none'} · ${time(seg.startedAt)}`),
        seg.warning ? banner('warn', seg.warning) : null,
        ta,
        h('div', { class: 'btn-row' },
          button('Delete', async () => {
            const ok = await ask({ title: 'Delete this recording?', message: 'The note will be redrafted without it.', actions: [{ label: 'Keep', value: false }, { label: 'Delete', value: true, style: 'destructive' }] });
            if (!ok) return;
            try { await api.removeSegment(visit.id, seg.id); close(); reload(); } catch (e) { toast(e.message, { tone: 'error' }); }
          }, { kind: 'danger', iconName: 'trash' }),
          button('Save and redraft', async () => {
            try { await api.setTranscript(visit.id, seg.id, ta.value); close(); toast('Redrafting…'); reload(); } catch (e) { toast(e.message, { tone: 'error' }); }
          }, { iconName: 'sparkle' })));
    },
  });
}

function intakeCard(visit) {
  const i = visit.intake;
  if (!i || !visit.soap) return null;
  const v = i.vitals ?? {};
  const vit = [
    v.weight?.value != null ? `${v.weight.value} ${v.weight.unit ?? ''}` : null, v.temperature_f != null ? `T ${v.temperature_f}` : null,
    v.heart_rate != null ? `HR ${v.heart_rate}` : null, v.resp_rate != null ? `RR ${v.resp_rate}` : null, v.mucous_membranes ? `mm ${v.mucous_membranes}` : null,
    v.crt_seconds != null ? `CRT ${v.crt_seconds}s` : null, v.bcs_9 != null ? `BCS ${v.bcs_9}/9` : null, v.pain_score_10 != null ? `Pain ${v.pain_score_10}/10` : null, v.attitude,
  ].filter(Boolean).join(' · ');
  const hist = Object.entries(i.history ?? {}).filter(([, val]) => val).map(([k, val]) => `${k.replace(/_/g, ' ')}: ${val}`);
  const dl = h('dl', { class: 'kv' });
  const add = (k, val) => { if (val && (!Array.isArray(val) || val.length)) dl.append(h('dt', {}, k), h('dd', {}, Array.isArray(val) ? h('ul', { style: 'margin:0;padding-left:16px' }, val.map((x) => h('li', {}, x))) : val)); };
  add('Complaint', i.presenting_complaint);
  add('Vitals', vit || 'none stated');
  add('History', hist);
  add('Owner asks', i.owner_concerns);
  add('Diet', i.diet);
  add('Meds reported', i.medications_and_supplements_reported);
  add('Preventives', [i.preventives_reported?.heartworm && `HW: ${i.preventives_reported.heartworm}`, i.preventives_reported?.flea_tick && `Flea/tick: ${i.preventives_reported.flea_tick}`].filter(Boolean));
  add('Lifestyle', i.lifestyle_environment);
  add('Tech noted', i.tech_observations);
  add('For the doctor', i.items_for_doctor);
  return card('Technician intake', dl);
}

function soapCard(visit, state, reload) {
  const soap = visit.soap;
  const noteBody = h('div', { class: 'note' });
  api.noteText(visit.id).then((t) => { clear(noteBody); noteBody.append(...noteNodes(t)); }).catch(() => noteBody.append(h('p', { class: 'muted' }, 'Could not load the note.')));
  const edit = () => sheet({
    title: 'Edit note text',
    build: (close) => {
      const ta = h('textarea', { class: 'textarea mono' });
      api.noteText(visit.id).then((t) => { ta.value = t; });
      return h('div', {},
        h('p', { class: 'tiny', style: 'margin-bottom:8px' }, 'This is the text that goes to the practice system. A new recording or "Redraft" replaces it.'),
        ta,
        h('div', { class: 'btn-row' },
          visit.noteOverride ? button('Discard edits', async () => { await api.updateDraft(visit.id, { noteText: null }); close(); reload(); }, { kind: 'gray' }) : null,
          button('Save', async () => { try { await api.updateDraft(visit.id, { noteText: ta.value }); close(); reload(); } catch (e) { toast(e.message, { tone: 'error' }); } })));
    },
  });
  const stageWord = { tech_intake: 'from the tech intake', doctor_exam: 'from the exam', addendum: 'with voice note', redraft: 'redrafted' }[visit.stage] ?? '';
  const last = visit.drafts.at(-1);
  return card(h('span', {}, 'SOAP ', h('span', { class: 'muted', style: 'text-transform:none;letter-spacing:0;font-weight:500' }, stageWord)),
    h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px' },
      soap.assessment.doctor_exam_pending ? chip('Doctor exam pending', 'medium', 'warn') : chip('Doctor exam recorded', 'purple', 'stethoscope'),
      visit.noteOverride ? chip('Edited by hand', 'low', 'pencil') : null,
      last ? chip(`${last.model === 'mock' ? 'mock scribe' : last.model} · ${relativeAgo(last.at)}`) : null),
    visit.soap.changes_from_previous?.length ? banner('info', h('span', {}, h('b', {}, 'Changed: '), visit.soap.changes_from_previous.join(' · '))) : null,
    noteBody,
    h('div', { class: 'btn-row' },
      visit.status === 'finalized' ? null : button('Edit text', edit, { kind: 'gray', iconName: 'pencil' }),
      button('Copy', async () => { try { await navigator.clipboard.writeText(await api.noteText(visit.id)); toast('Note copied'); } catch { toast('Copy failed', { tone: 'error' }); } }, { kind: 'gray', iconName: 'copy' })));
}

function flagsCard(soap) {
  if (!soap.flags?.length) return null;
  return card('Check before signing', h('div', {}, soap.flags.map((f) => h('div', { class: 'flag' }, chip(FLAG_LABEL[f.kind] ?? f.kind, FLAG_TONE[f.kind] ?? ''), h('span', {}, f.detail)))));
}

function actionsCard(soap, state) {
  if (!soap.pims_actions?.length) return null;
  return card('To record in the practice system',
    h('p', { class: 'tiny', style: 'margin-bottom:6px' }, 'Ticked items go with the note when you send it.'),
    h('div', {}, soap.pims_actions.map((a, i) => h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: state.actions.has(i), onchange: (e) => { if (e.target.checked) state.actions.add(i); else state.actions.delete(i); } }),
      h('span', {}, h('b', {}, `${ACTION_LABEL[a.kind] ?? a.kind}: `), a.detail, a.source ? h('span', { class: 'src' }, `“${a.source}”`) : null)))));
}

function evidenceCard(soap) {
  if (!soap.evidence?.length) return null;
  return card(null, h('details', {}, h('summary', {}, `Transcript evidence (${soap.evidence.length})`), soap.evidence.map((e) => h('div', { class: 'evidence' }, h('b', {}, `${e.section}: `), `“${e.quote}”`))));
}

export async function visitView(app, root, id) {
  clear(root);
  const body = h('div');
  root.append(h('button', { type: 'button', class: 'back', onclick: () => app.go('schedule') }, icon('back'), 'Schedule'), body);
  const state = { actions: new Set(), actionsFor: null };
  let visit = null;

  const record = (role) => openBadge({ visit, role, onFinished: () => load() });

  const render = () => {
    clear(body);
    if (!visit) return body.append(h('p', { class: 'empty' }, 'Loading…'));
    const p = visit.appointment.patient;
    const soap = visit.soap;
    const hasTech = visit.segments.some((s) => s.role === 'tech');
    const hasDoctor = visit.segments.some((s) => s.role === 'doctor');
    const next = !hasTech ? 'tech' : !hasDoctor ? 'doctor' : 'addendum';
    const locked = visit.status === 'finalized';
    const btn = (role, label, iconName, sub) => button(label, () => record(role), { kind: next === role && !locked ? 'filled' : 'tinted', iconName, cls: 'btn-big', sub, disabled: locked || visit.processing });

    body.append(h('div', {},
      h('div', { class: 'visit-head' },
        h('h1', { class: 'visit-name' }, p.name, locked ? chip('Sent to PIMS', 'green', 'check') : visit.processing ? chip('Drafting…', 'purple', 'sparkle') : null),
        h('p', { class: 'visit-sig' }, `${visit.briefing.headline.replace(`${p.name}, `, '')} · ${visit.appointment.client.name} · ${time(visit.appointment.start)} · ${visit.appointment.provider.name}`)),
      visit.lastError ? banner('danger', `The last draft failed: ${visit.lastError}`, h('button', { class: 'linkish', onclick: () => api.redraft(visit.id).then(load) }, 'Retry')) : null,
      locked ? banner('ok', `Sent ${relativeAgo(visit.finalizedAt)}${visit.signedBy ? ` by ${visit.signedBy}` : ''}${visit.pimsResult?.noteId ? ` as ${visit.pimsResult.noteId}` : ''}.`, h('button', { class: 'linkish', onclick: async () => { await api.reopen(visit.id); load(); } }, 'Reopen')) : null,
      briefCard(visit),
      locked ? null : h('div', { class: 'record-grid' }, btn('tech', 'Tech intake', 'mic', hasTech ? 'add more' : 'start here'), btn('doctor', 'Doctor exam', 'stethoscope', hasDoctor ? 'add more' : null), btn('addendum', 'Voice note', 'note', 'any time')),
      segmentsCard(visit, load),
      intakeCard(visit),
      soap ? soapCard(visit, state, load) : h('p', { class: 'empty' }, visit.processing ? 'Transcribing and drafting…' : 'Record the technician intake to start the note.'),
      soap ? flagsCard(soap) : null,
      soap ? actionsCard(soap, state) : null,
      soap ? evidenceCard(soap) : null,
      soap && !locked ? h('div', { class: 'btn-row' },
        button('Redraft', async () => { try { await api.redraft(visit.id); toast('Redrafting from all recordings…'); load(); } catch (e) { toast(e.message, { tone: 'error' }); } }, { kind: 'gray', iconName: 'sparkle', disabled: visit.processing }),
        button('Send to PIMS', finalize, { kind: 'green', iconName: 'send', disabled: visit.processing })) : null,
    ));
  };

  const finalize = async () => {
    if (visit.soap.assessment.doctor_exam_pending) {
      const go = await ask({ title: 'Send the intake draft?', message: 'No doctor exam has been recorded. The note will say the doctor exam is pending.', actions: [{ label: 'Wait', value: false }, { label: 'Send anyway', value: true }] });
      if (!go) return;
    }
    const ok = await ask({ title: 'Send this note to the practice system?', message: `It will be signed as ${app.device || 'this device'}. You can reopen it afterwards.`, actions: [{ label: 'Cancel', value: false }, { label: 'Send', value: true, style: 'bold' }] });
    if (!ok) return;
    try {
      const actions = visit.soap.pims_actions.filter((_, i) => state.actions.has(i));
      visit = await api.finalize(visit.id, actions);
      toast('Note sent');
      render();
    } catch (e) { toast(e.message, { tone: 'error' }); }
  };

  const load = async () => {
    try {
      const v = await api.visit(id);
      if (v.soap && state.actionsFor !== v.updatedAt) {
        state.actions = new Set(v.soap.pims_actions.map((_, i) => i));
        state.actionsFor = v.updatedAt;
      }
      const changed = !visit || visit.updatedAt !== v.updatedAt || visit.processing !== v.processing;
      visit = v;
      if (changed) render();
      app.poll(load, v.processing || v.segments.some((s) => s.status === 'recording') ? 2500 : 15000);
    } catch (e) {
      clear(body);
      body.append(banner('danger', e.message));
    }
  };
  render();
  await load();
}
