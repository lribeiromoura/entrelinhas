import { auth } from "./auth";
import { BackupError } from "./backup-format";
export const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export async function backupSession(req: Request, mutation = false) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) throw new Response(null, { status: 401, headers: privateHeaders });
  if (mutation && req.headers.get("origin") !== new URL(req.url).origin) throw new Response(null, { status: 403, headers: privateHeaders });
  return session.user.id;
}
export function backupFailure(error: unknown) {
  if (error instanceof Response) return error;
  return Response.json({ error: error instanceof BackupError ? error.message : "Não foi possível concluir o backup ou a restauração. Tente novamente; seus dados atuais foram preservados." }, { status: error instanceof BackupError ? 400 : 503, headers: privateHeaders });
}
export async function limitedBody(req: Request, limit: number) {
  if (Number(req.headers.get("content-length")) > limit) throw new BackupError("O arquivo excede o limite permitido.");
  const reader = req.body?.getReader();
  if (!reader) throw new BackupError("Arquivo vazio.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) { await reader.cancel(); throw new BackupError("O arquivo excede o limite permitido."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
