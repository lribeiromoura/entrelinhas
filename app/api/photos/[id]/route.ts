import { auth } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return new Response(null, { status: 401 });
  const { id } = await params;
  const p = db
    .prepare("SELECT mime,bytes FROM photos WHERE id=? AND owner=?")
    .get(id, s.user.id) as { mime: string; bytes: Buffer } | undefined;
  if (!p) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(p.bytes), {
    headers: {
      "Content-Type": p.mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
