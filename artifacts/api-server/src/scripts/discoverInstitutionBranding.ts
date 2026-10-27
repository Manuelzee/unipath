import { pool } from "@workspace/db";
import { runBrandingDiscovery } from "../lib/branding/import";
import { exportBrandingManifest } from "../lib/branding/manifest";
const args = process.argv.slice(2);
const option = (name: string) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
async function main() {
  console.log(await runBrandingDiscovery({ limit: Number(option("--limit") ?? 3), id: option("--id"), recheck: args.includes("--recheck") }));
  console.log({ packaged: await exportBrandingManifest() });
}
main().catch(() => { console.error("Branding discovery failed. Check database/schema and safe source diagnostics."); process.exitCode = 1; }).finally(() => pool.end());
