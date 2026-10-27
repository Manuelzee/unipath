import { and, eq } from "drizzle-orm";
import { db, institutionDirectoryTable, matchingEvidenceTable } from "@workspace/db";

// A small, explicitly verified pilot. Never treat an official homepage as proof of a
// particular deadline, fee, intake, program or scholarship award.
const identity = { id: "nces-100751", website: "https://www.ua.edu/" };
const checked = new Date("2026-10-27T16:32:30.240Z");
const fresh = "2026-10-27";
const admissions = "https://admissions.ua.edu/freshman/";
const tuition = "https://afford.ua.edu/cost";
const scholarships = "https://afford.ua.edu/scholarships";

export async function importVerifiedMatchingEvidence() {
  const [school] = await db.select({ id: institutionDirectoryTable.id })
    .from(institutionDirectoryTable)
    .where(and(eq(institutionDirectoryTable.id, identity.id), eq(institutionDirectoryTable.website, identity.website),
      eq(institutionDirectoryTable.ipedsId, 100751), eq(institutionDirectoryTable.isActive, true))).limit(1);
  if (!school) return { inserted: 0, skipped: "Exact official institution identity not found" };
  const base = { institutionId: school.id, verifiedAt: checked };
  const rows = [
    { ...base, id: "nces-100751-admissions-freshman-spring-2027", kind: "intake", degreeLevel: "Undergraduate",
      admissionTrack: "first_year", startTerm: "spring", startYear: 2027, deadline: "2026-11-02", deadlineType: "priority", sourceDate: fresh, sourceUrl: admissions },
    { ...base, id: "nces-100751-admissions-freshman-summer-2027", kind: "intake", degreeLevel: "Undergraduate",
      admissionTrack: "first_year", startTerm: "summer", startYear: 2027, deadline: "2026-12-04", deadlineType: "priority", sourceDate: fresh, sourceUrl: admissions },
    { ...base, id: "nces-100751-admissions-freshman-fall-2027", kind: "intake", degreeLevel: "Undergraduate",
      admissionTrack: "first_year", startTerm: "fall", startYear: 2027, deadline: "2026-12-04", deadlineType: "priority", sourceDate: fresh, sourceUrl: admissions },
    { ...base, id: "nces-100751-undergrad-domestic-instate-2026", kind: "tuition", degreeLevel: "Undergraduate",
      applicantStatus: "domestic", residenceRegion: "Alabama", amount: 12718, currency: "USD",
      budgetScope: "tuition_and_fees", reportingYear: 2026, sourceDate: "2026-07-01", sourceUrl: tuition },
    { ...base, id: "nces-100751-undergrad-domestic-outstate-2026", kind: "tuition", degreeLevel: "Undergraduate",
      applicantStatus: "domestic", residenceRegion: "out_of_state", amount: 36724, currency: "USD",
      budgetScope: "tuition_and_fees", reportingYear: 2026, sourceDate: "2026-07-01", sourceUrl: tuition },
    { ...base, id: "nces-100751-freshman-scholarships-2026", kind: "funding", degreeLevel: "Undergraduate",
      admissionTrack: "first_year", supported: true, sourceDate: fresh, sourceUrl: scholarships },
  ];
  const inserted = await db.insert(matchingEvidenceTable).values(rows)
    .onConflictDoNothing().returning({ id: matchingEvidenceTable.id });
  return { inserted: inserted.length, packaged: rows.length };
}
