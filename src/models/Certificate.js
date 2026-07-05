const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CertificateSchema = new Schema(
  {
    // Unguessable public identifier (also encoded in the QR / validation URL).
    certId: { type: String, unique: true, required: true, index: true },

    // Recipient / certificate details.
    name: { type: String, required: true, trim: true },
    certType: { type: String, required: true, trim: true },
    recipientEmail: { type: String, trim: true, lowercase: true },
    issueDate: { type: Date, default: () => new Date() },

    // R2 storage — the QR-stamped PDF that recipients see, and the raw QR image.
    documentUrl: { type: String, required: true },
    qrCodeUrl: { type: String },
    // The URL encoded inside the QR code.
    validationUrl: { type: String },
    // Object keys kept so we can delete from R2 on revoke/cleanup.
    documentKey: { type: String },
    qrKey: { type: String },
    // SHA-256 of the stamped PDF for tamper-evidence.
    fileHash: { type: String },

    // Lifecycle.
    status: { type: String, enum: ['active', 'revoked'], default: 'active', index: true },
    revokedAt: { type: Date },
    revokeReason: { type: String },

    // Audit.
    issuedBy: { type: String },
  },
  { timestamps: true }
);

const Certificate =
  mongoose.models.Certificate || mongoose.model('Certificate', CertificateSchema);

export default Certificate;
