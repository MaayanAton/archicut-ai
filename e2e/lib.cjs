// Browser tests. Start the app first (npm run build && npx vite preview --port 4173), then: npm run e2e
// Use a UTF-8 locale (LANG=C.UTF-8) so downloads keep their Hebrew file names.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '.output');
for (const sub of ['shots', 'out']) fs.mkdirSync(path.join(OUT, sub), { recursive: true });
fs.copyFileSync(path.join(__dirname, 'fixtures', 'test-sheet.jpg'), path.join(OUT, 'exercise.jpg'));
process.chdir(OUT);
const BASE = process.env.BASE || 'http://localhost:4173/';
let fails = 0;
function check(cond, msg) { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; }
async function start(viewport = { width: 1440, height: 900 }, opts = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, acceptDownloads: true, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/GPU stall|GL Driver/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  page.on('dialog', (d) => { errors.push('[native dialog] ' + d.message()); d.dismiss(); });
  await page.goto(BASE);
  await page.waitForSelector('.proj-card');
  return { browser, ctx, page, errors };
}
async function openProject(page, name) {
  await page.goto(BASE);
  await page.waitForSelector('.proj-card');
  await page.locator('.proj-card .name', { hasText: name }).first().click();
  await page.waitForTimeout(800);
}
function done(errors) {
  check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exitCode = fails ? 1 : 0;
}
module.exports = { BASE, check, start, openProject, done };
