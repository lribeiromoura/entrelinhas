import { db, type DataStore } from "./db";
export async function requireBook(
  book: unknown,
  owner: string,
  store: DataStore = db,
) {
  if (typeof book !== "string") throw Error("Livro não encontrado.");
  const found = await store.get<{ id: string }>(
    "SELECT id FROM books WHERE id=? AND owner=? AND deleted_at IS NULL",
    book,
    owner,
  );
  if (!found) throw Error("Livro não encontrado.");
  return found;
}
export async function readLibrary(owner: string) {
  const [books, ideas, connections, questions, photos] = await Promise.all([
    db.all(`SELECT b.*, CASE WHEN p.deleted_at IS NULL THEN b.cover_photo ELSE NULL END AS cover_photo
      FROM books b LEFT JOIN photos p ON p.id=b.cover_photo AND p.owner=b.owner
      WHERE b.owner=? AND b.deleted_at IS NULL`, owner),
    db.all(`SELECT i.* FROM ideas i JOIN books b ON b.id=i.book AND b.owner=i.owner
      WHERE i.owner=? AND i.deleted_at IS NULL AND b.deleted_at IS NULL`, owner),
    db.all(`SELECT c.* FROM connections c
      JOIN ideas s ON s.id=c.source AND s.owner=c.owner
      JOIN ideas t ON t.id=c.target AND t.owner=c.owner
      JOIN books sb ON sb.id=s.book AND sb.owner=c.owner
      JOIN books tb ON tb.id=t.book AND tb.owner=c.owner
      WHERE c.owner=? AND c.deleted_at IS NULL AND s.deleted_at IS NULL AND t.deleted_at IS NULL
      AND sb.deleted_at IS NULL AND tb.deleted_at IS NULL`, owner),
    db.all(`SELECT q.* FROM questions q JOIN books b ON b.id=q.book AND b.owner=q.owner
      WHERE q.owner=? AND q.deleted_at IS NULL AND b.deleted_at IS NULL ORDER BY q.due`, owner),
    db.all(`SELECT p.id,p.book FROM photos p JOIN books b ON b.id=p.book AND b.owner=p.owner
      WHERE p.owner=? AND p.kind='note' AND p.deleted_at IS NULL AND b.deleted_at IS NULL`, owner),
  ]);
  const trash = (await Promise.all([
    db.all("SELECT id,title,deleted_at FROM books WHERE owner=? AND deleted_at IS NOT NULL", owner).then(rows => rows.map(row => ({ ...row, kind: "book" }))),
    db.all("SELECT id,title,deleted_at FROM ideas WHERE owner=? AND deleted_at IS NOT NULL", owner).then(rows => rows.map(row => ({ ...row, kind: "idea" }))),
    db.all("SELECT id,prompt AS title,deleted_at FROM questions WHERE owner=? AND deleted_at IS NOT NULL", owner).then(rows => rows.map(row => ({ ...row, kind: "question" }))),
    db.all("SELECT id,deleted_at FROM photos WHERE owner=? AND deleted_at IS NOT NULL", owner).then(rows => rows.map(row => ({ ...row, title: "Foto", kind: "photo" }))),
    db.all("SELECT id,deleted_at FROM connections WHERE owner=? AND deleted_at IS NOT NULL", owner).then(rows => rows.map(row => ({ ...row, title: "Conexão", kind: "connection" }))),
  ])).flat();
  return { books, ideas, connections, questions, photos, trash };
}
