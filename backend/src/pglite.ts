import { PGlite } from "@electric-sql/pglite";
import type { Db, QueryResult, Sql } from "./db";

type PgliteQueryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }>;
  exec?: (text: string) => Promise<unknown>;
};

function toResult<T>(result: { rows: T[]; affectedRows?: number }): QueryResult<T> {
  return {
    rows: result.rows,
    rowCount: result.affectedRows ?? result.rows.length,
  };
}

export async function createPgliteDatabase(): Promise<{ client: PGlite; db: Db }> {
  const client = new PGlite();
  const db = wrap(client);
  return { client, db };
}

function wrap(client: PgliteQueryable & { transaction?: PGlite["transaction"]; exec: PGlite["exec"] }): Db {
  const sqlFor = (queryable: PgliteQueryable): Sql => ({
    async query<T>(text: string, params: unknown[] = []) {
      const result = await queryable.query(text, params);
      return toResult(result as { rows: T[]; affectedRows?: number });
    },
  });

  return {
    ...sqlFor(client),
    async exec(text: string) {
      await client.exec(text);
    },
    async transaction<T>(fn: (sql: Sql) => Promise<T>) {
      if (!client.transaction) {
        throw new Error("PGlite transaction is unavailable");
      }
      return client.transaction(async (tx) => fn(sqlFor(tx as PgliteQueryable)));
    },
  };
}
