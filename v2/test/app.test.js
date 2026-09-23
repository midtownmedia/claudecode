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

test('every screen module loads and its imports resolve', async () => {
  for (const f of walk(join(pub, 'js')).filter((f) => f !== 'js/app.js')) {
    await import(new URL(`../public/${f}`, import.meta.url));
  }
  execFileSync(process.execPath, ['--check', join(pub, 'js/app.js')]);
});

test('the offline cache lists exactly the files that ship', () => {
  const sw = readFileSync(join(pub, 'sw.js'), 'utf8');
  const list = [...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const shipped = walk(pub).filter((f) => f !== 'sw.js').sort();
  assert.deepEqual(list.filter((f) => f !== './').sort(), shipped);
});

test('the manifest points at icons that exist', () => {
  const m = JSON.parse(readFileSync(join(pub, 'manifest.webmanifest'), 'utf8'));
  for (const i of m.icons) assert.ok(statSync(join(pub, i.src)).size > 0, i.src);
  assert.equal(m.display, 'standalone');
});

test('nothing in the app talks to another server', () => {
  for (const f of walk(join(pub, 'js'))) {
    const src = readFileSync(join(pub, f), 'utf8');
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|https?:\/\/(?!www\.w3\.org)/, f);
  }
});
