// Site planning: a large project (1000+ elements) stays usable, touch works on a tablet, and the phone layout fits.
const fs = require('fs');
const { check, start, openProject, done, BASE } = require('./lib.cjs');
const { planIds, canvasInk, viewOf } = require('./site_lib.cjs');

(async () => {
  const { browser, page, errors } = await start();
  page.setDefaultTimeout(15000);

  // ---- build a large project from the demo park ----
  await openProject(page, 'פארק ציבורי לדוגמה');
  await page.waitForSelector('[data-testid="site-plan"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'שמירת קובץ פרויקט לגיבוי' }).click()]);
  await dl.saveAs('out/demo-park.archicut');
  const file = JSON.parse(fs.readFileSync('out/demo-park.archicut', 'utf8'));
  const p = file.projects[0];
  const base = p.data.elements.filter((e) => e.geom.type === 'point' && e.kind !== 'text');
  const big = [...p.data.elements];
  let k = 0;
  for (let gx = 0; gx < 5; gx++) for (let gy = 0; gy < 4; gy++) {
    if (gx === 0 && gy === 0) continue;
    for (const e of base) {
      big.push({ ...e, id: `big-${k++}`, geom: { ...e.geom, p: { x: e.geom.p.x + gx * 64000, y: e.geom.p.y + gy * 44000 } } });
    }
  }
  // a larger lot to hold all copies, and long curved paths
  big.push({ ...p.data.elements.find((e) => e.kind === 'lot'), id: 'big-lot', geom: { type: 'area', curved: false, pts: [{ x: 0, y: 0 }, { x: 316000, y: 0 }, { x: 316000, y: 172000 }, { x: 0, y: 172000 }] } });
  const pathProto = p.data.elements.find((e) => e.kind === 'path');
  for (let i = 0; i < 50; i++) big.push({ ...pathProto, id: `big-path-${i}`, geom: { type: 'line', curved: true, pts: [{ x: 2000 + i * 6200, y: 1000 }, { x: 5000 + i * 6200, y: 80000 }, { x: 2000 + i * 6200, y: 171000 }] } });
  p.data.elements = big;
  p.name = 'בדיקת עומס';
  p.id = 'load-test';
  fs.writeFileSync('out/big-site.archicut', JSON.stringify(file));
  check(big.length >= 1000, `large test project built (${big.length} elements)`);

  await page.goto(BASE);
  await page.waitForSelector('.proj-card');
  await page.locator('input[type=file][accept*=archicut]').setInputFiles('out/big-site.archicut');
  await page.waitForTimeout(1000);
  let t0 = Date.now();
  await page.locator('.proj-card .name', { hasText: 'בדיקת עומס' }).first().click();
  await page.waitForSelector('[data-testid="site-plan"] g[data-el]');
  const tOpen = Date.now() - t0;
  const n = (await planIds(page)).length;
  check(n >= 1000 && tOpen < 8000, `large project opens with ${n} elements in ${(tOpen / 1000).toFixed(1)} s`);
  // selection and moving with the keyboard
  const v = await viewOf(page, 'site-plan');
  const q = v.toScreen(48000 + 64000, 34000);
  await page.mouse.click(q.x, q.y);
  t0 = Date.now();
  for (let i = 0; i < 10; i++) { await page.keyboard.press('ArrowRight'); }
  await page.waitForTimeout(50);
  const tMove = Date.now() - t0;
  check(tMove < 6000, `10 moves of a selected element take ${(tMove / 1000).toFixed(2)} s`);
  t0 = Date.now();
  await page.getByRole('tab', { name: /תלת/ }).click();
  await page.waitForFunction(() => !!document.querySelector('[data-testid="site-3d"] canvas'));
  await page.waitForTimeout(500);
  const t3d = Date.now() - t0;
  const ink = await canvasInk(page, '[data-testid="site-3d"]');
  check(ink > 0.05 && t3d < 15000, `3D of the large project drawn in ${(t3d / 1000).toFixed(1)} s`);
  t0 = Date.now();
  await page.getByRole('tab', { name: /חתכים/ }).click();
  await page.waitForSelector('[data-testid="site-section"] svg');
  const tSec = Date.now() - t0;
  check(tSec < 6000, `sections of the large project open in ${(tSec / 1000).toFixed(1)} s`);
  t0 = Date.now();
  await page.getByRole('tab', { name: /טופוגרפיה/ }).click();
  await page.waitForSelector('[data-testid="site-plan"]');
  check(Date.now() - t0 < 6000, `topography of the large project opens in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await browser.close();

  // ---- tablet with touch ----
  {
    const { chromium } = require('playwright');
    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, deviceScaleFactor: 1 });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => errors.push('[pageerror tablet] ' + e.message));
    await pg.goto(BASE);
    await pg.waitForSelector('.proj-card');
    await pg.locator('.proj-card .name', { hasText: 'פארק ציבורי לדוגמה' }).first().tap();
    await pg.waitForSelector('[data-testid="site-plan"] g[data-el]');
    const before = (await planIds(pg)).length;
    await pg.locator('.toolbar .tool', { hasText: 'עץ' }).first().tap();
    const vv = await viewOf(pg, 'site-plan');
    const s = vv.toScreen(20000, 8000);
    await pg.touchscreen.tap(s.x, s.y);
    await pg.waitForTimeout(300);
    check((await planIds(pg)).length === before + 1, 'tablet: tapping the plan places a tree');
    await pg.locator('.btn', { hasText: 'סיום הכלי' }).first().tap();
    await pg.waitForTimeout(200);
    const s2 = vv.toScreen(41000, 27300);
    await pg.touchscreen.tap(s2.x, s2.y);
    await pg.waitForTimeout(300);
    check(/מדרגות/.test(await pg.locator('aside.panel').innerText()), 'tablet: tapping the stairs selects them and shows their properties');
    await pg.screenshot({ path: 'shots/t-site-tablet.png' });
    await b.close();
  }

  // ---- phone ----
  {
    const { chromium, devices } = require('playwright');
    const b = await chromium.launch();
    const ctx = await b.newContext({ ...devices['iPhone 13'] });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => errors.push('[pageerror phone] ' + e.message));
    await pg.goto(BASE);
    await pg.waitForSelector('.proj-card');
    await pg.locator('.proj-card .name', { hasText: 'פארק ציבורי לדוגמה' }).first().tap();
    await pg.waitForSelector('[data-testid="site-plan"]');
    const overflow = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 1, `phone: no sideways scrolling (${overflow}px)`);
    const plan = await pg.locator('[data-testid="site-plan"]').boundingBox();
    check(plan && plan.height > 200 && plan.width > 300, `phone: the plan has room (${Math.round(plan.width)} × ${Math.round(plan.height)})`);
    await pg.screenshot({ path: 'shots/t-site-phone-plan.png' });
    await pg.getByRole('button', { name: /פתיחת החלונית/ }).tap();
    await pg.waitForTimeout(300);
    check(await pg.getByText('ספריית אלמנטים').isVisible(), 'phone: the folded panel opens with one tap (element library)');
    await pg.screenshot({ path: 'shots/t-site-phone-panel.png' });
    for (const [t, sel] of [['תלת', '[data-testid="site-3d"]'], ['חתכים', '.sec-list'], ['גיליונות', '[data-testid="sheet-preview"]']]) {
      await pg.getByRole('tab', { name: new RegExp(t) }).tap();
      await pg.waitForTimeout(1200);
      check(await pg.locator(sel).count() >= 1, `phone: ${t} opens`);
      await pg.screenshot({ path: `shots/t-site-phone-${t}.png` });
    }
    await b.close();
  }

  done(errors);
})().catch((e) => { console.error(e); process.exitCode = 1; });
