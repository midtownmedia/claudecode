/** DOM helpers and the few iOS-style pieces every screen shares. */

const SVGNS = 'http://www.w3.org/2000/svg';

function append(node, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    node.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function h(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'value') node.value = v;
    else if (k === 'checked') node.checked = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  append(node, kids);
  return node;
}

export function s(tag, attrs = {}, ...kids) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, String(v));
  append(node, kids);
  return node;
}

export function clear(node) { while (node.firstChild) node.firstChild.remove(); return node; }

const PATHS = {
  calendar: ['M4 6 H20 A1 1 0 0 1 21 7 V19 A2 2 0 0 1 19 21 H5 A2 2 0 0 1 3 19 V7 A1 1 0 0 1 4 6 Z', 'M3 10 H21', 'M8 3 V7', 'M16 3 V7'],
  settings: ['M4 7 H14', 'M18 7 H20', 'M4 17 H6', 'M10 17 H20', 'M16 5 V9', 'M8 15 V19'],
  mic: ['M12 3 A3 3 0 0 1 15 6 V12 A3 3 0 0 1 9 12 V6 A3 3 0 0 1 12 3 Z', 'M6 11 A6 6 0 0 0 18 11', 'M12 17 V21', 'M9 21 H15'],
  stethoscope: ['M6 3 V9 A5 5 0 0 0 16 9 V3', 'M11 14 V16 A4 4 0 0 0 19 16 V13', 'M19 13 A1.5 1.5 0 1 0 19 10 A1.5 1.5 0 1 0 19 13 Z'],
  note: ['M7 3 H14 L19 8 V19 A2 2 0 0 1 17 21 H7 A2 2 0 0 1 5 19 V5 A2 2 0 0 1 7 3 Z', 'M14 3 V8 H19', 'M9 13 H15', 'M9 17 H13'],
  stop: ['M7 7 H17 V17 H7 Z'],
  send: ['M4 12 L20 4 L14 20 L12 13 Z', 'M12 13 L20 4'],
  back: ['M15 5 L8 12 L15 19'],
  chevron: ['M9 6 L15 12 L9 18'],
  refresh: ['M20 12 A8 8 0 1 1 17.5 6.2', 'M20 3 V7.5 H15.5'],
  warn: ['M12 3 L22 20 H2 Z', 'M12 10 V14', 'M12 17 H12.01'],
  check: ['M5 12.5 L10 17 L19 7'],
  close: ['M6 6 L18 18', 'M18 6 L6 18'],
  copy: ['M9 9 H19 V19 H9 Z', 'M15 9 V5 H5 V15 H9'],
  pencil: ['M4 20 L8 19 L19 8 L16 5 L5 16 Z', 'M14 7 L17 10'],
  trash: ['M4 7 H20', 'M9 7 V4 H15 V7', 'M6 7 L7 20 H17 L18 7'],
  sparkle: ['M12 4 L13.5 10.5 L20 12 L13.5 13.5 L12 20 L10.5 13.5 L4 12 L10.5 10.5 Z'],
  keyboard: ['M3 7 H21 V17 H3 Z', 'M7 11 H7.01', 'M11 11 H11.01', 'M15 11 H15.01', 'M7 14 H17'],
  user: ['M12 12 A4 4 0 1 0 12 4 A4 4 0 1 0 12 12 Z', 'M4 21 A8 8 0 0 1 20 21'],
  plus: ['M12 5 V19', 'M5 12 H19'],
};

export function icon(name, cls = 'icon') {
  return s('svg', { viewBox: '0 0 24 24', class: cls, 'aria-hidden': 'true', focusable: 'false' }, (PATHS[name] ?? []).map((d) => s('path', { d })));
}

export function group({ header, footer, cls = '' }, ...rows) {
  return h('section', { class: `group ${cls}` },
    header ? h('h3', { class: 'group-header' }, header) : null,
    h('div', { class: 'group-body' }, rows),
    footer ? h('p', { class: 'group-footer' }, footer) : null);
}

export function row(label, control, { id } = {}) {
  return h('label', { class: 'row', for: id }, h('span', { class: 'row-label' }, label), h('span', { class: 'row-value' }, control));
}

export function navRow({ title, sub, iconName, onClick, trailing }) {
  return h('button', { type: 'button', class: 'row row-nav', onclick: onClick },
    iconName ? h('span', { class: 'row-icon' }, icon(iconName)) : null,
    h('span', { class: 'row-stack' }, h('span', {}, title), sub ? h('span', { class: 'sub' }, sub) : null),
    trailing ?? icon('chevron', 'icon chevron'));
}

