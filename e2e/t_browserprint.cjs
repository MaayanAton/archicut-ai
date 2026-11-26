const { check, start, openProject, done } = require('./lib.cjs');
(async () => {
  const { browser, page, errors } = await start();
  for (const [name, tag, a3] of [['חתך אלכסוני בקובייה', 'bp-cube', false], ['חדר עם מידות', 'bp-room-a3', true]]) {
    await openProject(page, name);
    await page.getByRole('button', { name: /הדפסה וייצוא/ }).click();
    await page.waitForTimeout(800);
    if (a3) { await page.getByRole('radio', { name: 'A3' }).click(); await page.getByRole('radio', { name: /לרוחב/ }).click(); await page.waitForTimeout(300); }
    await page.evaluate(() => { window.print = () => {}; });
    await page.getByRole('button', { name: 'הדפסה', exact: true }).click();
    await page.waitForTimeout(300);
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: `out/${tag}.pdf`, preferCSSPageSize: true, printBackground: true });
    await page.emulateMedia({ media: 'screen' });
    check(true, `browser print rendered to out/${tag}.pdf`);
  }
  done(errors);
  await browser.close();
})();
