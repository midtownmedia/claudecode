/** The sheets that slide up: add or edit a peptide, log a dose, log a weight. */

import {
  h, clear, sheet, ask, toast, group, row, select, segmented, decimalInput,
  banner, button, localInputValue, icon, dayWord, time,
} from '../ui.js';
import { PEPTIDES, OTHER, peptide, FREQUENCIES, SYRINGES, SITES, EVIDENCE, RED_FLAGS, HANDLING } from '../data.js';
import { draw, checks, suggestWater, waterProblem, mass, num, suggestSite, sheetFactor, weightIn } from '../math.js';
import { syringeSvg } from '../syringe.js';
import { uid } from '../store.js';
import { nameOf, newProtocol, peptideOf, hasHistory, dosesOf, doseText } from '../model.js';

const PEPTIDE_OPTIONS = [
  ...PEPTIDES.map((p) => ({ value: p.id, label: p.name })),
  { value: 'other', label: 'Other…' },
];

/* ------------------------------------------------------------------ *
 * Shared bits
 * ------------------------------------------------------------------ */

export function warningList(list) {
  if (!list.length) return null;
  return h('div', { class: 'warnings' }, list.map((w) => banner(w.level, w.text)));
}

/** The schedule as one readable line. */
export function scheduleText(p) {
  if (!p.ladder?.length) return null;
  const steps = p.ladder.map((st) => mass(st.dose, { mcg: p.mcg }));
  const first = p.ladder[0];
  if (steps.length === 1) return `Usual dose: ${steps[0]}${p.course ? `, ${p.course}` : ''}.`;
  return `Usual schedule: ${steps[0]} for ${first.weeks} week${first.weeks === 1 ? '' : 's'}, then ${steps.slice(1).join(', ')}. Each step is held for weeks, not days.`;
}

export function aboutPeptide(p) {
  if (!p || p.id === 'other') return null;
  return h('details', { class: 'about' },
    h('summary', {}, h('span', {}, `About ${p.name}`), icon('chevron', 'icon about-chevron')),
    h('div', { class: 'about-body' },
      h('p', { class: 'about-kind' }, `${p.kind} · ${EVIDENCE[p.evidence] ?? ''}`),
      p.notes?.length ? h('ul', {}, p.notes.map((n) => h('li', {}, n))) : null,
      p.risks?.length ? h('h4', {}, 'Risks') : null,
      p.risks?.length ? h('ul', {}, p.risks.map((n) => h('li', {}, n))) : null));
}

/** A bottle whose strength changed without its look changing. */
export function changedNote(p, strength, waterMl) {
  const c = p?.changed;
  if (!c || strength !== c.to) return null;
  const f = sheetFactor({ fromStrength: c.from, fromWaterMl: c.sheetWaterMl, toStrength: strength, toWaterMl: waterMl });
  if (!(f > 1.05)) return null;
  return banner('info', `Older ${p.name} sheets were written for a ${c.from} mg bottle. Their unit counts would give you ${num(f, 1)}× the dose from this one. Go by mg, and use the units shown here.`);
}

/* ------------------------------------------------------------------ *
 * Add or edit a peptide
 * ------------------------------------------------------------------ */

