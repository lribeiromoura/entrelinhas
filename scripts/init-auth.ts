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

let stage = "validar configuração";
async function main() {
  const { auth } = await import("../lib/auth");
  const { pgPool, closeDatabase } = await import("../lib/db");
  const { prepareStorage } = await import("../lib/storage");
  stage = "conectar ao PostgreSQL";
  const connection = pgPool ? await pgPool.connect() : null;
  try {
    stage = "obter bloqueio de migração";
    if (connection)
      await connection.query(
        "SELECT pg_advisory_lock(hashtext('entrelinhas-schema'))",
      );
    stage = "preparar tabelas de autenticação";
    const { runMigrations } = await getMigrations(auth.options);
    await runMigrations();
    if (connection) {
      stage = "preparar tabelas da biblioteca";
      await connection.query(readFileSync("supabase/app-schema.sql", "utf8"));
      // No client-side PostgREST access to application or Better Auth tables.
      stage = "aplicar permissões privadas";
      await restrictSchema(connection);
      stage = "preparar armazenamento privado";
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
main().catch((error: unknown) => {
  // Never print raw errors: PostgreSQL and HTTP errors may contain credentials.
  const details = error as { code?: string; message?: string };
  const hints: Record<string, string> = {
    SELF_SIGNED_CERT_IN_CHAIN: "Configure DATABASE_CA_CERT com o certificado CA do Supabase.",
    DEPTH_ZERO_SELF_SIGNED_CERT: "Configure DATABASE_CA_CERT com o certificado CA do Supabase.",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "Configure DATABASE_CA_CERT com o certificado CA do Supabase.",
    ENOTFOUND: "Confira o endereço do banco nas variáveis de conexão.",
    ENETUNREACH: "Use a conexão Session pooler do Supabase compatível com IPv4.",
    ECONNREFUSED: "Confira host, porta e disponibilidade do projeto Supabase.",
    ETIMEDOUT: "Confira a disponibilidade e as restrições de rede do banco.",
    "28P01": "Confira a senha nas variáveis de conexão do PostgreSQL.",
    "42501": "A conexão do banco não tem permissão para preparar as tabelas.",
  };
  console.error(`Etapa que falhou: ${stage}.`);
  if (details?.code && hints[details.code])
    console.error(`${details.code}: ${hints[details.code]}`);
  if (stage === "validar configuração") {
    for (const name of ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "SUPABASE_URL"])
      if (!process.env[name]) console.error(`Variável ausente: ${name}.`);
    if (process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_SECRET.length < 32)
      console.error("BETTER_AUTH_SECRET precisa ter pelo menos 32 caracteres.");
  }
  console.error(
    "Não foi possível preparar o banco. Confira a conexão, as permissões e as variáveis privadas do servidor.",
  );
  process.exit(1);
});
