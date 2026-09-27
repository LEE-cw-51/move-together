import { createPgDb, createPoolFromEnv, migrate } from "./db";

const pool = createPoolFromEnv();
const db = createPgDb(pool);
const applied = await migrate(db);
if (applied.length === 0) {
  console.info("Migrations already applied");
} else {
  console.info(`Applied migrations: ${applied.join(", ")}`);
}
await pool.end();
