import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createPgDb, createPoolFromEnv } from "./db";

const pool = createPoolFromEnv();
const app = createApp(createPgDb(pool));
const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, () => {
  console.info(`Move Together API listening on :${port}`);
});
