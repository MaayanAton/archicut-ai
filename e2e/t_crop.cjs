const { check, start, done } = require('./lib.cjs');
const readBg = (page) => page.evaluate(async () => {
  const id = location.hash.split('/')[2];
  const db = await new Promise((res, rej) => { const r = indexedDB.open('archicut-ai'); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const v = await new Promise((res) => { const t = db.transaction('projects').objectStore('projects').get(id); t.onsuccess = () => res(t.result); });
  return v && v.data.background && { w: v.data.background.pxW, h: v.data.background.pxH, mm: v.data.background.mmPerPx };
});
(async () => {
  const { browser, page, errors } = await start();
  await page.locator('input[type=file]').first().setInputFiles('exercise.jpg');
  await page.waitForURL(/#\/p\//); await page.waitForTimeout(1000);
  const b0 = await readBg(page);
  check(b0 && b0.w === 972 && b0.h === 1400, `uploaded image stored at full size (${JSON.stringify(b0)})`);
  await page.getByRole('button', { name: 'סיבוב וחיתוך' }).click();
  await page.waitForTimeout(900);
  const img = await page.getByRole('dialog').locator('img').boundingBox();
  // drag from 25%/25% to 75%/75% of the displayed image -> crop about half of each side
  await page.mouse.move(img.x + img.width * 0.25, img.y + img.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(img.x + img.width * 0.75, img.y + img.height * 0.75, { steps: 6 });
  await page.mouse.up();
  await page.screenshot({ path: 'shots/t-crop-dialog.png' });
  await page.getByRole('dialog').getByRole('button', { name: 'שמירה' }).click();
  await page.waitForTimeout(1500);
  const b1 = await readBg(page);
  check(b1 && Math.abs(b1.w - 486) <= 4 && Math.abs(b1.h - 700) <= 4, `crop keeps the dragged half of the image (${JSON.stringify(b1)})`);
  done(errors);
  await browser.close();
})();
