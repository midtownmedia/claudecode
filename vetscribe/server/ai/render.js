/** The SOAP as the plain text that goes into the practice management system. */

import { toKg, toLb } from '../pims/normalize.js';

const list = (items, bullet = '- ') => (items?.length ? items.map((x) => `${bullet}${x}`).join('\n') : null);
const line = (label, v) => (v == null || v === '' ? null : `${label}: ${v}`);

export function renderVitals(v) {
  if (!v) return 'not recorded';
  const parts = [];
  if (v.weight?.value != null) {
    const w = { value: v.weight.value, unit: v.weight.unit ?? 'kg' };
    parts.push(`Wt ${toKg(w).toFixed(1)} kg (${toLb(w).toFixed(1)} lb)`);
  }
  if (v.temperature_f != null) parts.push(`T ${v.temperature_f} F`);
  if (v.heart_rate != null) parts.push(`HR ${v.heart_rate}`);
  if (v.resp_rate != null) parts.push(`RR ${v.resp_rate}`);
  if (v.mucous_membranes) parts.push(`mm ${v.mucous_membranes}`);
  if (v.crt_seconds != null) parts.push(`CRT ${v.crt_seconds}s`);
  if (v.bcs_9 != null) parts.push(`BCS ${v.bcs_9}/9`);
  if (v.pain_score_10 != null) parts.push(`Pain ${v.pain_score_10}/10`);
  if (v.hydration) parts.push(`Hydration ${v.hydration}`);
  if (v.attitude) parts.push(v.attitude);
  return parts.length ? parts.join(', ') : 'not recorded';
}

export function renderSoapText(soap, { appointment, visit, briefing } = {}) {
  const p = appointment?.patient;
  const out = [];
  if (p) out.push(`${briefing?.headline ?? `${p.name}, ${p.breed} ${p.species}`} | Owner: ${appointment.client.name} | ${briefing?.date ?? ''} | ${appointment.provider.name}`.trim());
  if (visit?.status === 'finalized' && visit.finalizedAt) out.push(`Finalized ${visit.finalizedAt}${visit.signedBy ? ` by ${visit.signedBy}` : ''}`);
  if (soap.assessment?.doctor_exam_pending) out.push('*** TECHNICIAN INTAKE DRAFT: doctor exam pending ***');
  out.push('');

  const s = soap.subjective;
  out.push('SUBJECTIVE');
  out.push(...[
    line('CC', s.presenting_complaint),
    s.history_of_present_illness ? `HPI: ${s.history_of_present_illness}` : null,
    s.owner_reported?.length ? `Owner reports:\n${list(s.owner_reported)}` : null,
    line('Diet', s.diet),
    s.current_medications?.length ? `Current meds: ${s.current_medications.join('; ')}` : null,
    line('Lifestyle', s.lifestyle_environment),
    s.pertinent_record_history?.length ? `Pertinent history:\n${list(s.pertinent_record_history)}` : null,
  ].filter(Boolean));
  out.push('');

  const o = soap.objective;
  out.push('OBJECTIVE');
  out.push(`Vitals: ${renderVitals(o.vitals)}`);
  if (o.physical_exam?.length) {
    out.push('PE:');
    for (const e of o.physical_exam) out.push(`- ${e.system}: ${e.finding}${e.abnormal ? ' (abnormal)' : ''}`);
  }
  if (o.diagnostics_results?.length) {
    out.push('Diagnostics:');
    for (const d of o.diagnostics_results) out.push(`- ${d.test}: ${d.result}`);
  }
  out.push('');

  const a = soap.assessment;
  out.push('ASSESSMENT');
  for (const pr of a.problems ?? []) {
    out.push(`- ${pr.problem} [${pr.status}]${pr.differentials?.length ? ` DDx: ${pr.differentials.join(', ')}` : ''}${pr.notes ? ` ${pr.notes}` : ''}`);
  }
  if (a.summary) out.push(a.summary);
  out.push('');

  const pl = soap.plan;
  out.push('PLAN');
  const tx = pl.treatments_given_in_clinic?.map((t) => `${t.name}${t.dose ? ` ${t.dose}` : ''}${t.route ? ` ${t.route}` : ''}${t.notes ? ` (${t.notes})` : ''}`);
  const rx = pl.medications_prescribed?.map((m) => [m.name, m.dose, m.route, m.frequency, m.duration].filter(Boolean).join(' ') + (m.instructions ? ` - ${m.instructions}` : ''));
  out.push(...[
    pl.diagnostics_ordered?.length ? `Diagnostics:\n${list(pl.diagnostics_ordered)}` : null,
    tx?.length ? `Treatments in clinic:\n${list(tx)}` : null,
    rx?.length ? `Rx:\n${list(rx)}` : null,
    pl.procedures_recommended?.length ? `Recommended:\n${list(pl.procedures_recommended)}` : null,
  ].filter(Boolean));
  const cc = pl.client_communication ?? {};
  const ccLines = [
    cc.discussed?.length ? `Discussed:\n${list(cc.discussed)}` : null,
    cc.estimates_given?.length ? `Estimates: ${cc.estimates_given.join('; ')}` : null,
    cc.consent_obtained?.length ? `Consent: ${cc.consent_obtained.join('; ')}` : null,
    cc.recommendations_declined?.length ? `Declined:\n${list(cc.recommendations_declined)}` : null,
    cc.questions_from_client?.length ? `Client questions:\n${list(cc.questions_from_client)}` : null,
    cc.handouts_or_instructions?.length ? `Instructions given:\n${list(cc.handouts_or_instructions)}` : null,
  ].filter(Boolean);
  if (ccLines.length) out.push('Client communication:', ...ccLines);
  const fu = pl.follow_up ?? {};
  const fuLines = [line('Recheck', fu.recheck), fu.monitoring?.length ? `Monitor: ${fu.monitoring.join('; ')}` : null, fu.call_if?.length ? `Call if: ${fu.call_if.join('; ')}` : null].filter(Boolean);
  if (fuLines.length) out.push('Follow-up:', ...fuLines);

  if (soap.flags?.length) {
    out.push('', 'REVIEW FLAGS');
    for (const f of soap.flags) out.push(`- [${f.kind}] ${f.detail}`);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
