/**
 * One-off maths, both directions:
 *   dose → units  "I take 0.5 mg, where do I draw to?"
 *   units → dose  "The sheet says 6 units, how much is that?"
 *
 * The form is built once. Typing only redraws the answer, so the caret never
 * jumps out of the field.
 */

import { h, clear, pageHeader, group, row, select, segmented, decimalInput, button, banner } from '../ui.js';
import { PEPTIDES, peptide, OTHER, SYRINGES } from '../data.js';
import { draw, checks, unitsToMg, suggestWater, waterProblem, mass, num, MAX_WATER_ML } from '../math.js';
import { syringeSvg } from '../syringe.js';
import { hasHistory, bestSyringe } from '../model.js';
import { protocolSheet, warningList, changedNote, scheduleText } from './sheets.js';

function defaults(p) {
  const doseMg = p.firstDose?.recommended ?? p.ladder?.[0]?.dose ?? NaN;
  const units = draw({ strength: p.strength, waterMl: p.waterMl, doseMg }).units;
  return {
    mode: 'dose',
    peptideId: p.id,
    strength: p.strength,
    customStrength: false,
    waterMl: p.waterMl,
    doseMg,
    doseUnit: p.mcg ? 'mcg' : 'mg',
    units: NaN,
    syringe: Number.isFinite(units) ? bestSyringe(units) : 100,
  };
}

