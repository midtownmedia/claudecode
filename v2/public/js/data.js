/**
 * Everything the app knows about the compounds, syringes and schedules.
 *
 * Protocols are stored as a dose in mg, never as syringe units. A unit is
 * 0.01 mL of whatever is in the bottle, so the same unit count is a different
 * dose from a different bottle. Units are always worked out from the bottle.
 *
 * Dose figures describe what these compounds are commonly given at, from
 * trials where they exist and circulated sheets where they do not. They are
 * not recommendations. Several have no approved human dose at any level.
 *
 * Bottle strengths and prices move. This is the one file to edit when they do.
 */

export const EVIDENCE = {
  approved: 'Approved medicine',
  trial: 'Human trials only',
  preclinical: 'Animal studies only',
  anecdotal: 'Anecdotal',
};

export const PEPTIDES = [
  {
    id: 'retatrutide',
    name: 'Retatrutide',
    kind: 'Triple agonist (GIP / GLP-1 / glucagon)',
    evidence: 'trial',
    strengths: [5, 10, 12, 15, 20, 24, 30, 40, 50, 60],
    strength: 60,
    vialMl: 5,
    // The full 5 mL: at 3 mL a 0.5 mg starting dose lands on 2.5 units,
    // which cannot be measured. A readable first dose beats a tidy ladder.
    waterMl: 5,
    freq: 'qw',
    price: 200,
    dosing: { low: 0.5, high: 8, redline: 12 },
    highRisk: true,
    firstDose: { recommended: 0.5, max: 1 },
    ladder: [
      { weeks: 2, dose: 0.5 }, { weeks: 4, dose: 1 }, { weeks: 4, dose: 2 },
      { weeks: 4, dose: 3 }, { weeks: 4, dose: 4 }, { weeks: 4, dose: 6 },
      { weeks: 4, dose: 8 }, { weeks: 4, dose: 12 },
    ],
    notes: [
      'Start at 0.5 mg. A first dose should never be more than 1 mg.',
      'Mix a 60 mg bottle with the full 5 mL of bac water. That puts 0.5 mg on 4 units, the smallest dose this bottle can measure. Use a 30-unit syringe for it.',
      'Go up slowly. Relentless nausea or vomiting means the last step was too big, so drop back.',
    ],
    risks: [
      'Severe nausea, vomiting and dehydration are the usual reasons people need medical care.',
      'Low blood sugar risk rises sharply with insulin or a sulfonylurea.',
      'Slows stomach emptying. Tell any anaesthetist before a procedure.',
      'Never combine with another GLP-1 medicine.',
    ],
  },
  {
    id: 'mots-c',
    name: 'MOTS-c',
    kind: 'Mitochondrial peptide',
    evidence: 'preclinical',
    strengths: [5, 10, 20, 30, 40, 50],
    strength: 40,
    changed: { from: 10, to: 40, sheetWaterMl: 3 },
    vialMl: 5,
    // 4 mL makes one unit exactly 0.1 mg, so units divided by ten is the dose.
    waterMl: 4,
    freq: 'qd',
    price: 275,
    dosing: { low: 0.2, high: 1, redline: 10 },
    ladder: [
      { weeks: 2, dose: 0.2 }, { weeks: 2, dose: 0.4 }, { weeks: 2, dose: 0.6 },
      { weeks: 2, dose: 0.8 }, { weeks: 2, dose: 1 },
    ],
    notes: [
      'Mix a 40 mg bottle with 4 mL. One unit is then exactly 0.1 mg: 2 units is 0.2 mg, 10 units is 1 mg.',
      'Old sheets were written for a 10 mg bottle that looks identical. Check the label.',
      'Usually taken in the morning because it can raise energy.',
    ],
    risks: ['Human safety data is thin. Animal studies only.'],
  },
  {
    id: 'ss-31',
    name: 'SS-31',
    kind: 'Mitochondria-targeted peptide (elamipretide)',
    evidence: 'trial',
    strengths: [10, 20, 50, 100],
    strength: 50,
    vialMl: 5,
    waterMl: 3,
    freq: 'qd',
    price: 230,
    dosing: { low: 5, high: 40, redline: 60 },
    ladder: [{ weeks: 2, dose: 5 }, { weeks: 6, dose: 10 }],
    notes: [
      'Early nausea is common and usually settles.',
      'The 50 mg bottle has not changed strength. The old sheet still matches it.',
    ],
    risks: ['Injection site reactions are the most common issue in trials.'],
  },
  {
    id: 'nad',
    name: 'NAD+',
    kind: 'Coenzyme',
    evidence: 'anecdotal',
    strengths: [100, 200, 500, 750, 1000],
    strength: 500,
    vialMl: 5,
    waterMl: 3,
    freq: 'qd',
    price: 120,
    dosing: { low: 15, high: 100, redline: 300 },
    ladder: [{ weeks: 1, dose: 50 }, { weeks: 1, dose: 75 }, { weeks: 6, dose: 100 }],
    split: { reason: 'flushing and nausea' },
    notes: [
      'It often stings. Inject slowly, and let the bottle warm up from the fridge first.',
      'Many people start well below the schedule.',
    ],
    risks: ['Flushing, nausea and chest tightness, more so when injected quickly.'],
  },
  {
    id: 'bpc-tb500',
    name: 'BPC-157 / TB-500',
    kind: 'Repair blend',
    evidence: 'preclinical',
    strengths: [10, 15, 20, 30, 40, 60],
    strength: 20,
    changed: { from: 10, to: 20, sheetWaterMl: 3 },
    vialMl: 3,
    waterMl: 3,
    freq: 'qd',
    price: 120,
    dosing: { low: 0.5, high: 1.5, redline: 5 },
    ladder: [{ weeks: 1, dose: 0.667 }, { weeks: 2, dose: 1 }, { weeks: 5, dose: 1.333 }],
    notes: ['The bottle strength is both peptides combined.'],
    risks: ['No human trial data.'],
  },
  {
    id: 'glow',
    name: 'GLOW blend',
    kind: 'GHK-Cu / TB-500 / BPC-157',
    evidence: 'preclinical',
    strengths: [50, 70, 80, 100],
    strength: 70,
    vialMl: 5,
    waterMl: 3,
    freq: 'qd',
    price: 130,
    dosing: { low: 1, high: 3, redline: 8 },
    ladder: [{ weeks: 1, dose: 1.4 }, { weeks: 1, dose: 1.867 }, { weeks: 2, dose: 2.333 }],
    notes: ['The bottle strength is all three peptides combined.'],
    risks: ['Carries copper. Long, high-dose use raises questions about copper build-up.'],
  },
  {
    id: 'melanotan-1',
    name: 'Melanotan I',
    kind: 'Melanocortin agonist (afamelanotide)',
    evidence: 'approved',
    strengths: [5, 10, 20],
    strength: 10,
    vialMl: 3,
    waterMl: 2,
    freq: 'qd',
    price: 45,
    dosing: { low: 0.25, high: 1, redline: 2 },
    ladder: [{ weeks: 1, dose: 0.25 }, { weeks: 1, dose: 0.5 }, { weeks: 1, dose: 0.75 }, { weeks: 5, dose: 1 }],
    notes: ['A tan from this is not sun protection.'],
    risks: [
      'Can darken and change moles. Any mole that changes needs a dermatologist.',
      'Nausea and flushing are common in the first week.',
    ],
  },
  {
    id: 'epitalon',
    name: 'Epitalon',
    kind: 'Tetrapeptide',
    evidence: 'preclinical',
    strengths: [10, 20, 50, 100],
    strength: 50,
    vialMl: 5,
    // 5 mL makes one unit exactly 0.1 mg: a 2.5 mg half dose is 25 units.
    waterMl: 5,
    freq: 'qd',
    price: 170,
    dosing: { low: 5, high: 10, redline: 50 },
    course: '20 days on, about twice a year',
    ladder: [{ weeks: 3, dose: 5 }],
    split: { reason: 'nausea' },
    notes: [
      'Run as a course: 5 mg a day for 20 days, repeated about every six months. That is two 50 mg bottles per course.',
      'No written sheet for this one yet. Treat the schedule as a placeholder.',
    ],
    risks: ['Human evidence is limited to a few small studies.'],
  },
  {
    id: 'semaglutide',
    name: 'Semaglutide',
    kind: 'GLP-1 agonist',
    evidence: 'approved',
    strengths: [2, 3, 5, 10, 15, 20, 30],
    strength: 10,
    vialMl: 3,
    waterMl: 2,
    freq: 'qw',
    dosing: { low: 0.25, high: 2.4, redline: 2.4 },
    ladder: [
      { weeks: 4, dose: 0.25 }, { weeks: 4, dose: 0.5 }, { weeks: 4, dose: 1 },
      { weeks: 4, dose: 1.7 }, { weeks: 4, dose: 2.4 },
    ],
    notes: ['The approved schedule holds each step for four weeks. 2.4 mg a week is the top dose.'],
    risks: [
      'Not for anyone with a personal or family history of medullary thyroid cancer or MEN2.',
      'Low blood sugar risk rises sharply with insulin or a sulfonylurea.',
      'Not for use in pregnancy.',
    ],
  },
  {
    id: 'tirzepatide',
    name: 'Tirzepatide',
    kind: 'GIP / GLP-1 agonist',
    evidence: 'approved',
    strengths: [5, 10, 15, 20, 30, 40, 60],
    // 60 mg in 3 mL: 2.5 mg is 12.5 units and the 15 mg top step still fits a
    // 1 mL syringe at 75 units. A 30 mg bottle runs out of room at 12.5 mg.
    strength: 60,
    vialMl: 5,
    waterMl: 3,
    freq: 'qw',
    dosing: { low: 2.5, high: 15, redline: 15 },
    ladder: [
      { weeks: 4, dose: 2.5 }, { weeks: 4, dose: 5 }, { weeks: 4, dose: 7.5 },
      { weeks: 4, dose: 10 }, { weeks: 4, dose: 12.5 }, { weeks: 4, dose: 15 },
    ],
    notes: ['The approved schedule moves in 2.5 mg steps, at least four weeks each. 15 mg a week is the top dose.'],
    risks: [
      'Not for anyone with a personal or family history of medullary thyroid cancer or MEN2.',
      'Low blood sugar risk rises sharply with insulin or a sulfonylurea.',
      'Not for use in pregnancy.',
    ],
  },
  {
    id: 'bpc-157',
    name: 'BPC-157',
    kind: 'Repair peptide',
    evidence: 'preclinical',
    strengths: [5, 10, 20],
    strength: 10,
    vialMl: 3,
    waterMl: 3,
    freq: 'qd',
    mcg: true,
    dosing: { low: 0.2, high: 0.5, redline: 1 },
    ladder: [{ weeks: 4, dose: 0.25 }, { weeks: 4, dose: 0.5 }],
    notes: [],
    risks: ['No human trial data.'],
  },
  {
    id: 'tb-500',
    name: 'TB-500',
    kind: 'Repair peptide',
    evidence: 'preclinical',
    strengths: [2, 5, 10, 20],
    strength: 10,
    vialMl: 3,
    waterMl: 3,
    freq: '2xw',
    dosing: { low: 2, high: 2.5, redline: 10 },
    ladder: [{ weeks: 4, dose: 2.5 }, { weeks: 4, dose: 2 }],
    notes: ['Usually a twice-weekly loading phase, then tapered.'],
    risks: ['No human trial data.'],
  },
  {
    id: 'ipamorelin',
    name: 'Ipamorelin',
    kind: 'Growth hormone secretagogue',
    evidence: 'preclinical',
    strengths: [2, 5, 10, 15, 20],
    strength: 10,
    vialMl: 3,
    waterMl: 3,
    freq: 'qd',
    mcg: true,
    dosing: { low: 0.1, high: 0.3, redline: 1 },
    ladder: [{ weeks: 4, dose: 0.2 }, { weeks: 4, dose: 0.3 }],
    notes: [],
    risks: ['A head rush and flushing right after the injection are common.'],
  },
  {
    id: 'ghk-cu',
    name: 'GHK-Cu',
    kind: 'Copper peptide',
    evidence: 'preclinical',
    strengths: [10, 20, 50, 100],
    strength: 50,
    vialMl: 5,
    waterMl: 3,
    freq: 'qd',
    dosing: { low: 1, high: 2, redline: 5 },
    ladder: [{ weeks: 4, dose: 1 }, { weeks: 4, dose: 2 }],
    notes: [],
    risks: ['Carries copper. Build-up is the open question with long use.'],
  },
];

