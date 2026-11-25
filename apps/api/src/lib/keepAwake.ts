import { sql } from "drizzle-orm";
import { logger } from "./logger";

const JOB = "unipath-keep-awake";

/**
 * The URL to ping: KEEP_AWAKE_URL, or the health check at RENDER_EXTERNAL_URL
 * (Render sets it for web services). Null when there is nothing to keep awake
 * (local development) or when KEEP_AWAKE=off.
 */
export function keepAwakeUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.KEEP_AWAKE?.trim().toLowerCase() === "off") return null;
  const explicit = env.KEEP_AWAKE_URL?.trim();
  const base = explicit || env.RENDER_EXTERNAL_URL?.trim();
  if (!base) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== "https:") return null;
    return explicit ? url.toString() : new URL("/api/healthz", url.origin).toString();
  } catch { return null; }
}

/**
 * Keeps the API from falling asleep on hosts that stop idle free instances
 * (Render stops them after 15 minutes, and the next visitor then waits up to
 * a minute). The database calls the health check every 5 minutes through
 * Supabase's pg_cron and pg_net extensions, which is far more regular than
 * GitHub's scheduled workflows (2 runs in 28 hours in practice). Runs at
 * start-up, is idempotent, and only logs a warning where the extensions are
 * unavailable (local PGlite or other Postgres hosts).
 */
export async function scheduleKeepAwake(): Promise<void> {
  const url = keepAwakeUrl();
  if (!url) return;
  // Loaded here so keepAwakeUrl can be tested without a database.
  const { db } = await import("@workspace/db");
  try {
    await db.execute(sql`create extension if not exists pg_cron`);
    await db.execute(sql`create extension if not exists pg_net`);
    await db.execute(sql`select cron.unschedule(jobid) from cron.job where jobname = ${JOB}`);
    await db.execute(sql`select cron.schedule(${JOB}, '*/5 * * * *',
      format('select net.http_get(url := %L, timeout_milliseconds := 60000)', ${url}::text))`);
    logger.info({ url }, "Keep-awake ping scheduled in the database every 5 minutes");
  } catch (error) {
    logger.warn({ code: (error as { code?: unknown }).code ?? null },
      "Could not schedule the keep-awake ping (pg_cron or pg_net unavailable); the server may sleep when idle");
  }
}
