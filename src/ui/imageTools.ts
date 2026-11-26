// Turning uploaded files into images, and rotating/cropping them with a canvas.

export const MAX_IMAGE_PX = 3000;
export const MAX_FILE_MB = 40;

export interface LoadedImage {
  dataUrl: string;
  w: number;
  h: number;
}

export class UploadError extends Error {}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new UploadError('לא ניתן לפתוח את התמונה. ייתכן שהקובץ פגום.'));
    img.src = src;
  });
}

function canvasToImage(c: HTMLCanvasElement): LoadedImage {
  return { dataUrl: c.toDataURL('image/jpeg', 0.9), w: c.width, h: c.height };
}

function fitCanvas(w: number, h: number) {
  const k = Math.min(1, MAX_IMAGE_PX / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  return { c, k };
}

export async function fileToImages(file: File, pdfPage = 1): Promise<{ image: LoadedImage; pageCount: number }> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new UploadError(`הקובץ גדול מדי (מעל ${MAX_FILE_MB}MB).`);
  const name = file.name.toLowerCase();
  const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf');
  const isImg = /^image\/(jpeg|png)$/.test(file.type) || /\.(jpe?g|png)$/.test(name);
  if (isPdf) return pdfToImage(file, pdfPage);
  if (!isImg) throw new UploadError('סוג הקובץ לא נתמך. אפשר להעלות JPG, PNG או PDF.');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const { c } = fitCanvas(img.naturalWidth, img.naturalHeight);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return { image: canvasToImage(c), pageCount: 1 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function pdfToImage(file: File, pageNo: number): Promise<{ image: LoadedImage; pageCount: number }> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), verbosity: 0 }).promise;
  } catch (e) {
    console.error(e);
    throw new UploadError('לא ניתן לקרוא את קובץ ה-PDF. ייתכן שהוא פגום או מוגן בסיסמה.');
  }
  const page = await doc.getPage(Math.min(Math.max(1, pageNo), doc.numPages));
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(MAX_IMAGE_PX / Math.max(base.width, base.height), 4);
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width);
  c.height = Math.round(vp.height);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp, canvas: c }).promise;
  return { image: canvasToImage(c), pageCount: doc.numPages };
}

/** Rotate by any angle (degrees), then crop to a rectangle given in the rotated image's pixels. */
export async function transformImage(src: LoadedImage, angleDeg: number, crop: { x: number; y: number; w: number; h: number } | null): Promise<LoadedImage> {
  const img = await loadImg(src.dataUrl);
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
  const rw = Math.round(src.w * cos + src.h * sin);
  const rh = Math.round(src.w * sin + src.h * cos);
  const rc = document.createElement('canvas');
  rc.width = rw;
  rc.height = rh;
  const ctx = rc.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, rw, rh);
  ctx.translate(rw / 2, rh / 2);
  ctx.rotate(a);
  ctx.drawImage(img, -src.w / 2, -src.h / 2);
  if (!crop) return fitResult(rc);
  const cx = Math.max(0, Math.round(crop.x)), cy = Math.max(0, Math.round(crop.y));
  const cw = Math.min(rw - cx, Math.round(crop.w)), ch = Math.min(rh - cy, Math.round(crop.h));
  if (cw < 10 || ch < 10) throw new UploadError('אזור החיתוך קטן מדי.');
  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  out.getContext('2d')!.drawImage(rc, cx, cy, cw, ch, 0, 0, cw, ch);
  return fitResult(out);
}

function fitResult(c: HTMLCanvasElement): LoadedImage {
  if (Math.max(c.width, c.height) <= MAX_IMAGE_PX) return canvasToImage(c);
  const { c: o } = fitCanvas(c.width, c.height);
  o.getContext('2d')!.drawImage(c, 0, 0, o.width, o.height);
  return canvasToImage(o);
}
