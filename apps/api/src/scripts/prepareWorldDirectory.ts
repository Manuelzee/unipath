/**
 * Rebuilds the bundled worldwide directory from a Research Organization
 * Registry (ROR) data dump (CC0 1.0, https://ror.org/; dumps are published at
 * https://zenodo.org/communities/ror-data).
 *
 *   pnpm --filter @workspace/api-server exec tsx src/scripts/prepareWorldDirectory.ts \
 *     <path to vX.Y-YYYY-MM-DD-ror-data.json> <release, e.g. v2.16> <release date> <Zenodo DOI>
 *
 * Writes apps/api/data/world/ror-education.json.gz and the manifest
 * apps/api/src/data/world-directory-manifest.json (checksum, counts). The API
 * adds missing entries at start-up (lib/worldDirectory.ts). Selection rules:
 * lib/world/rules.ts.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { comparableName, worldRecord, type RorRecord, type WorldRecord } from "../lib/world/rules";
import { directorySnapshot } from "../lib/directorySnapshot";
import { repoPath } from "../lib/paths";

const [dumpPath, release, releaseDate, doi] = process.argv.slice(2);
if (!dumpPath || !/^v\d+\.\d+$/.test(release ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate ?? "") || !/^10\.5281\/zenodo\.\d+$/.test(doi ?? "")) {
  throw new Error("Usage: prepareWorldDirectory.ts <ror-data.json> <release v2.16> <YYYY-MM-DD> <10.5281/zenodo.N>");
}

const dump = JSON.parse(readFileSync(dumpPath, "utf8")) as RorRecord[];
// Names already in the Canada pilot, so the same school is not listed twice.
const skipNames = new Map<string, Set<string>>([["CA", new Set(
  directorySnapshot.institutions.filter(row => row.countryCode === "CA").map(row => comparableName(row.name)))]]);

const records: WorldRecord[] = [];
const countries: Record<string, string> = {};
for (const record of dump) {
  const row = worldRecord(record, skipNames);
  if (!row) continue;
  records.push(row);
  countries[row.cc] ??= record.locations[0].geonames_details.country_name;
}
records.sort((a, b) => a.cc.localeCompare(b.cc) || a.n.localeCompare(b.n) || a.r.localeCompare(b.r));

const body = Buffer.from(JSON.stringify({ format: "unipath-world-directory-v1", release, releaseDate, countries, records }));
const gz = gzipSync(body, { level: 9 });
const file = repoPath("apps", "api", "data", "world", "ror-education.json.gz");
mkdirSync(path.dirname(file), { recursive: true });
writeFileSync(file, gz);

const perCountry: Record<string, number> = {};
for (const row of records) perCountry[row.cc] = (perCountry[row.cc] ?? 0) + 1;
const manifest = {
  format: "unipath-world-directory-manifest-v1",
  file: "apps/api/data/world/ror-education.json.gz",
  sha256: createHash("sha256").update(gz).digest("hex"),
  count: records.length,
  countryCount: Object.keys(perCountry).length,
  source: "Research Organization Registry (ROR)",
  sourceUrl: "https://ror.org/",
  dumpUrl: `https://doi.org/${doi}`,
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  release, releaseDate,
  rules: "Active education organizations; excludes Africa, the United States and its territories (NCES IPEDS covers those), schools already in the Canada pilot, and research units.",
};
writeFileSync(repoPath("apps", "api", "src", "data", "world-directory-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ ...manifest, bytes: gz.length, top: Object.entries(perCountry).sort((a, b) => b[1] - a[1]).slice(0, 12) }, null, 2));
