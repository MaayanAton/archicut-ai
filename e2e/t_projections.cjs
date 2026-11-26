const { check, start, openProject, done } = require('./lib.cjs');
(async () => {
  const { browser, page, errors } = await start();
  await openProject(page, 'היטלי נקודות');
  const epure = page.getByTestId('epure');
  check(await epure.count() === 1, 'epure canvas present');
  const markerPos = async (which) => {
    const g = page.locator(`[data-testid="epure"] g[data-which="${which}"] circle`).first();
    const b = await g.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const a2 = await markerPos('2'), a1 = await markerPos('1');
  check(Math.abs(a2.x - a1.x) < 1.5, `A1 and A2 on the same recall line (dx=${(a2.x - a1.x).toFixed(2)})`);
  // Edit X of A from 60 to 80: both projections must move left by 20mm*k (epure X axis is mirrored when π3 is right).
  const xA = page.getByLabel('X של A');
  await xA.fill('80');
  await page.waitForTimeout(300);
  const a2b = await markerPos('2');
  check(a2b.x < a2.x - 5, `A2 moved after editing X (from ${a2.x.toFixed(1)} to ${a2b.x.toFixed(1)})`);
  // Undo returns it
  await page.getByLabel('ביטול פעולה').click();
  await page.waitForTimeout(300);
  check((await xA.inputValue()) === '40', `undo restores X=40 (got ${await xA.inputValue()})`);
  await page.getByLabel('שחזור פעולה').click();
  await page.waitForTimeout(300);
  check((await xA.inputValue()) === '80', `redo restores X=80 (got ${await xA.inputValue()})`);
  await page.getByLabel('ביטול פעולה').click();
  // Clear Z of A: missing data warning, A2 and A3 hidden, A1 still shown
  const zA = page.getByLabel('Z של A');
  await zA.fill('');
  await page.waitForTimeout(300);
  check(await page.getByText('יש נקודות עם נתונים חסרים').count() === 1, 'missing data warning shown');
  check((await zA.getAttribute('class')).includes('missing'), 'empty field marked missing');
  const aId = await page.locator('[data-testid="epure"] g[data-which="1"]').first().getAttribute('data-pid');
  const shown = await page.locator(`[data-testid="epure"] g[data-pid="${aId}"]`).evaluateAll((els) => els.map((e) => e.getAttribute('data-which')));
  check(JSON.stringify(shown) === '["1"]', `only A1 drawn when Z missing (got ${JSON.stringify(shown)})`);
  check((await zA.inputValue()) === '', 'app did not fill the missing value');
  await zA.fill('28');
  await page.waitForTimeout(300);
  // Drag A2 straight up by 40px: Z must grow, X unchanged
  const p = await markerPos('2');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x, p.y - 20, { steps: 4 });
  await page.mouse.move(p.x, p.y - 40, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const z = Number(await zA.inputValue()), x = Number(await xA.inputValue());
  check(z > 28 && Number.isInteger(z), `dragging A2 up raised Z to a whole number (Z=${z})`);
  check(x === 40, `dragging A2 vertically kept X=40 (X=${x})`);
  // Typing several digits is one undo step
  const yA = page.getByLabel('Y של A');
  const y0 = await yA.inputValue();
  await yA.click(); await yA.press('Control+a'); await page.keyboard.type('125', { delay: 80 });
  await page.waitForTimeout(200);
  check((await yA.inputValue()) === '125', 'typed Y=125');
  await page.locator('h3').first().click();
  await page.getByLabel('ביטול פעולה').click(); await page.waitForTimeout(200);
  check((await yA.inputValue()) === y0, `one undo reverts the whole typed number (got ${await yA.inputValue()}, expected ${y0})`);
  // Add point -> row with empty coordinates
  await page.getByRole('button', { name: 'נקודה' }).click();
  await page.waitForTimeout(300);
  const rows = await page.locator('.pt-row:not(.head)').count();
  check(rows === 6, `new point row added (${rows} rows)`);
  const lastX = page.locator('.pt-row:not(.head)').last().locator('input.numeric').first();
  check((await lastX.inputValue()) === '', 'new point has empty X (no invented value)');
  // switch π3 side to left: A3 moves to the other side
  const a3right = await markerPos('3');
  await page.getByRole('radio', { name: 'משמאל' }).click();
  await page.waitForTimeout(400);
  const a3left = await markerPos('3');
  check(a3left.x < a3right.x - 20 || a3left.x !== a3right.x, `π3 side switch moves A3 (${a3right.x.toFixed(0)} -> ${a3left.x.toFixed(0)})`);
  await page.screenshot({ path: 'shots/t-projections.png' });
  // persistence: reload and check data still there
  await page.reload();
  await page.waitForTimeout(1200);
  check((await page.getByLabel('Z של A').inputValue()) === String(z), `after reload Z of A is still ${z}`);
  check(await page.locator('.pt-row:not(.head)').count() === 6, 'after reload new point row persisted');
  done(errors);
  await browser.close();
})();
