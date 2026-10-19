import { auth } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { downloadPrivate } from "../../../../lib/storage";
export const runtime = "nodejs";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return new Response(null, { status: 401 });
  const { id } = await params;
  try {
    const p = await db.get<{
      mime: string;
      bytes: Buffer | null;
      storage_path: string | null;
    }>(
      "SELECT mime,bytes,storage_path FROM photos WHERE id=? AND owner=?",
      id,
      s.user.id,
    );
    if (!p) return new Response(null, { status: 404 });
    const body = p.storage_path
      ? (await downloadPrivate(p.storage_path, s.user.id)).stream()
      : p.bytes
        ? new Uint8Array(p.bytes)
        : null;
    if (!body) return new Response(null, { status: 404 });
    return new Response(body, {
      headers: {
        "Content-Type": p.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response("Imagem temporariamente indisponível.", {
      status: 503,
    });
  }
}
