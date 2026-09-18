/** Tiny DOM helpers. No framework: this app must keep working untouched for years. */

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in node && k !== 'list') node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/**
 * A labelled control.
 *
 * Every form control inside gets a stable key derived from its label, so that
 * focus and the half-typed text can be put back after a re-render. Without it,
 * rebuilding the DOM on each keystroke throws the caret out of the field and
 * you cannot type "12.5" at all. `scope` distinguishes repeated cards that
 * share label text, such as one per protocol.
 */
export function field(label, control, hint, scope = '') {
  const node = el('label', { class: 'field' },
    el('span', { class: 'field-label' }, label),
    control,
    hint ? el('span', { class: 'field-hint' }, hint) : null);

  const controls = node.querySelectorAll('input, select, textarea');
  controls.forEach((c, i) => {
    c.dataset.fkey = `${scope}|${label}|${i}`;
  });
  return node;
}

/**
 * A disclosure whose open state survives a re-render, for the same reason.
 */
export function detailsBox(ctx, key, summaryText, props, ...children) {
  const open = (ctx.ui.open ??= {});
  return el('details', {
    ...props,
    // `open` is set before the listener is attached so restoring it does not
    // immediately fire the handler.
    open: !!open[key],
    ontoggle: (e) => { open[key] = e.target.open; },
  }, el('summary', {}, summaryText), ...children);
}

/** Remember where the caret was, so a re-render can put it back. */
export function captureFocus() {
  const a = document.activeElement;
  if (!a?.dataset?.fkey) return null;
  let sel = null;
  try {
    sel = { start: a.selectionStart, end: a.selectionEnd };
  } catch {
    sel = null; // number inputs refuse selection access in some browsers
  }
  return { fkey: a.dataset.fkey, value: a.value, sel };
}

export function restoreFocus(snap) {
  if (!snap) return;
  let node;
  try {
    node = document.querySelector(`[data-fkey="${CSS.escape(snap.fkey)}"]`);
  } catch {
    return;
  }
  if (!node) return;
  // Put back exactly what was typed. State holds a number, so a half-finished
  // "12." would otherwise come back as "12" and swallow the decimal point.
  if (node.value !== snap.value) node.value = snap.value;
  node.focus({ preventScroll: true });
  if (snap.sel) {
    try {
      node.setSelectionRange(snap.sel.start, snap.sel.end);
    } catch {
      /* not supported on this input type */
    }
  }
}

export function select(options, value, onChange, props = {}) {
  const node = el('select', { ...props, onchange: (e) => onChange(e.target.value) });
  for (const opt of options) {
    const o = typeof opt === 'object' ? opt : { value: opt, label: String(opt) };
    node.append(el('option', { value: o.value, selected: String(o.value) === String(value) }, o.label));
  }
  return node;
}

/**
 * A numeric field, deliberately NOT type="number".
 *
 * A number input sanitises its own value: mid-way through typing "12.5" the
 * browser reports "" for "12.", so the decimal point cannot survive a
 * re-render, and a stray scroll wheel silently changes the dose. A text input
 * with a decimal keypad keeps exactly what was typed and leaves the parsing
 * to us.
 */
export function number(value, onInput, props = {}) {
  const { class: cls, ...rest } = props;
  return el('input', {
    type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: false,
    class: ['num', cls].filter(Boolean).join(' '),
    value: value ?? '', ...rest,
    oninput: (e) => {
      const raw = e.target.value.trim();
      if (raw === '') return onInput(null);
      const n = Number.parseFloat(raw);
      // A half-typed "12." parses to 12, which is what the rest of the app
      // should see; the field keeps showing what was actually typed.
      onInput(Number.isFinite(n) ? n : null);
    },
  });
}

export function banner(level, ...content) {
  return el('div', { class: `banner banner-${level}`, role: level === 'danger' ? 'alert' : 'status' }, ...content);
}

export function warnings(list = []) {
  if (!list.length) return null;
  const order = { danger: 0, warn: 1, info: 2, ok: 3 };
  return el('div', { class: 'warnings' },
    [...list].sort((a, b) => (order[a.level] ?? 9) - (order[b.level] ?? 9))
      .map((w) => banner(w.level, w.message)));
}

export function stat(label, value, sub) {
  return el('div', { class: 'stat' },
    el('div', { class: 'stat-label' }, label),
    el('div', { class: 'stat-value' }, value),
    sub ? el('div', { class: 'stat-sub' }, sub) : null);
}

export function fmtDate(d) {
  if (!d) return '--';
  const date = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(date.getTime())) return '--';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtNum(n, d = 2) {
  if (!Number.isFinite(n)) return '--';
  return String(Number(n.toFixed(d)));
}
