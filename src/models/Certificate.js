const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CertificateSchema = new Schema({
    certId: { type: String, unique: true },
    name: { type: String },
    certType: { type: String },
    issueDate: { type: Date, default: Date.now() },
    documentUrl: { type: String },
    validationUrl: { type: String } 
});

const Certificate = mongoose.models.Certificate || mongoose.model("Certificate", CertificateSchema);

export default Certificate;