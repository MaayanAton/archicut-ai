// Right-to-left text for the PDF exporter.
//
// Browsers lay out Hebrew text themselves (direction="rtl"), but svg2pdf/jsPDF draw the characters of a
// string from left to right in the order they are stored. Before building a PDF we therefore convert each
// right-to-left text into "visual order" with a small version of the Unicode bidirectional algorithm for a
// right-to-left paragraph, and flip its text-anchor so it stays at the same place on the page.

const HEBREW = /[֐-׿יִ-ﭏ]/;
// Strong or number-like left-to-right characters: Latin, digits, Greek (π), superscript digits.
const LTR = /[A-Za-z0-9À-ɏͰ-Ͽ²³¹⁰-⁹₀-₉]/;
const MIRROR: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<' };

export const hasHebrew = (s: string) => HEBREW.test(s);

/** Visual (left-to-right drawing) order of a string shown in a right-to-left paragraph. */
export function toVisual(s: string): string {
  const chars = [...s];
  const types = chars.map((c) => (HEBREW.test(c) ? 'R' : LTR.test(c) ? 'L' : 'N'));
  // Neutral characters take the direction of their neighbours when both sides agree, otherwise the paragraph's (R).
  for (let i = 0; i < types.length; i++) {
    if (types[i] !== 'N') continue;
    let j = i;
    while (j < types.length && types[j] === 'N') j++;
    const before = i > 0 ? types[i - 1] : 'R';
    const after = j < types.length ? types[j] : 'R';
    const t = before === 'L' && after === 'L' ? 'L' : 'R';
    for (let k = i; k < j; k++) types[k] = t;
    i = j - 1;
  }
  const runs: { t: string; s: string[] }[] = [];
  chars.forEach((c, i) => {
    const last = runs[runs.length - 1];
    if (last && last.t === types[i]) last.s.push(c);
    else runs.push({ t: types[i], s: [c] });
  });
  return runs
    .reverse()
    .map((r) => (r.t === 'R' ? r.s.reverse().map((c) => MIRROR[c] ?? c).join('') : r.s.join('')))
    .join('');
}

/** Rewrite right-to-left <text> elements of an SVG so a left-to-right renderer draws them correctly. */
export function prepareRtlTextForPdf(svg: Element) {
  svg.querySelectorAll('text').forEach((t) => {
    const rtl = t.getAttribute('direction') === 'rtl' || (t.getAttribute('style') ?? '').includes('direction:rtl');
    if (!rtl) return;
    const anchor = t.getAttribute('text-anchor') ?? 'start';
    t.setAttribute('text-anchor', anchor === 'start' ? 'end' : anchor === 'end' ? 'start' : 'middle');
    t.setAttribute('direction', 'ltr');
    // Plain text only; elements with child tspans are left-to-right labels in this app.
    if (t.children.length === 0 && t.textContent && hasHebrew(t.textContent)) t.textContent = toVisual(t.textContent);
  });
}

/**
 * The embedded Rubik font has no Greek letters. In the PDF the letter π is drawn with the standard
 * Symbol font instead (where "p" is π), so plane names such as π1 do not disappear.
 */
export function replacePiForPdf(svg: Element) {
  const doc = svg.ownerDocument;
  svg.querySelectorAll('text, tspan').forEach((el) => {
    [...el.childNodes].forEach((node) => {
      if (node.nodeType !== 3 || !node.textContent?.includes('π')) return;
      const parts = node.textContent.split('π');
      const frag = doc.createDocumentFragment();
      parts.forEach((part, i) => {
        if (i > 0) {
          const t = doc.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          t.setAttribute('font-family', 'symbol'); // jsPDF's built-in Symbol font, registered in lower case
          t.textContent = 'p';
          frag.appendChild(t);
        }
        if (part) frag.appendChild(doc.createTextNode(part));
      });
      node.replaceWith(frag);
    });
  });
}

/**
 * Fix the position of subscripts (A₁, π₂) using the browser's own text measurement, so the PDF
 * places them exactly where the screen does. Must run while the SVG is attached to the document.
 */
export function pinSubscriptsForPdf(svg: Element) {
  svg.querySelectorAll('text').forEach((t) => {
    const ts = t.querySelector('tspan');
    const first = t.firstChild;
    if (!ts || !first || first.nodeType !== 3 || (t.getAttribute('text-anchor') ?? 'start') !== 'start') return;
    try {
      const adv = (t as SVGTextElement).getSubStringLength(0, (first.textContent ?? '').length);
      const x = Number(t.getAttribute('x'));
      if (Number.isFinite(adv) && Number.isFinite(x)) ts.setAttribute('x', String(x + adv));
    } catch {
      // measurement not available: keep the renderer's own placement
    }
  });
}
