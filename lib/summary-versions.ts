import type { DataStore } from "./db";
export function createSummaryVersions(db: DataStore) {
  async function save(owner: string, book: unknown, text?: unknown, restoreId?: unknown) {
    if (typeof book !== "string") throw Error("Livro não encontrado.");
    return db.transaction(async tx => {
      await tx.run("UPDATE books SET summary=summary WHERE id=? AND owner=? AND deleted_at IS NULL", book, owner);
      const current = await tx.get<{ summary: string }>("SELECT summary FROM books WHERE id=? AND owner=? AND deleted_at IS NULL", book, owner);
      if (!current) throw Error("Livro não encontrado.");
      if (restoreId !== undefined) {
        if (typeof restoreId !== "string") throw Error("Versão não encontrada.");
        const version = await tx.get<{ summary: string }>("SELECT summary FROM summary_versions WHERE id=? AND book=? AND owner=?", restoreId, book, owner);
        if (!version) throw Error("Versão não encontrada.");
        text = version.summary;
      }
      if (typeof text !== "string" || text.length > 100000) throw Error("Resumo inválido ou muito longo.");
      if (current.summary === text) return;
      const latest = await tx.get<{ created_at: number; summary: string }>("SELECT created_at,summary FROM summary_versions WHERE book=? AND owner=? ORDER BY created_at DESC,id DESC LIMIT 1", book, owner);
      const now = Math.max(Date.now(), (latest?.created_at ?? 0) + 2);
      // Preserve a pre-existing summary when a library starts using versioning.
      if ((!latest && current.summary) || (latest && latest.summary !== current.summary)) await tx.run("INSERT INTO summary_versions(id,owner,book,summary,created_at) VALUES(?,?,?,?,?)", crypto.randomUUID(), owner, book, current.summary, now - 1);
      await tx.run("INSERT INTO summary_versions(id,owner,book,summary,created_at) VALUES(?,?,?,?,?)", crypto.randomUUID(), owner, book, text, now);
      await tx.run("UPDATE books SET summary=? WHERE id=? AND owner=?", text, book, owner);
    });
  }
  async function read(owner: string, book: string, version?: string, offset = 0) {
    const current = await db.get<{ summary: string }>("SELECT summary FROM books WHERE id=? AND owner=? AND deleted_at IS NULL", book, owner);
    if (!current) throw Error("Livro não encontrado.");
    if (version) {
      const row = await db.get<{ id: string; summary: string; created_at: number }>("SELECT id,summary,created_at FROM summary_versions WHERE id=? AND book=? AND owner=?", version, book, owner);
      if (!row) throw Error("Versão não encontrada.");
      return row;
    }
    const latest = await db.get<{ id: string; summary: string }>("SELECT id,summary FROM summary_versions WHERE book=? AND owner=? ORDER BY created_at DESC,id DESC LIMIT 1", book, owner);
    const items = await db.all<{ id: string; preview: string; created_at: number }>("SELECT id,SUBSTR(summary,1,180) AS preview,created_at FROM summary_versions WHERE book=? AND owner=? ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET ?", book, owner, offset);
    return { items: items.slice(0, 20), currentId: latest?.summary === current.summary ? latest.id : null, hasMore: items.length > 20 };
  }
  return { save, read };
}
