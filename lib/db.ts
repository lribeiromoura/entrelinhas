import { Pool, types, type PoolClient } from "pg";
types.setTypeParser(20, Number);
import type Database from "better-sqlite3";
import { cloud, databaseURL } from "./settings";
import { postgresParameters } from "./sql-parameters";
// Separate the native local driver from cloud mode; cloud never writes to disk.
const sqlite: Database.Database | null = cloud
  ? null
  : require("./sqlite").sqlite;
const connectionURL = cloud ? new URL(databaseURL!) : null;
for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
  connectionURL?.searchParams.delete(key);
export const pgPool = cloud
  ? new Pool({
      connectionString: connectionURL!.toString(),
      ssl: {
        rejectUnauthorized: true,
        ...(process.env.DATABASE_CA_CERT
          ? { ca: process.env.DATABASE_CA_CERT.replace(/\\n/g, "\n") }
          : {}),
      },
      max: 3,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 10000,
    })
  : null;
export const authDatabase = pgPool || sqlite!;
let tail: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const result = tail.then(fn, fn);
  tail = result.catch(() => {});
  return result;
}
export interface DataStore {
  all<T = Record<string, unknown>>(
    sql: string,
    ...args: unknown[]
  ): Promise<T[]>;
  get<T = Record<string, unknown>>(
    sql: string,
    ...args: unknown[]
  ): Promise<T | undefined>;
  run(sql: string, ...args: unknown[]): Promise<void>;
  transaction<T>(fn: (tx: DataStore) => Promise<T>): Promise<T>;
}
function store(client?: PoolClient, inside = false): DataStore {
  const pg = client || pgPool;
  async function execute(sql: string, args: unknown[], rows: boolean) {
    if (pg) {
      const result = await pg.query(postgresParameters(sql), args);
      return result.rows;
    }
    const action = async () => {
      const statement = sqlite!.prepare(sql);
      return rows ? statement.all(...args) : statement.run(...args);
    };
    return inside ? action() : locked(action);
  }
  return {
    async all<T>(sql: string, ...args: unknown[]) {
      return (await execute(sql, args, true)) as T[];
    },
    async get<T>(sql: string, ...args: unknown[]) {
      return ((await execute(sql, args, true)) as T[])[0];
    },
    async run(sql: string, ...args: unknown[]) {
      await execute(sql, args, false);
    },
    async transaction<T>(fn: (tx: DataStore) => Promise<T>) {
      if (inside) throw Error("Transação aninhada não suportada.");
      if (pgPool) {
        const connection = await pgPool.connect();
        try {
          await connection.query("BEGIN");
          const result = await fn(store(connection, true));
          await connection.query("COMMIT");
          return result;
        } catch (e) {
          await connection.query("ROLLBACK");
          throw e;
        } finally {
          connection.release();
        }
      }
      return locked(async () => {
        sqlite!.exec("BEGIN IMMEDIATE");
        try {
          const result = await fn(store(undefined, true));
          sqlite!.exec("COMMIT");
          return result;
        } catch (e) {
          sqlite!.exec("ROLLBACK");
          throw e;
        }
      });
    },
  };
}
export const db = store();
export async function closeDatabase() {
  await pgPool?.end();
  sqlite?.close();
}
