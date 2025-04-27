import connectMongo from '@/lib/mongodb';
import Certificate from '@/models/Certificate';

export async function GET(req) {
  await connectMongo();
  const { searchParams } = new URL(req.url);
  const certId = searchParams.get('id'); // Renaming variable to certId

  if (!certId) {
    return new Response(JSON.stringify({ success: false, message: "No ID provided" }), { status: 400 });
  }

  // Find the certificate by the certId field instead of _id
  const cert = await Certificate.findOne({ certId });

  if (!cert) {
    return new Response(JSON.stringify({ success: false, message: "Certificate not found" }), { status: 404 });
  }

  return new Response(JSON.stringify({ success: true, certificate: cert }), { status: 200 });
}
