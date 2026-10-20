import { backups } from "../../../../lib/backup-server";
import { backupSession, backupFailure, limitedBody, privateHeaders } from "../../../../lib/backup-http";
import { BackupError, maxBackupManifestBytes } from "../../../../lib/backup-format";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const owner = await backupSession(req, true);
    let body;
    try { body = JSON.parse((await limitedBody(req, maxBackupManifestBytes + 1000)).toString("utf8")); }
    catch (error) { if (error instanceof BackupError) throw error; throw new BackupError("Arquivo de backup inválido."); }
    if (body?.action === "begin") return Response.json(await backups.begin(owner, body.manifest), { headers: privateHeaders });
    if (body?.action === "commit" && typeof body.id === "string") return Response.json(await backups.commit(owner, body.id), { headers: privateHeaders });
    throw new BackupError("Operação de backup inválida.");
  } catch (error) { return backupFailure(error); }
}
