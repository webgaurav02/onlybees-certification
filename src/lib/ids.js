import { randomBytes } from 'crypto';

// URL-safe, unambiguous alphabet (no 0/O/1/I/l) for human-readable ids.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generate an unguessable, URL-safe certificate id.
 * Unguessability doubles as anti-enumeration for the public /validate endpoint.
 * Format: OB-<YEAR>-XXXXXXXXXXXX  (e.g. OB-2026-7QK4M2P9RT3F)
 * @param {number} [year] - defaults to the current UTC year
 * @returns {string}
 */
export function generateCertId(year = new Date().getUTCFullYear()) {
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `OB-${year}-${out}`;
}

/** Strict check for ids minted by this system (new format only). */
export function isNewCertId(id) {
  return typeof id === 'string' && /^OB-\d{4}-[2-9A-HJ-NP-Z]{12}$/.test(id);
}

/**
 * Sanity check for ids accepted from the URL before hitting the DB.
 * Deliberately permissive: it accepts the new OB-YYYY-XXXX format *and* legacy
 * ids already in the database (e.g. `cer-<uuid>`) so existing certificate links
 * and QR codes keep working. It only rejects clearly invalid input — empty
 * values, whitespace, path separators, and absurd lengths.
 */
export function isValidCertId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{5,79}$/.test(id);
}
