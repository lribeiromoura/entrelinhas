import { trashService } from "../../../lib/trash-server";
import { backups } from "../../../lib/backup-server";
import { backupSession, backupFailure, privateHeaders } from "../../../lib/backup-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try { const owner = await backupSession(req); await trashService.expire(owner); return Response.json(await backups.metadata(owner), { headers: privateHeaders }); }
  catch (error) { return backupFailure(error); }
}