/** Anything not in the list. No dose ranges, so only the measuring checks apply. */
export const OTHER = {
  id: 'other',
  name: 'Other',
  kind: 'Your own entry',
  strengths: [],
  strength: 10,
  vialMl: 5,
  waterMl: 3,
  freq: 'qd',
  ladder: [],
  notes: [],
  risks: [],
};

export function peptide(id) {
  return PEPTIDES.find((p) => p.id === id) ?? (id === 'other' ? OTHER : null);
}

/**
 * Insulin syringes. All U-100: 100 units = 1 mL, so 1 unit = 0.01 mL.
 * Smaller barrels put the same unit further apart, which makes small draws
 * far easier to read.
 */
export const SYRINGES = [
  { units: 30, label: '0.3 mL', long: '0.3 mL · 30 units', step: 0.5 },
  { units: 50, label: '0.5 mL', long: '0.5 mL · 50 units', step: 1 },
  { units: 100, label: '1 mL', long: '1 mL · 100 units', step: 1 },
];

export function syringe(units) {
  return SYRINGES.find((s) => s.units === Number(units)) ?? SYRINGES[2];
}

export const FREQUENCIES = [
  { id: 'qd', label: 'Every day', perWeek: 7, every: 1 },
  { id: 'bid', label: 'Twice a day', perWeek: 14, every: 0.5 },
  { id: 'eod', label: 'Every other day', perWeek: 3.5, every: 2 },
  { id: 'q3d', label: 'Every 3 days', perWeek: 7 / 3, every: 3 },
  { id: '3xw', label: '3 times a week', perWeek: 3, every: 2 },
  { id: '2xw', label: 'Twice a week', perWeek: 2, every: 3 },
  { id: '5on2off', label: '5 days on, 2 off', perWeek: 5, every: 1 },
  { id: 'q6d', label: 'Every 6 days', perWeek: 7 / 6, every: 6 },
  { id: 'qw', label: 'Once a week', perWeek: 1, every: 7 },
  { id: 'q2w', label: 'Every 2 weeks', perWeek: 0.5, every: 14 },
  { id: 'prn', label: 'As needed', perWeek: 0, every: null },
];

