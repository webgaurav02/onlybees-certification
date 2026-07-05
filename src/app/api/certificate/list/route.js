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

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function GET(req) {
  const auth = verifyAdmin(req);
  if (!auth.ok) return json({ success: false, message: auth.message }, auth.status);

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  const status = searchParams.get('status');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));

  const filter = {};
  if (status === 'active' || status === 'revoked') filter.status = status;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { certId: rx }, { certType: rx }, { recipientEmail: rx }];
  }

  await connectMongo();
  const [items, total] = await Promise.all([
    Certificate.find(filter)
      .select('-documentKey -qrKey -__v')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Certificate.countDocuments(filter),
  ]);

  return json({ success: true, items, total, page, limit, pages: Math.ceil(total / limit) });
}
