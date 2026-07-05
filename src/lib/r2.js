import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const {
  R2_ACCOUNT_ID,
  R2_ENDPOINT,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  R2_PUBLIC_URL,
} = process.env;

// Endpoint can be provided directly or derived from the account id.
const endpoint =
  R2_ENDPOINT || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);

let cached = global._r2Client;

/**
 * Lazily create a singleton S3 client pointed at Cloudflare R2.
 * Throws a clear error if credentials are missing so misconfiguration is obvious.
 */
function getClient() {
  if (cached) return cached;

  if (!endpoint || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    throw new Error(
      'R2 is not configured. Set R2_ENDPOINT (or R2_ACCOUNT_ID), R2_ACCESS_KEY_ID, ' +
        'R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME in your environment.'
    );
  }

  cached = global._r2Client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  return cached;
}

/**
 * Upload a buffer to R2 and return its public URL.
 * @param {string} key - object key, e.g. "certificates/ob_abc123.pdf"
 * @param {Buffer|Uint8Array} body
 * @param {string} contentType - e.g. "application/pdf" or "image/png"
 * @returns {Promise<string>} public URL to the uploaded object
 */
export async function uploadToR2(key, body, contentType) {
  if (!R2_PUBLIC_URL) {
    throw new Error('R2_PUBLIC_URL is not set — cannot build a public URL for uploads.');
  }

  await getClient().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Immutable content addressed by a unique cert id — cache aggressively.
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  return `${R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
}

/**
 * Delete an object from R2 by key. Best-effort; used when rolling back a failed issue.
 * @param {string} key
 */
export async function deleteFromR2(key) {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key })
  );
}
