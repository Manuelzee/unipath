import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { HealthCheckResponse, ReadinessCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";

const router: IRouter = Router();

/** Liveness: the process is up. Never touches the database. */
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

const READY_TIMEOUT_MS = 3_000;

/** Readiness: the database answers within a few seconds. */
router.get("/readyz", async (req, res) => {
  let ok = false;
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), READY_TIMEOUT_MS); }),
    ]);
    ok = true;
  } catch {
    req.log.warn("Readiness check failed: database unreachable");
  } finally {
    clearTimeout(timer);
  }
  res.setHeader("Cache-Control", "no-store");
  res.status(ok ? 200 : 503).json(ReadinessCheckResponse.parse({
    status: ok ? "ok" : "unavailable",
    database: ok ? "ok" : "unavailable",
    checkedAt: new Date().toISOString(),
  }));
});

export default router;