export function frequency(id) {
  return FREQUENCIES.find((f) => f.id === id) ?? FREQUENCIES[0];
}

/** Ordered so rotating moves across the body instead of around one spot. */
export const SITES = [
  'Belly, upper left', 'Belly, upper right',
  'Belly, lower left', 'Belly, lower right',
  'Left thigh', 'Right thigh',
  'Left arm', 'Right arm',
];

/** Bac water keeps a mixed bottle usable for about 28 days in the fridge. */
export const BOTTLE_DAYS = 28;

export const RED_FLAGS = [
  {
    title: 'Get emergency help now',
    urgent: true,
    items: [
      'Trouble breathing, or swelling of the face, lips or throat.',
      'Severe, constant upper belly pain that goes through to the back, especially with vomiting.',
      'Confusion, a seizure, or someone who cannot be woken.',
      'Chest pain, a racing heart that will not settle, or fainting.',
    ],
  },
  {
    title: 'Stop and speak to a clinician',
    items: [
      'Vomiting that will not stop, or not keeping fluids down for a day.',
      'Much less urine than normal, or dark urine with dizziness when standing.',
      'A hot, red, painful lump where you injected, or a fever.',
      'Yellow eyes or skin, or pain under the right ribs.',
    ],
  },
  {
    title: 'Worth keeping an eye on',
    items: [
      'Nausea that has not settled a few days after stepping up. The step was probably too big.',
      'Shaky, sweaty and hungry, and better after eating. Possibly low blood sugar.',
      'Lumps building up where you always inject. Rotate sites.',
    ],
  },
];

export const HANDLING = [
  'Use each needle once, and never share a needle, syringe or bottle.',
  'Wipe the bottle top and your skin with alcohol, and let both dry.',
  'Aim the bac water at the glass wall, not onto the powder. Swirl gently, never shake.',
  'Keep mixed bottles in the fridge. Throw one away 28 days after mixing.',
  'Put used needles straight into a hard sharps container.',
  'If you pre-draw more than one thing, label every syringe.',
];
