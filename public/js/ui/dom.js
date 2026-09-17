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

export function field(label, control, hint) {
  return el('label', { class: 'field' },
    el('span', { class: 'field-label' }, label),
    control,
    hint ? el('span', { class: 'field-hint' }, hint) : null);
}

export function select(options, value, onChange, props = {}) {
  const node = el('select', { ...props, onchange: (e) => onChange(e.target.value) });
  for (const opt of options) {
    const o = typeof opt === 'object' ? opt : { value: opt, label: String(opt) };
    node.append(el('option', { value: o.value, selected: String(o.value) === String(value) }, o.label));
  }
  return node;
}

export function number(value, onInput, props = {}) {
  return el('input', {
    type: 'number', inputmode: 'decimal', value: value ?? '', ...props,
    oninput: (e) => onInput(e.target.value === '' ? null : Number(e.target.value)),
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
