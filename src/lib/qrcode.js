import QRCode from 'qrcode';

/**
 * Generate a PNG QR code as a Buffer.
 * High error-correction ('H') so the code still scans after being placed onto a
 * busy certificate background.
 *
 * @param {string} text - the data to encode (the validation URL)
 * @param {object} [opts]
 * @param {number} [opts.width=600] - output width in px
 * @param {number} [opts.margin=1] - quiet-zone width in modules
 * @param {boolean} [opts.transparent=false] - transparent background (only dark
 *        modules drawn) so the code can be stamped borderlessly onto a document
 * @returns {Promise<Buffer>}
 */
export async function generateQrPng(text, opts = {}) {
  const { width = 600, margin = 1, transparent = false } = opts;
  return QRCode.toBuffer(text, {
    type: 'png',
    errorCorrectionLevel: 'H',
    width,
    margin,
    color: {
      dark: '#000000ff',
      light: transparent ? '#00000000' : '#ffffffff',
    },
  });
}
