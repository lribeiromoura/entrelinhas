import { db } from "./db";
import { uploadPrivate, removePrivate, downloadPrivate } from "./storage";
import { createBackupService } from "./backup-service";
export const backups = createBackupService(db, {
  upload: uploadPrivate,
  remove: removePrivate,
  download: async (path, owner) => Buffer.from(await (await downloadPrivate(path, owner)).arrayBuffer()),
});
