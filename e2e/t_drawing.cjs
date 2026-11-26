const { check, start, done, BASE } = require('./lib.cjs');
(async () => {
  const { browser, page, errors } = await start();
  await page.getByRole('button', { name: /שרטוט חדש/ }).click();
  await page.locator('.choice').nth(2).click();
  await page.waitForTimeout(800);
  check(page.url().includes('#/p/'), 'new free drawing created');
  const canvas = page.getByTestId('drawing-canvas');
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const count = () => page.locator('[data-testid="drawing-canvas"] svg.canvas [data-eid]').count();
  const tool = (name) => page.locator('.toolbar .tool', { hasText: name }).first().click();
  // Line: click-click
  await tool('קו');
  await page.mouse.click(cx - 150, cy);
  await page.mouse.click(cx + 150, cy);
  await page.waitForTimeout(300);
  let n = await count();
  check(n === 1, `line created by two clicks (${n} elements)`);
  // Properties panel shows length; set length 100
  const len = page.getByLabel('אורך', { exact: true });
  check(await len.count() === 1, 'properties panel shows line length');
  const before = Number(await len.inputValue());
  await len.fill('100'); await page.waitForTimeout(300);
  check((await len.inputValue()) === '100', `line length edited to 100 (was ${before})`);
  // Rect by drag
  await tool('מלבן');
  await page.mouse.move(cx - 100, cy + 40); await page.mouse.down(); await page.mouse.move(cx, cy + 100, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(300);
  n = await count();
  check(n === 2, `rectangle created by dragging (${n} elements)`);
  // Circle
  await tool('עיגול');
  await page.mouse.click(cx + 120, cy + 80); await page.mouse.click(cx + 160, cy + 80);
  await page.waitForTimeout(300);
  check(await count() === 3, 'circle created');
  const rField = page.getByLabel('רדיוס', { exact: true });
  check(await rField.count() === 1, 'circle radius field shown');
  // Text
  await tool('טקסט');
  await page.mouse.click(cx, cy - 100);
  await page.getByLabel('טקסט', { exact: true }).fill('חתך A-A');
  await page.getByRole('button', { name: 'הוספה' }).click();
  await page.waitForTimeout(300);
  check(await count() === 4, 'text added');
  check(await page.locator('svg.canvas text', { hasText: 'חתך A-A' }).count() >= 1, 'text rendered on canvas');
  // Dimension
  await tool('קו מידה');
  await page.mouse.click(cx - 150, cy - 40); await page.mouse.click(cx + 150, cy - 40);
  await page.waitForTimeout(300);
  check(await count() === 5, 'dimension added');
  // Undo / redo
  await page.getByLabel('ביטול פעולה').click(); await page.waitForTimeout(200);
  check(await count() === 4, 'undo removes the dimension');
  await page.keyboard.press('Control+y'); await page.waitForTimeout(200);
  check(await count() === 5, 'Ctrl+Y redoes it');
  // Select and move the circle with the select tool, then delete it
  await tool('בחירה');
  await page.mouse.click(box.x + 5, box.y + box.height - 5); await page.waitForTimeout(200);
  const circ = await page.locator('[data-testid="drawing-canvas"] svg.canvas [data-eid] circle').first().boundingBox();
  await page.screenshot({ path: 'shots/t-drawing-before-select.png' });
  await page.mouse.click(circ.x + circ.width - 1, circ.y + circ.height / 2); await page.waitForTimeout(200);
  check(await page.getByText('עיגול נבחר').count() === 1, 'clicking the circle edge selects it');
  await page.getByRole('button', { name: 'מחיקה' }).click(); await page.waitForTimeout(200);
  check(await count() === 4, 'delete removes the selected element');
  // Grid snap: with snap, a line end lands on grid multiples
  await page.screenshot({ path: 'shots/t-drawing.png' });
  await page.reload(); await page.waitForTimeout(1000);
  check(await count() === 4, 'drawing persisted after reload');
  done(errors);
  await browser.close();
})();
