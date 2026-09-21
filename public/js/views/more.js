/** Everything that is not the daily path, one tap away. */

import { el } from '../ui/dom.js';

const ITEMS = [
  { id: 'protocols', label: 'What I am taking', hint: 'Bottles, doses, how often. Set this up once.' },
  { id: 'log', label: 'History', hint: 'Every dose you have logged, and where you injected it.' },
  { id: 'cost', label: 'What it costs', hint: 'Per dose, per month, per year.' },
  { id: 'order', label: 'Plan an order', hint: 'How many bottles to buy, and what it comes to.' },
  { id: 'reference', label: 'Safety and reference', hint: 'Dose ranges, warning signs, how to handle vials.' },
];

export function moreView(ctx) {
  return el('section', { class: 'view' },
    el('div', { class: 'card' },
      el('h2', {}, 'More'),
      el('div', { class: 'menu' },
        ITEMS.map((item) => el('button', {
          type: 'button', class: 'menu-item', onclick: () => ctx.go(item.id),
        },
          el('span', { class: 'menu-label' }, item.label),
          el('span', { class: 'menu-hint' }, item.hint),
          el('span', { class: 'menu-chev' }, '›'))))));
}
