import Database from "better-sqlite3";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
const dir = process.env.DATA_DIR || "data";
mkdirSync(dir, { recursive: true, mode: 0o700 });
if (!existsSync(`${dir}/secret`)) {
  try {
    writeFileSync(`${dir}/secret`, randomBytes(48).toString("hex"), {
      mode: 0o600,
      flag: "wx",
    });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
}
export const secret =
  process.env.BETTER_AUTH_SECRET || readFileSync(`${dir}/secret`, "utf8");
export const db = new Database(`${dir}/library.sqlite`);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`CREATE TABLE IF NOT EXISTS books(id TEXT PRIMARY KEY,owner TEXT NOT NULL,title TEXT NOT NULL,author TEXT NOT NULL,summary TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS ideas(id TEXT PRIMARY KEY,owner TEXT NOT NULL,book TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,title TEXT NOT NULL,description TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY,owner TEXT NOT NULL,source TEXT NOT NULL REFERENCES ideas(id),target TEXT NOT NULL REFERENCES ideas(id),UNIQUE(owner,source,target));
CREATE TABLE IF NOT EXISTS questions(id TEXT PRIMARY KEY,owner TEXT NOT NULL,book TEXT NOT NULL REFERENCES books(id),prompt TEXT NOT NULL,answer TEXT NOT NULL,stage INTEGER NOT NULL DEFAULT 0,due INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY,owner TEXT NOT NULL,book TEXT NOT NULL REFERENCES books(id),mime TEXT NOT NULL,bytes BLOB NOT NULL);`);

// Additive migration for existing local libraries.
db.transaction(() => {
  const columns = db.pragma("table_info(books)") as { name: string }[];
  for (const [name, type] of [
    ["cover_id", "INTEGER"],
    ["cover_photo", "TEXT"],
  ]) {
    if (!columns.some((c) => c.name === name))
      db.exec(`ALTER TABLE books ADD COLUMN ${name} ${type}`);
  }
  const photos = db.pragma("table_info(photos)") as { name: string }[];
  if (!photos.some((c) => c.name === "kind"))
    db.exec("ALTER TABLE photos ADD COLUMN kind TEXT NOT NULL DEFAULT 'note'");
}).immediate();
