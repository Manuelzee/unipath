import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod/v4";
import { db, institutionDirectoryTable as schools, institutionTuitionTable as tuition } from "@workspace/db";
import { eq } from "drizzle-orm";

export const BC_LICENSE = "https://www2.gov.bc.ca/gov/content/data/policy-standards/data-policies/open-data/open-government-licence-bc";
const BC_BASE = "https://catalogue.data.gov.bc.ca/dataset/";
const BC_SOURCES = {
  "bc-international-2025": {
    category: "international", dataset: "6e317257-54fe-44d1-89a6-1fcd81f5a484",
    resource: "f991757f-26f3-459a-96c4-66b3dc3f5d10",
    file: "tui2_international_tuition_fees_at_public_post_secondary_institutions_by_economic_development_re.csv",
  },
  "bc-domestic-2025": {
    category: "domestic", dataset: "670516e0-6cb0-4d3b-ab2b-b82ed9ee59db",
    resource: "8a4c39f0-0986-43eb-bc61-63e3fa4d9472",
    file: "tui1_tuition_fees_at_public_post_secondary_institutions_by_economic_development_region.csv",
  },
} as const;

export function tuitionSource(provider: string) {
  if (Object.hasOwn(BC_SOURCES, provider)) {
    const s = BC_SOURCES[provider as keyof typeof BC_SOURCES];
    return {
      countryCode: "CA", currency: "CAD", year: 2025, academicYear: "2025/26", period: "year",
      scope: "Full-time undergraduate arts programs only; annual published tuition, not all programs or a personalized quote. Institution-level data are not applied to campus-only directory records.",
      sourceName: "Government of British Columbia, Research and Analysis",
      sourceUrl: `${BC_BASE}${s.dataset}`, sourceFileUrl: `${BC_BASE}${s.dataset}/resource/${s.resource}/download/${s.file}`,
      sourceLicenseUrl: BC_LICENSE,
      attribution: "Contains information licensed under the Open Government Licence – British Columbia. No government endorsement.",
      sourcePublishedAt: "2025-09", categories: [s.category],
    };
  }
  const isIpeds = provider === "ipeds-2023";
  const match = /^scorecard-(20\d{2})$/.exec(provider);
  if (!isIpeds && !match) throw new Error("Official source is not in the reviewed tuition source registry.");
  const year = isIpeds ? 2023 : Number(match![1]);
  if (year < 2000 || year > new Date().getUTCFullYear()) throw new Error("Official reporting year is invalid.");
  return {
    countryCode: "US", currency: "USD", year, academicYear: `${year}/${String(year + 1).slice(-2)}`, period: "year",
    scope: isIpeds
      ? "Full-time undergraduate average tuition for the full academic year. Tuition only; required fees and living costs excluded. Source-reported (R), not imputed."
      : "Annual undergraduate tuition and required fees, institution-level; not international fees or a program quote.",
    sourceName: isIpeds ? "NCES IPEDS, Institutional Characteristics" : "U.S. Department of Education, College Scorecard",
    sourceUrl: isIpeds ? "https://nces.ed.gov/ipeds/use-the-data/download-access-database" : "https://collegescorecard.ed.gov/data/",
    sourceFileUrl: isIpeds ? "https://nces.ed.gov/ipeds/datacenter/data/IC2023_AY.zip" : "https://collegescorecard.ed.gov/data/",
    sourceLicenseUrl: "https://www.ed.gov/about/ed-overview/required-notices/website-policies/copyright-status-notice",
    attribution: "Source: U.S. Department of Education. Public federal data; no endorsement.",
    sourcePublishedAt: null, categories: ["in_state", "out_of_state"],
  };
}

const manifestSchema = z.object({
  provider: z.string(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  rows: z.array(z.object({
    ipedsId: z.number().int().positive().optional(), name: z.string().trim().min(1).optional(),
    category: z.enum(["in_state", "out_of_state", "domestic", "international"]),
    amount: z.number().finite().min(0).lt(1_000_000),
  }).strict()).min(1).max(25000),
}).strict();
export function parseTuitionManifest(value: unknown) {
  const manifest = manifestSchema.parse(value);
  const source = tuitionSource(manifest.provider);
  const seen = new Set<string>();
  for (const row of manifest.rows) {
    if (!source.categories.some(c => c === row.category) ||
      (source.countryCode === "US" ? !row.ipedsId || row.name !== undefined : !row.name || row.ipedsId !== undefined))
      throw new Error("Official tuition row has the wrong identity or category for its source.");
    const key = `${row.ipedsId ?? row.name}:${row.category}`;
    if (seen.has(key)) throw new Error("Official tuition dataset contains duplicate evidence.");
    seen.add(key);
  }
  return { manifest, source };
}

/** Matches exact source identity only. No fuzzy matching or campus propagation. */
export async function applyTuitionManifest(value: unknown, database: Pick<typeof db, "select" | "insert">) {
  const { manifest, source } = parseTuitionManifest(value);
  const institutions = await database.select().from(schools).where(eq(schools.countryCode, source.countryCode));
  let inserted = 0, unmatched = 0, preserved = 0;
  const unmatchedNames = new Set<string>();
  const identities = new Map<string | number, typeof institutions>();
  for (const school of institutions) {
    const key = source.countryCode === "US" ? school.ipedsId : school.name;
    if (key === null) continue;
    identities.set(key, [...(identities.get(key) ?? []), school]);
  }
  const pending: (typeof tuition.$inferInsert)[] = [];
  for (const row of manifest.rows) {
    const matches = identities.get((source.countryCode === "US" ? row.ipedsId : row.name)!) ?? [];
    if (matches.length !== 1) {
      unmatched++;
      if (row.name) unmatchedNames.add(row.name);
      continue;
    }
    const school = matches[0];
    // Preserve legacy pairs too, including incomplete pairs that need owner review.
    if ((row.category === "in_state" && (school.tuitionInStateUsd !== null || school.tuitionInStateYear !== null)) ||
      (row.category === "out_of_state" && (school.tuitionOutOfStateUsd !== null || school.tuitionOutOfStateYear !== null))) {
      preserved++;
      continue;
    }
    const { countryCode: _country, categories: _categories, ...evidence } = source;
    pending.push({
      ...evidence, id: createHash("sha256").update(`${school.id}:${row.category}`).digest("hex"),
      institutionId: school.id, category: row.category, amount: row.amount, sourceHash: manifest.sourceHash,
    });
  }
  // Bounded batches keep task-merge setup fast without one query per quote.
  for (let start = 0; start < pending.length; start += 250) {
    const batch = pending.slice(start, start + 250);
    const result = await database.insert(tuition).values(batch).onConflictDoNothing().returning({ id: tuition.id });
    inserted += result.length;
    preserved += batch.length - result.length;
  }
  return { provider: manifest.provider, sourceQuotes: manifest.rows.length, insertedQuotes: inserted,
    preservedQuotes: preserved, unmatchedQuotes: unmatched, unmatchedNames: [...unmatchedNames],
    note: "Only tuition evidence inserted. Existing quotes, directory identity, branding and reviewed evidence were not modified." };
}

export async function importTuitionFile(path: string) {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  // Validate the entire file before opening the transaction.
  parseTuitionManifest(value);
  return db.transaction(tx => applyTuitionManifest(value, tx));
}
