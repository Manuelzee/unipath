/**
 * Starter programmes from data/programmes.json: details taken from each
 * university's official programme page on the date in `checkedAt`, never
 * marked as confirmed by the university. Each is inserted once (by its seed
 * key) at start-up; administrators can then edit or archive it, and later
 * starts never overwrite their changes.
 */
import { CreateProgrammeBody } from "@workspace/api-zod";
import data from "../data/programmes.json";
import { programmeProblem } from "./programmes";

export interface ProgrammeSeed { seedKey: string; programme: ReturnType<typeof CreateProgrammeBody.parse> }

/** Throws on a malformed entry, so a bad edit fails the tests and the start-up. */
export function validateSeeds(raw: unknown[]): ProgrammeSeed[] {
  const keys = new Set<string>();
  return raw.map((entry, index) => {
    const { seedKey, ...rest } = entry as { seedKey?: unknown } & Record<string, unknown>;
    if (typeof seedKey !== "string" || !/^[a-z0-9-]{3,80}$/.test(seedKey) || keys.has(seedKey)) throw new Error(`programme seed ${index}: missing or duplicate seedKey`);
    keys.add(seedKey);
    const parsed = CreateProgrammeBody.safeParse({ status: "published", ...rest });
    if (!parsed.success) throw new Error(`programme seed ${seedKey}: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
    const problem = programmeProblem({ ...parsed.data, requiredDocuments: parsed.data.requiredDocuments });
    if (problem) throw new Error(`programme seed ${seedKey}: ${problem}`);
    return { seedKey, programme: parsed.data };
  });
}

export const PROGRAMME_SEEDS = validateSeeds(data.programmes);

/** Inserts seeds that are missing and whose university is in the directory. */
export async function ensureProgrammeSeeds() {
  const [{ db, programmesTable, institutionDirectoryTable }, { inArray, isNotNull }] = await Promise.all([import("@workspace/db"), import("drizzle-orm")]);
  if (!PROGRAMME_SEEDS.length) return { expected: 0, imported: 0, skippedMissingUniversity: 0 };
  const present = new Set((await db.select({ key: programmesTable.seedKey }).from(programmesTable)
    .where(isNotNull(programmesTable.seedKey))).map(r => r.key));
  const missing = PROGRAMME_SEEDS.filter(s => !present.has(s.seedKey));
  if (!missing.length) return { expected: PROGRAMME_SEEDS.length, imported: 0, skippedMissingUniversity: 0 };
  const schools = new Set((await db.select({ id: institutionDirectoryTable.id }).from(institutionDirectoryTable)
    .where(inArray(institutionDirectoryTable.id, missing.map(s => s.programme.institutionId)))).map(r => r.id));
  const ready = missing.filter(s => schools.has(s.programme.institutionId));
  if (ready.length) {
    await db.insert(programmesTable).values(ready.map(({ seedKey, programme: p }) => ({
      ...p, seedKey, degreeName: p.degreeName ?? null, language: p.language ?? null, durationMonths: p.durationMonths ?? null,
      studyMode: p.studyMode ?? null, tuitionAmount: p.tuitionAmount ?? null, tuitionCurrency: p.tuitionCurrency ?? null,
      tuitionPeriod: p.tuitionPeriod ?? null, tuitionNote: p.tuitionNote ?? null, applicationFeeAmount: p.applicationFeeAmount ?? null,
      applicationFeeCurrency: p.applicationFeeCurrency ?? null, deadline: p.deadline ?? null, deadlineNote: p.deadlineNote ?? null,
      academicRequirement: p.academicRequirement ?? null, languageRequirement: p.languageRequirement ?? null,
      otherRequirements: p.otherRequirements ?? null, minimumGpa: p.minimumGpa ?? null, applyUrl: p.applyUrl ?? null,
      requiredDocuments: p.requiredDocuments.map(d => ({ kind: d.kind, need: d.need, note: d.note ?? null })),
    }))).onConflictDoNothing();
  }
  return { expected: PROGRAMME_SEEDS.length, imported: ready.length, skippedMissingUniversity: missing.length - ready.length };
}
