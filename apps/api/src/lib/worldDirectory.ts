/**
 * Worldwide universities and colleges (outside Africa and the United States)
 * from the Research Organization Registry (ROR, CC0 1.0). The bundled file is
 * built by scripts/prepareWorldDirectory.ts; this adds the entries that are
 * missing at start-up. Existing rows are never changed or removed.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { like } from "drizzle-orm";
import { db, institutionDirectoryTable } from "@workspace/db";
import manifest from "../data/world-directory-manifest.json";
import { repoPath } from "./paths";
import type { WorldRecord } from "./world/rules";

export const WORLD_SOURCE = {
  name: manifest.source,
  url: manifest.sourceUrl,
  licenseUrl: manifest.licenseUrl,
  release: manifest.release,
  releaseDate: manifest.releaseDate,
  count: manifest.count,
  countryCount: manifest.countryCount,
};

export const WORLD_SCOPE = "Listed in the Research Organization Registry (ROR) as an active education organization. Name, location and website only: programs, tuition, admissions, language and recognition are not supplied by this source.";
const RECOGNITION = "Not verified. ROR lists research and education organizations; it is not an accreditation or recognition register. Check recognition with the country's education ministry before applying.";

interface WorldFile { format: string; release: string; releaseDate: string; countries: Record<string, string>; records: WorldRecord[] }

export async function readWorldDirectory(): Promise<WorldFile> {
  const bytes = await readFile(repoPath(...manifest.file.split("/")));
  if (createHash("sha256").update(bytes).digest("hex") !== manifest.sha256) {
    throw new Error("Worldwide directory file checksum failed. Nothing was imported.");
  }
  const data = JSON.parse(gunzipSync(bytes, { maxOutputLength: 60 * 1024 * 1024 }).toString("utf8")) as WorldFile;
  if (data.format !== "unipath-world-directory-v1" || data.records.length !== manifest.count || data.release !== manifest.release) {
    throw new Error("Worldwide directory file does not match its manifest. Nothing was imported.");
  }
  return data;
}

export function worldRow(record: WorldRecord, countries: Record<string, string>, importedAt: Date) {
  return {
    id: `ror-${record.r}`, sourceKey: `ror:${record.r}`, name: record.n, alternateNames: record.a,
    city: record.c, state: record.s, countryCode: record.cc, country: countries[record.cc] ?? record.cc,
    institutionType: "University or college", ownership: null, website: record.w,
    sourceScope: WORLD_SCOPE, sourceLicenseUrl: manifest.licenseUrl, recognitionStatus: RECOGNITION,
    dataSource: "Research Organization Registry (ROR)", dataYear: `ROR ${manifest.release} (${manifest.releaseDate})`,
    sourceUrl: `https://ror.org/${record.r}`, isActive: true, lastUpdatedAt: importedAt,
  } satisfies typeof institutionDirectoryTable.$inferInsert;
}

/** Inserts missing worldwide entries in batches; safe to repeat and to interrupt. */
export async function ensureWorldDirectory(connection: Pick<typeof db, "select" | "insert"> = db) {
  const data = await readWorldDirectory();
  const present = new Set((await connection.select({ key: institutionDirectoryTable.sourceKey })
    .from(institutionDirectoryTable).where(like(institutionDirectoryTable.sourceKey, "ror:%"))).map(row => row.key));
  const importedAt = new Date();
  const missing = data.records.filter(record => !present.has(`ror:${record.r}`));
  let imported = 0;
  for (let start = 0; start < missing.length; start += 500) {
    const added = await connection.insert(institutionDirectoryTable)
      .values(missing.slice(start, start + 500).map(record => worldRow(record, data.countries, importedAt)))
      .onConflictDoNothing().returning({ id: institutionDirectoryTable.id });
    imported += added.length;
  }
  return { source: "ROR", release: manifest.release, expected: data.records.length, alreadyPresent: present.size, imported };
}