export function segmented({ options, value, onChange, label }) {
  const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  const buttons = options.map((o) => h('button', {
    type: 'button', class: 'seg-btn', role: 'radio', 'aria-checked': String(String(o.value) === String(value)),
    onclick: () => { for (const b of buttons) b.setAttribute('aria-checked', String(b === buttons[options.indexOf(o)])); onChange?.(o.value); },
  }, o.label));
  append(wrap, buttons);
  return wrap;
}

export function banner(level, text, action) {
  return h('div', { class: `banner banner-${level}`, role: level === 'danger' ? 'alert' : null },
    h('span', { class: 'banner-dot', 'aria-hidden': 'true' }), h('span', { class: 'banner-text' }, text), action ?? null);
}

export function button(label, onClick, { kind = 'filled', iconName, disabled, cls = '', sub } = {}) {
  return h('button', { type: 'button', class: `btn btn-${kind} ${cls}`, onclick: onClick, disabled },
    iconName ? icon(iconName) : null, h('span', {}, label), sub ? h('small', {}, sub) : null);
}

export function chip(text, tone = '', iconName) {
  return h('span', { class: `chip${tone ? ` chip-${tone}` : ''}` }, iconName ? icon(iconName) : null, text);
}

export function card(title, ...kids) {
  return h('section', { class: 'card' }, title ? h('h3', { class: 'card-title' }, title) : null, kids);
}

export function pageHeader(title, { subtitle, actions = [] } = {}) {
  return h('header', { class: 'page-head' },
    h('div', { class: 'page-titles' }, subtitle ? h('p', { class: 'page-sub' }, subtitle) : null, h('h1', { class: 'page-title' }, title)),
    actions.length ? h('div', { class: 'page-actions' }, actions) : null);
}

export function roundButton(iconName, label, onClick) {
  return h('button', { type: 'button', class: 'round-btn', 'aria-label': label, title: label, onclick: onClick }, icon(iconName));
}

let openSheets = 0;

export function sheet({ title, build, onClose, focus = null }) {
  const layer = h('div', { class: 'sheet-layer' });
  const close = () => {
    layer.classList.add('closing');
    document.removeEventListener('keydown', onKey);
    const done = () => { layer.remove(); openSheets -= 1; if (!openSheets) document.body.classList.remove('has-sheet'); onClose?.(); };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) done(); else setTimeout(done, 220);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' },
    h('div', { class: 'sheet-grabber', 'aria-hidden': 'true' }),
    h('header', { class: 'sheet-head' }, h('button', { type: 'button', class: 'sheet-cancel linkish', onclick: close }, 'Close'), h('h2', { class: 'sheet-title' }, title), h('span')),
    h('div', { class: 'sheet-body' }, build(close)));
  layer.append(h('div', { class: 'sheet-scrim', onclick: close }), panel);
  document.body.append(layer);
  document.body.classList.add('has-sheet');
  openSheets += 1;
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => { layer.classList.add('open'); (focus && panel.querySelector(focus) || panel).focus({ preventScroll: true }); });
  return { close, panel };
}

export function ask({ title, message, actions }) {
  return new Promise((resolve) => {
    const layer = h('div', { class: 'alert-layer' });
    const finish = (v) => { layer.classList.add('closing'); setTimeout(() => layer.remove(), 160); resolve(v); };
    const btns = actions.map((a) => h('button', { type: 'button', class: `alert-btn${a.style ? ` alert-${a.style}` : ''}`, onclick: () => finish(a.value) }, a.label));
    layer.append(h('div', { class: 'alert', role: 'alertdialog', 'aria-label': title },
      h('div', { class: 'alert-text' }, h('h2', {}, title), message ? h('p', {}, message) : null),
      h('div', { class: `alert-actions${actions.length > 2 ? ' stacked' : ''}` }, btns)));
    document.body.append(layer);
    requestAnimationFrame(() => { layer.classList.add('open'); (btns.find((b) => b.classList.contains('alert-bold')) ?? btns.at(-1)).focus(); });
  });
}

let toastTimer = null;
export function toast(text, { actionLabel, onAction, ms = 4500, tone } = {}) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const t = h('div', { class: `toast${tone ? ` toast-${tone}` : ''}`, role: 'status' },
    h('span', { class: 'toast-icon' }, icon(tone === 'error' ? 'warn' : 'check')), h('span', { class: 'toast-text' }, text),
    actionLabel ? h('button', { type: 'button', class: 'toast-action', onclick: () => { t.remove(); onAction?.(); } }, actionLabel) : null);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  toastTimer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

export function time(t) { return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
export function dateWord(d = new Date()) { return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }); }
export function isoDate(d = new Date()) { const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return x.toISOString().slice(0, 10); }
export function mmss(ms) { const s = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
export function relativeAgo(t, now = Date.now()) {
  const mins = Math.round((now - new Date(t).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs} hr ago` : `${Math.round(hrs / 24)} d ago`;
}
