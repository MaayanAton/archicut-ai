// Version 4.0 (creative design) in a real browser: the material picker on a floor (parquet, colour, tile size,
// direction), a wall with a different material on each face and a partial cladding up to a height, a door and a window
// in a wallpapered wall, copying a wall design, applying a finish to all the walls of a room, the element library
// (count, Hebrew synonyms, favourites), an accessory placed on a table and an item snapped to a wall, layers, lock and
// duplicate, an arched passage and a standing arch gate, the study protected-room template, 3D night mode and
// quality, and everything kept after a refresh and in the project file.
const fs = require('fs');
const { check, start, done, BASE } = require('./lib.cjs');
const { viewOf, clickWorld, setField, fieldValue, canvasInk } = require('./site_lib.cjs');

const P = 'bld-plan';
const tool = (page, name) => page.locator('.toolbar').getByRole('button', { name, exact: true }).click();
const aside = (page) => page.locator('aside').first();
const toastText = async (page) => (await page.locator('.toast').allInnerTexts()).join(' ');
const planIds = (page) => page.locator(`[data-testid="${P}"] [data-el]`).evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-el')))]);
const floorLines = (page) => page.locator(`[data-testid="${P}"] path[clip-path^="url(#clip-rp"]`).evaluateAll((els) => els.map((e) => e.getAttribute('d')).join(''));
const segCount = (d) => (d.match(/M/g) || []).length;
const esc = async (page) => { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(150); };
async function pickMaterial(scope, query, label) {
  const open = scope.getByRole('button', { name: 'בחירת חומר' });
  if (await open.count()) await open.first().click();
  await scope.getByRole('textbox', { name: /חיפוש חומר/ }).first().fill(query);
  await scope.locator('.mat-item', { hasText: label }).first().click();
}

