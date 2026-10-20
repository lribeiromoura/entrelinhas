import { BackupError, maxBackupFileBytes, parseBackup, withoutPhotoData, type BackupManifest, type BackupMetadata } from "./backup-format";
export async function photoDigest(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}
export function photoBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export function photoBytes(data: string) {
  return Uint8Array.from(atob(data), character => character.charCodeAt(0));
}
async function json(response: Response) {
  let value;
  try { value = await response.json(); } catch { throw new BackupError("Resposta inválida do servidor. Tente novamente."); }
  if (!response.ok) throw new BackupError(value.error || "Não foi possível concluir. Confira sua conexão e sessão.");
  return value;
}
export async function exportBackup(signal: AbortSignal, progress: (text: string) => void) {
  const metadata: BackupMetadata = await json(await fetch("/api/backup", { signal, cache: "no-store" }));
  const photos: BackupManifest["photos"] = [];
  let bytesTotal = new TextEncoder().encode(JSON.stringify(metadata)).length;
  for (const photo of metadata.photos) {
    progress(`Preparando foto ${photos.length + 1} de ${metadata.photos.length}…`);
    const response = await fetch("/api/backup/photo/" + encodeURIComponent(photo.id), { signal, cache: "no-store" });
    if (!response.ok) { await json(response); throw new BackupError("Não foi possível ler uma foto."); }
    const bytes = new Uint8Array(await response.arrayBuffer());
    bytesTotal += Math.ceil(bytes.length / 3) * 4 + 256;
    if (bytesTotal > maxBackupFileBytes) throw new BackupError("A biblioteca excede o limite de 100 MB por backup desta versão.");
    photos.push({ ...photo, size: bytes.length, sha256: await photoDigest(bytes), data: photoBase64(bytes) });
  }
  const archive = parseBackup({ ...metadata, photos }, true);
  const blob = new Blob([JSON.stringify(archive)], { type: "application/json" });
  if (blob.size > maxBackupFileBytes) throw new BackupError("O backup excede o limite de 100 MB desta versão.");
  return blob;
}
export async function readBackup(file: File, progress: (text: string) => void) {
  if (file.size > maxBackupFileBytes) throw new BackupError("Escolha um backup de até 100 MB.");
  let raw;
  try { raw = JSON.parse(await file.text()); } catch { throw new BackupError("Este arquivo não é um backup JSON válido."); }
  const backup = parseBackup(raw, true);
  for (let index = 0; index < backup.photos.length; index++) {
    progress(`Conferindo foto ${index + 1} de ${backup.photos.length}…`);
    const photo = backup.photos[index], bytes = photoBytes(photo.data!);
    if (bytes.length !== photo.size || await photoDigest(bytes) !== photo.sha256) throw new BackupError("Uma foto está incompleta ou foi alterada. Nenhum dado foi enviado.");
  }
  return backup;
}
export async function restoreBackup(backup: BackupManifest, signal: AbortSignal, progress: (text: string) => void) {
  const post = (body: object) => fetch("/api/backup/import", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(json);
  const job: { id: string; complete: boolean; uploaded: string[] } = await post({ action: "begin", manifest: withoutPhotoData(backup) });
  if (job.complete) return { alreadyImported: true };
  for (let index = 0; index < backup.photos.length; index++) {
    const photo = backup.photos[index];
    progress(`Restaurando foto ${index + 1} de ${backup.photos.length}…`);
    if (job.uploaded.includes(photo.id)) continue;
    const response = await fetch(`/api/backup/import/${encodeURIComponent(job.id)}/photos/${encodeURIComponent(photo.id)}`, {
      method: "PUT", signal, headers: { "Content-Type": photo.mime }, body: photoBytes(photo.data!).buffer as ArrayBuffer,
    });
    await json(response);
  }
  progress("Concluindo a restauração…");
  return post({ action: "commit", id: job.id });
}
