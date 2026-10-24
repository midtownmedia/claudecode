/**
 * The pre-visit briefing: what the practice management system knows, turned
 * into (a) a text block the scribe reads before the transcript and (b) flags
 * the phone shows the technician before they walk in.
 *
 * Deterministic for a given appointment, so the same visit always produces
 * the same briefing and the prompt cache gets to do its job.
 */

import { ageText, sexText, toKg, toLb, weightTrend } from '../pims/normalize.js';

const fmtKg = (w) => (w ? `${toKg(w).toFixed(1)} kg (${toLb(w).toFixed(1)} lb)` : 'no weight on file');

function overdue(due, today) { return Boolean(due) && due < today; }
function dueSoon(due, today, days = 30) {
  if (!due) return false;
  const t = new Date(today).getTime(); const d = new Date(due).getTime();
  return d >= t && d - t <= days * 86400000;
}

/**
 * @param {import('../pims/normalize.js').Appointment} appt
 * @param {{today?: string}} opts   ISO date; defaults to the appointment's date
 */
export function buildBriefing(appt, { today } = {}) {
  const p = appt.patient;
  const day = today ?? (appt.start ? appt.start.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const flags = [];

  const trend = weightTrend(p.weightHistory);
  if (trend && Math.abs(trend.pct) >= 5) {
    const dir = trend.pct < 0 ? 'lost' : 'gained';
    flags.push({
      kind: 'weight', severity: Math.abs(trend.pct) >= 10 ? 'high' : 'medium',
      text: `Weight ${dir} ${Math.abs(trend.pct).toFixed(0)}% since ${trend.from.date} (${fmtKg(trend.from)} to ${fmtKg(trend.to)})`,
    });
  }
  for (const v of p.vaccines) {
    if (overdue(v.due, day)) flags.push({ kind: 'overdue', severity: 'medium', text: `${v.name} overdue (due ${v.due})` });
    else if (dueSoon(v.due, day)) flags.push({ kind: 'due', severity: 'low', text: `${v.name} due ${v.due}` });
  }
  for (const v of p.preventives) {
    if (overdue(v.due, day)) flags.push({ kind: 'overdue', severity: 'medium', text: `${v.name} overdue (due ${v.due})` });
    else if (dueSoon(v.due, day)) flags.push({ kind: 'due', severity: 'low', text: `${v.name} due ${v.due}` });
  }
  for (const a of p.alerts) flags.push({ kind: 'alert', severity: 'high', text: a });
  for (const a of p.allergies) flags.push({ kind: 'allergy', severity: 'high', text: `Allergy/reaction: ${a}` });
  for (const pr of p.problems.filter((x) => x.status !== 'resolved')) flags.push({ kind: 'problem', severity: 'medium', text: `${pr.status === 'chronic' ? 'Chronic' : 'Active'}: ${pr.name}` });
  for (const r of p.openRecommendations) flags.push({ kind: 'open', severity: 'low', text: `Open: ${r}` });

  const lines = [];
  lines.push(`# Pre-visit briefing: ${p.name} (${appt.client.name})`);
  lines.push(`Appointment: ${appt.type}; ${appt.durationMin} min; room ${appt.room || '?'}; ${appt.provider.name || 'provider TBD'}; tech ${appt.technician.name || 'TBD'}.`);
  lines.push(`Reason for visit (front desk): ${appt.reason || 'not recorded'}`);
  if (appt.notes) lines.push(`Booking notes: ${appt.notes}`);
  lines.push('');
  lines.push('## Signalment');
  lines.push(`${p.name}: ${ageText(p.dob, new Date(`${day}T12:00:00`))} ${sexText(p.sex)} ${p.breed || ''} ${p.species || ''}`.replace(/\s+/g, ' ').trim() + (p.color ? `, ${p.color}` : '') + '.');
  lines.push(`Microchip: ${p.microchip ?? 'none on file'}. DOB: ${p.dob ?? 'unknown'}.`);
  lines.push('');
  lines.push('## Weight');
  if (p.weightHistory.length) {
    lines.push(p.weightHistory.slice(0, 5).map((w) => `${w.date}: ${fmtKg(w)}`).join('; '));
    if (trend) lines.push(`Trend: ${trend.pct >= 0 ? '+' : ''}${trend.pct.toFixed(1)}% since ${trend.from.date}.`);
  } else lines.push('No weight on file.');
  lines.push('');
  lines.push('## Alerts');
  lines.push(p.alerts.length ? p.alerts.map((a) => `- ${a}`).join('\n') : '- none');
  lines.push('## Allergies and adverse reactions');
  lines.push(p.allergies.length ? p.allergies.map((a) => `- ${a}`).join('\n') : '- none recorded');
  lines.push('## Problem list');
  lines.push(p.problems.length ? p.problems.map((x) => `- ${x.name} (${x.status}${x.since ? `, since ${x.since}` : ''})`).join('\n') : '- none recorded');
  lines.push('## Current medications on record');
  lines.push(p.medications.length ? p.medications.map((m) => `- ${m.name} ${m.dose} ${m.frequency}${m.since ? ` (since ${m.since})` : ''}`.replace(/\s+/g, ' ')).join('\n') : '- none recorded');
  lines.push('## Vaccines');
  lines.push(p.vaccines.length ? p.vaccines.map((v) => `- ${v.name}: given ${v.given ?? '?'}, due ${v.due ?? '?'}${overdue(v.due, day) ? ' (OVERDUE)' : ''}`).join('\n') : '- none recorded');
  lines.push('## Preventives and screening');
  lines.push(p.preventives.length ? p.preventives.map((v) => `- ${v.name}: last ${v.lastGiven ?? '?'}, due ${v.due ?? '?'}${overdue(v.due, day) ? ' (OVERDUE)' : ''}`).join('\n') : '- none recorded');
  lines.push('## Recent labs');
  lines.push(p.labs.length ? p.labs.map((l) => `- ${l.date} ${l.name}: ${l.summary}`).join('\n') : '- none recorded');
  lines.push('## Recent visits');
  lines.push(p.recentVisits.length
    ? p.recentVisits.slice(0, 3).map((v) => `- ${v.date} (${v.reason})\n  A: ${v.assessment}\n  P: ${v.plan}`).join('\n')
    : '- none recorded');
  lines.push('## Open recommendations (declined or never scheduled)');
  lines.push(p.openRecommendations.length ? p.openRecommendations.map((r) => `- ${r}`).join('\n') : '- none');
  lines.push('## Client');
  lines.push(`${appt.client.name}; prefers ${appt.client.preferredContact}; ${appt.client.phone || 'no phone'}${appt.client.email ? `; ${appt.client.email}` : ''}.`);
  if (appt.client.notes) lines.push(`Client notes: ${appt.client.notes}`);

  const order = { high: 0, medium: 1, low: 2 };
  flags.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    text: lines.join('\n'),
    flags,
    headline: `${p.name}, ${ageText(p.dob, new Date(`${day}T12:00:00`))} ${sexText(p.sex)} ${p.breed || p.species}`.replace(/\s+/g, ' ').trim(),
    date: day,
  };
}