export function protocolSheet(app, existing = null, prefill = null) {
  const isNew = !existing?.id;
  let draft = existing?.id
    ? { ...existing }
    : { ...newProtocol(peptide(prefill?.peptideId) ?? PEPTIDES[0]), ...(prefill ?? {}) };
  let doseUnit = peptideOf(draft).mcg ? 'mcg' : 'mg';
  let customStrength = draft.peptideId === 'other' || !peptideOf(draft).strengths.includes(draft.strength);
  const originalDose = existing?.doseMg ?? null;

  sheet({
    title: isNew ? 'Add Peptide' : `Edit ${nameOf(existing)}`,
    build: (close) => {
      const body = h('div', { class: 'form' });
      const preview = h('div', { class: 'preview' });
      const waterHint = h('p', { class: 'group-footer' });
      const error = h('div', { class: 'form-error', hidden: true });

      const update = () => {
        const p = peptideOf(draft);
        const d = draw({ strength: draft.strength, waterMl: draft.waterMl, doseMg: draft.doseMg, syringeUnits: draft.syringe });
        const list = checks({
          p, doseMg: draft.doseMg, d, syringeUnits: draft.syringe, waterMl: draft.waterMl,
          hasHistory: hasHistory(app.state, draft.peptideId, draft.id),
          previousMg: originalDose && draft.doseMg !== originalDose ? originalDose : null,
        });
        clear(preview).append(
          Number.isFinite(d.rounded)
            ? h('div', { class: 'preview-card' },
              syringeSvg({ units: d.rounded, capacity: draft.syringe, tone: list.some((w) => w.level === 'danger') ? 'danger' : 'ok' }),
              h('p', { class: 'preview-line' },
                h('strong', {}, `${num(d.rounded)} units`),
                ` for ${doseText(draft, draft.doseMg)}`))
            : h('p', { class: 'preview-empty' }, 'Fill in the bottle, water and dose to see the draw.'),
          warningList(list) ?? '',
          changedNote(p, draft.strength, draft.waterMl) ?? '');

        const doses = p.ladder?.length ? p.ladder.map((st) => st.dose) : [draft.doseMg];
        const sug = suggestWater({ strength: draft.strength, doses, vialMl: p.vialMl });
        clear(waterHint);
        const problem = waterProblem({ strength: draft.strength, waterMl: draft.waterMl, doses, syringeUnits: draft.syringe, vialMl: p.vialMl });
        if (sug && problem && Math.abs(sug.waterMl - draft.waterMl) > 1e-9) {
          const firstUnits = num(doses.filter((x) => x > 0).sort((a, b) => a - b)[0] / sug.mgPerUnit);
          waterHint.append(
            `Suggested: ${num(sug.waterMl)} mL, which puts ${p.ladder?.length ? 'the first dose' : 'this dose'} on ${firstUnits} units. `,
            h('button', {
              type: 'button', class: 'linkish',
              onclick: () => { draft.waterMl = sug.waterMl; build(); },
            }, `Use ${num(sug.waterMl)} mL`));
        } else if (draft.strength > 0 && draft.waterMl > 0) {
          waterHint.append(`1 unit = ${mass(draft.strength / draft.waterMl / 100, { mcg: p.mcg })}. A bottle takes at most 5 mL of bac water.`);
        } else {
          waterHint.append('3 mL of bac water is 300 units on the syringe. A bottle takes at most 5 mL.');
        }
      };

      const build = () => {
        const p = peptideOf(draft);
        const strengthOptions = [
          ...p.strengths.map((v) => ({ value: v, label: `${v} mg` })),
          { value: 'custom', label: 'Other amount…' },
        ];
        const shownDose = Number.isFinite(draft.doseMg) && draft.doseMg !== null
          ? Number((doseUnit === 'mcg' ? draft.doseMg * 1000 : draft.doseMg).toFixed(4))
          : '';

        clear(body).append(
          group({},
            row('Peptide', select({
              id: 'pr-peptide', label: 'Peptide', options: PEPTIDE_OPTIONS, value: draft.peptideId,
              onChange: (v) => {
                const np = peptide(v) ?? OTHER;
                const fresh = newProtocol(np);
                draft = { ...draft, ...fresh, id: draft.id, name: v === 'other' ? draft.name : '', mixedAt: draft.mixedAt };
                doseUnit = np.mcg ? 'mcg' : 'mg';
                customStrength = v === 'other';
                build();
              },
            }), { id: 'pr-peptide' }),
            draft.peptideId === 'other'
              ? row('Name', h('input', {
                id: 'pr-name', class: 'text-input', type: 'text', placeholder: 'What it is called',
                value: draft.name, autocomplete: 'off',
                oninput: (e) => { draft.name = e.target.value; },
              }), { id: 'pr-name' })
              : null,
            p.strengths.length
              ? row('Bottle', select({
                id: 'pr-bottle', label: 'Bottle strength', options: strengthOptions,
                value: customStrength ? 'custom' : draft.strength,
                onChange: (v) => {
                  customStrength = v === 'custom';
                  if (!customStrength) draft.strength = Number(v);
                  build();
                },
              }), { id: 'pr-bottle' })
              : null,
            customStrength
              ? row(p.strengths.length ? 'Amount' : 'Bottle', decimalInput({
                id: 'pr-strength', value: draft.strength, placeholder: '10', label: 'Bottle strength in mg',
                onInput: (n) => { draft.strength = n; update(); },
              }), { id: 'pr-strength', suffix: 'mg' })
              : null,
            row('Bac water', decimalInput({
              id: 'pr-water', value: draft.waterMl, placeholder: '3', label: 'Bac water in mL',
              onInput: (n) => { draft.waterMl = n; update(); },
            }), { id: 'pr-water', suffix: 'mL' })),
          waterHint,

          group({ header: 'Dose', footer: scheduleText(p) },
            h('div', { class: 'row' },
              h('label', { class: 'row-label', for: 'pr-dose' }, 'Dose'),
              h('span', { class: 'row-value' },
                decimalInput({
                  id: 'pr-dose', value: shownDose, placeholder: '0.5', label: `Dose in ${doseUnit}`,
                  onInput: (n) => { draft.doseMg = doseUnit === 'mcg' ? n / 1000 : n; update(); },
                }),
                segmented({
                  id: 'pr-dose-unit', label: 'Dose unit', small: true, value: doseUnit,
                  options: [{ value: 'mg', label: 'mg' }, { value: 'mcg', label: 'mcg' }],
                  onChange: (v) => { doseUnit = v; build(); },
                }))),
            row('How often', select({
              id: 'pr-freq', label: 'How often', value: draft.freq,
              options: FREQUENCIES.map((f) => ({ value: f.id, label: f.label })),
              onChange: (v) => { draft.freq = v; },
            }), { id: 'pr-freq' }),
            h('div', { class: 'row' },
              h('span', { class: 'row-label' }, 'Syringe'),
              h('span', { class: 'row-value' }, segmented({
                id: 'pr-syringe', label: 'Syringe size', small: true, value: draft.syringe,
                options: SYRINGES.map((x) => ({ value: x.units, label: x.label })),
                onChange: (v) => { draft.syringe = Number(v); update(); },
              })))),

          preview,

          group({ header: 'Bottle', footer: 'A mixed bottle is good for 28 days in the fridge. The price is only used to show cost per dose.' },
            row('Mixed on', h('input', {
              id: 'pr-mixed', class: 'date-input', type: 'date',
              value: draft.mixedAt ? localInputValue(draft.mixedAt, true) : '',
              onchange: (e) => { draft.mixedAt = e.target.value ? new Date(`${e.target.value}T12:00`).toISOString() : null; },
            }), { id: 'pr-mixed' }),
            row('Price', decimalInput({
              id: 'pr-price', value: draft.price ?? '', placeholder: 'Optional', label: 'Price per bottle in dollars',
              onInput: (n) => { draft.price = Number.isFinite(n) ? n : null; },
            }), { id: 'pr-price', suffix: '$' })),

          aboutPeptide(p),
          error,
          h('div', { class: 'sheet-actions' },
            button(isNew ? 'Add to Today' : 'Save', () => {
              const msg = !(draft.strength > 0) ? 'Enter how many mg are in the bottle.'
                : !(draft.waterMl > 0) ? 'Enter how much bac water went in.'
                  : !(draft.doseMg > 0) ? 'Enter the dose.'
                    : draft.peptideId === 'other' && !draft.name.trim() ? 'Give it a name.'
                      : null;
              if (msg) {
                clear(error).append(banner('warn', msg));
                error.hidden = false;
                return;
              }
              const now = new Date().toISOString();
              const rec = {
                ...draft,
                name: draft.name?.trim() ?? '',
                id: draft.id ?? uid(),
                doseSince: originalDose != null && originalDose !== draft.doseMg ? now : (draft.doseSince ?? now),
                createdAt: draft.createdAt ?? now,
                updatedAt: now,
              };
              app.commit((st) => {
                st.protocols = st.protocols.filter((x) => x.id !== rec.id).concat(rec);
              });
              close();
              toast(isNew ? `${nameOf(rec)} added` : 'Saved');
              if (isNew) app.go('today');
            }, { id: 'pr-save' }),
            isNew ? null : button(draft.active === false ? 'Show on Today' : 'Pause', () => {
              const active = draft.active === false;
              app.commit((st) => {
                const x = st.protocols.find((r) => r.id === draft.id);
                if (x) { x.active = active; x.updatedAt = new Date().toISOString(); }
              });
              close();
              toast(active ? 'Back on Today' : 'Paused. Find it in Settings.');
            }, { kind: 'gray' }),
            isNew ? null : button('Delete', async () => {
              const ok = await ask({
                title: `Delete ${nameOf(existing)}?`,
                message: 'Its logged doses stay in your history.',
                actions: [{ label: 'Cancel', value: false }, { label: 'Delete', value: true, style: 'destructive' }],
              });
              if (!ok) return;
              app.commit((st) => {
                st.protocols = st.protocols.filter((x) => x.id !== draft.id);
                st.deleted.protocols.push(draft.id);
              });
              close();
              toast('Deleted');
            }, { kind: 'destructive' })));
        update();
      };

      build();
      return body;
    },
  });
}

