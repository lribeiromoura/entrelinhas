import { getMigrations } from "better-auth/db/migration";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const { auth } = await import("../lib/auth");
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  console.log("Autenticação preparada.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
