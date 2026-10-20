import type { DataStore } from "./db";
export const trashRetentionMs = 30 * 24 * 60 * 60 * 1000;
const tables = { book: "books", idea: "ideas", question: "questions", photo: "photos", connection: "connections" } as const;
export function createTrashService(db: DataStore, removeFile: (path: string) => Promise<void>) {
  async function flush(owner: string) {
    const files = await db.all<{ id: string; storage_path: string }>("SELECT id,storage_path FROM storage_deletions WHERE owner=? LIMIT 100", owner);
    for (const file of files) {
      if (!file.storage_path.startsWith(owner + "/") || file.storage_path.includes("..")) continue;
      try { await removeFile(file.storage_path); await db.run("DELETE FROM storage_deletions WHERE id=? AND owner=?", file.id, owner); }
      catch { /* Durable queue retries on the next sweep. */ }
    }
  }
  async function purge(owner: string, kind: string, id: string, cutoff?: number) {
    if (!Object.hasOwn(tables, kind) || typeof id !== "string") throw Error("Registro não encontrado.");
    const table = tables[kind as keyof typeof tables];
    const removed = await db.transaction(async tx => {
      // Lock the record before checking its state; a concurrent restore must finish first.
      await tx.run(`UPDATE ${table} SET deleted_at=deleted_at WHERE id=? AND owner=?`, id, owner);
      const record = await tx.get<{ deleted_at: number | null }>(`SELECT deleted_at FROM ${table} WHERE id=? AND owner=?`, id, owner);
      if (cutoff !== undefined && (!record || record.deleted_at === null || record.deleted_at > cutoff)) return false;
      if (!record || record.deleted_at === null) throw Error("Somente itens da lixeira podem ser excluídos definitivamente.");
      const photos = kind === "book"
        ? await tx.all<{ storage_path: string | null }>("SELECT storage_path FROM photos WHERE book=? AND owner=?", id, owner)
        : kind === "photo" ? await tx.all<{ storage_path: string | null }>("SELECT storage_path FROM photos WHERE id=? AND owner=?", id, owner) : [];
      for (const photo of photos) if (photo.storage_path) await tx.run("INSERT INTO storage_deletions(id,owner,storage_path) VALUES(?,?,?)", crypto.randomUUID(), owner, photo.storage_path);
      if (kind === "book") {
        await tx.run("DELETE FROM connections WHERE owner=? AND (source IN (SELECT id FROM ideas WHERE book=? AND owner=?) OR target IN (SELECT id FROM ideas WHERE book=? AND owner=?))", owner, id, owner, id, owner);
        for (const child of ["questions", "photos", "ideas"]) await tx.run(`DELETE FROM ${child} WHERE book=? AND owner=?`, id, owner);
      }
      if (kind === "idea") await tx.run("DELETE FROM connections WHERE owner=? AND (source=? OR target=?)", owner, id, id);
      if (kind === "photo") await tx.run("UPDATE books SET cover_photo=NULL WHERE cover_photo=? AND owner=?", id, owner);
      await tx.run(`DELETE FROM ${table} WHERE id=? AND owner=?`, id, owner);
      return true;
    });
    await flush(owner);
    return removed;
  }
  async function expire(owner: string, now = Date.now()) {
    const cutoff = now - trashRetentionMs;
    let count = 0;
    for (const [kind, table] of Object.entries(tables)) {
      const rows = await db.all<{ id: string }>(`SELECT id FROM ${table} WHERE owner=? AND deleted_at IS NOT NULL AND deleted_at<=? LIMIT 100`, owner, cutoff);
      for (const row of rows) if (await purge(owner, kind, row.id, cutoff)) count++;
    }
    await flush(owner);
    return count;
  }
  async function sweep() {
    const rows = await db.all<{ owner: string }>(`SELECT DISTINCT owner FROM (
      SELECT owner FROM books WHERE deleted_at<=? UNION SELECT owner FROM ideas WHERE deleted_at<=?
      UNION SELECT owner FROM questions WHERE deleted_at<=? UNION SELECT owner FROM photos WHERE deleted_at<=?
      UNION SELECT owner FROM connections WHERE deleted_at<=? UNION SELECT owner FROM storage_deletions
    ) pending LIMIT 100`, ...Array(5).fill(Date.now() - trashRetentionMs));
    let count = 0;
    for (const row of rows) count += await expire(row.owner);
    return count;
  }
  return { purge, expire, sweep, flush };
}
