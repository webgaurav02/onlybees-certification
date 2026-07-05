import { createHash } from 'crypto';
import connectMongo from '@/lib/mongodb';
import Certificate from '@/models/Certificate';
import { verifyAdmin } from '@/lib/auth';
import { generateCertId } from '@/lib/ids';
import { generateQrPng } from '@/lib/qrcode';
import { stampQrOnPdf, looksLikePdf } from '@/lib/pdf';
import { uploadToR2, deleteFromR2 } from '@/lib/r2';

// pdf-lib / aws-sdk / crypto need the Node.js runtime, not Edge.
export const runtime = 'nodejs';

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Resolve the base URL the QR should point at. */
function resolveBaseUrl(req) {
  const fromEnv = process.env.NEXT_PUBLIC_BASE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return new URL(req.url).origin;
}

/** Generate a cert id that isn't already taken (retries on the rare collision). */
async function uniqueCertId() {
  for (let i = 0; i < 5; i++) {
    const id = generateCertId();
    const exists = await Certificate.exists({ certId: id });
    if (!exists) return id;
  }
  throw new Error('Could not generate a unique certificate id.');
}

export async function POST(req) {
  const auth = verifyAdmin(req);
  if (!auth.ok) return json({ success: false, message: auth.message }, auth.status);

  let form;
  try {
    form = await req.formData();
  } catch {
    return json({ success: false, message: 'Expected multipart/form-data.' }, 400);
  }

  const file = form.get('file');
  const name = (form.get('name') || '').toString().trim();
  const certType = (form.get('certType') || '').toString().trim();
  const recipientEmail = (form.get('recipientEmail') || '').toString().trim();
  const position = (form.get('position') || 'bottom-right').toString();
  const allPages = form.get('allPages') === 'true';
  // Visual-editor placement: QR top-left + size as fractions of the page (0..1).
  const toFrac = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const x = toFrac(form.get('x'));
  const y = toFrac(form.get('y'));
  const size = toFrac(form.get('size'));

  // ── Validate input ──────────────────────────────────────────
  if (!name || !certType) {
    return json({ success: false, message: 'name and certType are required.' }, 400);
  }
  if (!file || typeof file.arrayBuffer !== 'function') {
    return json({ success: false, message: 'A PDF file is required.' }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json({ success: false, message: 'File exceeds the 15 MB limit.' }, 413);
  }

  const srcBuffer = Buffer.from(await file.arrayBuffer());
  if (!looksLikePdf(srcBuffer)) {
    return json({ success: false, message: 'Only PDF certificates are supported.' }, 415);
  }

  await connectMongo();

  // ── Issue ───────────────────────────────────────────────────
  let certId;
  const uploaded = [];
  try {
    certId = await uniqueCertId();
    const baseUrl = resolveBaseUrl(req);
    const validationUrl = `${baseUrl}/validate?id=${encodeURIComponent(certId)}`;

    // 1) QR for the validation URL. Transparent (borderless) copy for stamping
    //    onto the document; opaque copy stored as the standalone QR asset.
    const stampQr = await generateQrPng(validationUrl, { margin: 0, transparent: true });
    const storedQr = await generateQrPng(validationUrl);
    const stampedPdf = await stampQrOnPdf(srcBuffer, stampQr, {
      x, y, size, position, allPages,
    });
    const fileHash = createHash('sha256').update(stampedPdf).digest('hex');

    // 2) Upload the stamped PDF and the standalone QR to R2.
    const documentKey = `certificates/${certId}.pdf`;
    const qrKey = `qrcodes/${certId}.png`;
    const documentUrl = await uploadToR2(documentKey, stampedPdf, 'application/pdf');
    uploaded.push(documentKey);
    const qrCodeUrl = await uploadToR2(qrKey, storedQr, 'image/png');
    uploaded.push(qrKey);

    // 3) Record it.
    const cert = await Certificate.create({
      certId,
      name,
      certType,
      recipientEmail: recipientEmail || undefined,
      documentUrl,
      documentKey,
      qrCodeUrl,
      qrKey,
      validationUrl,
      fileHash,
      status: 'active',
    });

    return json({ success: true, certificate: cert }, 201);
  } catch (err) {
    // Best-effort rollback of anything already uploaded to R2.
    await Promise.all(uploaded.map((key) => deleteFromR2(key).catch(() => {})));
    console.error('Certificate issue failed:', err);
    const message =
      err?.message?.includes('R2') || err?.name === 'CredentialsProviderError'
        ? 'Storage is not configured correctly. Check the R2 credentials.'
        : 'Failed to issue certificate.';
    return json({ success: false, message }, 500);
  }
}
