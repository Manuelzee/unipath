import { pool } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";
import { ensureInstitutionDirectory } from "./lib/bootstrapDirectory";
import { publicRequestFailure } from "./lib/requestErrors";
import { applyLogoManifest } from "./lib/logos/manifest";
import { applyBrandingManifest } from "./lib/branding/manifest";
import { importVerifiedMatchingEvidence } from "./lib/matching/seed";
import { scheduleKeepAwake } from "./lib/keepAwake";

const rawPort = process.env["PORT"] || "8080";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * Idempotent data upkeep (directory snapshot, verified logos and branding,
 * matching evidence). It runs after the server is already answering: on a
 * small hosting plan it takes a while, and visitors should not wait for it.
 */
async function maintain() {
  const directory = await ensureInstitutionDirectory();
  logger.info(await applyLogoManifest(), "Verified logo manifest applied; existing verified logos preserved");
  logger.info(await applyBrandingManifest(), "Verified branding manifest applied; existing verified fields preserved");
  logger.info(await importVerifiedMatchingEvidence(), "Official matching evidence imported without overwriting existing sources");
  logger.info(directory, directory.imported || directory.factsImported ? "Imported and verified missing source records; existing records preserved" : "Institution and program snapshot already present; no data written");
}

function start() {
  const server = app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    logger.info("Discovery auto-apply paused: new verification checks are available in the admin review queue; existing logos and branding are preserved.");
    void maintain().catch((error: unknown) => {
      logger.error({ code: publicRequestFailure(error).code }, "Institution data upkeep failed; the server keeps running. Check the database connection, source identity conflicts and that the schema is applied (pnpm run db:push); no sample data will be substituted.");
    });
    void scheduleKeepAwake();
  });

  // Graceful shutdown: stop accepting connections, let in-flight requests
  // finish, then close the database pool. Forced exit after 10 seconds.
  let stopping = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "Shutting down");
    setTimeout(() => { logger.warn("Forced exit after shutdown timeout"); process.exit(1); }, 10_000).unref();
    server.close(() => {
      pool.end().catch(() => undefined).finally(() => process.exit(0));
    });
    server.closeIdleConnections();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

start();
