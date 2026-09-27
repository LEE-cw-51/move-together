import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, (value) => value);

export type QueryResult<T> = {
  rows: T[];
  rowCount: number;
};

export type Sql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
};

export type Db = Sql & {
  transaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
  /** Runs a multi-statement SQL script. Defaults to query() when omitted. */
  exec?(sqlText: string): Promise<void>;
};

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. The API cannot use Postgres until you set DATABASE_URL to a Neon (or other Postgres) connection string and apply db/migrations.",
    );
  }
  return url;
}

export function createPoolFromEnv(): pg.Pool {
  return new pg.Pool({
    connectionString: databaseUrl(),
    max: 10,
  });
}

function normalizeQueryResult<T>(result: pg.QueryResult | pg.QueryResult[]): QueryResult<T> {
  const single = Array.isArray(result) ? result[result.length - 1] : result;
  const rows = (single?.rows ?? []) as T[];
  return { rows, rowCount: single?.rowCount ?? rows.length };
}

export function createPgDb(pool: pg.Pool): Db {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const result = await pool.query(text, params);
      return normalizeQueryResult<T>(result);
    },
    async exec(sqlText: string) {
      await pool.query(sqlText);
    },
    async transaction<T>(fn: (sql: Sql) => Promise<T>) {
      const client = await pool.connect();
      const sql: Sql = {
        async query<R>(text: string, params: unknown[] = []) {
          const result = await client.query(text, params);
          return normalizeQueryResult<R>(result);
        },
      };
      try {
        await client.query("BEGIN");
        const value = await fn(sql);
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export function migrationsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../db/migrations");
}

export async function migrate(db: Db): Promise<string[]> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const applied = await db.query<{ filename: string }>("SELECT filename FROM schema_migrations");
  const done = new Set(applied.rows.map((row) => row.filename));
  const files = (await readdir(migrationsDir())).filter((name) => name.endsWith(".sql")).sort();
  const ran: string[] = [];
  for (const filename of files) {
    if (done.has(filename)) continue;
    const sqlText = await readFile(path.join(migrationsDir(), filename), "utf8");
    if (db.exec) {
      await db.exec(sqlText);
      await db.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
    } else {
      await db.transaction(async (sql) => {
        await sql.query(sqlText);
        await sql.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
      });
    }
    ran.push(filename);
  }
  return ran;
}
