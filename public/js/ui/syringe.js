/**
 * A drawn syringe with the plunger at the right mark.
 *
 * For anyone who finds the arithmetic hard, the picture is the answer and the
 * number is the footnote. Worth more than any amount of explanatory text.
 */
import { el } from './dom.js';

const SVG = 'http://www.w3.org/2000/svg';

function s(tag, attrs = {}) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, String(v));
  return node;
}

/**
 * @param {number} units      where to draw the plunger
 * @param {object} syringe    { capacityUnits, label }
 * @param {string} caption    text under the barrel
 * @param {string} tone       'ok' | 'warn' | 'danger'
 */
export function syringeSvg({ units, syringe, caption, tone = 'ok' }) {
  const cap = syringe?.capacityUnits ?? 100;
  // The viewBox is wider than the barrel so the last number has room to sit
  // under the final mark without being clipped by the edge.
  const W = 548, H = 130;
  const x0 = 46, x1 = 470, barrelY = 34, barrelH = 40;
  const span = x1 - x0;
  const frac = Math.max(0, Math.min(1, (units ?? 0) / cap));
  const fillX = x0 + span * frac;

  const svg = s('svg', {
    viewBox: `0 0 ${W} ${H}`, class: `syringe syringe-${tone}`,
    role: 'img', 'aria-label': `Syringe drawn to ${units} of ${cap} units`,
  });

  // Needle and hub.
  svg.append(s('line', { x1: 8, y1: barrelY + barrelH / 2, x2: x0 - 12, y2: barrelY + barrelH / 2, class: 'sy-needle' }));
  svg.append(s('rect', { x: x0 - 12, y: barrelY + 10, width: 12, height: barrelH - 20, class: 'sy-hub' }));

  // Barrel.
  svg.append(s('rect', { x: x0, y: barrelY, width: span, height: barrelH, rx: 4, class: 'sy-barrel' }));

  // Liquid.
  if (frac > 0) {
    svg.append(s('rect', { x: x0, y: barrelY, width: Math.max(2, fillX - x0), height: barrelH, rx: 4, class: 'sy-fill' }));
  }

  // Graduations. Long marks and printed numbers are deliberately separate: on a
  // 100 unit barrel at phone width, numbering every long mark crowds them into
  // an unreadable row, so every other one carries the number.
  const majorStep = cap <= 30 ? 5 : 10;
  const minorStep = cap <= 30 ? 1 : cap <= 50 ? 2 : 5;
  const labelStep = cap >= 100 ? 20 : majorStep;
  for (let u = 0; u <= cap + 1e-9; u += minorStep) {
    const x = x0 + span * (u / cap);
    const major = Math.abs(u % majorStep) < 1e-9;
    const labelled = Math.abs(u % labelStep) < 1e-9;
    svg.append(s('line', {
      x1: x, y1: barrelY, x2: x, y2: barrelY + (major ? 14 : 8), class: major ? 'sy-tick-major' : 'sy-tick',
    }));
    // The zero mark is never in doubt and its label collides with the hub.
    if (labelled && u > 0) {
      const t = s('text', { x, y: barrelY + 28, class: 'sy-tick-label', 'text-anchor': 'middle' });
      t.textContent = String(u);
      svg.append(t);
    }
  }

  // Plunger.
  svg.append(s('rect', { x: fillX - 2, y: barrelY - 6, width: 4, height: barrelH + 12, class: 'sy-plunger' }));
  svg.append(s('rect', { x: fillX, y: barrelY + 12, width: Math.max(0, x1 - fillX), height: barrelH - 24, class: 'sy-rod' }));

  // Pointer and value.
  svg.append(s('path', {
    d: `M ${fillX} ${barrelY - 10} l -7 -11 l 14 0 z`, class: 'sy-pointer',
  }));
  const label = s('text', {
    x: Math.max(x0 + 26, Math.min(fillX, x1 - 26)), y: barrelY - 24,
    class: 'sy-value', 'text-anchor': 'middle',
  });
  label.textContent = Number.isFinite(units) ? `${Number(units.toFixed(2))} units` : '--';
  svg.append(label);

  if (caption) {
    const c = s('text', { x: W / 2, y: H - 10, class: 'sy-caption', 'text-anchor': 'middle' });
    c.textContent = caption;
    svg.append(c);
  }
  return svg;
}

export function syringeCard(opts) {
  return el('div', { class: 'syringe-wrap' }, syringeSvg(opts));
}
