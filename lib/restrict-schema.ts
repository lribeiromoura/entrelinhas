export const privateTables = [
  "books",
  "summary_versions",
  "storage_deletions",
  "backup_imports",
  "backup_import_photos",
  "ideas",
  "connections",
  "questions",
  "photos",
  "user",
  "session",
  "account",
  "verification",
];
export async function restrictSchema(connection: {
  query: (sql: string) => Promise<unknown>;
}) {
  for (const table of privateTables) {
    await connection.query(
      `ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY`,
    );
    await connection.query(
      `REVOKE ALL ON TABLE public."${table}" FROM PUBLIC, anon, authenticated`,
    );
  }
}
