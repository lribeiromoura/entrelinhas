import type { DataStore } from "./db";
import { requireBook } from "./library";
const tables = { book: "books", idea: "ideas", question: "questions", photo: "photos", connection: "connections" } as const;
type Kind = keyof typeof tables;
export async function changeRecord(store: DataStore, owner: string, input: Record<string, unknown>) {
  const kind = input.kind as Kind;
  if (!Object.hasOwn(tables, kind) || typeof input.id !== "string") throw Error("Registro não encontrado.");
  const table = tables[kind];
  await store.transaction(async (tx) => {
    const record = await tx.get<{ id: string; book?: string; source?: string; target?: string; deleted_at: number | null }>(
      `SELECT * FROM ${table} WHERE id=? AND owner=?`, input.id, owner);
    if (!record) throw Error("Registro não encontrado.");
    if (input.action === "trash") {
      if (record.deleted_at !== null) throw Error("Este registro já está na lixeira.");
      if (record.book) await requireBook(record.book, owner, tx);
      await tx.run(`UPDATE ${table} SET deleted_at=? WHERE id=? AND owner=?`, Date.now(), input.id, owner);
      return;
    }
    if (record.book) await requireBook(record.book, owner, tx);
    if (kind === "connection") {
      for (const id of [record.source, record.target]) {
        const idea = await tx.get<{ book: string }>("SELECT book FROM ideas WHERE id=? AND owner=? AND deleted_at IS NULL", id, owner);
        if (!idea) throw Error("Restaure primeiro as ideias desta conexão.");
        await requireBook(idea.book, owner, tx);
      }
    }
    if (input.action === "restore") {
      if (record.deleted_at === null) throw Error("Este registro não está na lixeira.");
      await tx.run(`UPDATE ${table} SET deleted_at=NULL WHERE id=? AND owner=?`, input.id, owner);
      return;
    }
    if (input.action !== "edit" || record.deleted_at !== null) throw Error("Operação inválida.");
    const fields = kind === "book" ? ["title", "author"] : kind === "idea" ? ["title", "description"] : kind === "question" ? ["prompt", "answer"] : [];
    if (!fields.length) throw Error("Este registro não permite edição.");
    const values = fields.map(field => {
      const value = input[field];
      const limit = ["title", "author"].includes(field) ? 500 : 20000;
      if (typeof value !== "string" || !value.trim() || value.length > limit) throw Error("Preencha os campos corretamente.");
      return value.trim();
    });
    await tx.run(`UPDATE ${table} SET ${fields.map(field => `${field}=?`).join(",")} WHERE id=? AND owner=?`, ...values, input.id, owner);
  });
}
