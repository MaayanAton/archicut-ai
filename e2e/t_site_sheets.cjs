// Site planning, demo park and submission sheets: the demo opens in every work area, the sample sheet
// has its drawings and 3D picture, and PDF/SVG/PNG exports are valid and at true scale.
const fs = require('fs');
const { execFileSync } = require('child_process');
const { check, start, openProject, done } = require('./lib.cjs');
const { planIds, canvasInk } = require('./site_lib.cjs');

(async () => {
  const { browser, page, errors } = await start();
  page.setDefaultTimeout(15000);
  await openProject(page, 'פארק ציבורי לדוגמה');
  await page.waitForSelector('[data-testid="site-plan"]');
  const panel = () => page.locator('aside.site-panel, aside.panel').first();
  const n = (await planIds(page)).length;
  check(n > 80, `demo park plan shows its elements (${n})`);
  check(/פרויקט הדגמה בנתונים לדוגמה בלבד/.test(await panel().innerText()), 'demo is clearly marked as sample data, not a course project');
  check(/2400 מ״ר/.test(await panel().innerText()), 'demo lot is 60 × 40 m (2400 m²)');
  await page.screenshot({ path: 'shots/t-site-demo-plan.png' });

  await page.getByRole('tab', { name: /תלת/ }).click();
  await page.waitForTimeout(1800);
  const ink = await canvasInk(page, '[data-testid="site-3d"]');
  check(ink > 0.1, `demo 3D model drawn (${(ink * 100).toFixed(1)}%)`);
  for (const v of ['מבט על', 'מדרום', 'ממזרח']) {
    await page.getByRole('radio', { name: v, exact: true }).click();
    await page.waitForTimeout(500);
  }
  check(await canvasInk(page, '[data-testid="site-3d"]') > 0.05, '3D view presets (top, south, east) keep the model in view');
  await page.getByRole('button', { name: /סיור בגובה העיניים/ }).click();
  await page.waitForTimeout(600);
  check(await page.locator('.walk-pad').count() === 1 && /1\.60/.test(await page.locator('.three-hint').innerText()), 'walk mode at eye height (1.60 m) with on-screen controls');
  await page.screenshot({ path: 'shots/t-site-demo-walk.png' });
  await page.getByRole('radio', { name: 'איזומטרי', exact: true }).first().click();

  await page.getByRole('tab', { name: /טופוגרפיה/ }).click();
  await page.waitForTimeout(500);
  const topo = await panel().innerText();
  check(/±0\.00 עד \+1\.20/.test(topo), `terrain range ±0.00 to +1.20 (hill) [${(topo.match(/טווח גבהים[^\n]*/) || [''])[0]}]`);
  check(!/נתון מדידה\s+\d/.test(topo), 'demo height points are not presented as survey data');

  await page.getByRole('tab', { name: /חתכים/ }).click();
  await page.waitForTimeout(600);
  const names = await page.locator('.sec-list .choice strong').allInnerTexts();
  check(names.includes('חתך A-A') && names.includes('חתך B-B'), `demo has sections A-A and B-B (${names.join(', ')})`);
  await page.locator('.sec-list .choice', { hasText: 'B-B' }).click();
  await page.waitForTimeout(500);
  const info = await page.locator('[data-testid="section-info"]').innerText();
  check(/בריכת נוי/.test(info) && /פרגולה/.test(info) && /קיר/.test(info), 'B-B cuts the pond, the pergola and the retaining wall');
  await page.locator('[data-testid="site-section"]').screenshot({ path: 'shots/t-site-demo-BB.png' });

  // ---- sheets ----
  await page.getByRole('tab', { name: /גיליונות/ }).click();
  await page.waitForTimeout(2500);
  const prev = page.locator('[data-testid="sheet-preview"]');
  check(await prev.count() === 1, 'sample sheet preview shown');
  const svg = await prev.locator('svg').first().evaluate((s) => s.outerHTML);
  check(/data:image\/png/.test(svg), '3D picture on the sheet was taken from the model');
  check(!(await panel().innerText()).includes('חורג'), 'sample sheet has no out-of-frame or overlap problems');
  await page.screenshot({ path: 'shots/t-site-demo-sheet.png' });

  const save = async (btn, path) => {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), panel().getByRole('button', { name: btn, exact: true }).click()]);
    await dl.saveAs(path);
    return dl.suggestedFilename();
  };
  // PDF: one A2 landscape page, ruler exactly 100 mm.
  const pdfName = await save('PDF', 'out/site-sheet.pdf');
  const pinfo = execFileSync('pdfinfo', ['out/site-sheet.pdf']).toString();
  const size = (pinfo.match(/Page size:\s+([\d.]+) x ([\d.]+)/) || []).slice(1).map(Number);
  check(/Pages:\s+1\b/.test(pinfo) && Math.abs(size[0] - 1683.78) < 0.5 && Math.abs(size[1] - 1190.55) < 0.5, `PDF is valid, 1 page, A2 landscape 594 × 420 mm (${size.map((x) => (x / 72 * 25.4).toFixed(1)).join(' × ')} mm, ${pdfName})`);
  execFileSync('pdftoppm', ['-r', '200', '-png', '-singlefile', 'out/site-sheet.pdf', 'out/site-sheet-pdf']);
  const rulerPdf = execFileSync('python3', ['../measure_ruler.py', 'out/site-sheet-pdf.png', '200']).toString().trim();
  const mmPdf = Number((rulerPdf.match(/= ([\d.]+) mm/) || [])[1]);
  check(Math.abs(mmPdf - 100) < 0.3, `PDF true scale: ${rulerPdf}`);
  // SVG: physical size in mm.
  await save('SVG', 'out/site-sheet.svg');
  const svgText = fs.readFileSync('out/site-sheet.svg', 'utf8');
  check(/width="594mm"/.test(svgText) && /height="420mm"/.test(svgText), 'SVG declares its true paper size (594mm × 420mm)');
  // PNG: 200 DPI for A2.
  await save('PNG', 'out/site-sheet.png');
  const dims = execFileSync('python3', ['-c', 'from PIL import Image;import sys;print(*Image.open(sys.argv[1]).size)', 'out/site-sheet.png']).toString().trim().split(' ').map(Number);
  check(Math.abs(dims[0] - 4677) <= 1 && Math.abs(dims[1] - 3307) <= 1, `PNG is A2 at 200 DPI (${dims.join(' × ')} px)`);
  const rulerPng = execFileSync('python3', ['../measure_ruler.py', 'out/site-sheet.png', '200']).toString().trim();
  check(Math.abs(Number((rulerPng.match(/= ([\d.]+) mm/) || [])[1]) - 100) < 0.3, `PNG true scale: ${rulerPng}`);

  // Smaller paper: drawings are never shrunk silently; the problems are listed and export asks first.
  await panel().getByRole('radio', { name: 'A3', exact: true }).click();
  await page.waitForTimeout(500);
  check(/גדול מהגיליון|חורג/.test(await panel().innerText()), 'on A3 the sheet lists the drawings that no longer fit');
  await panel().getByRole('button', { name: 'PDF', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'יש בעיות בגיליון' });
  check(await confirm.count() === 1 && /לא יוקטנו/.test(await confirm.innerText()), 'export warns that drawings will not be shrunk');
  await confirm.getByRole('button', { name: 'ביטול' }).click();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  check(!(await panel().innerText()).includes('גדול מהגיליון'), 'undo returns the sheet to A2');

  // A new automatic sheet in a few clicks.
  await panel().getByRole('button', { name: /גיליון אוטומטי/ }).click();
  await page.waitForTimeout(2000);
  check(await page.locator('aside.panel select option').count() === 2, 'a second, automatic sheet is created in one click');

  done(errors);
  await browser.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