export function calculatorView(app) {
  app.ui.calc ??= defaults(PEPTIDES[0]);
  const c = app.ui.calc;

  const formHost = h('div', { class: 'calc-form' });
  const result = h('div', { class: 'calc-result' });

  const p = () => peptide(c.peptideId) ?? OTHER;

  const update = () => {
    const pp = p();
    clear(result);
    if (c.mode === 'units') {
      const mg = unitsToMg({ strength: c.strength, waterMl: c.waterMl, units: c.units });
      result.append(h('section', { class: 'card answer' },
        h('p', { class: 'answer-label' }, `${num(c.units)} units is`),
        h('p', { class: 'answer-big' }, Number.isFinite(mg) ? mass(mg, { mcg: pp.mcg }) : '–'),
        Number.isFinite(mg)
          ? h('div', { class: 'answer-syringe' }, syringeSvg({ units: c.units, capacity: c.syringe }))
          : null,
        Number.isFinite(mg)
          ? h('p', { class: 'answer-note' }, `From a ${num(c.strength)} mg bottle mixed with ${num(c.waterMl)} mL. 1 unit = ${mass(c.strength / c.waterMl / 100, { mcg: pp.mcg })}.`)
          : h('p', { class: 'answer-note' }, 'Enter the bottle, the water and the units.'),
        changedNote(pp, c.strength, c.waterMl)));
      return;
    }

    const d = draw({ strength: c.strength, waterMl: c.waterMl, doseMg: c.doseMg, syringeUnits: c.syringe });
    const list = checks({
      p: pp, doseMg: c.doseMg, d, syringeUnits: c.syringe, waterMl: c.waterMl,
      hasHistory: hasHistory(app.state, c.peptideId),
    });
    const ok = Number.isFinite(d.rounded);
    const smaller = ok && d.rounded > 0 && SYRINGES.find((x) => x.units < c.syringe && d.rounded <= x.units);

    result.append(h('section', { class: 'card answer' },
      h('p', { class: 'answer-label' }, 'Draw to'),
      h('p', { class: 'answer-big' }, ok ? num(d.rounded) : '–', h('span', { class: 'answer-unit' }, ' units')),
      h('div', { class: 'answer-syringe' },
        syringeSvg({ units: ok ? d.rounded : 0, capacity: c.syringe, tone: list.some((w) => w.level === 'danger') ? 'danger' : 'ok' })),
      ok
        ? h('dl', { class: 'answer-facts' },
          fact('Gives you', mass(d.actualMg, { mcg: pp.mcg })),
          fact('Liquid', `${num(d.ml, 3)} mL`),
          fact('1 unit', mass(d.mgPerUnit, { mcg: pp.mcg })),
          fact('Doses per bottle', String(d.dosesPerBottle)))
        : h('p', { class: 'answer-note' }, 'Enter the bottle, the water and the dose.'),
      warningList(list),
      smaller && d.rounded <= 30 && c.syringe > 30
        ? banner('info', `Tip: a ${smaller.long} syringe makes ${num(d.rounded)} units easier to read.`)
        : null,
      changedNote(pp, c.strength, c.waterMl),
      ok && list.every((w) => w.level !== 'danger')
        ? button('Add to Today', () => protocolSheet(app, null, {
          peptideId: c.peptideId, strength: c.strength, waterMl: c.waterMl, doseMg: c.doseMg, syringe: c.syringe,
        }), { kind: 'tinted', iconName: 'plus' })
        : null));
  };

  const build = () => {
    const pp = p();
    const doses = pp.ladder?.length ? pp.ladder.map((x) => x.dose) : [c.doseMg];
    const sug = waterProblem({ strength: c.strength, waterMl: c.waterMl, doses, syringeUnits: c.syringe, vialMl: pp.vialMl })
      ? suggestWater({ strength: c.strength, doses, vialMl: pp.vialMl })
      : null;
    const shownDose = Number.isFinite(c.doseMg) ? Number((c.doseUnit === 'mcg' ? c.doseMg * 1000 : c.doseMg).toFixed(4)) : '';

    clear(formHost).append(
      segmented({
        id: 'calc-mode', label: 'What do you want to know', value: c.mode,
        options: [{ value: 'dose', label: 'Dose → Units' }, { value: 'units', label: 'Units → Dose' }],
        onChange: (v) => { c.mode = v; build(); },
      }),
      group({ header: 'Bottle', footer: sug && Math.abs(sug.waterMl - c.waterMl) > 1e-9 && c.mode === 'dose'
        ? h('span', {},
          `Suggested: ${num(sug.waterMl)} mL. `,
          h('button', { type: 'button', class: 'linkish', onclick: () => { c.waterMl = sug.waterMl; build(); } }, `Use ${num(sug.waterMl)} mL`))
        : `A bottle takes at most ${MAX_WATER_ML} mL of bac water. 1 mL is 100 units on the syringe.` },
      row('Peptide', select({
        id: 'calc-peptide', label: 'Peptide', value: c.peptideId,
        options: [...PEPTIDES.map((x) => ({ value: x.id, label: x.name })), { value: 'other', label: 'Other…' }],
        onChange: (v) => {
          const mode = c.mode;
          Object.assign(c, defaults(peptide(v) ?? OTHER), { mode, customStrength: v === 'other' });
          build();
        },
      }), { id: 'calc-peptide' }),
      pp.strengths.length
        ? row('Strength', select({
          id: 'calc-bottle', label: 'Bottle strength', value: c.customStrength ? 'custom' : c.strength,
          options: [...pp.strengths.map((v) => ({ value: v, label: `${v} mg` })), { value: 'custom', label: 'Other amount…' }],
          onChange: (v) => {
            c.customStrength = v === 'custom';
            if (!c.customStrength) c.strength = Number(v);
            build();
          },
        }), { id: 'calc-bottle' })
        : null,
      c.customStrength || !pp.strengths.length
        ? row(pp.strengths.length ? 'Amount' : 'Strength', decimalInput({
          id: 'calc-strength', value: c.strength, placeholder: '10', label: 'Bottle strength in mg',
          onInput: (n) => { c.strength = n; update(); },
        }), { id: 'calc-strength', suffix: 'mg' })
        : null,
      row('Bac water', decimalInput({
        id: 'calc-water', value: c.waterMl, placeholder: '3', label: 'Bac water in mL',
        onInput: (n) => { c.waterMl = n; update(); },
      }), { id: 'calc-water', suffix: 'mL' })),

      c.mode === 'dose'
        ? group({ header: 'Dose', footer: scheduleText(pp) },
          h('div', { class: 'row' },
            h('label', { class: 'row-label', for: 'calc-dose' }, 'Dose'),
            h('span', { class: 'row-value' },
              decimalInput({
                id: 'calc-dose', value: shownDose, placeholder: '0.5', label: `Dose in ${c.doseUnit}`,
                onInput: (n) => { c.doseMg = c.doseUnit === 'mcg' ? n / 1000 : n; update(); },
              }),
              segmented({
                id: 'calc-dose-unit', label: 'Dose unit', small: true, value: c.doseUnit,
                options: [{ value: 'mg', label: 'mg' }, { value: 'mcg', label: 'mcg' }],
                onChange: (v) => { c.doseUnit = v; build(); },
              }))),
          syringeRow())
        : group({ header: 'Syringe' },
          row('Units drawn', decimalInput({
            id: 'calc-units', value: c.units, placeholder: '10', label: 'Units drawn',
            onInput: (n) => { c.units = n; update(); },
          }), { id: 'calc-units', suffix: 'units' }),
          syringeRow()));
    update();
  };

  const syringeRow = () => h('div', { class: 'row' },
    h('span', { class: 'row-label' }, 'Syringe'),
    h('span', { class: 'row-value' }, segmented({
      id: 'calc-syringe', label: 'Syringe size', small: true, value: c.syringe,
      options: SYRINGES.map((x) => ({ value: x.units, label: x.label })),
      onChange: (v) => { c.syringe = Number(v); update(); },
    })));

  build();

  return h('div', { class: 'view view-calc' },
    pageHeader('Calculator', { subtitle: 'Syringe maths' }),
    h('div', { class: 'calc-layout' }, formHost, result));
}

function fact(label, value) {
  return h('div', { class: 'answer-fact' }, h('dt', {}, label), h('dd', {}, value));
}