(async () => {
  const { browser, page, errors } = await start();
  page.setDefaultTimeout(15000);

  // ---- a 10 × 8 m house with two rooms ----
  await page.getByRole('button', { name: /שרטוט חדש/ }).click();
  await page.getByRole('button', { name: /תכנון מבנים ועיצוב פנים/ }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'בית חדש במידות חוץ' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: 'רוחב (מזרח–מערב)' }).fill('10');
  await dlg.getByRole('textbox', { name: 'עומק (צפון–דרום)' }).fill('8');
  await dlg.getByRole('button', { name: 'יצירה' }).click();
  await page.waitForTimeout(400);
  await esc(page);
  await tool(page, 'קירות');
  await clickWorld(page, 5000, 0, P);
  await clickWorld(page, 5000, 8000, P);
  await esc(page);
  // The quick start made one room ("חלל המבנה"); after the partition it is one half, the other half is a new room.
  await tool(page, 'חדר');
  await clickWorld(page, 2500, 4000, P);
  await tool(page, 'חדר');
  await clickWorld(page, 7500, 4000, P);
  await page.waitForTimeout(250);
  await esc(page);
  await clickWorld(page, 7500, 4000, P);
  await page.waitForTimeout(250);
  await aside(page).getByRole('textbox', { name: 'שם החדר' }).fill('חדר שינה');
  await esc(page);
  const net = await aside(page).innerText();
  check(/69\.75\s*מ״ר/.test(net), 'the house and its two rooms are drawn (net 69.75 m²)');

  // ---- floor: parquet, colour, tile size, direction ----
  await clickWorld(page, 2500, 4000, P);
  await page.waitForTimeout(300);
  await aside(page).getByRole('textbox', { name: 'שם החדר' }).fill('סלון');
  const fp = page.getByTestId('picker-floor');
  check(await fp.count() === 1, 'selecting a room shows the floor material picker');
  await pickMaterial(fp, 'אלון', 'אלון טבעי');
  await page.waitForTimeout(300);
  check(/אלון טבעי/.test(await fp.locator('.mat-current').innerText()), 'the floor is now natural oak parquet');
  let lines = await floorLines(page);
  check(segCount(lines) > 20, `the plan draws the parquet planks inside the room (${segCount(lines)} lines)`);
  const thumb1 = await fp.locator('.mat-current img').getAttribute('src');
  await fp.locator('.swatch').nth(4).click();
  await page.waitForTimeout(300);
  const thumb2 = await fp.locator('.mat-current img').getAttribute('src');
  check(thumb1 && thumb2 && thumb1 !== thumb2, 'changing the parquet colour changes its texture');
  await pickMaterial(fp, 'פורצלן', 'גרניט פורצלן');
  await page.waitForTimeout(300);
  await setField(page, 'רוחב אריח / דוגמה', '0.6', fp);
  await setField(page, 'גובה אריח / דוגמה', '0.6', fp);
  const small = segCount(await floorLines(page));
  await setField(page, 'רוחב אריח / דוגמה', '1.2', fp);
  await setField(page, 'גובה אריח / דוגמה', '1.2', fp);
  const big = segCount(await floorLines(page));
  check(big > 0 && big < small, `bigger tiles draw fewer joints (60×60: ${small} lines, 120×120: ${big})`);
  const d0 = await floorLines(page);
  await setField(page, 'כיוון / סיבוב', '45', fp);
  const d45 = await floorLines(page);
  check(d45 !== d0 && segCount(d45) > 0, 'turning the tiles to 45° redraws the joints diagonally');
  await esc(page);
  check(/69\.75\s*מ״ר/.test(await aside(page).innerText()), 'the net area is the same after changing floors (69.75 m²)');

  // ---- a wall: two faces, wallpaper inside, stone outside, tiles to 1.20 ----
  await clickWorld(page, 1500, 125, P);
  await page.waitForTimeout(300);
  check(/עיצוב הקיר/.test(await aside(page).innerText()), 'selecting a wall shows its design');
  const inner = page.locator('[data-testid^="face-"]', { hasText: /פונה אל: .*סלון/ });
  const outer = page.locator('[data-testid^="face-"]', { hasText: 'פונה החוצה' });
  check(await inner.count() === 1 && await outer.count() === 1, 'the wall shows which face looks into the living room and which looks out');
  await pickMaterial(inner, 'פרחוני', 'טפט פרחוני');
  await pickMaterial(outer, 'חיפוי אבן', 'חיפוי אבן');
  await page.waitForTimeout(300);
  check(/טפט פרחוני/.test(await inner.locator('.mat-current').first().innerText()) && /חיפוי אבן/.test(await outer.locator('.mat-current').first().innerText()), 'each face keeps its own material (wallpaper inside, stone outside)');
  const innerSide = (await inner.getAttribute('data-testid')).slice(-1);
  await page.getByRole('combobox', { name: `הוספת אזור – ${innerSide === 'L' ? 'פן שמאל' : 'פן ימין'}` }).selectOption('dado');
  await page.waitForTimeout(300);
  const zone = inner.getByTestId('zone-row');
  check(await zone.count() === 1 && (await fieldValue(page, 'עד גובה (ריק = עד למעלה)', zone)) === '1.2', 'a lower cladding up to 1.20 m is added on the room side');
  await setField(page, 'עד גובה (ריק = עד למעלה)', '1.5', zone);
  check((await fieldValue(page, 'עד גובה (ריק = עד למעלה)', zone)) === '1.5', 'the cladding height can be changed (1.50 m)');
  await esc(page);

  // ---- a door and a window in the wallpapered wall ----
  await tool(page, 'דלת');
  await clickWorld(page, 3200, 125, P);
  await esc(page);
  await tool(page, 'חלון');
  await clickWorld(page, 1300, 125, P);
  await esc(page);
  check(!/חופף|חורג/.test(await aside(page).innerText()), 'the door and window sit inside the wall without warnings');

  // ---- copy the wall design to the opposite wall ----
  await clickWorld(page, 4300, 125, P);
  await page.waitForTimeout(300);
  await aside(page).getByRole('button', { name: 'העתקת עיצוב הקיר' }).click();
  await esc(page);
  await clickWorld(page, 2500, 7875, P);
  await page.waitForTimeout(300);
  await aside(page).getByRole('button', { name: 'הדבקת עיצוב' }).click();
  await page.waitForTimeout(300);
  const top = page.locator('[data-testid^="face-"]', { hasText: 'פונה אל:' });
  check(/טפט פרחוני/.test(await top.locator('.mat-current').first().innerText()) && await top.getByTestId('zone-row').count() === 1, 'pasting puts the wallpaper and the cladding on the room side of the other wall');
  await esc(page);

  // ---- apply a finish to all the walls of a room ----
  await clickWorld(page, 7500, 4000, P);
  await page.waitForTimeout(300);
  const roomWalls = aside(page).locator('.mat-picker', { hasText: 'חומר לקירות החדר' });
  await pickMaterial(roomWalls, 'מטבח', 'אריחי מטרו').catch(async () => pickMaterial(roomWalls, 'מטרו', 'אריחי מטרו'));
  await aside(page).getByRole('radio', { name: 'עד 1.20 מ׳' }).click();
  await aside(page).getByRole('button', { name: 'החלה על קירות החדר…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'החלה' }).click();
  await page.waitForTimeout(400);
  const nFaces = Number(((await toastText(page)).match(/על (\d+) פנים/) || [])[1] || 0);
  check(nFaces >= 4, `the finish is applied to the faces around the bedroom only (${nFaces} faces)`);
  await esc(page);

  // ---- the element library ----
  await tool(page, 'ריהוט');
  const count = Number(((await aside(page).locator('h3', { hasText: 'ספריית אלמנטים' }).innerText()).match(/\((\d+)\)/) || [])[1]);
  check(count >= 150, `the building element library has ${count} items (doors, windows and site items are counted separately)`);
  const search = page.getByRole('textbox', { name: 'חיפוש רהיטים' });
  await search.fill('כורסא');
  const a1 = await page.locator('.lib-item').count();
  await search.fill('כורסה');
  const a2 = await page.locator('.lib-item').count();
  check(a1 > 0 && a1 === a2, `Hebrew search finds armchairs with both spellings (${a1} / ${a2})`);
  await page.locator('.lib-star').first().click();
  await search.fill('');
  await aside(page).getByRole('button', { name: /מועדפים \(1\)/ }).click();
  check(await page.locator('.lib-item').count() === 1, 'a starred item appears under favourites');
  await aside(page).getByRole('button', { name: 'לפי קטגוריה' }).click();

  // a coffee table, a vase on it, a clock snapped to a wall
  await search.fill('שולחן סלון');
  await page.locator('.lib-item', { hasText: /^שולחן סלון$/ }).first().click();
  await clickWorld(page, 2500, 3000, P);
  await search.fill('אגרטל');
  await page.locator('.lib-item', { hasText: /^אגרטל$/ }).first().click();
  await clickWorld(page, 2500, 3000, P);
  await page.waitForTimeout(250);
  check(/הונח על "שולחן סלון"/.test(await toastText(page)), 'the vase is placed on the coffee table');
  await search.fill('שעון קיר');
  await page.locator('.lib-item', { hasText: 'שעון קיר' }).first().click();
  await clickWorld(page, 500, 5000, P);
  await search.fill('ספה תלת');
  await page.locator('.lib-item', { hasText: 'ספה תלת' }).first().click();
  await clickWorld(page, 2500, 1500, P);
  await esc(page);
  await clickWorld(page, 2500, 3000, P);
  await page.waitForTimeout(300);
  let props = await aside(page).innerText();
  if (!/אגרטל/.test(props)) { await clickWorld(page, 2500, 3000, P); props = await aside(page).innerText(); }
  check(/אגרטל/.test(props) && Number(await fieldValue(page, 'גובה מהרצפה')) > 0.3, `the vase stands at the table height (${await fieldValue(page, 'גובה מהרצפה')} m)`);
  await esc(page);
  await clickWorld(page, 272, 5000, P);
  await page.waitForTimeout(300);
  const clockRot = /שעון קיר/.test(await aside(page).innerText()) ? await fieldValue(page, 'סיבוב') : '?';
  check(clockRot === '90', `the wall clock snaps to the west wall, its back to the wall (rotation ${clockRot}°)`);
  await esc(page);

  // a part of the sofa gets its own material
  await clickWorld(page, 2500, 1500, P);
  await page.waitForTimeout(300);
  check(/ספה/.test(await aside(page).innerText()), 'the sofa is selected');
  const part = aside(page).locator('.zone-row').first();
  await part.getByRole('button', { name: 'עריכה' }).click();
  await pickMaterial(part, 'קטיפה', 'קטיפה');
  await page.waitForTimeout(300);
  check(/קטיפה/.test(await part.innerText()), 'the sofa upholstery is now velvet (one part, its own material)');

  // ---- lock and duplicate ----
  await aside(page).getByRole('button', { name: /נעילה/ }).click();
  await page.waitForTimeout(200);
  const before = (await planIds(page)).length;
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  check((await planIds(page)).length === before && /נעול ולכן לא נמחק/.test(await toastText(page)), 'a locked sofa is not deleted, with a message');
  await page.keyboard.press('Control+d');
  await page.waitForTimeout(300);
  check((await planIds(page)).length === before + 1 && await aside(page).getByRole('button', { name: /נעילה/ }).count() === 1, 'duplicating a locked sofa gives an unlocked copy');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  check((await planIds(page)).length === before, 'the unlocked copy can be deleted');
  await esc(page);

  // ---- layers (advanced mode) ----
  await aside(page).getByRole('radio', { name: 'מצב מתקדם' }).click();
  await aside(page).getByRole('button', { name: /שכבה חדשה/ }).click();
  await clickWorld(page, 2500, 1500, P);
  await page.waitForTimeout(300);
  await aside(page).getByRole('combobox', { name: 'שכבה' }).selectOption({ label: 'שכבה 1' });
  await esc(page);
  const shown = (await planIds(page)).length;
  await aside(page).getByRole('button', { name: 'הסתרת השכבה' }).click();
  await page.waitForTimeout(300);
  check((await planIds(page)).length === shown - 1, 'hiding a layer hides the sofa on it');
  await aside(page).getByRole('button', { name: 'הצגת השכבה' }).click();
  await page.waitForTimeout(300);
  check((await planIds(page)).length === shown, 'showing the layer brings it back');
  await aside(page).getByRole('radio', { name: 'מצב בסיסי' }).click();

  // ---- an arched passage in the inner wall, a standing arch gate in the garden ----
  await tool(page, 'דלת');
  await aside(page).getByRole('button', { name: 'מעברים ונישות' }).click();
  await aside(page).locator('.lib-item', { hasText: 'מעבר מקושת (פתח בלי דלת)' }).click();
  await clickWorld(page, 5000, 5500, P);
  await esc(page);
  await clickWorld(page, 5000, 5500, P);
  await page.waitForTimeout(300);
  props = await aside(page).innerText();
  check(/קשת/.test(props) && /מעבר/.test(props), 'the arched passage is placed in the inner wall and selected');
  await esc(page);
  await tool(page, 'ריהוט');
  await page.getByRole('textbox', { name: 'חיפוש רהיטים' }).fill('שער קשת');
  await page.locator('.lib-item', { hasText: 'שער קשתי' }).first().click();
  await clickWorld(page, 13000, 4000, P);
  await esc(page);

  // ---- the study protected room ----
  await aside(page).getByRole('button', { name: 'ממ״ד לימודי (להמחשה בלבד)' }).click();
  check(/להמחשה בלבד/.test(await page.getByRole('dialog').innerText()) && /אין להציג את התכנון כתקני/.test(await page.getByRole('dialog').innerText()), 'the protected-room template says clearly that it is a study tool only');
  await page.getByRole('dialog').getByRole('button', { name: 'יצירת התבנית' }).click();
  await page.waitForTimeout(500);
  check(await page.getByTestId('safe-note').count() === 1, 'the new protected room is selected with its study notice');
  check(/ממ״ד \(להמחשה בלבד\)/.test(await page.locator(`[data-testid="${P}"]`).innerHTML()), 'the plan labels it "for illustration only"');
  await esc(page);
  check(!/אזהרות/.test(await aside(page).innerText()), 'the template and everything drawn open without warnings');

  // ---- 3D: textures, night mode, quality ----
  await page.getByRole('tab', { name: /תלת/ }).click();
  await page.waitForTimeout(2000);
  const ink = await canvasInk(page, '[data-testid="bld-3d"]');
  check(ink > 0.05, `3D draws the designed house (${(ink * 100).toFixed(0)}% of the canvas)`);
  await page.getByText('מצב לילה (תאורה)').click();
  await page.waitForTimeout(1200);
  const inkN = await canvasInk(page, '[data-testid="bld-3d"]');
  check(inkN > 0.05, `night mode draws the scene with its lights (${(inkN * 100).toFixed(0)}%)`);
  await page.screenshot({ path: 'shots/t-v4-night.png' });
  await page.getByText('מצב לילה (תאורה)').click();
  await page.getByRole('combobox', { name: 'איכות תלת־ממד' }).selectOption('basic');
  await page.waitForTimeout(1500);
  check(await canvasInk(page, '[data-testid="bld-3d"]') > 0.05, 'basic 3D quality still draws the model');
  await page.screenshot({ path: 'shots/t-v4-3d.png' });

  // ---- sections: the arch and the cladding ----
  await page.getByRole('tab', { name: /חתכים/ }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'קו חתך חדש' }).click();
  await clickWorld(page, 1300, -2000, P);
  await clickWorld(page, 1300, 10000, P);
  await page.waitForTimeout(700);
  const info = await page.locator('[data-testid="bsection-info"]').innerText();
  check(Number((info.match(/נחתכים:\s*(\d+)/) || [])[1] || 0) >= 3, `a section through the window cuts the walls (${info.replace(/\s+/g, ' ').slice(0, 60)})`);

  // ---- saved after a refresh, and in the project file ----
  await page.getByRole('tab', { name: /תוכנית/ }).first().click();
  await page.waitForTimeout(1500);
  await page.reload();
  await page.waitForSelector(`[data-testid="${P}"], .proj-card`);
  if (await page.locator('.proj-card').count()) {
    const names = await page.locator('.proj-card .name').allInnerTexts();
    const mine = names.find((n) => /מבנה|תכנון/.test(n) && !/הדגמה/.test(n));
    await page.locator('.proj-card .name', { hasText: mine }).first().click();
  }
  await page.waitForTimeout(800);
  if (await page.getByRole('tab', { name: /תוכנית/ }).count()) await page.getByRole('tab', { name: /תוכנית/ }).first().click();
  await clickWorld(page, 2500, 4500, P);
  await page.waitForTimeout(300);
  check(/גרניט פורצלן/.test(await page.getByTestId('picker-floor').innerText().catch(() => '')), 'after a refresh the living room floor is still porcelain');
  await esc(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'שמירת קובץ פרויקט לגיבוי' }).click()]);
  await dl.saveAs('out/v4.archicut');
  const pf = JSON.parse(fs.readFileSync('out/v4.archicut', 'utf8'));
  const bd = pf.projects[0].data;
  const living = bd.rooms.find((r) => r.name === 'סלון');
  check(pf.version === 3 && living?.floor?.v === 4 && living.floor.tileW === 1200 && living.floor.angle === 45, 'the project file keeps the floor material, tile size and direction');
  check(bd.walls.some((w) => (w.zones || []).some((z) => z.z1 === 1500)) && bd.walls.some((w) => w.left.material === 'wp-floral' || w.right.material === 'wp-floral'), 'the project file keeps the wallpaper and the 1.50 m cladding');
  check(bd.layers?.length === 1 && bd.furniture.some((f) => f.locked) && bd.rooms.some((r) => r.safeRoom), 'the project file keeps layers, the lock and the protected-room template');

  // import the file back as a copy, then a broken one
  await page.goto(BASE);
  await page.waitForSelector('.proj-card');
  const n0 = await page.locator('.proj-card').count();
  await page.locator('input[type=file]').nth(1).setInputFiles('out/v4.archicut');
  await page.waitForTimeout(800);
  check(await page.locator('.proj-card').count() === n0 + 1, 'importing the 4.0 project file adds it');
  const broken = JSON.parse(JSON.stringify(pf));
  broken.projects[0].data.rooms[0].floor = { material: 'no-such-material', color: 'not a colour', tileW: -5, v: 4 };
  broken.projects[0].data.walls[0].zones = [{ id: 'z', side: 'Q', z0: 'x', finish: null }];
  broken.projects[0].name = 'קובץ עם נתונים פגומים';
  fs.writeFileSync('out/v4-bad.archicut', JSON.stringify(broken));
  await page.locator('input[type=file]').nth(1).setInputFiles('out/v4-bad.archicut');
  await page.waitForTimeout(800);
  check(await page.locator('.proj-card').count() === n0 + 2, 'a file with a missing material and broken zones still opens (bad values are dropped)');
  await page.locator('.proj-card .name', { hasText: 'קובץ עם נתונים פגומים' }).first().click();
  await page.waitForTimeout(800);
  await page.getByRole('tab', { name: /תלת/ }).click();
  await page.waitForTimeout(1500);
  check(await canvasInk(page, '[data-testid="bld-3d"]') > 0.05, 'the repaired project draws in 3D (a missing material falls back to a plain one)');

  done(errors);
  await browser.close();
})().catch((e) => { console.log('FAIL exception: ' + e.message.split('\n')[0]); process.exitCode = 1; process.exit(1); });
