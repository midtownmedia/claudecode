import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC = new URL('../public/', import.meta.url).pathname;

function walk(dir, base = '') {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, `${base}${name}/`));
    else out.push(`${base}${name}`);
  }
  return out;
}

const CACHEABLE = /\.(png|svg|css|js|html|webmanifest)$/;

test('the service worker precaches every shipped file', () => {
  const sw = readFileSync(join(PUBLIC, 'sw.js'), 'utf8');
  const listed = new Set([...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]));

  const onDisk = walk(PUBLIC).filter((f) => CACHEABLE.test(f) && f !== 'sw.js');
  assert.ok(onDisk.length >= 20, `expected the full app, found ${onDisk.length} files`);

  for (const f of onDisk) {
    assert.ok(listed.has(f), `${f} ships but is missing from the service worker cache list`);
  }
  for (const f of listed) {
    if (f === 'index.html') continue; // also referenced as the navigation fallback
    assert.ok(onDisk.includes(f), `${f} is cached by the service worker but no longer exists`);
  }
});

test('the manifest points at icons that exist', () => {
  const manifest = JSON.parse(readFileSync(join(PUBLIC, 'manifest.webmanifest'), 'utf8'));
  const files = new Set(walk(PUBLIC));
  assert.ok(manifest.icons.length >= 3);
  for (const icon of manifest.icons) {
    assert.ok(files.has(icon.src), `manifest lists ${icon.src}, which is not there`);
  }
  // Chrome will not offer to install without a 192 and a 512.
  const sizes = manifest.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192'), 'a 192px icon is required for the install prompt');
  assert.ok(sizes.includes('512x512'), 'a 512px icon is required for the install prompt');
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'),
    'a maskable icon keeps the Android launcher from cropping the artwork');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.start_url);
});

test('the page declares what iOS needs to launch full screen', () => {
  const html = readFileSync(join(PUBLIC, 'index.html'), 'utf8');
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /apple-touch-icon/);
  assert.match(html, /rel="manifest"/);
  assert.match(html, /viewport-fit=cover/);
});

test('the service worker registers itself and cleans up old caches', () => {
  const main = readFileSync(join(PUBLIC, 'js/main.js'), 'utf8');
  assert.match(main, /serviceWorker\.register/);
  const sw = readFileSync(join(PUBLIC, 'sw.js'), 'utf8');
  assert.match(sw, /caches\.delete/, 'a version bump must evict the previous cache');
  assert.match(sw, /skipWaiting/);
  assert.match(sw, /request\.mode === 'navigate'/, 'a cache miss on navigation needs the shell as fallback');
});
