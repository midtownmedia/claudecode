/** Small DOM helpers and the few iOS-style pieces every screen shares. */

const SVGNS = 'http://www.w3.org/2000/svg';

function append(node, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    node.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

/** h('div', { class, onclick, ...attrs }, ...children) */
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

export function clear(node) {
  while (node.firstChild) node.firstChild.remove();
  return node;
}

/* ------------------------------------------------------------------ *
 * Icons, drawn on a 24 grid with a 2px stroke
 * ------------------------------------------------------------------ */

const PATHS = {
  today: ['M4 20 L10.5 13.5', 'M8.5 11.5 L12.5 15.5', 'M10.5 9.5 L17 3 L21 7 L14.5 13.5 Z', 'M15 5 L19 9', 'M13 7 L14.5 8.5', 'M11 9 L12.5 10.5'],
  calc: ['M6 3 H18 A2 2 0 0 1 20 5 V19 A2 2 0 0 1 18 21 H6 A2 2 0 0 1 4 19 V5 A2 2 0 0 1 6 3 Z', 'M8 7 H16', 'M8 12 H8.01', 'M12 12 H12.01', 'M16 12 H16.01', 'M8 16 H8.01', 'M12 16 H12.01', 'M16 16 H16.01'],
  progress: ['M3 20 H21', 'M4 16 L9 10 L13 13 L20 5', 'M16 5 H20 V9'],
  settings: ['M4 7 H14', 'M18 7 H20', 'M4 17 H6', 'M10 17 H20', 'M16 5 V9', 'M8 15 V19'],
  plus: ['M12 5 V19', 'M5 12 H19'],
  chevron: ['M9 6 L15 12 L9 18'],
  check: ['M5 12.5 L10 17 L19 7'],
  file: ['M7 3 H14 L19 8 V19 A2 2 0 0 1 17 21 H7 A2 2 0 0 1 5 19 V5 A2 2 0 0 1 7 3 Z', 'M14 3 V8 H19'],
  upload: ['M12 16 V4', 'M7 9 L12 4 L17 9', 'M5 20 H19'],
  download: ['M12 4 V16', 'M7 11 L12 16 L17 11', 'M5 20 H19'],
  scale: ['M5 4 H19 A2 2 0 0 1 21 6 V18 A2 2 0 0 1 19 20 H5 A2 2 0 0 1 3 18 V6 A2 2 0 0 1 5 4 Z', 'M8.5 10 A4.5 4.5 0 0 1 15.5 10', 'M12 10 L13.5 8'],
  shield: ['M12 3 L19 6 V11 C19 15.5 16 19 12 21 C8 19 5 15.5 5 11 V6 Z', 'M12 8 V12', 'M12 15.5 H12.01'],
  hand: ['M12 21 C8 21 6 18 6 15 V9 A1.5 1.5 0 0 1 9 9 V12', 'M9 12 V5 A1.5 1.5 0 0 1 12 5 V11', 'M12 11 V4 A1.5 1.5 0 0 1 15 4 V11', 'M15 11 V6 A1.5 1.5 0 0 1 18 6 V15 C18 18 16 21 12 21'],
  trash: ['M4 7 H20', 'M9 7 V4 H15 V7', 'M6 7 L7 20 H17 L18 7', 'M10 11 V16', 'M14 11 V16'],
  link: ['M10 14 L14 10', 'M8.5 11.5 L6.5 13.5 A3.5 3.5 0 0 0 11.5 18.5 L13.5 16.5', 'M15.5 12.5 L17.5 10.5 A3.5 3.5 0 0 0 12.5 5.5 L10.5 7.5'],
  bottle: ['M9 3 H15', 'M10 3 V7 L7 10 V19 A2 2 0 0 0 9 21 H15 A2 2 0 0 0 17 19 V10 L14 7 V3', 'M7 14 H17'],
  close: ['M6 6 L18 18', 'M18 6 L6 18'],
  dollar: ['M12 3 V21', 'M16.5 7.5 C16 6 14.4 5 12 5 C9.6 5 7.5 6.2 7.5 8.4 C7.5 12.6 16.5 10.9 16.5 15.6 C16.5 17.7 14.5 19 12 19 C9.3 19 7.8 17.8 7.3 16.2'],
  sparkle: ['M12 4 L13.5 10.5 L20 12 L13.5 13.5 L12 20 L10.5 13.5 L4 12 L10.5 10.5 Z'],
};

export function icon(name, cls = 'icon') {
  return s('svg', { viewBox: '0 0 24 24', class: cls, 'aria-hidden': 'true', focusable: 'false' },
    (PATHS[name] ?? []).map((d) => s('path', { d })));
}

/* ------------------------------------------------------------------ *
 * Numbers typed by people
 * ------------------------------------------------------------------ */

/**
 * `type="number"` reports "" halfway through typing "12.", which eats the
 * decimal point. Text with a decimal keypad, parsed here, does not.
 */
export function parseNum(text) {
  const t = String(text ?? '').trim().replace(',', '.');
  if (!t) return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function decimalInput({ id, value, placeholder = '', onInput, label }) {
  return h('input', {
    id, class: 'num-input', type: 'text', inputmode: 'decimal', autocomplete: 'off',
    enterkeyhint: 'done', spellcheck: 'false', placeholder,
    value: Number.isFinite(value) ? String(value) : (value ?? ''),
    'aria-label': label,
    oninput: (e) => onInput?.(parseNum(e.target.value), e.target.value),
  });
}

/* ------------------------------------------------------------------ *
 * Grouped list rows
 * ------------------------------------------------------------------ */

export function group({ header, footer, cls = '' }, ...rows) {
  return h('section', { class: `group ${cls}` },
    header ? h('h3', { class: 'group-header' }, header) : null,
    h('div', { class: 'group-body' }, rows),
    footer ? h('p', { class: 'group-footer' }, footer) : null);
}

/** A form row: label on the left, control on the right. */
export function row(label, control, { id, suffix } = {}) {
  return h('label', { class: 'row', for: id },
    h('span', { class: 'row-label' }, label),
    h('span', { class: 'row-value' }, control, suffix ? h('span', { class: 'row-suffix' }, suffix) : null));
}

/** A tappable row that goes somewhere. */
export function navRow({ title, detail, iconName, tone, onClick }) {
  return h('button', { type: 'button', class: `row row-nav${tone ? ` tone-${tone}` : ''}`, onclick: onClick },
    iconName ? h('span', { class: 'row-icon' }, icon(iconName)) : null,
    h('span', { class: 'row-label' }, title),
    detail ? h('span', { class: 'row-detail' }, detail) : null,
    tone === 'destructive' ? null : icon('chevron', 'icon chevron'));
}

export function select({ id, options, value, onChange, label }) {
  return h('span', { class: 'select-wrap' },
    h('select', {
      id, class: 'select', 'aria-label': label,
      onchange: (e) => onChange?.(e.target.value),
    }, options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label))),
    icon('chevron', 'icon select-chevron'));
}