/* ------------------------------------------------------------------ *
 * Log a dose
 * ------------------------------------------------------------------ */

export function doseSheet(app, pr) {
  const d = draw({ strength: pr.strength, waterMl: pr.waterMl, doseMg: pr.doseMg, syringeUnits: pr.syringe });
  const history = dosesOf(app.state, pr.id);
  const suggested = suggestSite(app.state.doses, SITES);
  let site = suggested;
  let when = Date.now();
  const recent = history[0] && Date.now() - new Date(history[0].at).getTime() < 3 * 60000 ? history[0] : null;

  sheet({
    title: 'Log Dose',
    build: (close) => h('div', { class: 'form' },
      h('div', { class: 'log-summary' },
        h('span', { class: 'log-name' }, nameOf(pr)),
        h('span', { class: 'log-amount' }, `${doseText(pr, pr.doseMg)} · ${num(d.rounded)} units`)),
      recent ? banner('warn', `You logged this ${Math.max(1, Math.round((Date.now() - new Date(recent.at).getTime()) / 60000))} min ago. Only log it again if you took a second dose.`) : null,
      group({},
        row('When', h('input', {
          id: 'dose-when', class: 'date-input', type: 'datetime-local',
          value: localInputValue(when), max: localInputValue(Date.now() + 60000),
          onchange: (e) => { const t = new Date(e.target.value).getTime(); if (Number.isFinite(t)) when = t; },
        }), { id: 'dose-when' })),
      group({ header: 'Injection site', footer: 'Suggested is the spot you have used least recently. Rotating stops lumps building up.' },
        h('div', { class: 'sites', role: 'radiogroup', 'aria-label': 'Injection site' },
          SITES.map((name) => h('button', {
            type: 'button', class: 'site', role: 'radio', 'aria-checked': String(name === site),
            onclick: (e) => {
              site = name;
              for (const b of e.currentTarget.parentElement.children) b.setAttribute('aria-checked', String(b === e.currentTarget));
            },
          }, h('span', {}, name), name === suggested ? h('small', {}, 'Suggested') : null)))),
      h('div', { class: 'sheet-actions' },
        button(recent ? 'Log Another Dose' : 'Log Dose', () => {
          const rec = {
            id: uid(), protocolId: pr.id, peptideId: pr.peptideId, name: nameOf(pr),
            at: new Date(when).toISOString(), doseMg: pr.doseMg, units: d.rounded, site,
            updatedAt: new Date().toISOString(),
          };
          const ok = app.commit((st) => { st.doses.push(rec); });
          close();
          app.afterSave(ok, `Logged ${doseText(pr, pr.doseMg)} · ${dayWord(when) === 'Today' ? time(when) : dayWord(when)}`, () => {
            app.commit((st) => {
              st.doses = st.doses.filter((x) => x.id !== rec.id);
              st.deleted.doses.push(rec.id);
            });
          });
        }, { id: 'dose-save' }))),
  });
}

