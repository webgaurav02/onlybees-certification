// Browser-only helper: render the first page of a PDF to a <canvas> using
// pdf.js. Kept in its own module and dynamically imported so pdf.js never loads
// during SSR or in the initial bundle.

let pdfjsPromise = null;

async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((lib) => {
      // Webpack/Turbopack emit this asset and rewrite the URL at build time,
      // keeping the worker version in lockstep with the API.
      lib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
      return lib;
    });
  }
  return pdfjsPromise;
}

/**
 * Render page 1 of a PDF into `canvas`, fit within a width AND height box
 * (preserving aspect) so tall/portrait certificates don't overflow the screen.
 * @param {ArrayBuffer|Uint8Array} data - PDF bytes (a copy; pdf.js may detach it)
 * @param {HTMLCanvasElement} canvas
 * @param {{maxWidth:number, maxHeight:number}} fit - available display box in CSS px
 * @returns {Promise<{cssWidth:number, cssHeight:number, pageWidth:number, pageHeight:number}>}
 */
export async function renderFirstPage(data, canvas, { maxWidth, maxHeight }) {
  const pdfjs = await getPdfjs();
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    // Largest scale that fits both bounds, preserving aspect ratio.
    const scale = Math.min(maxWidth / base.width, maxHeight / base.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap for memory
    const viewport = page.getViewport({ scale: scale * dpr });

    const cssWidth = base.width * scale;
    const cssHeight = base.height * scale;
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    return { cssWidth, cssHeight, pageWidth: base.width, pageHeight: base.height };
  } finally {
    // Cleanup must never mask a successful render.
    try {
      await loadingTask.destroy();
    } catch {
      /* ignore */
    }
  }
}
