import connectMongo from '@/lib/mongodb';
import Certificate from '@/models/Certificate';
import { verifyAdmin } from '@/lib/auth';

export const runtime = 'nodejs';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Revoke or reinstate a certificate.
 * Body: { certId: string, action?: 'revoke' | 'reinstate', reason?: string }
 * The document stays in R2 so existing links resolve, but /validate reports it revoked.
 */
export async function POST(req) {
  const auth = verifyAdmin(req);
  if (!auth.ok) return json({ success: false, message: auth.message }, auth.status);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: 'Invalid JSON body.' }, 400);
  }

  const certId = (body.certId || '').toString().trim();
  const action = body.action === 'reinstate' ? 'reinstate' : 'revoke';
  const reason = (body.reason || '').toString().trim();

  if (!certId) return json({ success: false, message: 'certId is required.' }, 400);

  await connectMongo();

  const update =
    action === 'revoke'
      ? { status: 'revoked', revokedAt: new Date(), revokeReason: reason || 'Revoked by issuer.' }
      : { status: 'active', $unset: { revokedAt: '', revokeReason: '' } };

  const cert = await Certificate.findOneAndUpdate({ certId }, update, { new: true })
    .select('-documentKey -qrKey -__v')
    .lean();

  if (!cert) return json({ success: false, message: 'Certificate not found.' }, 404);

  return json({ success: true, certificate: cert });
}
