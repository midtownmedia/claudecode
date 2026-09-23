/**
 * Progress charts: one series each, one axis each.
 *
 * Weight and dose are never drawn on the same axes. Their scales have nothing
 * to do with each other, so sharing a plot would invent a relationship. They
 * sit one above the other on the same time range instead.
 */

import { h, s, clear } from './ui.js';

function niceStep(range, count) {
  const raw = range / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

export function niceTicks(min, max, count = 4) {
  let lo = min;
  let hi = max;
  if (!(hi > lo)) {
    const pad = Math.abs(lo) > 0 ? Math.abs(lo) * 0.05 : 1;
    lo -= pad;
    hi += pad;
  }
  const step = niceStep(hi - lo, count);
  const start = Math.floor(lo / step + 1e-9) * step;
  const end = Math.ceil(hi / step - 1e-9) * step;
  const out = [];
  for (let v = start; v <= end + step / 2; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

/**
 * @param {HTMLElement} host
 * @param {object} spec
 *   points   [{ t, v }] sorted by t
 *   kind     'line' (area + line) or 'step' (dose held until it changes)
 *   tone     css class suffix that sets the series colour
 *   domain   [t0, t1]
 *   zero     start the y axis at zero
 *   fmtY     axis label for a value
 *   tip      (point) => [strong, secondary]
 *   label    accessible summary
 */
export function mountChart(host, spec) {
  const wrap = h('div', { class: `chart chart-${spec.tone}`, tabindex: '0', role: 'group', 'aria-label': spec.label });
  const tipEl = h('div', { class: 'chart-tip', hidden: true });
  host.append(wrap);

  let geom = null;
  let active = -1;

  const draw = () => {
    const width = Math.max(240, Math.round(wrap.clientWidth || host.clientWidth || 320));
    const height = spec.height ?? 168;
    geom = layout(spec, width, height);
    clear(wrap);
    wrap.append(render(spec, geom), tipEl);
    if (active >= 0) show(active);
  };

  const show = (i) => {
    if (!geom || i < 0 || i >= spec.points.length) return hide();
    active = i;
    const p = spec.points[i];
    const x = geom.x(p.t);
    const y = geom.y(p.v);
    const svg = wrap.querySelector('svg');
    svg.querySelector('.chart-cross')?.remove();
    svg.append(s('g', { class: 'chart-cross' },
      s('line', { x1: x, y1: geom.top, x2: x, y2: geom.bottom, class: 'chart-cross-line' }),
      s('circle', { cx: x, cy: y, r: 5, class: 'chart-dot chart-dot-hi' })));
    const [strong, sub] = spec.tip(p);
    clear(tipEl).append(h('strong', {}, strong), h('span', {}, sub));
    tipEl.hidden = false;
    const tw = tipEl.offsetWidth || 120;
    tipEl.style.left = `${Math.max(0, Math.min(geom.width - tw, x - tw / 2))}px`;
  };

  const hide = () => {
    active = -1;
    tipEl.hidden = true;
    wrap.querySelector('.chart-cross')?.remove();
  };

  const nearest = (clientX) => {
    const r = wrap.getBoundingClientRect();
    const px = clientX - r.left;
    let best = -1;
    let bestD = Infinity;
    spec.points.forEach((p, i) => {
      const d = Math.abs(geom.x(p.t) - px);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };

  wrap.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
  wrap.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
  wrap.addEventListener('pointerleave', hide);
  wrap.addEventListener('blur', hide);
  wrap.addEventListener('keydown', (e) => {
    const n = spec.points.length;
    if (!n) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(active < 0 ? n - 1 : Math.max(0, active - 1)); }
    if (e.key === 'ArrowRight') { e.preventDefault(); show(active < 0 ? n - 1 : Math.min(n - 1, active + 1)); }
    if (e.key === 'Escape') hide();
  });

  draw();
  if (typeof ResizeObserver === 'function') {
    let last = wrap.clientWidth;
    const ro = new ResizeObserver(() => {
      if (!wrap.isConnected) { ro.disconnect(); return; }
      if (Math.abs(wrap.clientWidth - last) > 1) {
        last = wrap.clientWidth;
        draw();
      }
    });
    ro.observe(wrap);
  }
  return wrap;
}

function layout(spec, width, height) {
  const vals = spec.points.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const ticks = spec.zero ? niceTicks(0, max * 1.08, 3) : niceTicks(min, max, 3);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const labelW = Math.max(...ticks.map((t) => spec.fmtY(t).length)) * 7 + 10;
  const left = 4;
  const right = width - labelW;
  const top = 10;
  const bottom = height - 26;
  const [t0, t1] = spec.domain;
  const span = Math.max(1, t1 - t0);
  return {
    width, height, left, right, top, bottom, ticks,
    x: (t) => left + ((t - t0) / span) * (right - left),
    y: (v) => bottom - ((v - lo) / (hi - lo || 1)) * (bottom - top),
  };
}

function dateTicks([t0, t1], width) {
  const n = width < 420 ? 3 : 4;
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(t0 + ((t1 - t0) * i) / (n - 1));
  return out;
}

function render(spec, g) {
  const svg = s('svg', {
    width: g.width, height: g.height, viewBox: `0 0 ${g.width} ${g.height}`,
    class: 'chart-svg', role: 'img', 'aria-label': spec.label,
  });

  for (const t of g.ticks) {
    const y = g.y(t);
    svg.append(s('line', { x1: g.left, y1: y, x2: g.right, y2: y, class: 'chart-grid' }));
    svg.append(s('text', { x: g.width - 2, y: y + 4, class: 'chart-axis', 'text-anchor': 'end' }, spec.fmtY(t)));
  }

  const dts = dateTicks(spec.domain, g.width);
  dts.forEach((t, i) => {
    const anchor = i === 0 ? 'start' : i === dts.length - 1 ? 'end' : 'middle';
    svg.append(s('text', { x: g.x(t), y: g.height - 6, class: 'chart-axis', 'text-anchor': anchor },
      new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })));
  });

  const pts = spec.points.map((p) => [g.x(p.t), g.y(p.v)]);
  if (!pts.length) return svg;

  let line = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i += 1) {
    line += spec.kind === 'step'
      ? ` H ${pts[i][0]} V ${pts[i][1]}`
      : ` L ${pts[i][0]} ${pts[i][1]}`;
  }

  if (spec.kind === 'line' && pts.length > 1) {
    const area = `${line} L ${pts[pts.length - 1][0]} ${g.bottom} L ${pts[0][0]} ${g.bottom} Z`;
    svg.append(s('path', { d: area, class: 'chart-area' }));
  }
  if (pts.length > 1) svg.append(s('path', { d: line, class: 'chart-line' }));

  if (spec.kind === 'step') {
    // One dot per logged dose. Thin them when there are too many to separate.
    const room = (g.right - g.left) / pts.length;
    const dense = room < 6;
    for (const [x, y] of pts) {
      svg.append(s('circle', { cx: x, cy: y, r: dense ? 1.75 : 3.5, class: dense ? 'chart-dot chart-dot-dense' : 'chart-dot' }));
    }
  }
  const [ex, ey] = pts[pts.length - 1];
  svg.append(s('circle', { cx: ex, cy: ey, r: 4.5, class: 'chart-dot chart-dot-end' }));
  return svg;
}
