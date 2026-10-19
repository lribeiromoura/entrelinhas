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
    const photos = sqlite.pragma("table_info(photos)") as { name: string }[];
    if (!photos.some((c) => c.name === "storage_path"))
      sqlite.exec("ALTER TABLE photos ADD COLUMN storage_path TEXT");
    if (!photos.some((c) => c.name === "kind"))
      sqlite.exec(
        "ALTER TABLE photos ADD COLUMN kind TEXT NOT NULL DEFAULT 'note'",
      );
  })
  .immediate();