/** iOS segmented control. */
export function segmented({ id, options, value, onChange, label, small = false }) {
  const wrap = h('div', { class: `seg${small ? ' seg-small' : ''}`, role: 'radiogroup', 'aria-label': label, id });
  const buttons = options.map((o) => h('button', {
    type: 'button', class: 'seg-btn', role: 'radio',
    'aria-checked': String(String(o.value) === String(value)),
    onclick: () => {
      for (const b of buttons) b.setAttribute('aria-checked', String(b === btnFor(o)));
      onChange?.(o.value);
    },
  }, o.label));
  const btnFor = (o) => buttons[options.indexOf(o)];
  append(wrap, buttons);
  return wrap;
}

export function banner(level, text, action) {
  return h('div', { class: `banner banner-${level}`, role: level === 'danger' ? 'alert' : null },
    h('span', { class: 'banner-dot', 'aria-hidden': 'true' }),
    h('span', { class: 'banner-text' }, text),
    action ?? null);
}

export function button(label, onClick, { kind = 'filled', id, iconName, disabled } = {}) {
  return h('button', { type: 'button', class: `btn btn-${kind}`, id, onclick: onClick, disabled },
    iconName ? icon(iconName) : null, h('span', {}, label));
}

/* ------------------------------------------------------------------ *
 * Sheets, alerts and toasts
 * ------------------------------------------------------------------ */

let openSheets = 0;

/**
 * A sheet that slides up on a phone and sits centred on a larger screen.
 * `build(close)` returns the content.
 */
