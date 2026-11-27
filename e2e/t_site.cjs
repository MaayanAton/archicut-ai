// Site planning, the core flow in a real browser: exact lot, placing and resizing elements, paths and areas,
// undo/redo, layers, 2D/3D sync, topography and slope, sections that follow model changes, invalid input,
// saving after a refresh, and export/import of the project file.
const fs = require('fs');
const { check, start, done, BASE } = require('./lib.cjs');
const { viewOf, clickWorld, planIds, elBox, setField, fieldValue, canvasInk } = require('./site_lib.cjs');

(async () => {
  const { browser, page, errors } = await start();
  page.setDefaultTimeout(15000);
  const panel = () => page.locator('aside.site-panel');

  // ---- new site project ----
  await page.getByRole('button', { name: /שרטוט חדש/ }).click();
  await page.getByRole('button', { name: /תכנון אדריכלי ומתחמים/ }).click();
  await page.waitForTimeout(600);
  check(await page.locator('.site-tab').count() === 5, 'site project opens with 5 work areas (plan, 3D, topography, sections, sheets)');
  check(await page.getByText('מתחילים בגבול המגרש').count() === 1, 'empty project explains how to start (lot first)');

  // ---- invalid input in the lot dialog ----
  await page.getByRole('button', { name: 'מגרש מלבני במידות' }).click();
  const dlg = page.getByRole('dialog', { name: 'מגרש מלבני במידות' });
  await dlg.getByRole('textbox', { name: 'רוחב (לאורך X)' }).fill('abc');
  check(await dlg.getByText('מספר לא תקין').count() === 1, 'letters in a dimension field are rejected with a message');
  check(await dlg.getByRole('button', { name: 'יצירת המגרש' }).isDisabled(), 'cannot create a lot with invalid input');
  await dlg.getByRole('textbox', { name: 'רוחב (לאורך X)' }).fill('0.05');
  check(await dlg.getByText(/מינימום/).count() === 1, 'a too-small dimension is rejected with its minimum');
  await dlg.getByRole('textbox', { name: 'רוחב (לאורך X)' }).fill('60');
  await dlg.getByRole('textbox', { name: 'עומק (לאורך Y)' }).fill('40');
  const dtext = await dlg.innerText();
  check(/2400 מ״ר/.test(dtext) && /200 מ׳/.test(dtext), `lot dialog shows area 2400 m² and perimeter 200 m (${dtext.split('\n').find((l) => l.includes('שטח'))})`);
  await dlg.getByRole('button', { name: 'יצירת המגרש' }).click();
  await page.waitForTimeout(500);
  let ids = await planIds(page);
  check(ids.length === 1, `exact lot created (${ids.length} element)`);
  const lotId = ids[0];
  const v0 = await viewOf(page, 'site-plan');
  const lb = await elBox(page, lotId);
  // the box includes the boundary line's stroke, the same on all sides, so the difference of the sides is exact
  check(Math.abs((lb.width - lb.height) / v0.k - 20000) < 60, `lot is drawn 60 × 40 m at the view scale (difference of the sides ${((lb.width - lb.height) / v0.k / 1000).toFixed(2)} m)`);
  check(/2400 מ״ר/.test(await panel().innerText()), 'areas table lists the lot as 2400 m²');

  // ---- place a bench from the library, then resize and move it exactly ----
  await panel().getByRole('textbox', { name: 'חיפוש בספרייה' }).fill('ספסל');
  await panel().locator('.lib-item', { hasText: 'ספסל' }).first().click();
  await clickWorld(page, 10000, 10000);
  await page.keyboard.press('Escape');
  ids = await planIds(page);
  const benchId = ids.find((x) => x !== lotId);
  check(ids.length === 2 && !!benchId, 'bench placed by clicking the plan');
  const bx = await fieldValue(page, 'X'), by = await fieldValue(page, 'Y');
  check(bx === '10' && by === '10', `bench sits exactly at the clicked grid point (${bx}, ${by})`);
  const b1 = await elBox(page, benchId);
  await setField(page, 'אורך', '2.4');
  const b2 = await elBox(page, benchId);
  check(Math.abs((b2.width - b1.width) / v0.k - 600) < 60, `bench length 1.8 → 2.4 m changes the plan symbol (${((b2.width - b1.width) / v0.k).toFixed(0)} mm wider)`);
  await setField(page, 'X', '12.5');
  const b3 = await elBox(page, benchId);
  check(Math.abs((b3.x + b3.width / 2 - (b2.x + b2.width / 2)) / v0.k - 2500) < 30, 'typing X = 12.5 moves the bench exactly 2.5 m');
  await page.getByRole('textbox', { name: 'אורך', exact: true }).fill('-1');
  check(await page.getByText('ערך שלילי אינו אפשרי').count() === 1, 'negative length is rejected with a message');
  await page.getByRole('textbox', { name: 'אורך', exact: true }).blur();
  check(await fieldValue(page, 'אורך') === '2.4', 'after leaving the field the last valid length (2.4) is kept');

  // ---- a straight path and a rectangular lawn ----
  await page.keyboard.press('Escape');
  await page.locator('.toolbar .tool', { hasText: 'שביל' }).first().click();
  await clickWorld(page, 5000, 20000);
  await clickWorld(page, 25000, 20000);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  ids = await planIds(page);
  check(ids.length === 3, 'path drawn with two clicks and Enter');
  const pathLen = await page.waitForFunction(() => /אורך\s*20 מ׳/.test(document.querySelector('aside.site-panel')?.innerText || ''), null, { timeout: 4000 }).then(() => true, () => false);
  check(pathLen, `path length shows exactly 20 m (${((await panel().innerText()).match(/אורך\s*[^\n]*/) || ['?'])[0]})`);
  await page.keyboard.press('Escape');
  await page.locator('.toolbar .tool', { hasText: 'מדשאה' }).first().click();
  await panel().getByRole('radio', { name: 'מלבן', exact: true }).click();
  await clickWorld(page, 30000, 5000);
  await clickWorld(page, 40000, 15000);
  await page.waitForTimeout(300);
  ids = await planIds(page);
  check(ids.length === 4, 'lawn drawn as a rectangle with two clicks');
  const ptxt = await panel().innerText();
  check(/100 מ״ר/.test(ptxt) && /40 מ׳/.test(ptxt), 'lawn area 100 m² and perimeter 40 m');
  await page.keyboard.press('Escape');

  // ---- undo / redo / delete ----
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  check((await planIds(page)).length === 3, 'Ctrl+Z removes the lawn');
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(200);
  check((await planIds(page)).length === 4, 'Ctrl+Y brings it back');
  await page.keyboard.press('Escape');
  await clickWorld(page, 12500, 10000);
  check(await fieldValue(page, 'X') === '12.5', 'clicking the bench selects it');
  await page.keyboard.press('Control+d');
  await page.waitForTimeout(200);
  check((await planIds(page)).length === 5, 'Ctrl+D duplicates the selection');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);
  check((await planIds(page)).length === 4, 'Delete removes the selection');

  // ---- 2D / 3D sync ----
  await clickWorld(page, 12500, 10000);
  await page.getByRole('tab', { name: /תלת/ }).click();
  await page.waitForTimeout(1500);
  const ink = await canvasInk(page, '[data-testid="site-3d"]');
  check(ink > 0.05, `3D model is drawn (${(ink * 100).toFixed(1)}% of the view)`);
  const hint = await page.locator('.three-hint').innerText();
  check(/נבחר: ספסל/.test(hint), 'the bench selected in the plan is selected in 3D too');
  await setField(page, 'אורך', '3');
  await page.getByRole('tab', { name: /תוכנית/ }).click();
  await page.waitForTimeout(400);
  const b4 = await elBox(page, benchId);
  check(Math.abs((b4.width - b2.width) / v0.k - 600) < 60, 'a change made in the 3D view shows in the plan');
  // hiding a layer hides it in the plan, 3D and sections
  await page.getByRole('tab', { name: /תלת/ }).click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await panel().getByRole('button', { name: 'הסתרת ריהוט רחוב' }).click();
  await page.getByRole('tab', { name: /תוכנית/ }).click();
  await page.waitForTimeout(300);
  check(!(await planIds(page)).includes(benchId), 'hidden layer is hidden in the plan');
  await page.getByRole('tab', { name: /תלת/ }).click();
  await panel().getByRole('button', { name: 'הצגת ריהוט רחוב' }).click();
  await page.getByRole('tab', { name: /תוכנית/ }).click();
  await page.waitForTimeout(300);
  check((await planIds(page)).includes(benchId), 'showing the layer brings it back');

  // ---- topography: a manual height point and the slope between two points ----
  await page.getByRole('tab', { name: /טופוגרפיה/ }).click();
  await page.waitForTimeout(300);
  await panel().getByRole('button', { name: /נקודת גובה/ }).click();
  await clickWorld(page, 30000, 20000);
  const hdlg = page.getByRole('dialog', { name: 'נקודת גובה' });
  check(/מפלס בסיס, אין נתון/.test(await hdlg.innerText()), 'before any data the dialog says the ground is only the base level');
  await hdlg.getByRole('textbox', { name: 'גובה (מפלס)' }).fill('1.5');
  await hdlg.getByRole('button', { name: 'הוספה' }).click();
  await page.waitForTimeout(300);
  const tp = await panel().innerText();
  check(/\+1\.50/.test(tp) && /הוזן ידנית/.test(tp), 'height point +1.50 listed as manually entered data');
  await panel().getByRole('button', { name: /שיפוע בין נקודות/ }).click();
  await clickWorld(page, 30000, 20000);
  await clickWorld(page, 45000, 20000);
  const slope = await page.locator('[data-testid="slope-result"]').innerText();
  check(/15 מ׳/.test(slope) && /-0\.75/.test(slope) && /5%/.test(slope) && /1:20/.test(slope), `slope between points: 15 m, -0.75 m, 5% (1:20) [${slope.replace(/\n/g, ' ')}]`);
  check(/אינטרפולציה/.test(slope), 'the second level is labelled as interpolated, not as data');

  // ---- sections ----
  await page.getByRole('tab', { name: /חתכים/ }).click();
  await page.waitForTimeout(300);
  check(await page.getByText(/כדי לראות חתך/).count() >= 1, 'no section yet: explains how to draw one');
  await page.getByRole('button', { name: /קו חתך חדש/ }).click();
  await page.waitForTimeout(300);
  await clickWorld(page, 12500, 2000);
  await clickWorld(page, 12500, 38000);
  await page.waitForTimeout(500);
  await page.locator('.sec-list .choice').first().click();
  await page.waitForTimeout(500);
  let info = await page.locator('[data-testid="section-info"]').innerText();
  const cut1 = Number((info.match(/נחתכים: (\d+)/) || [])[1]);
  check(cut1 >= 2 && /ספסל/.test(info) && /שביל/.test(info), `section A-A cuts the bench and the path (${cut1} cut)`);
  check(/אינטרפולציה/.test(info), 'section states that the ground along the line is interpolated from height points');
  check(await page.locator('[data-testid="site-section"] svg path').count() > 10, 'section drawing rendered');
  // move the bench away; the section follows
  await page.getByRole('tab', { name: /תוכנית/ }).click();
  await clickWorld(page, 12500, 10000);
  await setField(page, 'X', '50');
  await page.getByRole('tab', { name: /חתכים/ }).click();
  await page.waitForTimeout(500);
  info = await page.locator('[data-testid="section-info"]').innerText();
  const cut2 = Number((info.match(/נחתכים: (\d+)/) || [])[1]);
  check(cut2 === cut1 - 1 && !/ספסל/.test(info.split('\n')[2] || ''), `section updates after the bench moved away (${cut1} → ${cut2} cut)`);
  await page.screenshot({ path: 'shots/t-site-section.png' });

  // ---- save, refresh, still there ----
  const projUrl = page.url();
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForTimeout(1200);
  if (!page.url().includes('project')) await page.goto(projUrl);
  await page.waitForSelector('[data-testid="site-plan"]');
  await page.waitForTimeout(500);
  check((await planIds(page)).length === 4, 'after a refresh the project is still there (saved in the browser)');

  // ---- export the project file and import it again ----
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'שמירת קובץ פרויקט לגיבוי' }).click()]);
  await dl.saveAs('out/site-project.archicut');
  const file = JSON.parse(fs.readFileSync('out/site-project.archicut', 'utf8'));
  const sp = file.projects[0];
  check(file.version === 2 && sp.type === 'site' && sp.data.elements.length === 4 && sp.data.terrain.points.length === 1 && sp.data.sections.length === 1, 'project file (version 2) holds elements, height data and sections');
  const lot = sp.data.elements.find((e) => e.kind === 'lot');
  check(JSON.stringify(lot.geom.pts) === JSON.stringify([{ x: 0, y: 0 }, { x: 60000, y: 0 }, { x: 60000, y: 40000 }, { x: 0, y: 40000 }]), 'stored lot corners are exact millimetres (no rounding)');
  await page.goto(BASE);
  await page.waitForSelector('.proj-card');
  const before = await page.locator('.proj-card').count();
  await page.locator('input[type=file][accept*=archicut]').setInputFiles('out/site-project.archicut');
  await page.waitForTimeout(800);
  check(await page.locator('.proj-card').count() === before + 1, 'imported project appears on the home screen');
  await page.locator('.proj-card .name', { hasText: 'מיובא' }).first().click();
  await page.waitForSelector('[data-testid="site-plan"]');
  await page.waitForTimeout(500);
  check((await planIds(page)).length === 4, 'imported project opens with all its elements');

  done(errors);
  await browser.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
