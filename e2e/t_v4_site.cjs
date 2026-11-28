// Version 4.0 site library in a real browser: the library count and groups, Hebrew search, favourites, an olive
// tree, the monumental gate with its real openings in a section and its stone texture, the study shelters with their
// notice, a sand surface with a texture, stepping stones along a line, everything in 3D, and saving.
const fs = require('fs');
const { check, start, done } = require('./lib.cjs');
const { clickWorld, planIds, canvasInk } = require('./site_lib.cjs');

(async () => {
  const { browser, page, errors } = await start();
  page.setDefaultTimeout(15000);
  const panel = () => page.locator('aside.site-panel');
  const search = () => panel().getByRole('textbox', { name: 'חיפוש בספרייה' });
  const place = async (q, label, x, y) => {
    await search().fill(q);
    await panel().locator('.lib-item', { hasText: label }).first().click();
    await clickWorld(page, x, y);
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
  };

  await page.getByRole('button', { name: /שרטוט חדש/ }).click();
  await page.getByRole('button', { name: /תכנון אדריכלי ומתחמים/ }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'מגרש מלבני במידות' }).click();
  const dlg = page.getByRole('dialog', { name: 'מגרש מלבני במידות' });
  await dlg.getByRole('textbox', { name: 'רוחב (לאורך X)' }).fill('60');
  await dlg.getByRole('textbox', { name: 'עומק (לאורך Y)' }).fill('40');
  await dlg.getByRole('button', { name: 'יצירת המגרש' }).click();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');

  // ---- the library ----
  const count = Number(((await panel().locator('h3', { hasText: 'ספריית אלמנטים' }).innerText()).match(/\((\d+)\)/) || [])[1]);
  check(count >= 120, `the site library has ${count} items`);
  const cats = await panel().locator('.lib-cat-head').allInnerTexts();
  check(['משחק וספורט', 'מים, הצללה ופנאי', 'עצים, שיחים וכיסוי קרקע'].every((c) => cats.some((x) => x.includes(c))), 'new groups: play and sport, water and shade, trees and ground cover');
  await panel().locator('.lib-cat-head', { hasText: 'עצים, שיחים' }).click();
  const subs = await panel().locator('.lib-sub').allInnerTexts();
  check(['עצים', 'שיחים וצמחים', 'משטחי קרקע'].every((s) => subs.includes(s)), `the plants group is split into sub-groups (${subs.join(', ')})`);
  await search().fill('נדנדה');
  check(await panel().locator('.lib-item', { hasText: 'נדנדה' }).count() >= 1, 'search finds the swing');
  await panel().locator('.lib-star').first().click();
  await search().fill('');
  await panel().getByRole('button', { name: /מועדפים \(1\)/ }).click();
  check(await panel().locator('.lib-item').count() === 1, 'a starred site item appears under favourites');
  await panel().getByRole('button', { name: 'לפי קטגוריה' }).click();

  // ---- items ----
  const n0 = (await planIds(page)).length;
  await place('זית', 'עץ זית', 10000, 30000);
  await place('שער ניצחון', 'שער מונומנטלי', 30000, 8000);
  await place('מקלט תת', 'מקלט ציבורי תת', 50000, 10000);
  await place('נדנדה', 'נדנדה', 20000, 22000);
  check((await planIds(page)).length === n0 + 4, 'olive tree, monumental gate, underground shelter and swing are placed');

  await clickWorld(page, 30000 - 5800, 8000);
  await page.waitForTimeout(300);
  let props = await page.getByTestId('site-props').innerText();
  check(/שער מונומנטלי/.test(props) && /פתחים אמיתיים/.test(props), 'the gate says its openings are real geometry');
  const fin = page.getByTestId('site-finish');
  check(await fin.count() === 1 && /אבן/.test(await fin.locator('.mat-current').innerText()), 'the gate has a stone texture from the shared catalogue');
  await fin.getByRole('button', { name: 'בחירת חומר' }).click();
  await fin.getByRole('textbox', { name: /חיפוש חומר/ }).fill('טרוורטין');
  await fin.locator('.mat-item', { hasText: 'טרוורטין' }).first().click();
  await page.waitForTimeout(300);
  check(/טרוורטין/.test(await fin.locator('.mat-current').innerText()), 'the gate material changes to travertine');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await clickWorld(page, 50000, 10000);
  await page.waitForTimeout(300);
  props = await page.getByTestId('site-props').innerText();
  check(/המחשה תכנונית לימודית בלבד/.test(props) && /אין להציג את התכנון כתקני/.test(props), 'the underground shelter carries the study notice');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // ---- a sand surface and stepping stones ----
  await search().fill('חול');
  await panel().locator('.lib-item', { hasText: /^חול$/ }).first().click();
  await panel().getByRole('radio', { name: 'מלבן', exact: true }).click();
  await clickWorld(page, 40000, 22000);
  await clickWorld(page, 48000, 28000);
  await page.waitForTimeout(300);
  props = await page.getByTestId('site-props').innerText();
  check(/48 מ״ר/.test(props) && /חול/.test(await page.getByTestId('site-finish').locator('.mat-current').innerText()), 'a 48 m² sand surface with a sand texture');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await search().fill('אבני מדרך');
  await panel().locator('.lib-item', { hasText: 'אבני מדרך' }).first().click();
  await clickWorld(page, 5000, 15000);
  await clickWorld(page, 12000, 15000);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  check((await planIds(page)).length === n0 + 6, 'the stepping-stone path is drawn along the line');

  // ---- section through the middle of the gate ----
  await page.getByRole('tab', { name: /חתכים/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /קו חתך חדש/ }).click();
  await page.waitForTimeout(300);
  await clickWorld(page, 30000, 1000);
  await clickWorld(page, 30000, 14000);
  await page.waitForTimeout(500);
  await page.locator('.sec-list .choice').first().click();
  await page.waitForTimeout(500);
  const info = await page.locator('[data-testid="section-info"]').innerText();
  check(/שער מונומנטלי/.test(info), `the section through the gate cuts it (${info.replace(/\s+/g, ' ').slice(0, 90)})`);
  await page.screenshot({ path: 'shots/t-v4-site-section.png' });

  // ---- 3D ----
  await page.getByRole('tab', { name: /תלת/ }).click();
  await page.waitForTimeout(2500);
  const ink = await canvasInk(page, '[data-testid="site-3d"]');
  check(ink > 0.05, `3D draws the new site items (${(ink * 100).toFixed(0)}% of the canvas)`);
  await page.screenshot({ path: 'shots/t-v4-site-3d.png' });

  // ---- saved ----
  await page.getByRole('tab', { name: /תוכנית/ }).first().click();
  await page.waitForTimeout(1200);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /שמירת קובץ פרויקט|הורדת קובץ פרויקט/ }).first().click()]);
  await dl.saveAs('out/v4-site.archicut');
  const pf = JSON.parse(fs.readFileSync('out/v4-site.archicut', 'utf8'));
  const els = pf.projects[0].data.elements;
  const gate = els.find((e) => e.kind === 'gate-triumphal');
  check(pf.version <= 3 && gate?.finish?.material === 'travertine' && els.some((e) => e.kind === 'ground-sand' && e.finish?.material === 'sand'), 'the project file keeps the new items and their textures (file version ' + pf.version + ', readable by 3.0)');

  done(errors);
  await browser.close();
})().catch((e) => { console.log('FAIL exception: ' + e.message.split('\n')[0]); process.exitCode = 1; process.exit(1); });
