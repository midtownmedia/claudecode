/**
 * Dose plausibility checks.
 *
 * These do not tell anyone what to take. They compare the number you are about
 * to draw against the range a compound is normally discussed in, and shout when
 * the two are far apart -- which is almost always a reconstitution mistake
 * rather than a deliberate choice.
 */

import { toBase, formatMass } from './units.js';

export const LEVEL = { OK: 'ok', INFO: 'info', WARN: 'warn', DANGER: 'danger' };

/**
 * @param {number} doseMg  dose actually being drawn, in mg
 * @param {object} peptide entry from the peptide library
 */
export function checkDose(doseMg, peptide) {
  if (!peptide || !Number.isFinite(doseMg)) return [];
  const out = [];
  const { typicalLow, typicalHigh, redline, unit = 'mg', label } = peptide.dosing ?? {};
  const low = Number.isFinite(typicalLow) ? toBase(typicalLow, unit) : null;
  const high = Number.isFinite(typicalHigh) ? toBase(typicalHigh, unit) : null;
  const red = Number.isFinite(redline) ? toBase(redline, unit) : null;

  // Strictly above: the top of a published ladder is reachable, not an error.
  if (red != null && doseMg > red) {
    const fold = doseMg / red;
    out.push({
      level: LEVEL.DANGER,
      code: 'redline',
      message:
        fold >= 1.5
          ? `${formatMass(doseMg)} is ${fold.toFixed(1)}x the highest dose ${label ?? peptide.name} is described at anywhere (${formatMass(red)}). A number this far out is usually a reconstitution error, not a dose. Recheck the vial strength and how much water went in.`
          : `${formatMass(doseMg)} is above the highest dose ${label ?? peptide.name} is described at anywhere (${formatMass(red)}).`,
    });
  } else if (high != null && doseMg > high) {
    out.push({
      level: LEVEL.WARN,
      code: 'above-typical',
      message: `${formatMass(doseMg)} is above the range ${label ?? peptide.name} is usually discussed at (${formatMass(low ?? 0)}-${formatMass(high)}).`,
    });
  } else if (low != null && doseMg > 0 && doseMg < low) {
    out.push({
      level: LEVEL.INFO,
      code: 'below-typical',
      message: `${formatMass(doseMg)} is below the usual range (${formatMass(low)}-${formatMass(high ?? low)}). That is fine when easing in, but check you have not slipped a decimal.`,
    });
  }
  return out;
}

/**
 * Escalation check: a titration exists so the body gets time to adapt.
 * Jumping steps is the other common way people get hurt.
 */
export function checkEscalation({ previousDoseMg, nextDoseMg, daysSincePrevious, peptide }) {
  const out = [];
  if (!Number.isFinite(previousDoseMg) || !Number.isFinite(nextDoseMg) || previousDoseMg <= 0) return out;
  const fold = nextDoseMg / previousDoseMg;
  const minDays = peptide?.dosing?.minDaysBetweenIncreases;

  if (fold >= 2) {
    out.push({
      level: LEVEL.DANGER,
      code: 'jump',
      message: `This is a ${fold.toFixed(1)}x jump from your last dose (${formatMass(previousDoseMg)} to ${formatMass(nextDoseMg)}). Doubling in one step is how most people end up badly sick.`,
    });
  } else if (fold > 1.55) {
    out.push({
      level: LEVEL.WARN,
      code: 'steep',
      message: `That is a ${Math.round((fold - 1) * 100)}% increase in one step. Most titrations move in smaller increments.`,
    });
  }
  if (Number.isFinite(minDays) && Number.isFinite(daysSincePrevious) && fold > 1 && daysSincePrevious < minDays) {
    out.push({
      level: LEVEL.WARN,
      code: 'too-soon',
      message: `You last increased ${Math.round(daysSincePrevious)} days ago. ${peptide.name} escalations are normally held for at least ${minDays} days before going up again.`,
    });
  }
  return out;
}

