const { check, start, done, BASE } = require('./lib.cjs');
(async () => {
  const { browser, page, errors } = await start();
  const cards = () => page.locator('.proj-card').count();
  const n0 = await cards();
  const first = page.locator('.proj-card').first();
  const name0 = await first.locator('.name').innerText();
  // Rename
  await first.getByLabel('שינוי שם').click();
  const input = page.getByRole('dialog').locator('input');
  await input.fill('');
  check(await page.getByRole('dialog').getByRole('button', { name: 'שמירה' }).isDisabled(), 'empty name cannot be saved');
  await input.fill('התרגיל שלי');
  await page.getByRole('dialog').getByRole('button', { name: 'שמירה' }).click();
  await page.waitForTimeout(300);
  check(await page.locator('.proj-card .name', { hasText: 'התרגיל שלי' }).count() === 1, 'rename works');
  // Duplicate
  await page.locator('.proj-card', { hasText: 'התרגיל שלי' }).getByLabel('שכפול').click();
  await page.waitForTimeout(300);
  check(await cards() === n0 + 1, 'duplicate adds a card');
  // Export single project file
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.proj-card', { hasText: 'התרגיל שלי' }).first().getByLabel('ייצוא קובץ פרויקט').click()]);
  await dl.saveAs('out/one.archicut');
  const file = JSON.parse(require('fs').readFileSync('out/one.archicut', 'utf8'));
  check(file.app === 'ArchiCut AI' || file.projects?.length === 1 || file.version, `project file is valid JSON (${dl.suggestedFilename()})`);
  // Delete with confirmation: cancel first, then confirm
  const dupCard = page.locator('.proj-card').filter({ hasText: 'עותק' }).first();
  const dupName = await dupCard.locator('.name').innerText();
  await dupCard.getByLabel('מחיקה').click();
  check(await page.getByRole('dialog', { name: 'מחיקת פרויקט' }).count() === 1, 'delete asks for confirmation');
  await page.getByRole('dialog').getByRole('button', { name: 'ביטול' }).click();
  await page.waitForTimeout(200);
  check(await cards() === n0 + 1, 'cancel keeps the project');
  await dupCard.getByLabel('מחיקה').click();
  await page.getByRole('dialog').getByRole('button', { name: 'מחיקה' }).click();
  await page.waitForTimeout(400);
  check(await cards() === n0 && (await page.locator('.proj-card .name', { hasText: dupName }).count()) === 0, `confirmed delete removes "${dupName}"`);
  // Backup all
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /גיבוי כל הפרויקטים/ }).click()]);
  await dl2.saveAs('out/all.archicut');
  check(require('fs').statSync('out/all.archicut').size > 1000, `backup of all projects downloaded (${dl2.suggestedFilename()})`);
  // Import the single file -> adds a project (new id)
  await page.locator('input[type=file]').nth(1).setInputFiles('out/one.archicut');
  await page.waitForTimeout(600);
  check(await cards() === n0 + 1, 'importing a project file adds it');
  // Import a broken file -> friendly message, nothing added
  require('fs').writeFileSync('out/broken.archicut', '{"nope":1}');
  await page.locator('input[type=file]').nth(1).setInputFiles('out/broken.archicut');
  await page.waitForTimeout(600);
  const t = await page.locator('.toast').allInnerTexts();
  check(await cards() === n0 + 1 && t.some((x) => x.length > 5), `broken file rejected with a message (${t.slice(-1)})`);
  // Persistence after reload
  await page.reload(); await page.waitForSelector('.proj-card');
  check(await cards() === n0 + 1, 'projects persist after reload');
  done(errors);
  await browser.close();
})();
