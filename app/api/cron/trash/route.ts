import { timingSafeEqual } from "node:crypto";
import { trashService } from "../../../../lib/trash-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return new Response(null, { status: 503 });
  const expected = Buffer.from(`Bearer ${secret}`), provided = Buffer.from(req.headers.get("authorization") || "");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return new Response(null, { status: 401 });
  try { return Response.json({ removed: await trashService.sweep() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Não foi possível concluir a limpeza." }, { status: 503 }); }
}
