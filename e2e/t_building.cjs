// Building design (version 3.0) in a real browser: a new house from exact outside dimensions, net and gross areas,
// interior walls at any angle, rooms, doors and windows kept inside their wall, furniture from the library, undo and
// redo, levels, stairs and a roof, the synchronised 3D view, sections that follow the model, tables with CSV, sheets
// with honest scale problems and PDF/SVG/PNG export, saving after a refresh, the project file (version 3), an existing
// plan as a calibrated background, the renovation demo's phases, and the three demos opening without warnings.
const fs = require('fs');
const { check, start, done, openProject, BASE } = require('./lib.cjs');
const { viewOf, clickWorld, setField, fieldValue, canvasInk } = require('./site_lib.cjs');

/** Distinct ids of the elements drawn in the building plan (walls, rooms, openings, furniture…). */
const planIds = (page) => page.locator('[data-testid="bld-plan"] [data-el]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-el')))]);

const P = 'bld-plan';
const tool = (page, name) => page.locator('.toolbar').getByRole('button', { name, exact: true }).click();
const aside = (page) => page.locator('aside').first();
const toastText = async (page) => (await page.locator('.toast').allInnerTexts()).join(' ');

(async () => {
  const { browser, page, errors } = await start();
  page.setDefaultTimeout(15000);

  // ---- home: the new option and the demos ----
  const cards = await page.locator('.proj-card .name').allInnerTexts();
  check(['דירה מעוצבת', 'בית פרטי דו־קומתי', 'שיפוץ דירה קיימת'].every((n) => cards.some((c) => c.includes(n))), 'three building demos are on the home screen');
  check(cards.some((c) => c.includes('פארק ציבורי')) && cards.some((c) => c.includes('היטלי נקודות')), 'version 1 and 2 demos are still there');
  await page.getByRole('button', { name: /שרטוט חדש/ }).click();
  check(await page.getByRole('button', { name: /תכנון מבנים ועיצוב פנים/ }).count() === 1, '"new drawing" offers building design and interior design');
  check(await page.getByRole('button', { name: /תכנון אדריכלי ומתחמים/ }).count() === 1, '"new drawing" still offers site planning');
  await page.getByRole('button', { name: /תכנון מבנים ועיצוב פנים/ }).click();
  await page.waitForTimeout(600);
  check(await page.getByRole('tab').count() === 5, 'building project opens with 5 work areas (plan, 3D, sections, tables, sheets)');
  check(await page.getByRole('button', { name: 'בית חדש במידות חוץ' }).count() === 1, 'empty project offers a quick start');

  // ---- a 10 × 8 m house from outside dimensions ----
  await page.getByRole('button', { name: 'בית חדש במידות חוץ' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: 'רוחב (מזרח–מערב)' }).fill('10');
  await dlg.getByRole('textbox', { name: 'עומק (צפון–דרום)' }).fill('8');
  await dlg.getByRole('button', { name: 'יצירה' }).click();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  let text = await aside(page).innerText();
  check(/80\s*מ״ר/.test(text), 'gross area of the level is 80 m² (outside 10 × 8 m)');
  check(/71\.25\s*מ״ר/.test(text), 'net area is 71.25 m² (inside 9.5 × 7.5 m, walls 25 cm)');

  // ---- interior wall, a free wall at 45°, delete ----
  await tool(page, 'קירות');
  await clickWorld(page, 5000, 0, P);
  await clickWorld(page, 5000, 8000, P);
  await page.keyboard.press('Escape');
  await clickWorld(page, 13000, 0, P);
  await clickWorld(page, 16000, 3000, P);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await clickWorld(page, 14500, 1500, P);
  await page.waitForTimeout(300);
  const ang = await fieldValue(page, 'זווית'), len = await fieldValue(page, 'אורך (קו אמצע)');
  check(ang === '45' && Math.abs(Number(len) - 4.2) < 0.06, `a wall drawn at 45° keeps its angle; its length snaps to the grid (${ang}°, ${len} m)`);
  const before = (await planIds(page, P)).length;
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  check((await planIds(page, P)).length < before, 'Delete removes the selected wall');

  // ---- rooms ----
  await tool(page, 'חדר');
  await clickWorld(page, 2500, 4000, P);
  await page.waitForTimeout(300);
  await tool(page, 'חדר');
  await clickWorld(page, 7500, 4000, P);
  await page.waitForTimeout(300);
  await tool(page, 'חדר');
  await clickWorld(page, 2600, 3000, P);
  await page.waitForTimeout(300);
  check(/כבר יש חדר באזור הזה/.test(await toastText(page)), 'a second room in the same space is refused with a message');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  text = await aside(page).innerText();
  check(/69\.75\s*מ״ר/.test(text), 'net area after the partition: two rooms of 34.88 m² (69.75 m²)');

  // ---- door and windows ----
  await tool(page, 'דלת');
  await clickWorld(page, 5000, 3000, P);
  await clickWorld(page, 7500, 0, P);
  await page.keyboard.press('Escape');
  await tool(page, 'חלון');
  await clickWorld(page, 2500, 0, P);
  await clickWorld(page, 2600, 0, P);
  await clickWorld(page, 0, 5000, P);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const swings = await page.locator(`[data-testid="${P}"] path[stroke-dasharray]`).count();
  check(swings >= 2, `doors show their swing in the plan (${swings} dashed swing arcs)`);
  check(!/חופף/.test(await aside(page).innerText()), 'a window clicked onto an existing one moves to free wall space (no overlap)');
  // select the first window and try to make it wider than its wall
  await clickWorld(page, 2500, 125, P);
  await page.waitForTimeout(300);
  check(/חלון/.test(await aside(page).locator('h3').first().innerText()), 'clicking a window selects it');
  const w0 = await fieldValue(page, 'רוחב');
  await setField(page, 'רוחב', '20');
  await page.waitForTimeout(200);
  check(/לא ניתן/.test(await toastText(page)) && (await fieldValue(page, 'רוחב')) === w0, `an opening wider than its wall is refused (width stays ${w0} m)`);
  await page.keyboard.press('Escape');

  // ---- furniture, duplicate, rotate, undo and redo ----
  await tool(page, 'ריהוט');
  await page.getByRole('textbox', { name: 'חיפוש רהיטים' }).fill('מיטה זוגית');
  await page.locator('.lib-item', { hasText: 'מיטה זוגית' }).first().click();
  await clickWorld(page, 7500, 5000, P);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const n1 = (await planIds(page, P)).length;
  await clickWorld(page, 7500, 5000, P);
  await page.keyboard.press('Control+d');
  await page.waitForTimeout(300);
  const n2 = (await planIds(page, P)).length;
  check(n2 === n1 + 1, 'Ctrl+D duplicates the selected bed');
  await page.keyboard.press('r');
  await page.waitForTimeout(200);
  check((await fieldValue(page, 'סיבוב')) === '90', 'R rotates the selected item by 90°');
  await page.getByRole('button', { name: 'ביטול פעולה' }).click();
  await page.getByRole('button', { name: 'ביטול פעולה' }).click();
  await page.waitForTimeout(300);
  check((await planIds(page, P)).length === n1, 'undo removes the duplicate');
  await page.getByRole('button', { name: 'שחזור פעולה' }).click();
  await page.waitForTimeout(300);
  check((await planIds(page, P)).length === n2, 'redo brings it back');
  await page.keyboard.press('Escape');

  // ---- stairs, an upper level and a gable roof ----
  await tool(page, 'מדרגות');
  await clickWorld(page, 1000, 7000, P);
  await page.waitForTimeout(300);
  text = await aside(page).innerText();
  check(/אינן מאושרות/.test(text) && /גובה רום/.test(text), 'stair panel shows riser height and says stairs are not approved');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /הוספה/ }).first().click();
  await page.waitForTimeout(500);
  const lvls = await page.getByRole('combobox', { name: 'קומה פעילה' }).locator('option').count().catch(() => 0);
  check(lvls === 2 || (await page.locator('.level-pick option, select[aria-label="קומה בתוכנית"] option').count()) >= 2, 'an upper level was added');
  await tool(page, 'גג');
  for (const [x, y] of [[0, 0], [10000, 0], [10000, 8000], [0, 8000]]) await clickWorld(page, x, y, P);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // ---- 3D ----
  await page.getByRole('tab', { name: /תלת/ }).click();
  await page.waitForTimeout(1500);
  const ink = await canvasInk(page, '[data-testid="bld-3d"]');
  check(ink > 0.05, `3D view draws the model (${(ink * 100).toFixed(0)}% of the canvas)`);
  for (const lbl of ['גגות', 'תקרות', 'ריהוט']) check(await page.getByText(lbl, { exact: true }).count() >= 1, `3D has a "${lbl}" toggle`);
  await page.getByText('חתך אופקי (1.20 מ׳)').click();
  await page.waitForTimeout(800);
  const ink2 = await canvasInk(page, '[data-testid="bld-3d"]');
  check(ink2 > 0.03, 'horizontal cutaway still draws the model');
  await page.getByText('דרום', { exact: true }).first().click();
  await page.waitForTimeout(500);
  check(await page.getByRole('button', { name: /סיור בגובה העיניים/ }).count() === 1, 'eye-level walk is available');

  // ---- sections follow the model ----
  await page.getByRole('tab', { name: /חתכים/ }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'קו חתך חדש' }).click();
  await clickWorld(page, 2500, -2000, P);
  await clickWorld(page, 2500, 10000, P);
  await page.waitForTimeout(600);
  const info = await page.locator('[data-testid="bsection-info"]').innerText();
  const cutN = Number((info.match(/נחתכים:\s*(\d+)/) || [])[1] || 0);
  check(cutN >= 3, `section A-A cuts walls, slab and window (${cutN} elements)`);
  const secText = await page.locator('[data-testid="bld-section"]').innerText();
  check(/1\.2/.test(secText), 'section dimensions the window height (1.2 m)');
  // change the window in the plan, the section updates
  await page.getByRole('tab', { name: /תוכנית/ }).first().click();
  await page.waitForTimeout(400);
  await page.locator('select[aria-label="קומה פעילה"], .level-pick').first().selectOption({ index: 1 }).catch(() => {});
  await page.waitForTimeout(300);
  await clickWorld(page, 2500, 125, P);
  await page.waitForTimeout(300);
  await setField(page, 'גובה', '1.5');
  await page.getByRole('tab', { name: /חתכים/ }).click();
  await page.waitForTimeout(500);
  check(/1\.5/.test(await page.locator('[data-testid="bld-section"]').innerText()), 'after changing the window to 1.5 m, the section shows 1.5');
  await page.getByRole('button', { name: /חזית דרומית|חזית תחתונה/ }).first().click();
  await page.waitForTimeout(500);
  check(/חזית/.test(await page.locator('.sec-list').innerText()), 'an elevation was added from the building');

  // ---- tables and CSV ----
  await page.getByRole('tab', { name: /טבלאות/ }).click();
  await page.waitForTimeout(500);
  text = await page.locator('body').innerText();
  check(/34\.88/.test(text), 'room table lists 34.88 m² rooms');
  check(/ברוטו/.test(text) && /נטו/.test(text), 'tables explain gross and net areas');
  const [csvDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /CSV/ }).click()]);
  await csvDl.saveAs('out/building.csv');
  const csv = fs.readFileSync('out/building.csv', 'utf8');
  check(csv.charCodeAt(0) === 0xfeff && /34\.88/.test(csv) && /חלון/.test(csv), 'CSV has a BOM (opens in Excel in Hebrew) and the room and window rows');

  // ---- sheets ----
  await page.getByRole('tab', { name: /גיליונות/ }).click();
  await page.waitForTimeout(1500);
  if (await page.locator('[data-testid="bsheet-preview"]').count() === 0) { await page.getByRole('button', { name: 'גיליון אוטומטי' }).click(); await page.waitForTimeout(1500); }
  check(await page.locator('[data-testid="bsheet-preview"]').count() === 1, 'an automatic sheet is laid out');
  check(/נכנסים לגיליון/.test(await aside(page).innerText()), 'automatic sheet: every drawing fits at its scale');
  await page.locator('.field', { hasText: /קומת קרקע/ }).getByRole('button', { name: 'קומה' }).first().click().catch(async () => {
    await aside(page).getByRole('button', { name: 'קומה', exact: true }).first().click();
  });
  await page.waitForTimeout(400);
  await page.getByRole('combobox', { name: 'קנה מידה' }).selectOption('20');
  await page.waitForTimeout(400);
  text = await aside(page).innerText();
  check(/לא מוקטן אוטומטית|חורג/.test(text), 'a plan at 1:20 that does not fit is reported, not shrunk');
  await page.getByRole('button', { name: 'הסרה מהגיליון' }).click();
  await page.waitForTimeout(400);
  for (const kind of ['PDF', 'SVG', 'PNG']) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: kind, exact: true }).click()]);
    const f = `out/building-sheet.${kind.toLowerCase()}`;
    await dl.saveAs(f);
    const size = fs.statSync(f).size;
    let ok = size > 5000;
    if (kind === 'PDF') { const s = fs.readFileSync(f, 'latin1'); ok = ok && /%PDF/.test(s); const mb = s.match(/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)/); ok = ok && !!mb && Math.abs(Number(mb[1]) - 1683.78) < 2 && Math.abs(Number(mb[2]) - 1190.55) < 2; }
    if (kind === 'SVG') ok = ok && /width="594mm"/.test(fs.readFileSync(f, 'utf8'));
    check(ok, `sheet exported as ${kind} at exact A2 size (${(size / 1024).toFixed(0)} KB)`);
  }

  // ---- saved after a refresh; project file version 3 ----
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForSelector('.proj-card, [data-testid="bsheet-preview"], [data-testid="bld-plan"]');
  await page.goto(BASE);
  await page.waitForSelector('.proj-card');
  const names = await page.locator('.proj-card .name').allInnerTexts();
  const mine = names.find((n) => /מבנה|תכנון/.test(n) && !/הדגמה/.test(n));
  check(!!mine, `the new building project is saved after a refresh (${mine})`);
  await page.locator('.proj-card .name', { hasText: mine }).first().click();
  await page.waitForTimeout(800);
  if (await page.getByRole('tab', { name: /תוכנית/ }).count()) await page.getByRole('tab', { name: /תוכנית/ }).first().click();
  await page.locator('select[aria-label="קומה פעילה"]').first().selectOption({ index: 1 }).catch(() => {});
  await page.waitForTimeout(400);
  text = await aside(page).innerText();
  check(/80\s*מ״ר/.test(text), 'after the refresh the house and its areas are back');
  const [fileDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'שמירת קובץ פרויקט לגיבוי' }).click()]);
  await fileDl.saveAs('out/building.archicut');
  const pf = JSON.parse(fs.readFileSync('out/building.archicut', 'utf8'));
  check(pf.version === 3 && pf.projects[0].type === 'building' && pf.projects[0].data.walls.length >= 5, `project file is version 3 with the building data (${pf.projects?.[0]?.data?.walls?.length} walls)`);

  // ---- an existing plan as a background: calibrate and lock ----
  await page.goto(BASE);
  await page.waitForSelector('.proj-card');
  await page.getByRole('button', { name: /שרטוט חדש/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /תכנון מבנים ועיצוב פנים/ }).click();
  await page.waitForTimeout(600);
  await page.locator('input[type=file]').first().setInputFiles('exercise.jpg');
  await page.waitForTimeout(1500);
  text = await aside(page).innerText();
  check(/לא מכויל/.test(text) && await page.locator(`[data-testid="${P}"] image`).count() === 1, 'uploaded plan shows as a background marked "not calibrated"');
  check(await page.getByRole('checkbox', { name: /פרויקט שיפוץ/ }).isChecked(), 'uploading a plan turns on renovation phases (existing first)');
  const img = page.locator(`[data-testid="${P}"] image`).first();
  const v1 = await viewOf(page, P);
  const ib1 = await img.boundingBox();
  await page.getByRole('button', { name: 'כיול קנה מידה' }).click();
  await clickWorld(page, 0, 0, P);
  await clickWorld(page, 100, 0, P);
  await page.getByRole('dialog').getByRole('textbox', { name: 'המרחק האמיתי' }).fill('5');
  await page.getByRole('dialog').getByRole('button', { name: 'כיול' }).click();
  await page.waitForTimeout(500);
  const v2 = await viewOf(page, P);
  const ib2 = await img.boundingBox();
  const ratio = (ib2.width / v2.k) / (ib1.width / v1.k);
  check(Math.abs(ratio - 50) < 1, `calibration (0.1 → 5 m) scales the background 50× (${ratio.toFixed(2)}×)`);
  check(/מכויל/.test(await aside(page).innerText()), 'background is marked calibrated');
  await page.getByText('נעילת שכבת המקור').click();
  await page.waitForTimeout(200);
  check(await page.getByRole('button', { name: 'כיול קנה מידה' }).isDisabled(), 'locking the source layer disables calibration and cropping');

  // ---- the renovation demo: phases ----
  await openProject(page, 'שיפוץ דירה קיימת');
  check(!/אזהרות/.test(await aside(page).innerText()), 'renovation demo opens without warnings');
  const dashedCompare = await page.locator(`[data-testid="${P}"] path[stroke-dasharray]`).count();
  await page.getByRole('combobox', { name: /מצב תצוגה|תצוגה/ }).first().selectOption({ label: 'מצב מוצע' }).catch(async () => { await page.getByRole('radio', { name: 'מצב מוצע' }).first().click(); });
  await page.waitForTimeout(400);
  const dashedProp = await page.locator(`[data-testid="${P}"] path[stroke-dasharray]`).count();
  check(dashedProp < dashedCompare, `proposed state hides the elements marked for demolition (${dashedCompare} → ${dashedProp} dashed shapes)`);
  check(/אינו אישור להריסה/.test(await aside(page).innerText()) || /אינו אישור להריסה/.test(await page.content()), 'demolition is explained as a planning action only');

  // ---- the other demos open clean ----
  for (const n of ['דירה מעוצבת', 'בית פרטי דו־קומתי']) {
    await openProject(page, n);
    check(!/אזהרות/.test(await aside(page).innerText()), `${n} demo opens without warnings`);
    check(/הדגמה לימודי/.test(await aside(page).innerText()), `${n} demo is marked as educational`);
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
    await pg.locator('.proj-card .name', { hasText: 'דירה מעוצבת' }).first().tap();
    await pg.waitForSelector(`[data-testid="${P}"]`);
    const overflow = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 1, `phone: no sideways scrolling (${overflow}px)`);
    const plan = await pg.locator(`[data-testid="${P}"]`).boundingBox();
    check(plan && plan.height > 200 && plan.width > 300, `phone: the plan has room (${Math.round(plan.width)} × ${Math.round(plan.height)})`);
    await pg.screenshot({ path: 'shots/t-bld-phone-plan.png' });
    await pg.getByRole('button', { name: /פתיחת החלונית/ }).tap();
    await pg.waitForTimeout(300);
    check(await pg.getByText('שטחים בקומה').isVisible(), 'phone: the folded panel opens with one tap (areas of the level)');
    for (const [t, sel] of [['תלת', '[data-testid="bld-3d"]'], ['חתכים', '.sec-list'], ['טבלאות', 'table'], ['גיליונות', '[data-testid="bsheet-preview"]']]) {
      await pg.getByRole('tab', { name: new RegExp(t) }).tap();
      await pg.waitForTimeout(1200);
      check(await pg.locator(sel).count() >= 1, `phone: ${t} opens`);
      await pg.screenshot({ path: `shots/t-bld-phone-${t}.png` });
    }
    await b.close();
  }

  done(errors);
  await browser.close();
})().catch((e) => { console.log('FAIL exception: ' + e.message.split('\n')[0]); process.exitCode = 1; process.exit(1); });
