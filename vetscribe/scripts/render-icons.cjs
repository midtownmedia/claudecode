/**
 * Renders public/icon.svg into the PNG sizes phones ask for.
 * Needs Playwright:  NODE_PATH=$(npm root -g) node scripts/render-icons.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const pub = path.join(__dirname, '..', 'public');
const svg = fs.readFileSync(path.join(pub, 'icon.svg'), 'utf8');
const SIZES = [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512]];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, size] of SIZES) {
    await page.setViewportSize({ width: size, height: size });
    const pad = name.includes('maskable') ? 0.1 : 0;
    const inner = size * (1 - 2 * pad);
    await page.setContent(`<style>html,body{margin:0;background:#0a5fd6}svg{display:block;width:${inner}px;height:${inner}px;margin:${size * pad}px}</style>${svg}`);
    await page.screenshot({ path: path.join(pub, name), omitBackground: false });
  }
  await browser.close();
})();
