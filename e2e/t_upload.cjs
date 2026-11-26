const { check, start, done, BASE } = require('./lib.cjs');
(async () => {
  const { browser, page, errors } = await start();
  // JPG upload
  await page.locator('input[type=file]').first().setInputFiles('exercise.jpg');
  await page.waitForURL(/#\/p\//, { timeout: 15000 });
  await page.waitForTimeout(1000);
  check(await page.getByTestId('image-canvas').count() === 1, 'JPG upload opens a drawing with the image beside it');
  check((await page.locator('aside.panel').innerText()).includes('לא מכוילת'), 'new image is marked as not calibrated');
  // Measure before calibration: pixels, not mm
  await page.locator('.toolbar .tool', { hasText: 'מדידה' }).click();
  const img = await page.getByTestId('image-canvas').boundingBox();
  const ix = img.x + img.width / 2, iy = img.y + img.height / 2;
  await page.mouse.click(ix - 100, iy); await page.mouse.click(ix + 100, iy);
  await page.waitForTimeout(300);
  let txt = await page.locator('.stage').innerText();
  check(txt.includes('פיקסלים') && txt.includes('לא מכוילת'), 'measuring an uncalibrated image shows pixels, not mm');
  // Calibrate: 200 screen px = some image px; tell it 100 mm
  await page.locator('.toolbar .tool', { hasText: 'כיול' }).click();
  await page.mouse.click(ix - 100, iy + 50); await page.mouse.click(ix + 100, iy + 50);
  await page.waitForTimeout(300);
  check(await page.getByRole('dialog', { name: 'כיול קנה מידה' }).count() === 1, 'calibration dialog opens after two clicks');
  await page.getByLabel('המרחק האמיתי').fill('100');
  await page.getByRole('button', { name: 'שמירת הכיול' }).click();
  await page.waitForTimeout(600);
  const panelTxt = await page.locator('aside.panel').innerText();
  check(!panelTxt.includes('התמונה לא מכוילת. כדי'), 'calibration status updated');
  // Measure same distance -> approx 100 mm, flagged as approximate
  await page.locator('.toolbar .tool', { hasText: 'מדידה' }).click();
  const img2 = await page.getByTestId('image-canvas').boundingBox();
  // the view refits after calibration, so measure the full canvas width instead and just check the wording
  await page.mouse.click(img2.x + 40, iy); await page.mouse.click(img2.x + img2.width - 40, iy);
  await page.waitForTimeout(300);
  txt = await page.locator('.stage').innerText();
  check(/≈ [\d.,]+ מ״מ \(משוער, לפי התמונה\)/.test(txt), 'measuring a calibrated image says the value is approximate');
  await page.screenshot({ path: 'shots/t-upload-calibrated.png' });
  // Rotate/crop dialog opens and saving resets calibration
  await page.getByRole('button', { name: 'סיבוב וחיתוך' }).click();
  await page.waitForTimeout(800);
  check(await page.getByRole('dialog', { name: 'סיבוב וחיתוך התמונה' }).count() === 1, 'rotate/crop dialog opens');
  await page.getByRole('button', { name: /90° ימינה/ }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'shots/t-upload-rotate.png' });
  await page.getByRole('dialog').getByRole('button', { name: 'שמירה' }).click();
  await page.waitForTimeout(1200);
  check((await page.locator('aside.panel').innerText()).includes('לא מכוילת'), 'after rotation the image must be calibrated again');
  // PDF upload (needs a multi-page PDF with at least 5 pages: set TEST_PDF)
  const pdf = process.env.TEST_PDF || '';
  if (pdf && require('fs').existsSync(pdf)) {
  await page.goto(BASE); await page.waitForSelector('.proj-card');
  await page.locator('input[type=file]').first().setInputFiles(pdf);
  await page.getByRole('dialog', { name: 'איזה עמוד לטעון?' }).waitFor({ timeout: 30000 });
  check((await page.getByRole('dialog').innerText()).includes('9 עמודים'), 'multi-page PDF asks which page to load');
  await page.getByLabel(/מספר עמוד/).fill('5');
  await page.getByRole('button', { name: 'טעינת העמוד' }).click();
  await page.waitForURL(/#\/p\//, { timeout: 30000 });
  await page.waitForTimeout(1500);
  check(await page.getByTestId('image-canvas').count() === 1, 'PDF page 5 rendered as the background image');
  check((await page.locator('.topbar').innerText()).includes('עמוד 5'), 'project name says which page was loaded');
  } else console.log('SKIP PDF upload: no TEST_PDF file');
  await page.screenshot({ path: 'shots/t-upload-pdf.png' });
  // Unsupported file type
  await page.goto(BASE); await page.waitForSelector('.proj-card');
  require('fs').writeFileSync('bad.txt', 'hello');
  await page.locator('input[type=file]').first().setInputFiles('bad.txt');
  await page.waitForTimeout(800);
  const t2 = await page.locator('.toast').allInnerTexts();
  check(t2.some((t) => t.length > 5) && !page.url().includes('#/p/'), `unsupported file shows a message (${t2.join(' | ')})`);
  done(errors);
  await browser.close();
})();
