import { db, type DataStore } from "./db";
export async function requireBook(
  book: unknown,
  owner: string,
  store: DataStore = db,
) {
  if (typeof book !== "string") throw Error("Livro não encontrado.");
  const found = await store.get<{ id: string }>(
    "SELECT id FROM books WHERE id=? AND owner=?",
    book,
    owner,
  );
  if (!found) throw Error("Livro não encontrado.");
  return found;
}
export async function readLibrary(owner: string) {
  const [books, ideas, connections, questions, photos] = await Promise.all([
    db.all("SELECT * FROM books WHERE owner=?", owner),
    db.all("SELECT * FROM ideas WHERE owner=?", owner),
    db.all("SELECT * FROM connections WHERE owner=?", owner),
    db.all("SELECT * FROM questions WHERE owner=? ORDER BY due", owner),
    db.all("SELECT id,book FROM photos WHERE owner=? AND kind='note'", owner),
  ]);
  return { books, ideas, connections, questions, photos };
}
