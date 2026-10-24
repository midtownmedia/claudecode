import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const pub = new URL('../public/', import.meta.url).pathname;

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [relative(pub, p)];
  });
}

test('every front-end module parses', () => {
  for (const f of walk(join(pub, 'js'))) execFileSync(process.execPath, ['--check', join(pub, f)]);
});

test('the offline cache lists exactly the shell files that ship', () => {
  const sw = readFileSync(join(pub, 'sw.js'), 'utf8');
  const list = [...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const shipped = walk(pub).filter((f) => f !== 'sw.js').sort();
  assert.deepEqual(list.filter((f) => f !== './').sort(), shipped);
  assert.match(sw, /\/api\//, 'the worker knows to leave the API alone');
});

test('the manifest points at icons that exist and installs standalone', () => {
  const m = JSON.parse(readFileSync(join(pub, 'manifest.webmanifest'), 'utf8'));
  for (const i of m.icons) assert.ok(statSync(join(pub, i.src)).size > 0, i.src);
  assert.equal(m.display, 'standalone');
});

test('the shell wires up the app, the worker and the manifest', () => {
  const html = readFileSync(join(pub, 'index.html'), 'utf8');
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /js\/app\.js/);
  assert.match(html, /viewport-fit=cover/);
});
