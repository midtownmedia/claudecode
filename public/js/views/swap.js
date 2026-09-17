/**
 * "My bottle changed."
 *
 * The protocol sheet is written in syringe units. Units are a property of the
 * bottle, not of the protocol, so a strength change silently rewrites every
 * number on the sheet. This screen makes that visible before it is injected.
 */

import { el, field, select, number, banner, fmtNum, stat } from '../ui/dom.js';
import { PEPTIDES, peptide, sheetFor } from '../data/peptides.js';
import { SYRINGES, syringe } from '../data/syringes.js';
import { rescaleLadder, describeScale, unitsToDose, doseToUnits } from '../lib/calc.js';
import { formatMass } from '../lib/units.js';

export function swapView(ctx) {
  const st = ctx.ui.swap ??= {};
  const p = peptide(st.peptideId ?? 'mots-c') ?? PEPTIDES[0];
  st.peptideId = p.id;
  const sheet = sheetFor(p.id);
  st.oldStrength ??= sheet?.sheetStrength ?? p.strengthOptions?.[0] ?? p.defaultStrength;
  st.oldDiluentMl ??= sheet?.sheetDiluentMl ?? p.defaultDiluentMl ?? 3;
  st.newStrength ??= p.defaultStrength;
  st.newDiluentMl ??= st.oldDiluentMl;
  st.syringeId ??= ctx.state.settings.syringeId ?? 'u100-10';

  const syr = syringe(st.syringeId);
  const oldVial = { strength: st.oldStrength, strengthUnit: p.strengthUnit, diluentMl: st.oldDiluentMl };
  const newVial = { strength: st.newStrength, strengthUnit: p.strengthUnit, diluentMl: st.newDiluentMl };

  const ladder = (p.ladder ?? []).map((l) => l.dose);
  const res = rescaleLadder({ ladder, sheet: oldVial, bottle: newVial, unitsPerMl: syr.unitsPerMl, roundTo: 0.5 });
  const scale = describeScale(res.unitScale);

  // The danger case: keep drawing the old unit count from the new bottle.
  const probeDose = ladder[ladder.length - 1] ?? 1;
  const probe = doseToUnits({ ...oldVial, dose: probeDose, unitsPerMl: syr.unitsPerMl, roundTo: 0.5 });
  const ifUnchanged = unitsToDose({ ...newVial, units: probe.roundedUnits, unitsPerMl: syr.unitsPerMl });
  const fold = probe.requestedDose > 0 ? ifUnchanged / probe.requestedDose : NaN;
  const changed = Math.abs(fold - 1) > 1e-6;

  return el('section', { class: 'view' },
    el('div', { class: 'card' },
      el('h2', {}, 'My bottle changed'),
      el('p', { class: 'lede' },
        'Protocol sheets are written in syringe units, but units only mean something for one exact bottle. Put the old bottle and the new bottle side by side and this rewrites the sheet.'),
      el('div', { class: 'grid' },
        field('Compound', select(
          PEPTIDES.map((x) => ({ value: x.id, label: x.name })), p.id,
          (v) => {
            const next = peptide(v); const sh = sheetFor(v);
            Object.assign(st, {
              peptideId: v,
              oldStrength: sh?.sheetStrength ?? next.strengthOptions?.[0] ?? next.defaultStrength,
              oldDiluentMl: sh?.sheetDiluentMl ?? next.defaultDiluentMl ?? 3,
              newStrength: next.defaultStrength,
              newDiluentMl: sh?.sheetDiluentMl ?? next.defaultDiluentMl ?? 3,
            });
            ctx.render();
          })),
        field('Syringe', select(
          SYRINGES.map((x) => ({ value: x.id, label: x.label })), st.syringeId,
          (v) => { st.syringeId = v; ctx.render(); })))),

    el('div', { class: 'compare' },
      el('div', { class: 'card compare-col' },
        el('h3', {}, 'The sheet was written for'),
        field('Strength', el('div', { class: 'row' },
          number(st.oldStrength, (v) => { st.oldStrength = v; ctx.render(); }, { min: 0, step: 'any' }),
          el('span', { class: 'suffix' }, p.strengthUnit))),
        field('Bac water', el('div', { class: 'row' },
          number(st.oldDiluentMl, (v) => { st.oldDiluentMl = v; ctx.render(); }, { min: 0, step: 'any' }),
          el('span', { class: 'suffix' }, 'mL')))),
      el('div', { class: 'card compare-col compare-new' },
        el('h3', {}, 'The bottle in your hand'),
        field('Strength', el('div', { class: 'row' },
          select([...new Set([...(p.strengthOptions ?? []), st.newStrength])].sort((a, b) => a - b)
            .map((v) => ({ value: v, label: `${v} ${p.strengthUnit}` })),
          st.newStrength, (v) => { st.newStrength = Number(v); ctx.render(); }),
          number(st.newStrength, (v) => { st.newStrength = v; ctx.render(); },
            { class: 'narrow', min: 0, step: 'any', 'aria-label': 'Custom strength' }))),
        field('Bac water', el('div', { class: 'row' },
          number(st.newDiluentMl, (v) => { st.newDiluentMl = v; ctx.render(); }, { min: 0, step: 'any' }),
          el('span', { class: 'suffix' }, 'mL')))))

    , changed
      ? el('div', { class: `card result result-${fold > 1.25 ? 'danger' : fold < 0.8 ? 'warn' : 'ok'}` },
        el('div', { class: 'headline' },
          el('div', { class: 'headline-kicker' }, 'If you draw the same units as before'),
          el('div', { class: 'headline-main' },
            `${fmtNum(probe.roundedUnits, 2)} units is now ${formatMass(ifUnchanged)}`),
          el('div', { class: 'headline-sub' },
            `It used to be ${formatMass(probe.requestedDose)}. That is ${fmtNum(fold, 2)}x your intended dose.`)),
        el('div', { class: 'scale-callout' },
          el('div', { class: 'scale-big' }, scale?.text ?? '--'),
          el('div', {}, scale?.plain ?? '')),
        fold > 1.5
          ? banner('danger', `This bottle is stronger. Drawing by habit would give you ${fmtNum(fold, 1)} times the dose you mean to take. Every number on the old sheet is now wrong.`)
          : fold < 0.75
            ? banner('warn', `This bottle is weaker. Drawing by habit would give you only ${Math.round(fold * 100)}% of your intended dose.`)
            : null)
      : banner('ok', 'These two bottles give the same units for the same dose. Nothing on the sheet changes.'),

    el('div', { class: 'card' },
      el('h3', {}, 'Your sheet, rewritten'),
      el('table', { class: 'table' },
        el('thead', {}, el('tr', {},
          el('th', {}, 'Dose'),
          el('th', {}, 'Sheet said'),
          el('th', {}, 'Draw instead'),
          el('th', {}, 'Delivers'))),
        el('tbody', {},
          res.steps.map((s) => el('tr', { class: s.exact ? '' : 'row-inexact' },
            el('td', { class: 'strong' }, formatMass(s.dose)),
            el('td', { class: 'was' }, Number.isFinite(s.sheetUnits) ? `${fmtNum(s.sheetUnits, 2)} u` : '--'),
            el('td', { class: 'now' }, `${fmtNum(s.roundedUnits, 2)} u`),
            el('td', {}, formatMass(s.actualDose)))))),
      res.steps.some((s) => !s.exact)
        ? banner('info', 'Rows that do not land on a whole mark are shown rounded to the nearest half unit. Changing how much water you add can make these come out even — the calculator suggests a volume.')
        : null),

    sheet?.note ? banner('info', sheet.note) : null,
    el('div', { class: 'card' },
      el('div', { class: 'stats' },
        stat('Strength change', Number.isFinite(res.strengthRatio) ? `${fmtNum(res.strengthRatio, 2)}x` : '--'),
        stat('Unit multiplier', Number.isFinite(res.unitScale) ? `${fmtNum(res.unitScale, 3)}x` : '--'),
        stat('New bottle', `1 unit = ${formatMass((st.newStrength / st.newDiluentMl) / syr.unitsPerMl)}`),
        stat('Old bottle', `1 unit = ${formatMass((st.oldStrength / st.oldDiluentMl) / syr.unitsPerMl)}`))));
}
