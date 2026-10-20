-- Only the server's database role accesses these tables. Better Auth owns login.
CREATE TABLE IF NOT EXISTS books(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,title TEXT NOT NULL,author TEXT NOT NULL,summary TEXT NOT NULL DEFAULT '',cover_id BIGINT,cover_photo TEXT);
CREATE TABLE IF NOT EXISTS ideas(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,book TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,title TEXT NOT NULL,description TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,source TEXT NOT NULL REFERENCES ideas(id),target TEXT NOT NULL REFERENCES ideas(id),UNIQUE(owner,source,target));
CREATE TABLE IF NOT EXISTS questions(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,book TEXT NOT NULL REFERENCES books(id),prompt TEXT NOT NULL,answer TEXT NOT NULL,stage INTEGER NOT NULL DEFAULT 0,due BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,book TEXT NOT NULL REFERENCES books(id),mime TEXT NOT NULL,bytes BYTEA,kind TEXT NOT NULL DEFAULT 'note',storage_path TEXT);
CREATE INDEX IF NOT EXISTS books_owner_idx ON books(owner);
CREATE INDEX IF NOT EXISTS ideas_owner_idx ON ideas(owner,book);
CREATE INDEX IF NOT EXISTS questions_due_idx ON questions(owner,due);
CREATE INDEX IF NOT EXISTS photos_owner_idx ON photos(owner,book);
CREATE INDEX IF NOT EXISTS connections_owner_idx ON connections(owner);

-- Recoverable trash: additive migrations preserve existing libraries.
ALTER TABLE books ADD COLUMN IF NOT EXISTS deleted_at BIGINT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS deleted_at BIGINT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS deleted_at BIGINT;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS deleted_at BIGINT;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS deleted_at BIGINT;

-- Private resumable imports; staged photos only become visible on atomic commit.
CREATE TABLE IF NOT EXISTS backup_imports(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,fingerprint TEXT NOT NULL,manifest TEXT NOT NULL,status TEXT NOT NULL,expires BIGINT NOT NULL,UNIQUE(owner,fingerprint));
CREATE TABLE IF NOT EXISTS backup_import_photos(import_id TEXT NOT NULL REFERENCES backup_imports(id) ON DELETE CASCADE,source_id TEXT NOT NULL,photo_id TEXT NOT NULL,mime TEXT NOT NULL,bytes BYTEA,storage_path TEXT,PRIMARY KEY(import_id,source_id));

ALTER TABLE ideas ADD COLUMN IF NOT EXISTS map_x INTEGER;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS map_y INTEGER;

CREATE TABLE IF NOT EXISTS storage_deletions(id TEXT PRIMARY KEY,owner TEXT NOT NULL,storage_path TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS summary_versions(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,book TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,summary TEXT NOT NULL,created_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS summary_versions_book_idx ON summary_versions(owner,book,created_at);
