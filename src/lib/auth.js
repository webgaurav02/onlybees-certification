import { timingSafeEqual } from 'crypto';

/**
 * Constant-time comparison of two strings. Returns false on any length mismatch
 * without leaking timing information about the correct value's length.
 */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Still do a comparison to keep timing roughly constant.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Extract the admin secret from a request: "Authorization: Bearer <token>"
 * or an "x-admin-token" header.
 */
function extractToken(req) {
  const auth = req.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return req.headers.get('x-admin-token') || '';
}

/**
 * Verify a request carries the admin secret.
 * @returns {{ ok: true } | { ok: false, status: number, message: string }}
 */
export function verifyAdmin(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return { ok: false, status: 500, message: 'ADMIN_PASSWORD is not configured on the server.' };
  }
  const token = extractToken(req);
  if (!token || !safeEqual(token, expected)) {
    return { ok: false, status: 401, message: 'Unauthorized.' };
  }
  return { ok: true };
}
