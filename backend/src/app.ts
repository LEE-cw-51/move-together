import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Db } from "./db";
import { ApiError } from "./errors";
import { registerDevRoutes } from "./dev";
import { registerRoutes } from "./http";
import { isProduction } from "./mail";

export function createApp(db: Db): Hono {
  const app = new Hono();
  app.use("*", cors());
  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.status as 400);
    }
    console.error(error);
    return c.json({ error: { code: "internal", message: "잠시 후 다시 시도해 주세요" } }, 500);
  });
  app.notFound((c) => c.json({ error: { code: "not_found", message: "요청을 찾을 수 없어요" } }, 404));
  registerRoutes(app, db);
  if (!isProduction()) registerDevRoutes(app, db);
  return app;
}
