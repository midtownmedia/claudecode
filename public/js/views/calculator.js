/** "What do I draw?" -- the screen most people will only ever use. */

import { el, field, select, number, warnings, stat, fmtNum, banner } from '../ui/dom.js';
import { syringeCard } from '../ui/syringe.js';
import { PEPTIDES, peptide, sheetFor } from '../data/peptides.js';
import { SYRINGES, syringe, bestSyringeFor } from '../data/syringes.js';
import { doseToUnits, suggestDiluents, drawWarnings, unitsToMl, mlToUnits, smallestMeasurableDose, splitDraw, scaleBetween, describeScale, MAX_BAC_WATER_ML } from '../lib/calc.js';
import { checkDose, checkFirstDose, checkMeasurability } from '../lib/safety.js';
import { formatMass } from '../lib/units.js';

export function calculatorView(ctx) {
  const st = ctx.ui.calc ??= {};
  const p = peptide(st.peptideId ?? 'retatrutide') ?? PEPTIDES[0];
  st.peptideId = p.id;
  st.strength ??= p.defaultStrength;
  st.diluentMl ??= p.defaultDiluentMl ?? 3;
  st.diluentId ??= 'bacteriostatic';
  st.syringeId ??= ctx.state.settings.syringeId ?? 'u100-10';
  if (st.dose == null) st.dose = p.ladder?.[0]?.dose ?? 1;

  const syr = syringe(st.syringeId);
  const calc = doseToUnits({
    strength: st.strength, strengthUnit: p.strengthUnit, diluentMl: st.diluentMl,
    dose: st.dose, doseUnit: 'mg', unitsPerMl: syr.unitsPerMl, roundTo: 0.5,
  });

  const draw = drawWarnings({
    units: calc.units, roundedUnits: calc.roundedUnits, errorPct: calc.errorPct,
    syringe: syr, volumeMl: calc.volumeMl, diluentMl: st.diluentMl, vialCapacityMl: p.vialCapacityMl,
  });
  const clinical = checkDose(calc.requestedDose, p);
  // Someone mid-ladder should not be shouted at. A logged dose or a saved
  // protocol for this compound both mean they are past their first one.
  const hasHistory =
    ctx.state.logs.some((l) => l.peptideId === p.id) ||
    ctx.state.protocols.some((pr) => pr.peptideId === p.id);
  const first = checkFirstDose(calc.requestedDose, p, { hasHistory });
  const floorDose = smallestMeasurableDose({
    strength: st.strength, strengthUnit: p.strengthUnit, diluentMl: st.diluentMl,
    unitsPerMl: syr.unitsPerMl, minUnits: p.highRisk ? 4 : 2,
  });
  const atMaxWater = st.diluentMl >= MAX_BAC_WATER_ML - 1e-9;
  const measure = checkMeasurability({
    units: calc.units, syringe: syr, highRisk: p.highRisk,
    smallestDose: floorDose, atMaxWater,
  });
  const all = [...draw, ...clinical, ...first, ...measure];
  const tone = all.some((w) => w.level === 'danger') ? 'danger'
    : all.some((w) => w.level === 'warn') ? 'warn' : 'ok';

  const rec = suggestDiluents({
    strength: st.strength, doses: (p.ladder ?? []).map((l) => l.dose),
    vialCapacityMl: Math.min(p.vialCapacityMl, MAX_BAC_WATER_ML),
    syringeCapacityUnits: syr.capacityUnits,
    criticalDose: p.ladder?.[0]?.dose ?? null,
    minCriticalUnits: p.highRisk ? 4 : 2,
  });
  const best = rec[0];
  const better = best && Math.abs(best.diluentMl - st.diluentMl) > 1e-6 ? best : null;
  const smaller = bestSyringeFor(calc.roundedUnits);

  const sheet = sheetFor(p.id);

  // Bottles that changed strength are the whole reason this app exists, so the
  // warning belongs on the screen people actually use, not only on Reference.
  let drift = null;
  if (p.strengthChanged) {
    const { from, to } = p.strengthChanged;
    const onOld = Math.abs(st.strength - from) < 1e-9;
    const sheetVial = sheet?.sheetStrength
      ? { strength: sheet.sheetStrength, strengthUnit: p.strengthUnit, diluentMl: sheet.sheetDiluentMl }
      : null;
    const here = { strength: st.strength, strengthUnit: p.strengthUnit, diluentMl: st.diluentMl };
    const scale = sheetVial ? scaleBetween(sheetVial, here, syr.unitsPerMl) : NaN;
    const sheetDraw = sheetVial
      ? doseToUnits({ ...sheetVial, dose: st.dose, doseUnit: 'mg', unitsPerMl: syr.unitsPerMl, roundTo: 0.5 })
      : null;
    // The unit multiplier is not the strength ratio whenever the amount of
    // water also differs from the sheet. Saying "40 mg is 4x" next to "draw a
    // third" reads as a contradiction unless the water is spelled out.
    const waterDiffers = sheetVial && Math.abs(sheetVial.diluentMl - st.diluentMl) > 1e-9;
    drift = {
      from, to, onOld, scale, waterDiffers,
      sheetWaterMl: sheetVial?.diluentMl,
      described: describeScale(scale),
      sheetUnits: sheetDraw?.roundedUnits,
      differs: Number.isFinite(scale) && Math.abs(scale - 1) > 1e-6,
    };
  }

  const split = p.splitDose
    ? splitDraw({ units: calc.roundedUnits, dose: calc.actualDose, parts: p.splitDose.parts })
    : null;

  return el('section', { class: 'view' },
    el('div', { class: 'card' },
      el('h2', {}, 'What do I draw?'),
      (drift
        ? el('div', { class: `driftbox drift-${drift.onOld ? 'old' : 'new'}` },
          el('div', { class: 'drift-head' },
            `Bottles for ${p.name} changed from ${drift.from} ${p.strengthUnit} to ${drift.to} ${p.strengthUnit}`),
          drift.onOld
            ? el('p', {},
              `You have the ${drift.from} ${p.strengthUnit} bottle selected. These now ship at `
              + `${drift.to} ${p.strengthUnit} in a bottle that looks identical, so check the label before you draw.`)
            : el('p', {},
              `Any sheet written for the ${drift.from} ${p.strengthUnit} bottle is wrong for this one. `
              + (drift.waterDiffers
                ? `That sheet used ${fmtNum(drift.sheetWaterMl, 2)} mL of bac water and you have ${fmtNum(st.diluentMl, 2)} mL in, so both numbers have moved: `
                : '')
              + (drift.described
                ? (drift.waterDiffers
                  // Follows a colon, so it continues the sentence.
                  ? drift.described.plain.charAt(0).toLowerCase() + drift.described.plain.slice(1)
                  : drift.described.plain)
                : '')),
          drift.differs && Number.isFinite(drift.sheetUnits)
            ? el('div', { class: 'drift-compare' },
              el('span', { class: 'was' }, `sheet said ${fmtNum(drift.sheetUnits, 2)} units`),
              el('span', { class: 'drift-arrow' }, '→'),
              el('span', { class: 'now' }, `draw ${fmtNum(calc.roundedUnits, 2)} units`),
              el('span', { class: 'drift-for' }, `for ${formatMass(calc.requestedDose)}`))
            : null,
          el('button', {
            type: 'button', class: 'linkbtn',
            onclick: () => {
              ctx.ui.swap = {
                peptideId: p.id,
                oldStrength: drift.from, oldDiluentMl: sheet?.sheetDiluentMl ?? st.diluentMl,
                newStrength: st.strength, newDiluentMl: st.diluentMl, syringeId: st.syringeId,
              };
              ctx.tab = 'swap';
              location.hash = 'swap';
              ctx.render();
            },
          }, 'Compare the two bottles'))
        : null),

      p.highRisk
        ? banner('warn', `${p.name} is the one here with real potential to hurt someone. ` +
          (p.firstDose ? p.firstDose.note + ' ' : '') +
          'Every step of the ladder exists to let your gut adapt - skipping one is where people get badly ill.')
        : null,
      el('div', { class: 'grid' },
        field('Compound', select(
          PEPTIDES.map((x) => ({ value: x.id, label: x.name })), p.id,
          (v) => {
            const next = peptide(v);
            Object.assign(st, {
              peptideId: v, strength: next.defaultStrength,
              diluentMl: next.defaultDiluentMl ?? 3, dose: next.ladder?.[0]?.dose ?? 1,
            });
            ctx.render();
          })),
        field('Your bottle says',
          el('div', { class: 'row' },
            select(
              [...new Set([...(p.strengthOptions ?? []), st.strength])].sort((a, b) => a - b)
                .map((v) => ({ value: v, label: `${v} ${p.strengthUnit}` })),
              st.strength, (v) => { st.strength = Number(v); ctx.render(); }),
            number(st.strength, (v) => { st.strength = v; ctx.render(); },
              { class: 'narrow', min: 0, step: 'any', 'aria-label': 'Custom bottle strength' })),
          'Read this off the label, not off the protocol sheet.'),
        field('Bac water added',
          el('div', { class: 'row' },
            number(st.diluentMl, (v) => { st.diluentMl = v; ctx.render(); }, { min: 0, step: 'any' }),
            el('span', { class: 'suffix' }, 'mL'),
            el('span', { class: 'equals' },
              `= ${fmtNum(mlToUnits(st.diluentMl ?? 0, 100), 0)} units`)),
          `1 mL = 100 units on a U-100 syringe, so ${fmtNum(st.diluentMl ?? 0, 2)} mL is ${fmtNum(mlToUnits(st.diluentMl ?? 0, 100), 0)} units if you measure it with one. A bottle takes ${MAX_BAC_WATER_ML} mL at most.`),
        field('Syringe', select(
          SYRINGES.map((x) => ({ value: x.id, label: x.label })), st.syringeId,
          (v) => { st.syringeId = v; ctx.state.settings.syringeId = v; ctx.save(); ctx.render(); })),
        field('Dose',
          el('div', { class: 'row' },
            number(st.dose, (v) => { st.dose = v; ctx.render(); }, { min: 0, step: 'any' }),
            el('span', { class: 'suffix' }, 'mg')),
          'The real instruction. Units change with the bottle, this does not.')),

      (p.ladder?.length
        ? el('div', { class: 'chips' },
          el('span', { class: 'chips-label' }, 'Ladder:'),
          p.ladder.map((step) => el('button', {
            type: 'button',
            class: `chip${Math.abs(step.dose - st.dose) < 1e-9 ? ' chip-on' : ''}`,
            onclick: () => { st.dose = step.dose; ctx.render(); },
          }, formatMass(step.dose))))
        : null)),

    el('div', { class: `card result result-${tone}` },
      syringeCard({
        units: calc.roundedUnits, syringe: syr, tone,
        caption: `${syr.label} · 1 unit = ${formatMass(calc.perUnit)}`,
      }),
      el('div', { class: 'headline' },
        el('div', { class: 'headline-main' }, `Draw ${fmtNum(calc.roundedUnits, 2)} units`),
        el('div', { class: 'headline-sub' },
          `for ${formatMass(calc.requestedDose)} of ${p.name}`)),
      el('div', { class: 'stats' },
        stat('One unit is', formatMass(calc.perUnit), 'on this bottle'),
        stat('Volume', `${fmtNum(calc.volumeMl, 3)} mL`),
        stat('Actually delivered', formatMass(calc.actualDose),
          Number.isFinite(calc.errorPct) && Math.abs(calc.errorPct) >= 0.05
            ? `${calc.errorPct > 0 ? '+' : ''}${fmtNum(calc.errorPct, 1)}% vs target` : 'exact'),
        stat('Doses in bottle', Number.isFinite(calc.dosesPerVial) ? calc.dosesPerVial : '--'),
        stat('Smallest this bottle can do', formatMass(floorDose),
          atMaxWater ? 'at full dilution' : `at ${fmtNum(st.diluentMl, 2)} mL`)),
      warnings(all),
      st.diluentMl > MAX_BAC_WATER_ML
        ? banner('danger', `${fmtNum(st.diluentMl, 2)} mL will not fit. A bottle takes about ${MAX_BAC_WATER_ML} mL of bac water at most.`)
        : null,
      smaller && smaller.id !== syr.id && calc.roundedUnits <= smaller.capacityUnits
        ? banner('info',
          `A ${smaller.label} syringe would hold this draw with the marks spaced further apart, which makes ${fmtNum(calc.roundedUnits, 2)} units easier to hit accurately.`)
        : null,
      better
        ? banner('info', el('span', {},
          `Next time you reconstitute: ${better.diluentMl} mL of water would make 1 unit = ${formatMass(better.perUnit)}`,
          better.note ? ` — ${better.note}` : '',
          ' ',
          el('button', {
            type: 'button', class: 'linkbtn',
            onclick: () => { st.diluentMl = better.diluentMl; ctx.render(); },
          }, 'use this')))
        : null),

    (split
      ? el('div', { class: 'card split-card' },
        el('h3', {}, `If ${p.name} makes you feel sick`),
        el('p', { class: 'lede' },
          `${p.name} is commonly split to keep ${p.splitDose.reason} down. It is the same ` +
          `${formatMass(calc.actualDose)} a day either way — just given in ${p.splitDose.parts} halves instead of one go.`),
        el('div', { class: 'split-row' },
          el('div', { class: 'split-half' },
            el('div', { class: 'split-units' }, `${fmtNum(split.perPartUnits, 2)} units`),
            el('div', { class: 'split-when' }, 'in the morning'),
            el('div', { class: 'split-dose' }, formatMass(split.perPartDose))),
          el('div', { class: 'split-plus' }, '+'),
          el('div', { class: 'split-half' },
            el('div', { class: 'split-units' }, `${fmtNum(split.perPartUnits, 2)} units`),
            el('div', { class: 'split-when' }, 'again at night'),
            el('div', { class: 'split-dose' }, formatMass(split.perPartDose)))),
        el('div', { class: 'stats' },
          stat('Whole dose', `${fmtNum(calc.roundedUnits, 2)} units`, formatMass(calc.actualDose)),
          stat('Each half', `${fmtNum(split.perPartUnits, 2)} units`, formatMass(split.perPartDose)),
          stat('Daily total', formatMass(split.totalDose), 'unchanged'),
          stat('Doses in bottle', Number.isFinite(calc.dosesPerVial) ? calc.dosesPerVial * split.parts : '--',
            `${split.parts} halves a day`)),
        banner('info',
          'You can fill both syringes in one go and keep the evening one capped in the fridge — one puncture of the vial a day instead of two. Take it out a few minutes early so it is not fridge-cold.'),
        split.exact
          ? null
          : banner('warn', `${fmtNum(calc.roundedUnits, 2)} units does not halve evenly, so each half is rounded to ${fmtNum(split.perPartUnits, 2)} units and the day comes to ${formatMass(split.totalDose)}.`))
      : null),

    el('details', { class: 'card' },
      el('summary', {}, 'Show me the maths'),
      el('ol', { class: 'maths' },
        el('li', {}, `The bottle holds ${st.strength} ${p.strengthUnit} of powder.`),
        el('li', {}, `You added ${fmtNum(st.diluentMl, 3)} mL of water, so the liquid is ${fmtNum(calc.concentration, 4)} mg per mL.`),
        el('li', {}, `One syringe unit is ${fmtNum(1 / syr.unitsPerMl, 4)} mL, so one unit carries ${formatMass(calc.perUnit)}.`),
        el('li', {}, `You want ${formatMass(calc.requestedDose)}, and ${formatMass(calc.requestedDose)} ÷ ${formatMass(calc.perUnit)} = ${fmtNum(calc.units, 2)} units.`),
        Number.isFinite(calc.roundedUnits) && Math.abs(calc.roundedUnits - calc.units) > 1e-9
          ? el('li', {}, `Rounded to the nearest half mark that is ${fmtNum(calc.roundedUnits, 2)} units, which delivers ${formatMass(calc.actualDose)}.`)
          : null),
      sheet?.note ? banner('info', sheet.note) : null));
}
