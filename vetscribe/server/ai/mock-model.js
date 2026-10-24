/**
 * A stand-in for the model: a keyword extractor over the transcript. It is
 * not a scribe, but it fills the same shape, so the UI, the visit flow and
 * the tests all work without a key, and the demo shows real numbers moving
 * from the room into the note.
 */

import { emptyIntake, emptySoap } from './schemas.js';

const num = (m) => (m ? Number(m[1]) : null);
const first = (text, re) => text.match(re);

function sentences(text) {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

function segmentsOf(userText) {
  const out = [];
  const re = /<segment id="([^"]*)" role="([^"]*)"[^>]*>\n([\s\S]*?)\n<\/segment>/g;
  let m;
  while ((m = re.exec(userText))) out.push({ id: m[1], role: m[2], text: m[3] });
  return out;
}

function extractVitals(text) {
  const v = emptyIntake().vitals;
  const w = first(text, /(\d+(?:\.\d+)?)\s*(kg|kilos?|kilograms?|lbs?|pounds?)\b/i);
  if (w) v.weight = { value: Number(w[1]), unit: /^k/i.test(w[2]) ? 'kg' : 'lb' };
  v.temperature_f = num(first(text, /temp(?:erature)?(?:\s+is|\s+of|\s+at|'s)?\s*(\d{2,3}(?:\.\d)?)/i));
  v.heart_rate = num(first(text, /heart\s*rate(?:\s+is|\s+of|\s+at|'s)?\s*(\d{2,3})/i)) ?? num(first(text, /(\d{2,3})\s*(?:bpm|beats)/i));
  v.resp_rate = num(first(text, /resp(?:iratory|s)?(?:\s*rate)?(?:\s+is|\s+of|\s+at|'s)?\s*(\d{2,3})/i));
  const mm = first(text, /(?:mucous membranes|gums|mm)\s*(?:are|is|look)?\s*(pink|pale|pale pink|white|icteric|yellow|tacky|moist|injected)/i);
  v.mucous_membranes = mm ? mm[1] : null;
  v.crt_seconds = num(first(text, /crt\s*(?:is|of)?\s*(?:less than|under|<)?\s*(\d(?:\.\d)?)/i));
  v.bcs_9 = num(first(text, /(?:bcs|body condition(?: score)?)\s*(?:is|of)?\s*(\d)\b/i));
  v.pain_score_10 = num(first(text, /pain score\s*(?:is|of)?\s*(\d{1,2})/i));
  const att = first(text, /\b(BAR|QAR|bright,? alert|quiet,? alert|depressed|lethargic|dull)\b/i);
  v.attitude = att ? att[1] : null;
  const hyd = first(text, /(?:hydration|hydrated)\s*(?:is|looks|seems)?\s*(normal|adequate|good|fine|mild(?:ly)? dehydrated|dehydrated|\d+%\s*dehydrated)/i)
    ?? first(text, /(\d+%\s*dehydrated|mildly dehydrated|dehydrated|well hydrated)/i);
  v.hydration = hyd ? hyd[1] : null;
  return v;
}

export function mockDraft(userText, _schema) {
  const segs = segmentsOf(userText);
  const stage = (userText.match(/<visit [^>]*stage="([^"]+)"/) ?? [])[1] ?? 'tech_intake';
  const reason = (userText.match(/Reason for visit \(front desk\): (.*)/) ?? [])[1]?.trim() ?? '';
  const recordWeight = userText.match(/## Weight\n(\d{4}-\d{2}-\d{2}): (\d+(?:\.\d+)?) kg/);
  const all = segs.map((s) => s.text).join('\n');
  const tech = segs.filter((s) => s.role === 'tech').map((s) => s.text).join('\n');
  const doctor = segs.filter((s) => s.role === 'doctor').map((s) => s.text).join('\n');
  const notes = segs.filter((s) => s.role === 'voice note').map((s) => s.text).join('\n');
  const hasDoctor = Boolean(doctor.trim());

  const intake = emptyIntake();
  const soap = emptySoap();
  const vitals = extractVitals(all);
  intake.vitals = vitals;
  soap.objective.vitals = vitals;

  const ownerish = sentences(tech || all).filter((s) => /\b(he|she|they)('s| has| is| was|'ve)? been|started|since|yesterday|last (week|night)|noticed|ago\b/i.test(s));
  const complaint = ownerish[0] ?? reason ?? '';
  intake.presenting_complaint = reason || complaint;
  intake.owner_concerns = sentences(tech || all).filter((s) => /\?$|worried|concern|wonder/i.test(s)).slice(0, 5);
  intake.history.onset = (all.match(/\b(?:since|started|for the last|for about)\s+([^.,]+)/i) ?? [])[1] ?? null;
  intake.history.appetite = (all.match(/\b(?:appetite|eating)\s+(?:is|has been|was)?\s*([^.,]+)/i) ?? [])[1] ?? null;
  intake.history.water_intake = (all.match(/\b(?:drinking|water intake)\s+(?:is|has been|was)?\s*([^.,]+)/i) ?? [])[1] ?? null;
  intake.history.vomiting = (all.match(/\b(vomit(?:ed|ing)[^.]*)/i) ?? [])[1] ?? null;
  intake.diet = (all.match(/\b(?:eats|eating|diet is|on)\s+((?:[A-Z][\w']*\s*){1,3}(?:kibble|food|diet|k\/d|chicken and rice)[^.,]*)/) ?? [])[1] ?? null;
  intake.medications_and_supplements_reported = sentences(all).filter((s) => /\b(giving|gives|on|takes|taking)\b.*\b(mg|tablet|chew|pill|capsule|supplement|apoquel|amlodipine|carprofen|simparica|nexgard|heartgard|revolution)\b/i.test(s)).slice(0, 5);
  intake.preventives_reported.heartworm = (all.match(/\b(heartworm[^.]*)/i) ?? [])[1] ?? null;
  intake.preventives_reported.flea_tick = (all.match(/\b((?:flea|tick|simparica|nexgard|bravecto|revolution)[^.]*)/i) ?? [])[1] ?? null;
  intake.tech_observations = sentences(tech).filter((s) => /\b(I (?:see|noticed|note)|looks|appears|gait|limping|favou?ring|mass|lump|discharge|odou?r|calculus|tartar)\b/i.test(s)).slice(0, 6);
  intake.items_for_doctor = [...intake.owner_concerns, ...sentences(tech).filter((s) => /\b(doctor|dr\.?|vet) (?:should|needs|can|will)\b/i.test(s))].slice(0, 6);

  soap.subjective.presenting_complaint = intake.presenting_complaint;
  soap.subjective.history_of_present_illness = ownerish.slice(0, 4).join(' ');
  soap.subjective.owner_reported = ownerish.slice(0, 8);
  soap.subjective.diet = intake.diet;
  soap.subjective.current_medications = intake.medications_and_supplements_reported;
  const rec = [];
  const lastPlan = userText.match(/## Recent visits\n- (\d{4}-\d{2}-\d{2}) \(([^)]*)\)\n {2}A: (.*)\n {2}P: (.*)/);
  if (lastPlan) rec.push(`Last visit ${lastPlan[1]} (${lastPlan[2]}): ${lastPlan[3]} Plan: ${lastPlan[4]}`);
  const openRecs = (userText.match(/## Open recommendations[^\n]*\n([\s\S]*?)\n## Client/) ?? [])[1];
  if (openRecs && !/^- none$/m.test(openRecs)) rec.push(...openRecs.split('\n').map((l) => l.replace(/^- /, 'Open: ')));
  soap.subjective.pertinent_record_history = rec;

  const examLines = sentences(doctor).filter((s) => /\b(heart|lungs?|auscult|abdomen|palpat|ears?|eyes?|teeth|dental|gums|skin|coat|lymph|range of motion|pain on|crepitus|effusion|murmur|NSF|WNL|normal|unremarkable)\b/i.test(s));
  const systemFor = (s) => {
    if (/\b(heart|murmur|pulse)\b/i.test(s)) return 'Cardiovascular';
    if (/\b(lungs?|auscult|breath|resp)\b/i.test(s)) return 'Respiratory';
    if (/\b(abdomen|palpat|bowel|gut)\b/i.test(s)) return 'Abdomen/GI';
    if (/\b(ears?|otitis|canal)\b/i.test(s)) return 'Ears';
    if (/\b(eyes?|ocular|conjunctiv)\b/i.test(s)) return 'Eyes';
    if (/\b(teeth|dental|gums|calculus|tartar|gingiv)\b/i.test(s)) return 'Oral/Dental';
    if (/\b(skin|coat|erythema|alopecia|pruritus|lesion|mass|lump|incision)\b/i.test(s)) return 'Integument';
    if (/\b(lymph)\b/i.test(s)) return 'Lymph nodes';
    if (/\b(joint|hip|stifle|elbow|carpus|range of motion|crepitus|effusion|lame|gait|limb|shoulder)\b/i.test(s)) return 'Musculoskeletal';
    if (/\b(neuro|proprio|reflex|ataxi)\b/i.test(s)) return 'Neurologic';
    return 'General';
  };
  soap.objective.physical_exam = (hasDoctor ? examLines : intake.tech_observations).map((s) => ({
    system: systemFor(s), finding: s, abnormal: !/\b(NSF|WNL|normal|unremarkable|no (?:murmur|pain|abnormal))\b/i.test(s),
  })).slice(0, 12);
  soap.objective.diagnostics_results = sentences(all).filter((s) => /\b(result|came back|cytology|radiograph|x-?ray|bloodwork|urine|SNAP|4Dx|fecal|glucose|PCV)\b.*\b(show|normal|negative|positive|elevated|low|high|consistent)\b/i.test(s)).map((s) => ({ test: (s.match(/\b(cytology|radiographs?|x-?rays?|bloodwork|urinalysis|SNAP|4Dx|fecal|glucose|PCV|blood pressure)\b/i) ?? ['Diagnostic'])[0], result: s })).slice(0, 6);

  const problemWords = reason || complaint;
  if (hasDoctor) {
    const dx = sentences(doctor).filter((s) => /\b(I think|likely|consistent with|diagnos|suspect|looks like|probably|my assessment)\b/i.test(s));
    soap.assessment.problems = (dx.length ? dx : [problemWords]).filter(Boolean).slice(0, 4).map((s) => ({
      problem: s, differentials: (s.match(/\b(?:versus|vs\.?|or)\s+([^.,]+)/i) ?? []).slice(1), status: /\b(better|improv)/i.test(s) ? 'improved' : /\b(worse)/i.test(s) ? 'worse' : 'new', notes: '',
    }));
    soap.assessment.summary = dx[0] ?? `Assessed: ${problemWords}`;
    soap.assessment.doctor_exam_pending = false;
    const rx = sentences(doctor).filter((s) => /\b(send (?:him|her|them) home (?:with|on)|prescrib|start (?:him|her|them) on|dispense|going to give|we'll give|I'll give)\b/i.test(s));
    soap.plan.medications_prescribed = rx.map((s) => {
      const m = s.match(/\b(?:with|on|prescribe|dispense|give)\s+([A-Z][\w-]*(?:\s[A-Z][\w-]*)?)/) ?? s.match(/\b([A-Z][a-z]{3,}[\w-]*)\b/);
      const dose = (s.match(/(\d+(?:\.\d+)?\s*(?:mg|mL|ml|mg\/kg|units?))/i) ?? [])[1] ?? null;
      const freq = (s.match(/\b(q\d+h|once (?:a|daily|per) day|twice (?:a|daily|per) day|every \d+ hours|SID|BID|TID|daily)\b/i) ?? [])[1] ?? null;
      const dur = (s.match(/\bfor (\d+ (?:days?|weeks?))\b/i) ?? [])[1] ?? null;
      return { name: m ? m[1] : s, dose, route: /\b(PO|by mouth|orally)\b/i.test(s) ? 'PO' : /\b(SQ|subcut)/i.test(s) ? 'SQ' : /\bIM\b/.test(s) ? 'IM' : null, frequency: freq, duration: dur, instructions: s };
    });
    soap.plan.diagnostics_ordered = sentences(doctor).filter((s) => /\b(run|order|let's do|I want to do|recommend(?:ing)?|we should do)\b.*\b(bloodwork|blood work|chem|CBC|urinalysis|radiograph|x-?ray|ultrasound|cytology|culture|SNAP|4Dx|fecal|biopsy|blood pressure)\b/i.test(s));
    soap.plan.procedures_recommended = sentences(doctor).filter((s) => /\b(recommend|should schedule|needs?)\b.*\b(dental|surgery|spay|neuter|removal|cleaning|referral)\b/i.test(s));
    soap.plan.follow_up.recheck = (doctor.match(/\b(recheck[^.]*|see (?:him|her|them) back[^.]*|come back in[^.]*)/i) ?? [])[1] ?? null;
    soap.plan.follow_up.call_if = sentences(doctor).filter((s) => /\b(call (?:us|me)|come (?:right )?in|emergency)\b/i.test(s));
    soap.plan.client_communication.discussed = sentences(doctor).filter((s) => /\b(we talked about|I explained|discussed|I'd recommend|I recommend|options?)\b/i.test(s)).slice(0, 6);
  } else {
    soap.assessment.problems = problemWords ? [{ problem: problemWords, differentials: [], status: 'unknown', notes: 'Pending doctor exam.' }] : [];
    soap.assessment.summary = 'Technician intake complete; doctor exam pending.';
    soap.assessment.doctor_exam_pending = true;
  }
  soap.plan.client_communication.recommendations_declined = sentences(all).filter((s) => /\b(declin|not today|can't afford|cannot afford|hold off|think about it|no thanks|rather not)\b/i.test(s));
  soap.plan.client_communication.estimates_given = sentences(all).filter((s) => /\$\d|estimate/i.test(s));
  soap.plan.client_communication.questions_from_client = intake.owner_concerns;
  soap.plan.treatments_given_in_clinic = sentences(all).filter((s) => /\b(gave|administered|injected|applied|trimmed|expressed|flushed|clipped)\b/i.test(s)).map((s) => ({ name: s, dose: (s.match(/(\d+(?:\.\d+)?\s*(?:mg|mL|ml|units?))/i) ?? [])[1] ?? null, route: /\bSQ|subcut/i.test(s) ? 'SQ' : /\bIM\b/.test(s) ? 'IM' : /\bPO|by mouth/i.test(s) ? 'PO' : null, notes: null }));

  for (const [k, label] of [['temperature_f', 'temperature'], ['heart_rate', 'heart rate'], ['resp_rate', 'respiratory rate']]) {
    if (vitals[k] == null) soap.flags.push({ kind: 'missing_vital', detail: `No ${label} stated in the recording.` });
  }
  if (vitals.weight.value == null) soap.flags.push({ kind: 'missing_vital', detail: 'No weight stated in the recording.' });
  else if (recordWeight) {
    const kg = vitals.weight.unit === 'lb' ? vitals.weight.value * 0.45359237 : vitals.weight.value;
    const prev = Number(recordWeight[2]);
    const pct = ((kg - prev) / prev) * 100;
    if (Math.abs(pct) >= 10) soap.flags.push({ kind: 'discrepancy_with_record', detail: `Weight today ${kg.toFixed(1)} kg is ${pct > 0 ? '+' : ''}${pct.toFixed(0)}% versus ${prev} kg on ${recordWeight[1]}. Confirm the scale reading.` });
    soap.pims_actions.push({ kind: 'vitals_update', detail: `Record weight ${vitals.weight.value} ${vitals.weight.unit}`, source: (all.match(/[^.]*\d+(?:\.\d+)?\s*(?:kg|kilos?|kilograms?|lbs?|pounds?)[^.]*/i) ?? [''])[0].trim() });
  }
  for (const s of sentences(all)) {
    if (/\b(gave|administered|boostered?|vaccinat)\b.*\b(vaccine|booster|rabies|DAPP|DHPP|lepto|bordetella|FVRCP)\b/i.test(s) || /\b(rabies|DAPP|DHPP|lepto|bordetella|FVRCP)\b.*\b(given|administered|done)\b/i.test(s)) {
      soap.pims_actions.push({ kind: 'vaccine_given', detail: s, source: s });
    }
  }
  for (const d of soap.plan.diagnostics_ordered) soap.pims_actions.push({ kind: 'lab_order', detail: d, source: d });
  for (const m of soap.plan.medications_prescribed) soap.pims_actions.push({ kind: 'prescription', detail: `${m.name} ${m.dose ?? ''} ${m.frequency ?? ''}`.trim(), source: m.instructions ?? '' });
  for (const d of soap.plan.client_communication.recommendations_declined) soap.pims_actions.push({ kind: 'declined_recommendation', detail: d, source: d });
  if (soap.plan.follow_up.recheck) soap.pims_actions.push({ kind: 'recheck_booking', detail: soap.plan.follow_up.recheck, source: soap.plan.follow_up.recheck });
  if (hasDoctor && openRecs && !/^- none$/m.test(openRecs)) {
    for (const line of openRecs.split('\n').map((l) => l.replace(/^- /, ''))) {
      const key = line.split(/[ (]/).slice(0, 2).join('\\s+');
      if (key && !new RegExp(key, 'i').test(doctor)) soap.flags.push({ kind: 'open_recommendation_not_addressed', detail: line });
    }
  }
  for (const s of sentences(all)) {
    if (/\d+(?:\.\d+)?\s*(kg|kilos?|lbs?|pounds?|mg|degrees|bpm)\b|temp|heart rate|resp/i.test(s)) soap.evidence.push({ section: 'Objective', quote: s });
  }
  soap.evidence = soap.evidence.slice(0, 8);
  if (stage === 'addendum' && notes) soap.changes_from_previous = sentences(notes).map((s) => `Voice note: ${s}`);
  return { intake, soap };
}
