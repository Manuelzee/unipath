import { readFile } from "node:fs/promises";
import { and, eq, getTableColumns, inArray, notInArray, sql } from "drizzle-orm";
import { db, pool, institutionDirectoryTable as schools, institutionFactsTable as facts } from "@workspace/db";
import { ListUniversityFactsResponse } from "@workspace/api-zod";

const SOURCE_URL = "https://open.canada.ca/data/en/dataset/ab36a4ab-9b69-49b1-8be6-6faa3f0d0c67";
const LICENSE_URL = "https://open.canada.ca/en/open-government-licence-canada";
type SchoolInput = {
  id: string; sourceKey: string; name: string; countryCode: string; country: string;
  city: string; state: string; institutionType: string;
  degreeLevels: string[]; degreeTypes: string[]; majors: string[];
};
type Input = {
  format: string; sourceId: string; sourceUrl: string; sourceLicenseUrl: string;
  sourceDate: string; sourceRowCount: number; institutions: SchoolInput[]; facts: unknown[];
};

async function main() {
  const path = process.argv[2];
  if (!path || path.startsWith("--")) throw new Error("Supply a prepared official international directory JSON file.");
  const input = JSON.parse(await readFile(path, "utf8")) as Input;
  // Expand this registry only after reviewing a new country's authority, coverage,
  // reuse permission, stable identity and field meanings. Never assume WHED consent.
  if (input.format !== "unipath-international-v1" || input.sourceId !== "ca-psc" ||
      input.sourceUrl !== SOURCE_URL || input.sourceLicenseUrl !== LICENSE_URL) {
    throw new Error("Unapproved source. WHED, CICIC and EduCanada bulk imports need separate permission review.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.sourceDate) || !input.institutions?.length || !input.facts?.length) {
    throw new Error("Missing source date or empty source records. Nothing imported.");
  }
  const importedAt = new Date();
  const ids = new Set<string>();
  const sourceKeys = new Set<string>();
  const institutionRows = input.institutions.map((row) => {
    if (row.countryCode !== "CA" || row.country !== "Canada" ||
        !/^ca-psc-[a-f0-9]{24}$/.test(row.id) || !row.sourceKey?.startsWith("psc:") ||
        !row.name?.trim() || ids.has(row.id) || sourceKeys.has(row.sourceKey)) {
      throw new Error("Invalid or duplicate country-qualified institution identity.");
    }
    for (const values of [row.degreeLevels, row.degreeTypes, row.majors]) {
      if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) {
        throw new Error("Invalid source-reported institution fields.");
      }
    }
    ids.add(row.id); sourceKeys.add(row.sourceKey);
    return {
      id: row.id, sourceKey: row.sourceKey, name: row.name,
      countryCode: "CA", country: "Canada", city: "", state: "",
      institutionType: "Postsecondary institution / campus (PSC listing)",
      degreeLevels: row.degreeLevels, degreeTypes: row.degreeTypes, majors: row.majors,
      sourceScope: "PSC co-op/internship source-listed institution/campus. Partial Canada coverage; not general recognition, accreditation or confirmation of current program availability.",
      sourceLicenseUrl: LICENSE_URL,
      recognitionStatus: "PSC co-op/internship listing only. Recognition and DLI status not independently verified.",
      dataSource: "Public Service Commission of Canada (Open Government)",
      dataYear: `PSC source snapshot ${input.sourceDate}`,
      sourceUrl: SOURCE_URL,
      dliSourceUrl: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/prepare/designated-learning-institutions-list.html",
      isActive: true, lastUpdatedAt: importedAt,
    };
  });
  const factIds = new Set<string>();
  const factRows = input.facts.map((raw) => {
    const fact = ListUniversityFactsResponse.shape.items.element.parse({
      applicantGroup: null, admissionScope: null, fundingCategory: null, awardAmount: null,
      eligibleCitizenships: [], eligibleResidenceCountries: [], eligibleResidenceRegions: [],
      eligibleDegreeLevels: [], eligibleMajors: [], majorRequirement: null, eligibleCriteria: [],
      minimumGpa: null, minimumGpaScale: null,
      ...(raw as object), importedAt: importedAt.toISOString(),
    });
    if (!ids.has(fact.institutionId) || fact.kind !== "program" ||
        !/^ca-psc-program-[a-f0-9]{24}$/.test(fact.id) || factIds.has(fact.id) ||
        fact.sourceUrl !== SOURCE_URL || fact.sourceLicenseUrl !== LICENSE_URL ||
        fact.sourceDate !== input.sourceDate || fact.lastVerifiedAt !== null ||
        fact.officialUrl !== null || fact.language !== null ||
        fact.applicantStatuses.length || fact.requirements.length || fact.eligibility !== null || fact.deadline !== null) {
      throw new Error("Invalid, duplicate or unsupported fact. Do not infer source-missing metadata.");
    }
    factIds.add(fact.id);
    return { ...fact, deadline: null, importedAt, lastVerifiedAt: null };
  });
  if (process.argv.includes("--dry-run")) {
    console.log(`Validated ${institutionRows.length} Canadian institution/campus records and ${factRows.length} programs. Dry run: no database writes.`);
    return;
  }
  const [beforeOther] = await db.select({ count: sql<number>`count(*)::int` }).from(schools).where(sql`${schools.countryCode} <> 'CA'`);
  const [beforeCA] = await db.select({ count: sql<number>`count(*)::int` }).from(schools).where(eq(schools.countryCode, "CA"));
  await db.transaction(async (tx) => {
    const updateFields = Object.fromEntries(
      Object.entries(getTableColumns(schools))
        .filter(([key]) => key in institutionRows[0]! && key !== "id")
        .map(([key, column]) => [key, sql.raw(`excluded."${column.name}"`)]),
    );
    for (let start = 0; start < institutionRows.length; start += 100) {
      await tx.insert(schools).values(institutionRows.slice(start, start + 100))
        .onConflictDoUpdate({ target: schools.id, set: updateFields });
    }
    await tx.update(schools).set({ isActive: false }).where(and(
      eq(schools.countryCode, "CA"), sql`${schools.sourceKey} LIKE 'psc:%'`,
      notInArray(schools.id, [...ids]),
    ));
    await tx.delete(facts).where(eq(facts.sourceUrl, SOURCE_URL));
    for (let start = 0; start < factRows.length; start += 100) {
      await tx.insert(facts).values(factRows.slice(start, start + 100));
    }
    const [written] = await tx.select({ count: sql<number>`count(*)::int` }).from(schools)
      .where(and(eq(schools.isActive, true), inArray(schools.id, [...ids])));
    const [writtenFacts] = await tx.select({ count: sql<number>`count(*)::int` }).from(facts).where(eq(facts.sourceUrl, SOURCE_URL));
    const [afterOther] = await tx.select({ count: sql<number>`count(*)::int` }).from(schools).where(sql`${schools.countryCode} <> 'CA'`);
    if (written?.count !== institutionRows.length || writtenFacts?.count !== factRows.length || beforeOther?.count !== afterOther?.count) {
      throw new Error("Import verification failed. Transaction rolled back; U.S. directory must remain unchanged.");
    }
  });
  console.log(`VERIFIED Canada pilot: ${institutionRows.length} institution/campus records and ${factRows.length} programs. Other-country records preserved: ${beforeOther?.count}. Canada had ${beforeCA?.count} records before this import. Source ${input.sourceDate}; imported ${importedAt.toISOString()}. Canada is NOT fully covered.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "International import failed.");
  process.exitCode = 1;
}).finally(() => pool.end());
