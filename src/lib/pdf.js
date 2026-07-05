import { PDFDocument } from 'pdf-lib';

const PDF_MAGIC = '%PDF-';

/** Cheap sanity check that a buffer is actually a PDF. */
export function looksLikePdf(buffer) {
  if (!buffer || buffer.length < 5) return false;
  return buffer.subarray(0, 5).toString('latin1') === PDF_MAGIC;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

const CORNERS = new Set([
  'bottom-right', 'bottom-center', 'bottom-left',
  'top-right', 'top-center', 'top-left',
]);

// Bounds for the QR size expressed as a fraction of page width.
const MIN_SIZE_FRAC = 0.04;
const MAX_SIZE_FRAC = 0.8;

/**
 * Resolve where the (square) QR goes, in PDF points with a bottom-left origin.
 *
 * Precise mode (from the visual editor): opts.x / opts.y are the QR's top-left
 * as fractions of page width/height (screen-style, y measured from the top), and
 * opts.size is the QR width as a fraction of page width.
 *
 * Fallback: opts.position names a corner/edge ('bottom-right', 'top-center', …).
 */
function resolvePlacement(opts, pw, ph) {
  if (isNum(opts.x) && isNum(opts.y) && isNum(opts.size)) {
    const w = clamp(opts.size, MIN_SIZE_FRAC, MAX_SIZE_FRAC) * pw;
    const left = clamp(opts.x, 0, 1) * pw;
    const top = clamp(opts.y, 0, 1) * ph;
    return {
      w,
      x: clamp(left, 0, Math.max(0, pw - w)),
      y: clamp(ph - top - w, 0, Math.max(0, ph - w)), // flip y to bottom-left origin
    };
  }

  // Corner fallback — bare QR with a small margin.
  const place = CORNERS.has(opts.position) ? opts.position : 'bottom-right';
  const w = clamp(pw * 0.16, 84, 150);
  const margin = Math.min(28, pw * 0.03);
  const x = place.endsWith('center')
    ? (pw - w) / 2
    : place.endsWith('right')
      ? pw - margin - w
      : margin;
  const y = place.startsWith('bottom') ? margin : ph - margin - w;
  return { w, x, y };
}

/**
 * Stamp a QR code (PNG) onto a PDF certificate — just the code itself, no card,
 * caption, or border. Placement/size come from the visual editor (fractional
 * x/y/size) or a named corner.
 *
 * @param {Buffer} pdfBuffer   - the source certificate PDF
 * @param {Buffer} qrPngBuffer - PNG QR code (ideally transparent, from generateQrPng)
 * @param {object} [opts]
 * @param {number} [opts.x] - QR left as a fraction of page width (0..1, from top-left)
 * @param {number} [opts.y] - QR top as a fraction of page height (0..1, from top-left)
 * @param {number} [opts.size] - QR width as a fraction of page width (0..1)
 * @param {string} [opts.position] - corner fallback when x/y/size are absent
 * @param {boolean} [opts.allPages=false] - stamp every page instead of just the first
 * @returns {Promise<Buffer>} the stamped PDF
 */
export async function stampQrOnPdf(pdfBuffer, qrPngBuffer, opts = {}) {
  const { allPages = false } = opts;

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const qrImage = await pdfDoc.embedPng(qrPngBuffer);
  const pages = allPages ? pdfDoc.getPages() : [pdfDoc.getPages()[0]];

  for (const page of pages) {
    const { width: pw, height: ph } = page.getSize();
    const { x, y, w } = resolvePlacement(opts, pw, ph);
    page.drawImage(qrImage, { x, y, width: w, height: w });
  }

  const out = await pdfDoc.save();
  return Buffer.from(out);
}
