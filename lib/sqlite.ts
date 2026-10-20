import Database from "better-sqlite3";
import { localDataDir as dir } from "./settings";
export const sqlite = new Database(`${dir}/library.sqlite`);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.exec(`CREATE TABLE IF NOT EXISTS books(id TEXT PRIMARY KEY,owner TEXT NOT NULL,title TEXT NOT NULL,author TEXT NOT NULL,summary TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS ideas(id TEXT PRIMARY KEY,owner TEXT NOT NULL,book TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,title TEXT NOT NULL,description TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY,owner TEXT NOT NULL,source TEXT NOT NULL REFERENCES ideas(id),target TEXT NOT NULL REFERENCES ideas(id),UNIQUE(owner,source,target));
CREATE TABLE IF NOT EXISTS questions(id TEXT PRIMARY KEY,owner TEXT NOT NULL,book TEXT NOT NULL REFERENCES books(id),prompt TEXT NOT NULL,answer TEXT NOT NULL,stage INTEGER NOT NULL DEFAULT 0,due INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY,owner TEXT NOT NULL,book TEXT NOT NULL REFERENCES books(id),mime TEXT NOT NULL,bytes BLOB NOT NULL);`);

// Additive migration for existing local libraries.
sqlite
  .transaction(() => {
    const columns = sqlite.pragma("table_info(books)") as { name: string }[];
    for (const [name, type] of [
      ["cover_id", "INTEGER"],
      ["cover_photo", "TEXT"],
    ]) {
      if (!columns.some((c) => c.name === name))
        sqlite.exec(`ALTER TABLE books ADD COLUMN ${name} ${type}`);
    }
    for (const table of ["books", "ideas", "questions", "photos", "connections"]) {
      const fields = sqlite.pragma(`table_info(${table})`) as { name: string }[];
      if (!fields.some((field) => field.name === "deleted_at"))
        sqlite.exec(`ALTER TABLE ${table} ADD COLUMN deleted_at INTEGER`);
    }
    const photos = sqlite.pragma("table_info(photos)") as { name: string }[];
    if (!photos.some((c) => c.name === "storage_path"))
      sqlite.exec("ALTER TABLE photos ADD COLUMN storage_path TEXT");
    if (!photos.some((c) => c.name === "kind"))
      sqlite.exec(
        "ALTER TABLE photos ADD COLUMN kind TEXT NOT NULL DEFAULT 'note'",
      );
  })
  .immediate();

sqlite.exec(`CREATE TABLE IF NOT EXISTS backup_imports(id TEXT PRIMARY KEY,owner TEXT NOT NULL,fingerprint TEXT NOT NULL,manifest TEXT NOT NULL,status TEXT NOT NULL,expires INTEGER NOT NULL,UNIQUE(owner,fingerprint));
CREATE TABLE IF NOT EXISTS backup_import_photos(import_id TEXT NOT NULL REFERENCES backup_imports(id) ON DELETE CASCADE,source_id TEXT NOT NULL,photo_id TEXT NOT NULL,mime TEXT NOT NULL,bytes BLOB,storage_path TEXT,PRIMARY KEY(import_id,source_id));`);

for (const name of ["map_x", "map_y"]) {
  const fields = sqlite.pragma("table_info(ideas)") as { name: string }[];
  if (!fields.some(field => field.name === name)) sqlite.exec(`ALTER TABLE ideas ADD COLUMN ${name} INTEGER`);
}

sqlite.exec("CREATE TABLE IF NOT EXISTS storage_deletions(id TEXT PRIMARY KEY,owner TEXT NOT NULL,storage_path TEXT NOT NULL)");

sqlite.exec("CREATE TABLE IF NOT EXISTS summary_versions(id TEXT PRIMARY KEY,owner TEXT NOT NULL,book TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,summary TEXT NOT NULL,created_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS summary_versions_book_idx ON summary_versions(owner,book,created_at)");
