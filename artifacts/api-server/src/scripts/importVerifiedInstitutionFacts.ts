import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { and, eq, getTableColumns, inArray, isNotNull, sql } from "drizzle-orm";
import { db, institutionDirectoryTable as schools, institutionFactsTable as facts, pool } from "@workspace/db";
import { ListUniversityFactsResponse } from "@workspace/api-zod";
import type { InstitutionFact } from "@workspace/api-zod";

const FORMAT = "unipath-verified-facts-v1";
const PUBLIC_OFFICIAL_SUFFIXES = [".gov", ".gc.ca", ".canada.ca", ".gov.uk", ".gouv.fr"];
const FACT_KINDS = new Set(["admissions", "funding"]);
const MAX_TEXT = 4000;

type SourcePolicy = {
  sourceId: string;
  sourceName: string;
  termsUrl: string;
  commercialReuseAllowed: boolean;
  policyReviewedAt: string;
  attribution: string;
};
type InputFact = Record<string, unknown> & {
  institutionId: string;
  kind: string;
  title: string;
  sourceUrl: string;
  officialUrl: string;
  lastVerifiedAt: string;
};
type Manifest = {
  format: string;
  sources: Array<SourcePolicy & { facts: InputFact[] }>;
};

function safeHttpsUrl(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`${label} must be an HTTPS URL.`);
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    return url;
  } catch {
    throw new Error(`${label} must be an HTTPS URL without embedded credentials.`);
  }
}

