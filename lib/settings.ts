import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
export const databaseURL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
export const supabaseSecret =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
export const cloud = Boolean(databaseURL);
export const localDataDir = process.env.DATA_DIR || "data";
if ((process.env.SUPABASE_URL || supabaseSecret) && !cloud)
  throw Error(
    "Configure DATABASE_URL para usar o Supabase; não será usado um banco local silenciosamente.",
  );
if (process.env.VERCEL && !cloud)
  throw Error(
    "Configure DATABASE_URL para publicar com armazenamento persistente.",
  );
if (cloud) {
  const required = {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: supabaseSecret,
  };
  for (const [name, value] of Object.entries(required)) {
    if (!value) throw Error(`Configure ${name} no servidor antes de publicar.`);
  }
  if ((process.env.BETTER_AUTH_SECRET?.length || 0) < 32)
    throw Error("BETTER_AUTH_SECRET deve ter pelo menos 32 caracteres.");
  if (
    !process.env.BETTER_AUTH_URL?.startsWith("https://") &&
    !process.env.BETTER_AUTH_URL?.startsWith("http://localhost:")
  )
    throw Error("Use HTTPS na origem pública do aplicativo.");
  if (!process.env.SUPABASE_URL?.startsWith("https://"))
    throw Error("SUPABASE_URL deve usar HTTPS.");
}
let localSecret = "";
if (!cloud) {
  mkdirSync(localDataDir, { recursive: true, mode: 0o700 });
  const file = `${localDataDir}/secret`;
  if (!existsSync(file)) {
    try {
      writeFileSync(file, randomBytes(48).toString("hex"), {
        mode: 0o600,
        flag: "wx",
      });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  }
  localSecret = readFileSync(file, "utf8");
}
export const secret = process.env.BETTER_AUTH_SECRET || localSecret;
export const publicOrigin =
  process.env.BETTER_AUTH_URL || "http://localhost:3000";
export const bucket =
  process.env.SUPABASE_STORAGE_BUCKET || "entrelinhas-private";
