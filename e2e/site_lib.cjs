// Helpers for the site-planning browser tests.
// World coordinates are millimetres (y up). The canvas exposes its view as data-view="k cx cy".

async function viewOf(page, testId) {
  const loc = page.locator(`[data-testid="${testId}"]`).first();
  await loc.waitFor();
  const [view, box] = await Promise.all([loc.getAttribute('data-view'), loc.boundingBox()]);
  const [k, cx, cy] = view.split(' ').map(Number);
  return {
    k,
    box,
    toScreen: (x, y) => ({ x: box.x + box.width / 2 + (x - cx) * k, y: box.y + box.height / 2 - (y - cy) * k }),
  };
}

/** Clicks the plan canvas at a world point (mm). */
async function clickWorld(page, x, y, testId = 'site-plan') {
  const v = await viewOf(page, testId);
  const p = v.toScreen(x, y);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(120);
}

/** Ids of the elements drawn in the plan. */
async function planIds(page, testId = 'site-plan') {
  return page.locator(`[data-testid="${testId}"] g[data-el]`).evaluateAll((els) => els.map((e) => e.getAttribute('data-el')));
}

/** Screen bounding box of an element drawn in the plan. */
async function elBox(page, id, testId = 'site-plan') {
  return page.locator(`[data-testid="${testId}"] g[data-el="${id}"]`).first().boundingBox();
}

/** Fills a labelled metre/number field and leaves it, so it commits. */
async function setField(page, label, value, scope) {
  const root = scope ?? page;
  const input = root.getByRole('textbox', { name: label, exact: true }).first();
  await input.fill(String(value));
  await input.blur();
  await page.waitForTimeout(150);
}

async function fieldValue(page, label, scope) {
  const root = scope ?? page;
  return root.getByRole('textbox', { name: label, exact: true }).first().inputValue();
}

/** Share of canvas pixels that differ from the corner colour: a quick "something was drawn" check for WebGL. */
async function canvasInk(page, selector) {
  return page.locator(selector).evaluate((host) => {
    const c = host.querySelector('canvas');
    if (!c) return -1;
    const off = document.createElement('canvas');
    off.width = 200; off.height = 150;
    const g = off.getContext('2d');
    g.drawImage(c, 0, 0, off.width, off.height);
    const d = g.getImageData(0, 0, off.width, off.height).data;
    const r0 = d[0], g0 = d[1], b0 = d[2];
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) > 30) n++;
    return n / (off.width * off.height);
  });
}

module.exports = { viewOf, clickWorld, planIds, elBox, setField, fieldValue, canvasInk };