export function sheet({ title, build, onClose, wide = false, focus = null }) {
  const layer = h('div', { class: 'sheet-layer' });
  const close = () => {
    layer.classList.add('closing');
    document.removeEventListener('keydown', onKey);
    const done = () => {
      layer.remove();
      openSheets -= 1;
      if (!openSheets) document.body.classList.remove('has-sheet');
      onClose?.();
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) done();
    else setTimeout(done, 220);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  const panel = h('div', { class: `sheet${wide ? ' sheet-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' },
    h('div', { class: 'sheet-grabber', 'aria-hidden': 'true' }),
    h('header', { class: 'sheet-head' },
      h('button', { type: 'button', class: 'sheet-cancel linkish', onclick: close }, 'Cancel'),
      h('h2', { class: 'sheet-title' }, title),
      h('span', { class: 'sheet-spacer' })),
    h('div', { class: 'sheet-body' }, build(close)));

  layer.append(h('div', { class: 'sheet-scrim', onclick: close }), panel);
  document.body.append(layer);
  document.body.classList.add('has-sheet');
  openSheets += 1;
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => {
    layer.classList.add('open');
    // Focusing a field on a phone throws the keyboard up over the sheet, so
    // only do it where typing is the whole point of the sheet.
    (focus && panel.querySelector(focus) || panel).focus({ preventScroll: true });
  });
  return { close, panel };
}

/**
 * An iOS alert. `alert()` and `confirm()` are blocked in embedded previews and
 * look foreign everywhere else, so every question is asked in the page.
 */
export function ask({ title, message, actions }) {
  return new Promise((resolve) => {
    const layer = h('div', { class: 'alert-layer' });
    const finish = (v) => {
      layer.classList.add('closing');
      setTimeout(() => layer.remove(), 160);
      resolve(v);
    };
    const btns = actions.map((a) => h('button', {
      type: 'button', class: `alert-btn${a.style ? ` alert-${a.style}` : ''}`,
      onclick: () => finish(a.value),
    }, a.label));
    layer.append(h('div', { class: 'alert', role: 'alertdialog', 'aria-label': title },
      h('div', { class: 'alert-text' },
        h('h2', {}, title),
        message ? h('p', {}, message) : null),
      h('div', { class: `alert-actions${actions.length > 2 ? ' stacked' : ''}` }, btns)));
    document.body.append(layer);
    requestAnimationFrame(() => {
      layer.classList.add('open');
      (btns.find((b) => b.classList.contains('alert-bold')) ?? btns[btns.length - 1]).focus();
    });
  });
}

let toastTimer = null;

export function toast(text, { actionLabel, onAction, ms = 4500, tone } = {}) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const t = h('div', { class: `toast${tone ? ` toast-${tone}` : ''}`, role: 'status' },
    h('span', { class: 'toast-icon' }, icon(tone === 'error' ? 'close' : 'check')),
    h('span', { class: 'toast-text' }, text),
    actionLabel
      ? h('button', { type: 'button', class: 'toast-action', onclick: () => { t.remove(); onAction?.(); } }, actionLabel)
      : null);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

const DAY = 86400000;

function dayStart(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayWord(t, now = Date.now()) {
  const diff = Math.round((dayStart(t) - dayStart(now)) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return new Date(t).toLocaleDateString(undefined, { weekday: 'long' });
  const sameYear = new Date(t).getFullYear() === new Date(now).getFullYear();
  return new Date(t).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric',
  });
}

export function shortDate(t) {
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function time(t) {
  return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Value for <input type="datetime-local"> in local time. */
export function localInputValue(t = Date.now(), dateOnly = false) {
  const d = new Date(t);
  const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
  return dateOnly ? iso.slice(0, 10) : iso.slice(0, 16);
}

export function relativeAgo(t, now = Date.now()) {
  const mins = Math.round((now - new Date(t).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/* ------------------------------------------------------------------ *
 * Page chrome
 * ------------------------------------------------------------------ */

/** Large title, like the top of an iOS screen. */
export function pageHeader(title, { subtitle, actions = [] } = {}) {
  return h('header', { class: 'page-head' },
    h('div', { class: 'page-titles' },
      subtitle ? h('p', { class: 'page-sub' }, subtitle) : null,
      h('h1', { class: 'page-title' }, title)),
    actions.length ? h('div', { class: 'page-actions' }, actions) : null);
}

/** Round icon button for the top right of a page. */
export function roundButton(iconName, label, onClick) {
  return h('button', { type: 'button', class: 'round-btn', 'aria-label': label, title: label, onclick: onClick },
    icon(iconName));
}
