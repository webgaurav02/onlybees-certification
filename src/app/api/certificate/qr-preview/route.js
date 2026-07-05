import { verifyAdmin } from '@/lib/auth';
import { generateQrPng } from '@/lib/qrcode';

export const runtime = 'nodejs';

/**
 * Returns a representative transparent QR PNG for the admin placement editor.
 * It encodes a sample validation URL — the real code (with the minted certId) is
 * generated at issue time, but the appearance/size for placement is identical.
 */
export async function GET(req) {
  const auth = verifyAdmin(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ success: false, message: auth.message }), {
      status: auth.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin).replace(/\/$/, '');
  const png = await generateQrPng(`${baseUrl}/validate?id=PREVIEW-SAMPLE`, {
    margin: 0,
    transparent: true,
  });

  return new Response(png, {
    status: 200,
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
  });
}
