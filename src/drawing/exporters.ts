// Export the printable sheet as SVG, PNG or PDF, or send it to the browser's print dialog.

import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { downloadBlob, safeFileName } from '../storage/storage';
import rubikRegularUrl from '../assets/fonts/Rubik_400Regular.ttf?url';
import rubikBoldUrl from '../assets/fonts/Rubik_700Bold.ttf?url';
import { pinSubscriptsForPdf, prepareRtlTextForPdf, replacePiForPdf } from './bidi';

export const sheetMarkup = (svg: ReactNode) => renderToStaticMarkup(svg as React.ReactElement);

export function exportSvg(svg: ReactNode, name: string) {
  const text = `<?xml version="1.0" encoding="UTF-8"?>\n${sheetMarkup(svg)}`;
  downloadBlob(new Blob([text], { type: 'image/svg+xml' }), `${safeFileName(name)}.svg`);
}

/** Rasterise the sheet at the given resolution (default 300 DPI). */
export async function sheetToCanvas(svg: ReactNode, paper: { w: number; h: number }, dpi = 300): Promise<HTMLCanvasElement> {
  const pxW = Math.round((paper.w / 25.4) * dpi), pxH = Math.round((paper.h / 25.4) * dpi);
  let markup = sheetMarkup(svg);
  markup = markup.replace(/width="[^"]*mm" height="[^"]*mm"/, `width="${pxW}" height="${pxH}"`);
  // Embed the Hebrew font so the rasterised text looks the same everywhere.
  const font = await fontDataUrl(rubikRegularUrl);
  const fontBold = await fontDataUrl(rubikBoldUrl);
  markup = markup.replace('<defs>', `<defs><style>@font-face{font-family:'Rubik';src:url(${font}) format('truetype');font-weight:400}@font-face{font-family:'Rubik';src:url(${fontBold}) format('truetype');font-weight:700}</style>`);
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = pxW;
    c.height = pxH;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, pxW, pxH);
    ctx.drawImage(img, 0, 0, pxW, pxH);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const fontCache = new Map<string, string>();
async function fontDataUrl(url: string): Promise<string> {
  if (fontCache.has(url)) return fontCache.get(url)!;
  const buf = await (await fetch(url)).arrayBuffer();
  const b64 = arrayBufferToBase64(buf);
  const data = `data:font/ttf;base64,${b64}`;
  fontCache.set(url, data);
  return data;
}
async function fontBase64(url: string): Promise<string> {
  return arrayBufferToBase64(await (await fetch(url)).arrayBuffer());
}
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function exportPng(svg: ReactNode, paper: { w: number; h: number }, name: string) {
  const c = await sheetToCanvas(svg, paper, 300);
  const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG failed'))), 'image/png'));
  downloadBlob(blob, `${safeFileName(name)}.png`);
}

/**
 * PDF with exact paper size. The drawing is placed as vector graphics (svg2pdf) with the
 * Rubik font embedded, so Hebrew text and lines stay sharp. Page size is set in millimetres.
 */
export async function buildPdf(svg: ReactNode, paper: { w: number; h: number }) {
  const { jsPDF } = await import('jspdf');
  await import('svg2pdf.js');
  disableJsPdfBidi(jsPDF);
  const doc = new jsPDF({ unit: 'mm', format: [paper.w, paper.h], orientation: paper.w > paper.h ? 'landscape' : 'portrait', compress: true });
  doc.addFileToVFS('Rubik-Regular.ttf', await fontBase64(rubikRegularUrl));
  doc.addFont('Rubik-Regular.ttf', 'Rubik', 'normal');
  doc.addFileToVFS('Rubik-Bold.ttf', await fontBase64(rubikBoldUrl));
  doc.addFont('Rubik-Bold.ttf', 'Rubik', 'bold');
  doc.setFont('Rubik', 'normal');
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:10px;height:10px;overflow:hidden';
  holder.innerHTML = sheetMarkup(svg);
  document.body.appendChild(holder);
  try {
    const el = holder.querySelector('svg')!;
    // jsPDF draws characters left to right: convert Hebrew to visual order first.
    pinSubscriptsForPdf(el);
    prepareRtlTextForPdf(el);
    replacePiForPdf(el);
    await doc.svg(el, { x: 0, y: 0, width: paper.w, height: paper.h });
  } finally {
    holder.remove();
  }
  return doc;
}

/**
 * jsPDF re-orders right-to-left text with its own engine, which reverses numbers inside Hebrew sentences.
 * We pass text that is already in visual order (see bidi.ts), so that step is switched off.
 */
function disableJsPdfBidi(jsPDF: unknown) {
  const api = (jsPDF as { API?: { events?: [string, unknown][] } }).API;
  if (!api?.events) return;
  api.events = api.events.filter(([name, fn]) => !(name === 'postProcessText' && String(fn).includes('doBidiReorder')));
}

export async function exportPdf(svg: ReactNode, paper: { w: number; h: number }, name: string) {
  const doc = await buildPdf(svg, paper);
  downloadBlob(doc.output('blob'), `${safeFileName(name)}.pdf`);
}

/** Print through the browser at true size: the page size is set with CSS @page in millimetres. */
export function printSheet(svg: ReactNode, paper: { w: number; h: number }) {
  let root = document.getElementById('print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    document.body.appendChild(root);
  }
  root.innerHTML = `<style>@page{size:${paper.w}mm ${paper.h}mm;margin:0}</style>${sheetMarkup(svg)}`;
  const cleanup = () => {
    root!.innerHTML = '';
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => window.print(), 50);
}
