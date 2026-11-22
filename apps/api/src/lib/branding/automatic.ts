import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { runBrandingDiscovery } from "./import";
import { logger } from "../logger";
let running = false;
export function startAutomaticBrandingDiscovery() {
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await db.transaction(async tx => {
        const lock = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(740619130) AS acquired`);
        if (!lock.rows[0]?.acquired) return;
        logger.info(await runBrandingDiscovery({ limit: 1 }), "Automatic institution branding check completed");
      });
    } catch { logger.warn("Automatic institution branding check failed; verified branding retained."); }
    finally { running = false; }
  };
  setTimeout(() => void tick(), 90_000).unref();
  setInterval(() => void tick(), 10 * 60_000).unref();
}
