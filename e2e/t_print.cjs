const { check, start, openProject, done } = require('./lib.cjs');
const name = process.argv[2] || 'חתך אלכסוני בקובייה';
const tag = process.argv[3] || 'cube';
(async () => {
  const { browser, page, errors } = await start();
  await openProject(page, name);
  await page.getByRole('button', { name: /הדפסה וייצוא/ }).click();
  await page.waitForTimeout(1200);
  check(page.url().endsWith('/print'), 'print screen opened');
  await page.screenshot({ path: `shots/t-print-${tag}.png` });
  const panel = await page.locator('aside.panel').innerText();
  console.log('notice:', panel.split('\n').filter((l) => /נכנס|לא נכנס|ריק/.test(l)).join(' | '));
  for (const [btn, ext] of [['PDF', 'pdf'], ['SVG', 'svg'], ['PNG', 'png']]) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: btn, exact: true }).click()]);
    const path = `out/${tag}.${ext}`;
    await dl.saveAs(path);
    const size = require('fs').statSync(path).size;
    check(size > 1000, `${btn} downloaded (${size} bytes, ${dl.suggestedFilename()})`);
  }
  // print button: injects #print-root with @page size; intercept window.print
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await page.getByRole('button', { name: 'הדפסה', exact: true }).click();
  await page.waitForTimeout(400);
  const printed = await page.evaluate(() => ({ n: window.__printed, html: document.getElementById('print-root')?.innerHTML.slice(0, 120) }));
  check(printed.n === 1 && printed.html.includes('@page{size:'), `print button opens the print dialog with exact page size (${printed.html})`);
  done(errors);
  await browser.close();
})();
