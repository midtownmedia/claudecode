/**
 * The syringe, drawn to the mark.
 *
 * For people who find the arithmetic hard, the picture is the answer and the
 * number is the footnote. The scale is drawn last: the plunger rod is opaque,
 * and drawn over the marks it would hide most of them on a small draw.
 */

import { s } from './ui.js';

export function syringeSvg({ units, capacity = 100, tone = 'ok' }) {
  const W = 600, H = 132;
  const x0 = 78, x1 = 500;             // barrel, zero mark to full mark
  const y = 34, bh = 50;               // barrel top and height
  const span = x1 - x0;
  const val = Number.isFinite(units) ? units : 0;
  const frac = Math.max(0, Math.min(1, val / capacity));
  const fx = x0 + span * frac;
  const over = val > capacity;

  const svg = s('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: `syringe tone-${over ? 'danger' : tone}`,
    role: 'img',
    'aria-label': Number.isFinite(units)
      ? `Syringe filled to ${units} of ${capacity} units`
      : 'Empty syringe',
  });

  const mid = y + bh / 2;
  // Needle and hub.
  svg.append(s('line', { x1: 6, y1: mid, x2: x0 - 22, y2: mid, class: 'sy-needle' }));
  svg.append(s('path', { d: `M ${x0 - 24} ${mid - 7} H ${x0 - 4} V ${mid + 7} H ${x0 - 24} Z`, class: 'sy-hub' }));
  svg.append(s('path', { d: `M ${x0 - 6} ${mid - 13} H ${x0} V ${mid + 13} H ${x0 - 6} Z`, class: 'sy-hub' }));

  // Barrel.
  svg.append(s('rect', { x: x0, y, width: span, height: bh, rx: 10, class: 'sy-barrel' }));

  // Liquid.
  if (frac > 0) {
    svg.append(s('rect', { x: x0 + 1, y: y + 1, width: Math.max(4, fx - x0 - 1), height: bh - 2, rx: 9, class: 'sy-liquid' }));
  }

  // Plunger: rod out past the flange, rubber stopper at the mark.
  svg.append(s('rect', { x: fx + 8, y: mid - 7, width: Math.max(0, W - 28 - fx - 8), height: 14, rx: 3, class: 'sy-rod' }));
  svg.append(s('rect', { x: W - 30, y: y - 6, width: 12, height: bh + 12, rx: 4, class: 'sy-thumb' }));
  svg.append(s('rect', { x: x1 + 2, y: y - 12, width: 8, height: bh + 24, rx: 3, class: 'sy-flange' }));
  svg.append(s('rect', { x: fx - 2, y: y + 3, width: 12, height: bh - 6, rx: 3, class: 'sy-stopper' }));

  // Graduations, on top of everything.
  const minor = capacity <= 50 ? 1 : 2;
  const major = capacity <= 50 ? 5 : 10;
  const every = capacity <= 30 ? 5 : 10;
  for (let u = 0; u <= capacity + 1e-9; u += minor) {
    const x = x0 + span * (u / capacity);
    const isMajor = u % major === 0;
    svg.append(s('line', { x1: x, y1: y, x2: x, y2: y + (isMajor ? 16 : 9), class: isMajor ? 'sy-tick sy-tick-major' : 'sy-tick' }));
    if (u > 0 && u % every === 0) {
      svg.append(s('text', { x, y: y + bh + 24, class: 'sy-num', 'text-anchor': 'middle' }, String(u)));
    }
  }

  // Marker at the draw line.
  if (frac > 0) {
    svg.append(s('line', { x1: fx, y1: y - 6, x2: fx, y2: y + bh + 6, class: 'sy-mark' }));
    svg.append(s('path', { d: `M ${fx} ${y - 8} l -8 -12 h 16 z`, class: 'sy-pointer' }));
  }
  return svg;
}
