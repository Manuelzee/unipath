import app from "./app";
import { logger } from "./lib/logger";
import { ensureInstitutionDirectory } from "./lib/bootstrapDirectory";
import { publicRequestFailure } from "./lib/requestErrors";
import { applyLogoManifest } from "./lib/logos/manifest";
import { startAutomaticLogoDiscovery } from "./lib/logos/automatic";
import { applyBrandingManifest } from "./lib/branding/manifest";
import { startAutomaticBrandingDiscovery } from "./lib/branding/automatic";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start() {
  const directory = await ensureInstitutionDirectory();
  logger.info(await applyLogoManifest(), "Verified logo manifest applied; existing verified logos preserved");
  logger.info(await applyBrandingManifest(), "Verified branding manifest applied; existing verified fields preserved");
  logger.info(directory, directory.imported || directory.factsImported ? "Imported and verified missing source records; existing records preserved" : "Institution and program snapshot already present; no data written");
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    startAutomaticLogoDiscovery();
    startAutomaticBrandingDiscovery();
  });
}

start().catch((err: unknown) => {
  logger.fatal({ code: publicRequestFailure(err).code }, "Cannot initialize institution directory. Check database connection, source identity conflicts and publish-time schema migration; no sample data will be substituted.");
  process.exit(1);
});
