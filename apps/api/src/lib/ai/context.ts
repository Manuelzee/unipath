import { and, eq, inArray } from "drizzle-orm";
import { db, institutionFactsTable, studentProfilesTable } from "@workspace/db";
import { findUniversities } from "../universities";
import { profileFacts, universityFacts, type GroundingFact } from "./grounding";

/**
 * Retrieve only what this request needs: the student's own profile (when they
 * allow it) and the specific universities they selected.
 */
export async function loadGrounding(userId: string, options: { useProfile: boolean; universityIds: string[] }) {
  const facts: GroundingFact[] = [];
  if (options.useProfile) {
    const [profile] = await db.select().from(studentProfilesTable).where(eq(studentProfilesTable.userId, userId)).limit(1);
    if (profile) facts.push(...profileFacts(profile));
  }
  const ids = [...new Set(options.universityIds)].slice(0, 3);
  const universities = await findUniversities(ids);
  const records = ids.length
    ? await db.select().from(institutionFactsTable)
      .where(and(inArray(institutionFactsTable.institutionId, ids), inArray(institutionFactsTable.kind, ["admissions", "funding"])))
    : [];
  const found: Array<{ id: string; name: string }> = [];
  for (const id of ids) {
    const university = universities.get(id);
    if (!university) continue;
    found.push({ id, name: university.name });
    const own = records.filter(r => r.institutionId === id)
      // Prefer independently verified records, then the most recent source.
      .sort((a, b) => Number(!!b.lastVerifiedAt) - Number(!!a.lastVerifiedAt) || (b.sourceDate ?? "").localeCompare(a.sourceDate ?? ""));
    facts.push(...universityFacts(university, own));
  }
  return { facts, universities: found, missingUniversityIds: ids.filter(id => !universities.has(id)) };
}
