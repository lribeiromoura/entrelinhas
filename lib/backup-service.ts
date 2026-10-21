import { createHash, randomUUID } from "node:crypto";
import type { DataStore } from "./db";
import { validPhotoSignature } from "./photo-signature";
import { normalizePhoto } from "./normalize-photo";
import { BackupError, backupCounts, maxBackupManifestBytes, parseBackup, type BackupManifest, type BackupMetadata, type BackupPhoto } from "./backup-format";
type StoredManifest = Omit<BackupManifest, "photos"> & { photos: (BackupPhoto & { source_id: string })[] };
type ImportRow = { id: string; manifest: string; status: string; expires: number };
type StagedPhoto = { source_id: string; photo_id: string; mime: string; bytes: Buffer | null; storage_path: string | null };
export type BackupFiles = {
  upload(owner: string, id: string, mime: string, bytes: Buffer): Promise<string | null>;
  remove(path: string): Promise<void>;
  download(path: string, owner: string): Promise<Buffer>;
};
async function insertRows(tx: DataStore, table: string, columns: string[], rows: unknown[][]) {
  for (let index = 0; index < rows.length; index += 100) {
    const batch = rows.slice(index, index + 100);
    await tx.run(`INSERT INTO ${table}(${columns.join(",")}) VALUES ${batch.map(row => `(${row.map(() => "?").join(",")})`).join(",")}`, ...batch.flat());
  }
}
export function createBackupService(db: DataStore, files: BackupFiles) {
  async function getJob(tx: DataStore, owner: string, id: string) {
    const job = await tx.get<ImportRow>("SELECT id,manifest,status,expires FROM backup_imports WHERE id=? AND owner=?", id, owner);
    if (!job || (job.status !== "committed" && job.expires <= Date.now())) throw new BackupError("A restauração expirou ou não foi encontrada. Selecione o backup novamente.");
    return job;
  }
  async function lockJob(tx: DataStore, owner: string, id: string) {
    // Updating the job obtains the same row lock for upload and commit in both databases.
    await tx.run("UPDATE backup_imports SET status=status WHERE id=? AND owner=?", id, owner);
    return getJob(tx, owner, id);
  }
  async function status(owner: string, id: string) {
    const job = await getJob(db, owner, id);
    const manifest = JSON.parse(job.manifest);
    const uploaded = await db.all<{ source_id: string }>("SELECT source_id FROM backup_import_photos WHERE import_id=?", job.id);
    return { id: job.id, complete: job.status === "committed", uploaded: uploaded.map(photo => photo.source_id), counts: job.status === "committed" ? manifest : backupCounts(manifest) };
  }
  async function cleanup(owner: string) {
    const paths = await db.transaction(async tx => {
      const expired = await tx.all<{ id: string }>("SELECT id FROM backup_imports WHERE owner=? AND status='pending' AND expires<=?", owner, Date.now());
      const paths: string[] = [];
      for (const job of expired) {
        await tx.run("UPDATE backup_imports SET status='expired' WHERE id=? AND owner=? AND status='pending'", job.id, owner);
        const staged = await tx.all<{ storage_path: string | null }>("SELECT storage_path FROM backup_import_photos WHERE import_id=?", job.id);
        paths.push(...staged.flatMap(photo => photo.storage_path ? [photo.storage_path] : []));
        await tx.run("DELETE FROM backup_imports WHERE id=? AND owner=? AND status='expired'", job.id, owner);
      }
      return paths;
    });
    for (const path of paths) await files.remove(path);
  }
  return {
    async metadata(owner: string): Promise<BackupMetadata> {
      const result = await db.transaction(async tx => {
        const books = await tx.all<BackupMetadata["books"][number]>("SELECT id,title,author,summary,cover_id,cover_photo,deleted_at,reading_status FROM books WHERE owner=? ORDER BY id", owner);
        const summaryVersions = await tx.all<NonNullable<BackupMetadata["summaryVersions"]>[number]>("SELECT id,book,summary,created_at FROM summary_versions WHERE owner=? ORDER BY created_at,id", owner);
        const ideas = await tx.all<BackupMetadata["ideas"][number]>("SELECT id,book,title,description,deleted_at,map_x,map_y FROM ideas WHERE owner=? ORDER BY id", owner);
        const questions = await tx.all<BackupMetadata["questions"][number]>("SELECT id,book,prompt,answer,stage,due,deleted_at FROM questions WHERE owner=? ORDER BY id", owner);
        const connections = await tx.all<BackupMetadata["connections"][number]>("SELECT id,source,target,deleted_at FROM connections WHERE owner=? ORDER BY id", owner);
        const photos = await tx.all<BackupMetadata["photos"][number]>("SELECT id,book,mime,kind,deleted_at FROM photos WHERE owner=? ORDER BY id", owner);
        return { format: "entrelinhas" as const, version: 1 as const, createdAt: new Date().toISOString(), books, ideas, questions, connections, photos, summaryVersions };
      }, { snapshot: true });
      if (Buffer.byteLength(JSON.stringify(result)) > maxBackupManifestBytes - 20000) throw new BackupError("O texto da biblioteca excede o limite de 2 MB por backup desta versão.");
      return result;
    },
    async photo(owner: string, id: string) {
      // Backup includes individually trashed photos and photos of trashed books.
      const photo = await db.get<{ mime: string; bytes: Buffer | null; storage_path: string | null }>("SELECT mime,bytes,storage_path FROM photos WHERE id=? AND owner=?", id, owner);
      if (!photo) throw new BackupError("Foto do backup não encontrada.");
      const bytes = photo.storage_path ? await files.download(photo.storage_path, owner) : photo.bytes;
      if (!bytes) throw new BackupError("Não foi possível ler uma das fotos. O backup não foi concluído.");
      return { bytes, mime: photo.mime };
    },
    async begin(owner: string, input: unknown) {
      const manifest = parseBackup(input);
      const fingerprint = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
      await cleanup(owner);
      const existing = await db.get<{ id: string }>("SELECT id FROM backup_imports WHERE owner=? AND fingerprint=?", owner, fingerprint);
      if (existing) return status(owner, existing.id);
      const bookIds = new Map(manifest.books.map(row => [row.id, randomUUID()]));
      const ideaIds = new Map(manifest.ideas.map(row => [row.id, randomUUID()]));
      const photoIds = new Map(manifest.photos.map(row => [row.id, randomUUID()]));
      const remapped: StoredManifest = {
        ...manifest,
        books: manifest.books.map(row => ({ ...row, id: bookIds.get(row.id)!, cover_photo: row.cover_photo ? photoIds.get(row.cover_photo)! : null })),
        ideas: manifest.ideas.map(row => ({ ...row, id: ideaIds.get(row.id)!, book: bookIds.get(row.book)! })),
        summaryVersions: (manifest.summaryVersions ?? []).map(row => ({ ...row, id: randomUUID(), book: bookIds.get(row.book)! })),
        questions: manifest.questions.map(row => ({ ...row, id: randomUUID(), book: bookIds.get(row.book)! })),
        connections: manifest.connections.map(row => {
          const [source, target] = [ideaIds.get(row.source)!, ideaIds.get(row.target)!].sort();
          return { ...row, id: randomUUID(), source, target };
        }),
        photos: manifest.photos.map(row => ({ ...row, source_id: row.id, id: photoIds.get(row.id)!, book: bookIds.get(row.book)! })),
      };
      const id = randomUUID();
      await db.run("INSERT INTO backup_imports(id,owner,fingerprint,manifest,status,expires) VALUES(?,?,?,?,?,?) ON CONFLICT(owner,fingerprint) DO NOTHING", id, owner, fingerprint, JSON.stringify(remapped), "pending", Date.now() + 86400000);
      const job = await db.get<{ id: string }>("SELECT id FROM backup_imports WHERE owner=? AND fingerprint=?", owner, fingerprint);
      return status(owner, job!.id);
    },
    async upload(owner: string, jobId: string, sourceId: string, bytes: Buffer, mime: string) {
      const job = await getJob(db, owner, jobId);
      if (job.status === "committed") return;
      const manifest: StoredManifest = JSON.parse(job.manifest);
      const photo = manifest.photos.find(row => row.source_id === sourceId);
      if (!validPhotoSignature(mime, bytes) || !photo || photo.mime !== mime || photo.size !== bytes.length || createHash("sha256").update(bytes).digest("hex") !== photo.sha256) throw new BackupError("Uma foto não corresponde ao backup. Nenhum registro foi restaurado.");
      if (await db.get("SELECT photo_id FROM backup_import_photos WHERE import_id=? AND source_id=?", jobId, sourceId)) return;
      // Imported images pass the same decoding, size, and metadata stripping as normal uploads.
      let optimized;
      try { optimized = await normalizePhoto(bytes); }
      catch { throw new BackupError("Uma imagem do backup é inválida. Nenhum registro foi restaurado."); }
      const path = await files.upload(owner, randomUUID(), optimized.mime, optimized.bytes);
      let used = false;
      try {
        await db.transaction(async tx => {
          const current = await lockJob(tx, owner, jobId);
          if (current.status === "committed") return;
          if (await tx.get("SELECT photo_id FROM backup_import_photos WHERE import_id=? AND source_id=?", jobId, sourceId)) return;
          await tx.run("INSERT INTO backup_import_photos(import_id,source_id,photo_id,mime,bytes,storage_path) VALUES(?,?,?,?,?,?)", jobId, sourceId, photo.id, optimized.mime, path ? null : optimized.bytes, path);
          used = true;
        });
      } finally { if (path && !used) await files.remove(path); }
    },
    async commit(owner: string, id: string) {
      return db.transaction(async tx => {
        const job = await lockJob(tx, owner, id);
        if (job.status === "committed") return { alreadyImported: true, counts: JSON.parse(job.manifest) };
        const manifest: StoredManifest = JSON.parse(job.manifest);
        const photos = await tx.all<StagedPhoto>("SELECT source_id,photo_id,mime,bytes,storage_path FROM backup_import_photos WHERE import_id=?", id);
        if (photos.length !== manifest.photos.length || manifest.photos.some(row => !photos.some(photo => photo.source_id === row.source_id && photo.photo_id === row.id))) throw new BackupError("Ainda faltam fotos. Tente novamente para continuar a restauração.");
        await insertRows(tx, "books", ["id", "owner", "title", "author", "summary", "cover_id", "cover_photo", "deleted_at", "reading_status"], manifest.books.map(row => [row.id, owner, row.title, row.author, row.summary, row.cover_id, row.cover_photo, row.deleted_at, row.reading_status ?? "want"]));
        await insertRows(tx, "summary_versions", ["id", "owner", "book", "summary", "created_at"], (manifest.summaryVersions ?? []).map(row => [row.id, owner, row.book, row.summary, row.created_at]));
        await insertRows(tx, "ideas", ["id", "owner", "book", "title", "description", "deleted_at", "map_x", "map_y"], manifest.ideas.map(row => [row.id, owner, row.book, row.title, row.description, row.deleted_at, row.map_x, row.map_y]));
        await insertRows(tx, "questions", ["id", "owner", "book", "prompt", "answer", "stage", "due", "deleted_at"], manifest.questions.map(row => [row.id, owner, row.book, row.prompt, row.answer, row.stage, row.due, row.deleted_at]));
        await insertRows(tx, "connections", ["id", "owner", "source", "target", "deleted_at"], manifest.connections.map(row => [row.id, owner, row.source, row.target, row.deleted_at]));
        const staged = new Map(photos.map(photo => [photo.source_id, photo]));
        await insertRows(tx, "photos", ["id", "owner", "book", "mime", "bytes", "kind", "storage_path", "deleted_at"], manifest.photos.map(row => {
          const photo = staged.get(row.source_id)!;
          return [row.id, owner, row.book, photo.mime, photo.bytes, row.kind, photo.storage_path, row.deleted_at];
        }));
        const counts = backupCounts(manifest);
        await tx.run("UPDATE backup_imports SET status='committed',manifest=? WHERE id=? AND owner=?", JSON.stringify(counts), id, owner);
        await tx.run("DELETE FROM backup_import_photos WHERE import_id=?", id);
        return { alreadyImported: false, counts };
      });
    },
  };
}
