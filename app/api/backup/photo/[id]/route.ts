import { backups } from "../../../../../lib/backup-server";
import { backupSession, backupFailure, privateHeaders } from "../../../../../lib/backup-http";
export const runtime = "nodejs";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const owner = await backupSession(req);
    const photo = await backups.photo(owner, (await params).id);
    return new Response(new Uint8Array(photo.bytes), { headers: { ...privateHeaders, "Content-Type": photo.mime, "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch (error) { return backupFailure(error); }
}
