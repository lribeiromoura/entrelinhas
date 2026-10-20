import { backups } from "../../../../../../../lib/backup-server";
import { backupSession, backupFailure, limitedBody, privateHeaders } from "../../../../../../../lib/backup-http";
import { maxBackupPhotoBytes } from "../../../../../../../lib/backup-format";
export const runtime = "nodejs";
export async function PUT(req: Request, { params }: { params: Promise<{ job: string; id: string }> }) {
  try {
    const owner = await backupSession(req, true), { job, id } = await params;
    const bytes = await limitedBody(req, maxBackupPhotoBytes);
    await backups.upload(owner, job, id, bytes, req.headers.get("content-type") || "");
    return Response.json({ ok: true }, { headers: privateHeaders });
  } catch (error) { return backupFailure(error); }
}
