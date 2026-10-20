import { auth } from "../../../../../lib/auth";
import { summaryVersions } from "../../../../../lib/summary-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: "Entre na sua conta." }, { status: 401 });
  const url = new URL(req.url), offset = Number(url.searchParams.get("offset") || 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) return Response.json({ error: "Página inválida." }, { status: 400 });
  try { return Response.json(await summaryVersions.read(session.user.id, (await params).id, url.searchParams.get("version") || undefined, offset), { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "Livro ou versão indisponível. Atualize a biblioteca." }, { status: 404 }); }
}
