import { validPosition } from "./idea-map";
// Portable, versioned format. No account, session, password, or storage credentials.
export const maxBackupFileBytes = 100 * 1024 * 1024;
export const maxBackupManifestBytes = 2 * 1024 * 1024;
export const maxBackupPhotoBytes = 3 * 1024 * 1024;
export type BackupBook = { id: string; title: string; author: string; summary: string; cover_id: number | null; cover_photo: string | null; deleted_at: number | null };
export type BackupIdea = { id: string; book: string; title: string; description: string; deleted_at: number | null; map_x: number | null; map_y: number | null };
export type BackupQuestion = { id: string; book: string; prompt: string; answer: string; stage: number; due: number; deleted_at: number | null };
export type BackupConnection = { id: string; source: string; target: string; deleted_at: number | null };
export type BackupPhoto = { id: string; book: string; mime: string; kind: "cover" | "note"; deleted_at: number | null; size: number; sha256: string; data?: string };
export type BackupSummaryVersion = { id: string; book: string; summary: string; created_at: number };
export type BackupManifest = { format: "entrelinhas"; version: 1; createdAt: string; summaryVersions?: BackupSummaryVersion[]; books: BackupBook[]; ideas: BackupIdea[]; questions: BackupQuestion[]; connections: BackupConnection[]; photos: BackupPhoto[] };
export type BackupMetadata = Omit<BackupManifest, "photos"> & { photos: Omit<BackupPhoto, "size" | "sha256" | "data">[] };
export class BackupError extends Error {}
const invalid = () => new BackupError("Backup inválido ou incompatível. Nenhum registro foi restaurado.");
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, empty = false) {
  if (typeof value !== "string" || value.length > max || (!empty && !value.trim())) throw invalid();
  return value;
}
function integer(value: unknown, max = 8640000000000000) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) throw invalid();
  return value;
}
function deleted(value: unknown) { return value === null ? null : integer(value); }
function list(value: unknown): (Record<string, unknown> & { id: string })[] {
  if (!Array.isArray(value) || value.length > 5000) throw invalid();
  const ids = new Set<string>();
  return value.map(item => {
    const row = object(item), id = text(row.id, 128);
    if (ids.has(id)) throw invalid();
    ids.add(id);
    return { ...row, id };
  });
}
export function parseBackup(value: unknown, includeData = false): BackupManifest {
  const raw = object(value);
  if (raw.format !== "entrelinhas" || raw.version !== 1) throw invalid();
  const createdAt = text(raw.createdAt, 40);
  if (!Number.isFinite(Date.parse(createdAt))) throw invalid();
  const books = list(raw.books).map(row => ({ id: row.id, title: text(row.title, 500), author: text(row.author, 500), summary: text(row.summary, 100000, true), cover_id: row.cover_id === null ? null : integer(row.cover_id, Number.MAX_SAFE_INTEGER), cover_photo: row.cover_photo === null ? null : text(row.cover_photo, 128), deleted_at: deleted(row.deleted_at) }));
  const summaryVersions = list(raw.summaryVersions ?? []).map(row => ({ id: row.id, book: text(row.book, 128), summary: text(row.summary, 100000, true), created_at: integer(row.created_at) }));
  const ideas = list(raw.ideas).map(row => {
    const x = row.map_x ?? null, y = row.map_y ?? null;
    if (!(x === null && y === null) && !validPosition(x, y)) throw invalid();
    return { id: row.id, book: text(row.book, 128), title: text(row.title, 500), description: text(row.description, 20000), deleted_at: deleted(row.deleted_at), map_x: x === null ? null : Math.round(x as number), map_y: y === null ? null : Math.round(y as number) };
  });
  const questions = list(raw.questions).map(row => ({ id: row.id, book: text(row.book, 128), prompt: text(row.prompt, 20000), answer: text(row.answer, 20000), stage: integer(row.stage, 4), due: integer(row.due), deleted_at: deleted(row.deleted_at) }));
  const connections = list(raw.connections).map(row => ({ id: row.id, source: text(row.source, 128), target: text(row.target, 128), deleted_at: deleted(row.deleted_at) }));
  const photos: BackupPhoto[] = list(raw.photos).map(row => {
    const mime = text(row.mime, 20), kind = row.kind;
    if (!["image/jpeg", "image/png", "image/webp"].includes(mime) || (kind !== "note" && kind !== "cover")) throw invalid();
    const size = integer(row.size, maxBackupPhotoBytes), sha256 = text(row.sha256, 64);
    if (!size || !/^[a-f0-9]{64}$/.test(sha256)) throw invalid();
    const photo: BackupPhoto = { id: row.id, book: text(row.book, 128), mime, kind, size, sha256, deleted_at: deleted(row.deleted_at) };
    if (includeData) {
      const data = text(row.data, Math.ceil(maxBackupPhotoBytes / 3) * 4);
      if (data.length !== 4 * Math.ceil(size / 3) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) throw invalid();
      photo.data = data;
    }
    return photo;
  });
  const bookIds = new Set(books.map(book => book.id)), ideaIds = new Set(ideas.map(idea => idea.id));
  if ([...ideas, ...questions, ...photos, ...summaryVersions].some(row => !bookIds.has(row.book))) throw invalid();
  for (const book of books) if (book.cover_photo && !photos.some(photo => photo.id === book.cover_photo && photo.book === book.id && photo.kind === "cover")) throw invalid();
  const pairs = new Set<string>();
  for (const connection of connections) {
    const pair = JSON.stringify([connection.source, connection.target].sort());
    if (!ideaIds.has(connection.source) || !ideaIds.has(connection.target) || connection.source === connection.target || pairs.has(pair)) throw invalid();
    pairs.add(pair);
  }
  const result: BackupManifest = { format: "entrelinhas", version: 1, createdAt, books, ideas, questions, connections, photos, summaryVersions };
  if (new TextEncoder().encode(JSON.stringify(withoutPhotoData(result))).length > maxBackupManifestBytes) throw new BackupError("O texto deste backup excede o limite de 2 MB desta versão.");
  if (photos.reduce((sum, photo) => sum + Math.ceil(photo.size / 3) * 4, 0) > maxBackupFileBytes - maxBackupManifestBytes) throw new BackupError("Este backup excede o limite de 100 MB desta versão.");
  return result;
}
export function withoutPhotoData(backup: BackupManifest): BackupManifest {
  return { ...backup, photos: backup.photos.map(({ data: _data, ...photo }) => photo) };
}
export function backupCounts(backup: BackupManifest) {
  return { books: backup.books.length, ideas: backup.ideas.length, questions: backup.questions.length, connections: backup.connections.length, photos: backup.photos.length };
}