/** Symptoms that mean stop and get help rather than push through. */
export const RED_FLAGS = [
  {
    group: 'Get emergency help now',
    urgent: true,
    items: [
      'Trouble breathing, swelling of the face, lips or throat, or a spreading rash - this is anaphylaxis.',
      'Severe, constant pain in the upper abdomen that bores through to your back, especially with vomiting - possible pancreatitis.',
      'Confusion, seizure, or someone cannot be woken - possible severe low blood sugar.',
      'Chest pain, a racing heart that will not settle, or fainting.',
    ],
  },
  {
    group: 'Stop dosing and speak to a clinician',
    urgent: false,
    items: [
      'Vomiting that will not stop, or you cannot keep fluids down for more than a day. Dehydration is the most common way GLP-1 use lands someone in hospital.',
      'Passing much less urine than normal, or dark urine with dizziness on standing.',
      'A hard, hot, red or painful lump at an injection site, or a fever - possible infection.',
      'Yellowing of the eyes or skin, or pain under the right ribs.',
      'Vision changes, or a new lump in the neck and trouble swallowing.',
    ],
  },
  {
    group: 'Worth flagging, not an emergency',
    urgent: false,
    items: [
      'Nausea that does not settle after a few days at a new dose - usually a sign the step up was too big.',
      'Shakiness, sweating and hunger that clears after eating - possible low blood sugar, far more likely if you also take insulin or a sulfonylurea.',
      'Persistent injection-site bruising, or lumps building up where you always inject.',
    ],
  },
];

/**
 * Drawing a day's doses in one go.
 *
 * For a protocol split across morning and evening, filling both syringes at
 * once is ordinary practice - it halves the number of times the vial is
 * punctured, which is the thing most likely to contaminate it.
 */
export const PRE_DRAWN = [
  'Draw both doses at once, cap the second and put it in the fridge until the evening. One puncture a day is better for the vial than two.',
  'Keep the cap on and do not let the needle touch anything between drawing and injecting.',
  'Take it out a few minutes before you use it. Injecting straight from the fridge stings noticeably more.',
  'If you pre-draw more than one compound, label every syringe. Two identical syringes holding different things is the single easiest way to give yourself the wrong one.',
  'Same day only. This is for an evening dose you drew that morning, not for filling a week ahead.',
];

export const SHARP_SAFETY = [
  'A needle is single use. Reusing one blunts the tip, hurts more and pushes skin bacteria into the vial.',
  'Never share a needle, syringe or vial with anyone, for any reason.',
  'Swab the vial stopper and the skin, and let both dry before the needle touches them.',
  'Put used sharps straight into a rigid sealed container, not a bin bag.',
  'Do not shake a reconstituted vial. Roll or swirl it - peptides are fragile and foam means damaged product.',
  'Aim the water at the glass wall of the vial, not straight onto the powder.',
];

/**
 * First-dose ceiling.
 *
 * The first dose of a compound is the one with no tolerance behind it, and for
 * the incretins it is where the avoidable harm actually happens. This is
 * separate from the general range check because a dose can sit comfortably
 * inside the normal range and still be a reckless place to begin.
 */
export function checkFirstDose(doseMg, peptide, { hasHistory = false } = {}) {
  const fd = peptide?.firstDose;
  if (!fd || hasHistory || !Number.isFinite(doseMg)) return [];
  if (doseMg > fd.max) {
    return [{
      level: LEVEL.DANGER,
      code: 'first-dose-over-max',
      message: `If this is your first dose of ${peptide.name}, ${formatMass(doseMg)} is too much: the ceiling for a first dose is ${formatMass(fd.max)} and ${formatMass(fd.recommended)} is the sensible place to start. If you have worked up to this on the ladder, log a dose or save a protocol and this will stop asking.`,
    }];
  }
  if (doseMg > fd.recommendedMax) {
    return [{
      level: LEVEL.WARN,
      code: 'first-dose-high',
      message: `If this is your first dose, ${formatMass(fd.recommended)} is where to gauge tolerance. ${formatMass(doseMg)} is at the top of what is reasonable to begin with.`,
    }];
  }
  return [];
}

/**
 * Can this bottle physically deliver this dose?
 * A dose that lands on one or two marks is not a dose, it is a guess.
 */
export function checkMeasurability({ units, syringe, highRisk = false, smallestDose = null, atMaxWater = false }) {
  if (!Number.isFinite(units) || units <= 0) return [];
  const floor = highRisk ? 4 : 2;
  if (units >= floor) return [];

  const narrower = syringe && syringe.capacityUnits > 30;
  const parts = [`${Number(units.toFixed(2))} units is too small to measure reliably${syringe ? ` on a ${syringe.label}` : ''}.`];
  if (narrower) parts.push('Switch to a 0.3 mL / 30 unit syringe, where the marks sit much further apart.');
  if (!atMaxWater) parts.push('Adding more bac water, up to the 5 mL a bottle will take, spreads the dose over more marks.');
  if (atMaxWater && Number.isFinite(smallestDose)) {
    parts.push(
      `This bottle is already at full dilution, so it cannot go lower: the smallest dose it can measure is about ${formatMass(smallestDose)}. Start there instead.`
    );
  }
  return [{ level: highRisk ? LEVEL.DANGER : LEVEL.WARN, code: 'unmeasurable', message: parts.join(' ') }];
}