/* ------------------------------------------------------------------ *
 * Log a weight
 * ------------------------------------------------------------------ */

export function weightSheet(app) {
  let unit = app.state.settings.weightUnit;
  let value = NaN;
  let day = localInputValue(Date.now(), true);
  const last = [...app.state.weights].sort((a, b) => new Date(b.at) - new Date(a.at))[0];

  sheet({
    title: 'Log Weight',
    focus: '#w-value',
    build: (close) => {
      const input = decimalInput({
        id: 'w-value', label: `Weight in ${unit}`,
        placeholder: last ? num(weightIn(last, unit), 1) : '0',
        onInput: (n) => { value = n; },
      });
      input.classList.add('big-input');
      return h('div', { class: 'form' },
        h('div', { class: 'big-entry' },
          input,
          segmented({
            id: 'w-unit', label: 'Weight unit', value: unit,
            options: [{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }],
            onChange: (v) => { unit = v; input.setAttribute('aria-label', `Weight in ${v}`); if (last) input.placeholder = num(weightIn(last, v), 1); },
          })),
        group({},
          row('Date', h('input', {
            id: 'w-date', class: 'date-input', type: 'date', value: day, max: localInputValue(Date.now(), true),
            onchange: (e) => { day = e.target.value || day; },
          }), { id: 'w-date' })),
        h('div', { class: 'sheet-actions' },
          button('Save', () => {
            const min = unit === 'kg' ? 20 : 45;
            const max = unit === 'kg' ? 350 : 770;
            if (!(value >= min && value <= max)) {
              input.focus();
              toast(`Enter a weight between ${min} and ${max} ${unit}.`, { tone: 'error' });
              return;
            }
            const today = localInputValue(Date.now(), true);
            const at = day === today ? new Date() : new Date(`${day}T12:00`);
            const rec = { id: uid(), at: at.toISOString(), value, unit, updatedAt: new Date().toISOString() };
            const ok = app.commit((st) => {
              st.weights.push(rec);
              st.settings.weightUnit = unit;
            });
            close();
            app.afterSave(ok, `Logged ${num(value, 1)} ${unit}`, () => {
              app.commit((st) => {
                st.weights = st.weights.filter((x) => x.id !== rec.id);
                st.deleted.weights.push(rec.id);
              });
            });
          }, { id: 'w-save' })));
    },
  });
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

export function safetySheet() {
  sheet({
    title: 'Warning Signs',
    build: () => h('div', { class: 'form reading' },
      RED_FLAGS.map((g) => group({ header: g.title, cls: g.urgent ? 'group-urgent' : '' },
        h('ul', { class: 'plain-list' }, g.items.map((t) => h('li', {}, t)))))),
  });
}

export function handlingSheet() {
  sheet({
    title: 'Safe Handling',
    build: () => h('div', { class: 'form reading' },
      group({}, h('ul', { class: 'plain-list' }, HANDLING.map((t) => h('li', {}, t))))),
  });
}
