import { gunzipSync } from "node:zlib";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import catalog from "../../data/logo-identity-catalog.json";
import manifest from "../../data/institution-logo-manifest.json";
import { runLogoDiscovery } from "../../scripts/discoverInstitutionLogos";
import type { CatalogRow } from "./discovery";
import { logger } from "../logger";
import { safeFetch } from "./safeFetch";

let running = false;
export function startAutomaticLogoDiscovery() {
  let rows: CatalogRow[];
  try {
    rows = catalog.gzipBase64
      ? JSON.parse(gunzipSync(Buffer.from(catalog.gzipBase64, "base64"), { maxOutputLength: 5_000_000 }).toString())
      : [];
  } catch {
    logger.warn("Logo identity catalog is invalid; automatic discovery disabled, name placeholders retained.");
    return;
  }
  let refreshDue = Date.parse(catalog.fetchedAt ?? "") + 7 * 86400_000;
  if (!Number.isFinite(refreshDue)) refreshDue = 0;
  async function tick() {
    if (running) return;
    const packagedPause = "sourcePausedUntil" in manifest && typeof manifest.sourcePausedUntil === "string"
      ? Date.parse(manifest.sourcePausedUntil) : 0;
    if (packagedPause > Date.now()) return;
    running = true;
    try {
      // Keep only one background batch active across autoscale instances.
      await db.transaction(async (tx) => {
        const lock = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(740619130) AS acquired`);
        if (!lock.rows[0]?.acquired) return;
        if (Date.now() > refreshDue) {
          // Refresh CC0 identity metadata, not unlicensed image bytes. Fail safely on restrictions.
          refreshDue = Date.now() + 86400_000;
          try {
            const url = new URL("https://query.wikidata.org/sparql");
            url.search = new URLSearchParams({ format: "json", query:
              "SELECT ?item ?ipeds ?logo ?website WHERE { ?item wdt:P1771 ?ipeds; wdt:P154 ?logo. OPTIONAL { ?item wdt:P856 ?website. } }" }).toString();
            const source = await safeFetch(url.href, 2_000_000, new Set(["query.wikidata.org"]));
            if (source.status === 200) {
              const data = JSON.parse(source.body.toString());
              if (Array.isArray(data.results?.bindings)) rows = data.results.bindings;
            }
          } catch { logger.warn("Logo identity metadata refresh unavailable; previous catalog retained."); }
        }
        logger.info(await runLogoDiscovery({ catalog: rows, limit: 5 }), "Automatic logo discovery batch completed");
      });
    } catch {
      logger.warn("Automatic logo discovery paused after a source/storage failure; existing images preserved.");
    } finally { running = false; }
  }
  // Never block app startup. Autoscale may pause checks while the app is idle.
  setTimeout(() => void tick(), 60_000).unref();
  setInterval(() => void tick(), 10 * 60_000).unref();
}
