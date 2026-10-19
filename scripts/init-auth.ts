import { getMigrations } from "better-auth/db/migration";
import { loadEnvConfig } from "@next/env";
import { readFileSync } from "node:fs";
import { restrictSchema } from "../lib/restrict-schema";
loadEnvConfig(process.cwd());
// Schema changes require a session connection: transaction poolers do not retain session locks.
if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
  const migrationURL = new URL(
    process.env.DATABASE_MIGRATION_URL ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL!,
  );
  if (
    migrationURL.hostname.endsWith(".pooler.supabase.com") &&
    migrationURL.port === "6543"
  )
    migrationURL.port = "5432";
  process.env.DATABASE_URL = migrationURL.toString();
}

async function main() {
  const { auth } = await import("../lib/auth");
  const { pgPool, closeDatabase } = await import("../lib/db");
  const { prepareStorage } = await import("../lib/storage");
  const connection = pgPool ? await pgPool.connect() : null;
  try {
    if (connection)
      await connection.query(
        "SELECT pg_advisory_lock(hashtext('entrelinhas-schema'))",
      );
    const { runMigrations } = await getMigrations(auth.options);
    await runMigrations();
    if (connection) {
      await connection.query(readFileSync("supabase/app-schema.sql", "utf8"));
      // No client-side PostgREST access to application or Better Auth tables.
      await restrictSchema(connection);
      await prepareStorage();
    }
    console.log("Banco e armazenamento preparados.");
  } finally {
    if (connection) {
      await connection.query(
        "SELECT pg_advisory_unlock(hashtext('entrelinhas-schema'))",
      );
      connection.release();
    }
    await closeDatabase();
  }
}
main().catch(() => {
  console.error(
    "Não foi possível preparar o banco. Confira a conexão, as permissões e as variáveis privadas do servidor.",
  );
  process.exit(1);
});
