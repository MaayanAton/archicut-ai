const { check, start, openProject, done } = require('./lib.cjs');
(async () => {
  const { browser, page, errors } = await start({ width: 390, height: 844 }, { hasTouch: true });
  await openProject(page, 'חתכי חרוט');
  await page.locator('.topbar .btn.primary').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'shots/phone-print.png' });
  await page.screenshot({ path: 'shots/phone-print-full.png', fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `no horizontal scroll on phone print screen (${overflow})`);
  done(errors);
  await browser.close();
})();
