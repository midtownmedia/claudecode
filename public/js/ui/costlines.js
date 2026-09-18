/**
 * The per-dose price, shown as its parts.
 *
 * A single "cost per dose" figure is easy to disbelieve. Splitting it into the
 * share of the bottle, the water and the syringe makes it checkable, and makes
 * it obvious that the bottle is almost all of it.
 */
import { el } from './dom.js';
import { formatMoneyExact } from '../lib/cost.js';

export function costLines({ breakdown, currency = 'USD', dosesPerVial, strength, strengthUnit = 'mg', diluentMl }) {
  const money = (v) => formatMoneyExact(v, currency);
  if (!breakdown || !Number.isFinite(breakdown.perDose)) return null;

  const rows = [
    {
      label: `Bottle${Number.isFinite(strength) ? ` (${strength} ${strengthUnit})` : ''}`,
      detail: Number.isFinite(dosesPerVial) && dosesPerVial > 0
        ? `${money(breakdown.landedVial)} split over ${dosesPerVial} doses`
        : null,
      value: breakdown.vialSharePerDose,
    },
    {
      label: 'Bac water',
      detail: Number.isFinite(diluentMl) && breakdown.bacPerVial > 0
        ? `${money(breakdown.bacPerVial)} of water per bottle, split over ${dosesPerVial}`
        : 'not priced',
      value: breakdown.bacSharePerDose,
    },
    { label: 'Syringe', detail: breakdown.syringeSharePerDose > 0 ? 'one per dose' : 'not priced', value: breakdown.syringeSharePerDose },
    { label: 'Swabs and sundries', detail: null, value: breakdown.otherPerDose, hideIfZero: true },
  ].filter((r) => !(r.hideIfZero && !(r.value > 0)));

  return el('table', { class: 'table costlines' },
    el('tbody', {},
      rows.map((r) => el('tr', { class: r.value > 0 ? '' : 'costline-zero' },
        el('td', {},
          el('div', {}, r.label),
          r.detail ? el('div', { class: 'muted' }, r.detail) : null),
        el('td', { class: 'costline-value' }, Number.isFinite(r.value) ? money(r.value) : '--'))),
      el('tr', { class: 'costline-total' },
        el('td', {}, 'Per dose'),
        el('td', { class: 'costline-value' }, money(breakdown.perDose)))));
}