function reviewedOfficialHost(url: URL, website: string | null) {
  if (website) {
    try {
      const officialHost = new URL(website).hostname.toLowerCase();
      if (url.hostname.toLowerCase() === officialHost ||
          url.hostname.toLowerCase().endsWith(`.${officialHost}`)) return true;
    } catch {
      // An invalid imported school URL is not trusted as a domain allowlist.
    }
  }
  const host = url.hostname.toLowerCase();
  return PUBLIC_OFFICIAL_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function stableFactId(fact: InputFact) {
  const key = [fact.institutionId, fact.kind, fact.title.trim().normalize("NFKC").toLowerCase(),
    fact.applicantGroup ?? "", fact.admissionScope ?? "", fact.fundingCategory ?? "",
    JSON.stringify([...(fact.eligibleDegreeLevels as string[])].map((v) => v.toLowerCase()).sort()),
    JSON.stringify([...(fact.eligibleMajors as string[])].map((v) => v.toLowerCase()).sort()),
    fact.sourceUrl].join("|");
  return `verified-fact-${createHash("sha256").update(key).digest("hex").slice(0, 32)}`;
}

function includesAnnualTuitionOrCost(value: unknown) {
  if (typeof value !== "string") return false;
  return /(?:annual\s+(?:tuition|cost)|tuition.{0,60}(?:cost|amount)|cost\s+of\s+attendance).{0,100}(?:\$\s*[\d,]+|(?:USD|CAD|EUR|GBP)\s*[\d,]+)/i.test(value);
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath || filePath.startsWith("--")) throw new Error("Supply the reviewed facts JSON file.");
  const dryRun = process.argv.includes("--dry-run");
  if (!dryRun && !process.argv.includes("--confirm-commercial-reuse-reviewed")) {
    throw new Error("No records imported. Review each source's commercial reuse terms and rerun with --confirm-commercial-reuse-reviewed.");
  }
  const manifest = JSON.parse(await readFile(filePath, "utf8")) as Manifest;
  if (manifest.format !== FORMAT || !Array.isArray(manifest.sources) || !manifest.sources.length) {
    throw new Error("This is not a verified UniPath fact manifest.");
  }

  const reviewDate = new Date().toISOString().slice(0, 10);
  const sourceIds = new Set<string>();
  const policyReviewedFacts: Array<{ row: InstitutionFact; sourceId: string }> = [];
  const identityKeys = new Set<string>();

  for (const source of manifest.sources) {
    if (!/^[a-z0-9-]{2,80}$/.test(source.sourceId) || sourceIds.has(source.sourceId) ||
        !source.sourceName?.trim() || !source.attribution?.trim() ||
        source.commercialReuseAllowed !== true ||
        !/^\d{4}-\d{2}-\d{2}$/.test(source.policyReviewedAt) ||
        source.policyReviewedAt > reviewDate || !Array.isArray(source.facts) || !source.facts.length) {
      throw new Error("Each source needs a unique ID, attribution, reviewed commercial-reuse permission and recent policy-review date.");
    }
    sourceIds.add(source.sourceId);
    const termsUrl = safeHttpsUrl(source.termsUrl, "Source terms");
    const sourceRows = source.facts.map((fact) => {
      if (!FACT_KINDS.has(fact.kind) || !fact.institutionId?.trim() ||
          !fact.title?.trim() || !fact.lastVerifiedAt || !Array.isArray(fact.requirements) ||
          !Array.isArray(fact.applicantStatuses) || !Array.isArray(fact.fieldsOfStudy) ||
          !Array.isArray(fact.eligibleCitizenships) || !Array.isArray(fact.eligibleResidenceCountries) ||
          !Array.isArray(fact.eligibleResidenceRegions) || !Array.isArray(fact.eligibleDegreeLevels) ||
          !Array.isArray(fact.eligibleMajors) || !Array.isArray(fact.eligibleCriteria)) {
        throw new Error("Every admission/funding fact must contain its institution, exact source categories and an independently checked date.");
      }
      if (Object.values(fact).some(includesAnnualTuitionOrCost)) {
        throw new Error(`No fact is imported because annual tuition/cost text is prohibited: ${fact.title}`);
      }
      for (const [name, values] of Object.entries({
        requirements: fact.requirements, fieldsOfStudy: fact.fieldsOfStudy,
        eligibleCitizenships: fact.eligibleCitizenships, eligibleResidenceCountries: fact.eligibleResidenceCountries,
        eligibleResidenceRegions: fact.eligibleResidenceRegions, eligibleDegreeLevels: fact.eligibleDegreeLevels,
        eligibleMajors: fact.eligibleMajors, eligibleCriteria: fact.eligibleCriteria,
      })) {
        if (values.some((value: unknown) => typeof value !== "string" || value.length > MAX_TEXT)) {
          throw new Error(`${name} must contain short, plain-text source-reported values.`);
        }
      }
      const sourceUrl = safeHttpsUrl(fact.sourceUrl, "Fact source");
      const officialUrl = safeHttpsUrl(fact.officialUrl, "Direct official page");
      if (fact.kind === "admissions" &&
          !["school-general", "program-specific"].includes(String(fact.admissionScope))) {
        throw new Error(`${fact.title} must identify school-general or program-specific requirements.`);
      }
      const verification = new Date(fact.lastVerifiedAt);
      const age = Date.now() - verification.getTime();
      if (!Number.isFinite(verification.getTime()) || age < 0 ||
          age > 365 * 24 * 60 * 60 * 1000 ||
          verification.toISOString() !== fact.lastVerifiedAt) {
        throw new Error(`${fact.title} must have a real verification timestamp within the last year.`);
      }
      if (fact.minimumGpa != null &&
          (typeof fact.minimumGpa !== "number" || fact.minimumGpa < 0 ||
            fact.minimumGpa > 4 || fact.minimumGpaScale !== "4.0")) {
        throw new Error(`${fact.title} has an unsupported GPA scale or range. Do not convert grading scales.`);
      }
      if (fact.awardAmount != null && (typeof fact.awardAmount !== "string" || fact.awardAmount.length > 240)) {
        throw new Error(`${fact.title} has an invalid official award amount.`);
      }
      if (fact.deadline != null &&
          (typeof fact.deadline !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fact.deadline))) {
        throw new Error(`${fact.title} has an invalid deadline; provide YYYY-MM-DD or null.`);
      }
      if (fact.sourceDate != null &&
          (typeof fact.sourceDate !== "string" || !/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(fact.sourceDate))) {
        throw new Error(`${fact.title} sourceDate must be a year, month or date, or null.`);
      }
      const identity = stableFactId(fact);
      const id = identity;
      if (identityKeys.has(id)) throw new Error(`Duplicate official source fact: ${fact.title}`);
      identityKeys.add(id);

      const reviewed = {
        id, institutionId: fact.institutionId, kind: fact.kind, title: fact.title.trim(),
        fieldsOfStudy: fact.fieldsOfStudy, degreeLevel: fact.degreeLevel ?? null,
        language: fact.language ?? null, programType: fact.programType ?? null,
        applicantStatuses: fact.applicantStatuses, requirements: fact.requirements,
        eligibility: fact.eligibility ?? null, applicantGroup: fact.applicantGroup ?? null,
        admissionScope: fact.admissionScope ?? null, fundingCategory: fact.fundingCategory ?? null,
        awardAmount: fact.awardAmount ?? null, eligibleCitizenships: fact.eligibleCitizenships,
        eligibleResidenceCountries: fact.eligibleResidenceCountries,
        eligibleResidenceRegions: fact.eligibleResidenceRegions,
        eligibleDegreeLevels: fact.eligibleDegreeLevels, eligibleMajors: fact.eligibleMajors,
        majorRequirement: fact.majorRequirement ?? null, eligibleCriteria: fact.eligibleCriteria,
        minimumGpa: fact.minimumGpa ?? null, minimumGpaScale: fact.minimumGpaScale ?? null,
        deadline: fact.deadline ?? null, officialUrl: officialUrl.href,
        sourceName: source.sourceName, sourceUrl: sourceUrl.href, sourceDate: fact.sourceDate ?? null,
        sourceLicenseUrl: termsUrl.href, lastVerifiedAt: verification,
        importedAt: new Date(),
      };
      const checked = ListUniversityFactsResponse.shape.items.element.parse(reviewed);
      policyReviewedFacts.push({ row: checked, sourceId: source.sourceId });
      return { row: checked, sourceId: source.sourceId, officialUrl, sourceUrl };
    });
    const schoolIds = [...new Set(sourceRows.map(({ row }) => String(row.institutionId)))];
    const schoolRecords = await db.select({
      id: schools.id, website: schools.website, active: schools.isActive,
    }).from(schools).where(inArray(schools.id, schoolIds));
    const schoolsById = new Map(schoolRecords.map((school) => [school.id, school]));
    for (const { row, officialUrl, sourceUrl } of sourceRows) {
      const school = schoolsById.get(String(row.institutionId));
      if (!school?.active || !reviewedOfficialHost(officialUrl, school.website) ||
          !reviewedOfficialHost(sourceUrl, school.website)) {
        throw new Error(`${String(row.title)} is not linked to an active school and its checked official school/government domain.`);
      }
    }
  }

  if (dryRun) {
    console.log(`Validated ${policyReviewedFacts.length} curated admission/funding facts, official-school links, recent verification dates and reuse attestations. No database writes.`);
    return;
  }
  await db.transaction(async (tx) => {
    const rows: Array<typeof facts.$inferInsert> = policyReviewedFacts.map(({ row }) => ({
      ...row,
      deadline: row.deadline?.toISOString().slice(0, 10) ?? null,
    }));
    for (let start = 0; start < rows.length; start += 100) {
      const batch = rows.slice(start, start + 100);
      const updateFields = Object.fromEntries(
        Object.entries(getTableColumns(facts))
          .filter(([key]) => key !== "id")
          .map(([key, column]) => [key, sql.raw(`excluded."${column.name}"`)]),
      );
      await tx.insert(facts).values(batch).onConflictDoUpdate({ target: facts.id, set: updateFields });
    }
    const ids = rows.map((row) => String(row.id));
    const [written] = await tx.select({ count: sql<number>`count(*)::int` }).from(facts).where(and(
      inArray(facts.id, ids), isNotNull(facts.lastVerifiedAt),
    ));
    if (written?.count !== rows.length) {
      throw new Error("Verification count did not match; transaction rolled back.");
    }
  });
  console.log(`Imported and verified ${policyReviewedFacts.length} admissions/funding records after reviewing source reuse policy. Student inputs are never part of this import.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Curated facts import failed.");
  process.exitCode = 1;
}).finally(() => pool.end());
