const { check, start, openProject, done } = require('./lib.cjs');
(async () => {
  const { browser, page, errors } = await start();
  await openProject(page, 'חתך אלכסוני בקובייה');
  const panel = page.locator('aside.panel');
  const results = async () => (await panel.locator('.panel-section').last().innerText()).replace(/\s+/g, ' ');
  const tilt = page.getByLabel('זווית הטיה – ערך מדויק');
  const off = page.getByLabel('מיקום החיתוך (מהמרכז) – ערך מדויק');
  await tilt.fill('0'); await off.fill('0'); await page.waitForTimeout(300);
  let t = await results();
  check(/שטח: 10,?000(\.0)? מ/.test(t), `cube 100, horizontal mid cut area 10000 (${t.slice(0, 120)})`);
  await tilt.fill('45'); await page.waitForTimeout(300);
  t = await results();
  check(/14,?142\.1/.test(t), 'cube tilt 45 area 14142.1');
  await tilt.fill('0'); await off.fill('50'); await page.waitForTimeout(300);
  t = await results();
  check(t.includes('מגע בפאה') || t.includes('מתלכד עם פאה'), 'plane on top face reported as face contact');
  await off.fill('60'); await page.waitForTimeout(300);
  t = await results();
  check(t.includes('לא חותך'), 'plane above the cube reported as no section');
  // Vertex touch: advanced mode, plane normal along a body diagonal through a corner (distance 86.6025)
  await page.getByText('מצב מתקדם: סיבוב הגוף וסיבוב המישור').click();
  await page.getByLabel('סיבוב המישור סביב ציר Z – ערך מדויק').fill('135');
  await tilt.fill('54.7356');
  await off.fill('86.6025'); await page.waitForTimeout(300);
  t = await results();
  check(t.includes('נוגע בקודקוד'), `vertex touch reported as a single point (${t.slice(0, 90)})`);
  await page.waitForTimeout(1600); // a new typing burst in the same field is a separate undo step
  await off.fill('0'); await page.waitForTimeout(300);
  t = await results();
  check(t.includes('6 צלעות') && t.includes('משושה'), 'body-diagonal mid plane gives a hexagon');
  // Undo restores previous offset
  await page.getByLabel('ביטול פעולה').click(); await page.waitForTimeout(300);
  check((await off.inputValue()) === '86.6025', `undo restores offset (got ${await off.inputValue()})`);
  // Cylinder
  await page.getByLabel('סוג הגוף').selectOption({ label: 'גליל' });
  await page.waitForTimeout(300);
  check((await page.locator('aside.panel').innerText()).includes('חסר'), 'switching to cylinder asks for its missing dimensions');
  await page.getByLabel('רדיוס', { exact: false }).first().fill('40');
  await page.getByLabel('גובה', { exact: false }).first().fill('140');
  await page.getByLabel('סיבוב המישור סביב ציר Z – ערך מדויק').fill('0');
  await tilt.fill('0'); await off.fill('0'); await page.waitForTimeout(300);
  t = await results();
  check(t.includes('מעגל'), `cylinder horizontal cut is a circle (${t.slice(0, 100)})`);
  const rField = page.getByLabel('רדיוס', { exact: false }).first();
  await rField.fill(''); await page.waitForTimeout(300);
  const ptext = await panel.innerText();
  check(ptext.includes('חסר'), 'clearing radius shows a missing-value warning');
  check(await page.getByRole('button', { name: 'שרטוט דו-ממדי של החתך' }).count() === 0, 'no section results while data is missing');
  await rField.fill('40'); await page.waitForTimeout(300);
  await page.screenshot({ path: 'shots/t-section-cyl.png' });
  // 2D drawing from section
  await page.getByRole('button', { name: 'שרטוט דו-ממדי של החתך' }).click();
  await page.waitForTimeout(800);
  check(page.url().includes('#/p/'), 'navigated to the new drawing project');
  check(await page.locator('svg.canvas polygon, svg.canvas path').count() > 0, 'section drawing has shapes');
  await page.screenshot({ path: 'shots/t-section-to2d.png' });
  done(errors);
  await browser.close();
})();
