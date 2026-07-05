import connectMongo from '@/lib/mongodb';
import Certificate from '@/models/Certificate';
import { isValidCertId } from '@/lib/ids';

export const runtime = 'nodejs';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Public, non-PII fields only. recipientEmail / storage keys are intentionally excluded.
const PUBLIC_FIELDS =
  'certId name certType issueDate documentUrl qrCodeUrl validationUrl status revokedAt revokeReason fileHash createdAt';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const certId = searchParams.get('id');

  if (!certId) {
    return json({ success: false, message: 'No certificate ID provided.' }, 400);
  }
  // Reject obviously malformed ids before touching the database.
  if (!isValidCertId(certId)) {
    return json({ success: false, message: 'Certificate not found.' }, 404);
  }

  await connectMongo();
  const cert = await Certificate.findOne({ certId }).select(PUBLIC_FIELDS).lean();

  if (!cert) {
    return json({ success: false, message: 'Certificate not found.' }, 404);
  }

  const revoked = cert.status === 'revoked';
  return json(
    {
      success: true,
      valid: !revoked,
      status: cert.status,
      certificate: cert,
    },
    revoked ? 410 : 200
  );
}
