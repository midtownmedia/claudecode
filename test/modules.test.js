import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The browser is the only place this app runs, so a broken import would
 * otherwise only show up as a blank page. Importing every module here catches
 * a bad path or a missing export before it ships.
 */
const ROOT = new URL('../public/js/', import.meta.url);

function walk(dir, base = '') {
  const out = [];
  for (const entry of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...walk(`${dir}${entry.name}/`, `${base}${entry.name}/`));
    else if (entry.name.endsWith('.js')) out.push(`${dir}${entry.name}`);
  }
  return out;
}

test('every module imports cleanly', async () => {
  const files = walk('').filter((f) => f !== 'main.js'); // main.js touches the DOM on load
  assert.ok(files.length >= 12, `expected the full module set, found ${files.length}`);
  for (const f of files) {
    const mod = await import(new URL(f, ROOT));
    assert.ok(Object.keys(mod).length > 0, `${f} exports nothing`);
  }
});

test('every view exports a render function', async () => {
  for (const f of walk('views/')) {
    const mod = await import(new URL(f, ROOT));
    const fn = Object.values(mod).find((v) => typeof v === 'function');
    assert.ok(fn, `${f} has no exported view function`);
  }
});
