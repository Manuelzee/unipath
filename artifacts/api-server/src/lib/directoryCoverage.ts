import {
  db,
  institutionDirectoryTable,
  institutionFactsTable,
  institutionDirectoryTable as schools,
  institutionFactsTable as facts,
} from "@workspace/db";
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { GetFundingFinderOptionsResponse, ListUniversityFactsResponse } from "@workspace/api-zod";
import type { FundingStudentProfileInput, FundingPotentialMatch } from "@workspace/api-zod";

export const DIRECTORY_REFERENCES = [
  {
    name: "EduCanada",
    url: "https://www.educanada.ca/programs-programmes/index.aspx?lang=eng",
    termsUrl: "https://www.educanada.ca/notices-avis.aspx?lang=eng",
    access: "Official reference only. Commercial redistribution requires written permission unless separately licensed. No EduCanada directory records have been copied.",
  },
  {
    name: "CICIC recognized/authorized institution directory",
    url: "https://www.cicic.ca/868/search_the_directory_of_educational_institutions_in_canada.canada",
    termsUrl: "https://www.cicic.ca/1679/terms_of_use.canada",
    access: "Official recognition lookup only. Terms prohibit automated extraction and storing significant portions. No bulk import without permission.",
  },
  {
    name: "IRCC designated learning institutions",
    url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/prepare/designated-learning-institutions-list.html",
    termsUrl: "https://www.canada.ca/en/transparency/terms.html",
    access: "Check current DLI status directly. A PSC listing is not evidence of DLI status, study-permit eligibility, or PGWP eligibility.",
  },
  {
    name: "WHED — IAU in collaboration with UNESCO",
    url: "https://www.whed.net/",
    termsUrl: "https://www.whed.net/Terms_of_use.html",
    access: "Prior IAU consent is required to copy all or substantial parts. No WHED records imported. Its criteria do not cover every college or technical school.",
  },
  {
    name: "Public Service Commission open institution/program dataset",
    url: "https://open.canada.ca/data/en/dataset/ab36a4ab-9b69-49b1-8be6-6faa3f0d0c67",
    termsUrl: "https://open.canada.ca/en/open-government-licence-canada",
    access: "Commercial reuse permitted with attribution. Contains information licensed under the Open Government Licence – Canada. Co-op/internship validation only; not comprehensive Canadian recognition.",
  },
];

export async function getDirectoryCoverage() {
  const counts = await db.select({
    code: institutionDirectoryTable.countryCode,
    country: institutionDirectoryTable.country,
    count: sql<number>`count(*)::int`,
    lastImportedAt: sql<string | null>`max(${institutionDirectoryTable.lastUpdatedAt})`,
  }).from(institutionDirectoryTable).where(eq(institutionDirectoryTable.isActive, true))
    .groupBy(institutionDirectoryTable.countryCode, institutionDirectoryTable.country);
  const programCounts = await db.select({
    code: institutionDirectoryTable.countryCode,
    count: sql<number>`count(*)::int`,
  }).from(institutionFactsTable)
    .innerJoin(institutionDirectoryTable, eq(institutionDirectoryTable.id, institutionFactsTable.institutionId))
    .where(and(eq(institutionDirectoryTable.isActive, true), eq(institutionFactsTable.kind, "program")))
    .groupBy(institutionDirectoryTable.countryCode);
  return {
    countries: [
      { countryCode: "US", country: "United States",
        note: "Source-limited active IPEDS directory across 50 states, D.C. and covered territories. Scorecard program enrichment remains pending; not every U.S. institution is necessarily covered by these sources." },
      { countryCode: "CA", country: "Canada",
        note: "Pilot: source-listed institutions/campuses and programs validated by the Public Service Commission for co-op/internships. Not full Canadian coverage or a general recognition/accreditation directory. Names are kept as listed; campuses may be separate. City, type, language, official school URLs, applicant eligibility and DLI status are not supplied by this dataset." },
      ...counts.filter((row) => !["US", "CA"].includes(row.code)).map((row) => ({
        countryCode: row.code, country: row.country,
        note: "Existing NCES IPEDS source records outside the United States. Source-limited holdings only, not a national directory or complete country coverage.",
      })),
    ].map((country) => {
      const found = counts.find((row) => row.code === country.countryCode);
      return { ...country, institutionCount: found?.count ?? 0,
        programCount: programCounts.find((row) => row.code === country.countryCode)?.count ?? 0,
        status: found?.count ? "Source-limited / partial" : "Not imported",
        lastImportedAt: found?.lastImportedAt ? new Date(found.lastImportedAt).toISOString() : null };
    }),
    worldwideNote: "Only the countries listed here have imported records; a few countries have limited holdings inherited from IPEDS, not a national import. Later phases require country-specific official, reusable sources or licensed WHED access. No country is claimed fully covered.",
    references: DIRECTORY_REFERENCES,
  };
}

const FUNDING_VERIFICATION_WINDOW_DAYS = 180;
const FUNDING_BATCH_SIZE = 1000;
const MAX_FUNDING_RECORDS_SCANNED = 100_000;

function normalizeEligibility(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function currentDate() {
  return new Date().toISOString().slice(0, 10);
}

function isVerifiedOfficialUrl(
  officialUrl: string | null,
  schoolWebsite: string | null,
) {
  if (!officialUrl) return false;
  try {
    const url = new URL(officialUrl);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (schoolWebsite) {
      const schoolHost = new URL(schoolWebsite).hostname.toLowerCase();
      if (host === schoolHost || host.endsWith(`.${schoolHost}`)) return true;
    }
    return [".gov", ".gc.ca", ".canada.ca", ".gov.uk", ".gouv.fr"]
      .some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
}

type FundingSourceRow = {
  fact: typeof facts.$inferSelect;
  school: {
    id: string; name: string; countryCode: string; city: string; website: string | null;
  };
};

async function loadFundingSourceRows(): Promise<FundingSourceRow[]> {
  const rows: FundingSourceRow[] = [];
  for (let offset = 0; ; offset += FUNDING_BATCH_SIZE) {
    const batch = await db
      .select({
        fact: getTableColumns(facts),
        school: {
          id: schools.id, name: schools.name, countryCode: schools.countryCode,
          city: schools.city, website: schools.website,
        },
      })
      .from(facts)
      .innerJoin(schools, eq(schools.id, facts.institutionId))
      .where(and(eq(facts.kind, "funding"), eq(schools.isActive, true)))
      .orderBy(facts.id)
      .limit(FUNDING_BATCH_SIZE)
      .offset(offset);
    rows.push(...batch);
    if (rows.length > MAX_FUNDING_RECORDS_SCANNED) {
      throw new Error("Too many funding records to verify safely in a single search.");
    }
    if (batch.length < FUNDING_BATCH_SIZE) return rows;
  }
}

function isRecentlyVerified(row: FundingSourceRow, now: Date) {
  const verifiedAt = row.fact.lastVerifiedAt;
  if (!verifiedAt || !isVerifiedOfficialUrl(row.fact.officialUrl, row.school.website)) return false;
  const age = now.getTime() - verifiedAt.getTime();
  const windowMs = FUNDING_VERIFICATION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return age >= 0 && age <= windowMs && row.fact.sourceUrl.startsWith("https://");
}

function isExpired(row: FundingSourceRow, today: string) {
  return !!row.fact.deadline && row.fact.deadline < today;
}

export async function getFundingFinderOptions() {
  const all = await loadFundingSourceRows();
  const now = new Date();
  const today = currentDate();
  const notExpired = all.filter((row) => !isExpired(row, today));
  const verified = notExpired.filter((row) => isRecentlyVerified(row, now));
  const items = GetFundingFinderOptionsResponse.parse({
    verifiedOpportunityCount: verified.length,
    unverifiedOpportunityCount: notExpired.length - verified.length,
    expiredOpportunityCount: all.filter((row) => isExpired(row, today)).length,
    applicantGroups: [...new Set(verified.map((row) => row.fact.applicantGroup).filter((v): v is string => !!v))].sort(),
    applicantStatuses: [...new Set(verified.flatMap((row) => row.fact.applicantStatuses))].sort(),
    citizenships: [...new Set(verified.flatMap((row) => row.fact.eligibleCitizenships))].sort(),
    residenceCountries: [...new Set(verified.flatMap((row) => row.fact.eligibleResidenceCountries))].sort(),
    residenceRegions: [...new Set(verified.flatMap((row) => row.fact.eligibleResidenceRegions))].sort(),
    degreeLevels: [...new Set(verified.flatMap((row) => row.fact.eligibleDegreeLevels))].sort(),
    criteria: [...new Set(verified.flatMap((row) => row.fact.eligibleCriteria))].sort(),
    verificationWindowDays: FUNDING_VERIFICATION_WINDOW_DAYS,
  });
  return items;
}

function sourceFieldsMatch(
  sourceValues: string[],
  studentValue: string | undefined,
  label: string,
  matched: string[],
  unconfirmed: string[],
) {
  if (!sourceValues.length) {
    unconfirmed.push(`${label}: not recorded in this directory.`);
    return true;
  }
  if (!studentValue) {
    unconfirmed.push(`${label}: add this information to check the source-listed rule.`);
    return true;
  }
  const expected = normalizeEligibility(studentValue);
  if (!sourceValues.some((value) => normalizeEligibility(value) === expected)) return false;
  matched.push(`${label}: matches the source-listed eligibility.`);
  return true;
}

export async function getFundingMatches(input: FundingStudentProfileInput) {
  const all = await loadFundingSourceRows();
  const now = new Date();
  const today = currentDate();
  const notExpired = all.filter((row) => !isExpired(row, today));
  const verified = notExpired.filter((row) => isRecentlyVerified(row, now));
  const matches: FundingPotentialMatch[] = [];

  for (const row of verified) {
    const { fact, school } = row;
    const matchedCriteria: string[] = [];
    const unconfirmedCriteria: string[] = [];
    let conflictsWithReportedRule = false;

    if (fact.applicantStatuses.length) {
      if (!input.applicantStatus) {
        unconfirmedCriteria.push("Applicant status: add domestic or international to check this rule.");
      } else if (!fact.applicantStatuses.includes(input.applicantStatus)) {
        conflictsWithReportedRule = true;
      } else {
        matchedCriteria.push(`Applicant status: ${input.applicantStatus}.`);
      }
    } else {
      unconfirmedCriteria.push("Applicant status: not recorded in this directory.");
    }
    if (fact.applicantGroup && fact.applicantGroup !== "general") {
      if (!input.applicantGroup) {
        unconfirmedCriteria.push("Applicant group: add your study level to check this rule.");
      } else if (fact.applicantGroup !== input.applicantGroup) {
        conflictsWithReportedRule = true;
      } else {
        matchedCriteria.push(`Applicant group: ${input.applicantGroup}.`);
      }
    } else {
      unconfirmedCriteria.push("Applicant group: not recorded in this directory.");
    }

    conflictsWithReportedRule ||= !sourceFieldsMatch(fact.eligibleCitizenships, input.citizenship, "Citizenship", matchedCriteria, unconfirmedCriteria);
    conflictsWithReportedRule ||= !sourceFieldsMatch(fact.eligibleResidenceCountries, input.residenceCountry, "Residence country", matchedCriteria, unconfirmedCriteria);
    conflictsWithReportedRule ||= !sourceFieldsMatch(fact.eligibleResidenceRegions, input.residenceRegion, "Residence region", matchedCriteria, unconfirmedCriteria);
    conflictsWithReportedRule ||= !sourceFieldsMatch(fact.eligibleDegreeLevels, input.degreeLevel, "Degree level", matchedCriteria, unconfirmedCriteria);
    if (fact.eligibleCriteria.length) {
      const selected = new Set((input.criteria ?? []).map(normalizeEligibility));
      const matched = fact.eligibleCriteria.filter((value) => selected.has(normalizeEligibility(value)));
      if (matched.length) matchedCriteria.push(`Selected criteria: ${matched.join(", ")}.`);
      unconfirmedCriteria.push("Review all source-listed personal eligibility conditions.");
    }
    if (fact.majorRequirement === "required" && fact.eligibleMajors.length) {
      if (!input.intendedMajor) {
        unconfirmedCriteria.push("Intended major: add a field of study to check this rule.");
      } else if (!fact.eligibleMajors.some((major) => normalizeEligibility(major) === normalizeEligibility(input.intendedMajor!))) {
        conflictsWithReportedRule = true;
      } else {
        matchedCriteria.push(`Intended major: ${input.intendedMajor}.`);
      }
    } else if (fact.majorRequirement === "required") {
      unconfirmedCriteria.push("Intended major: the source reports a restriction but does not list fields here.");
    } else if (fact.majorRequirement !== "not_restricted") {
      unconfirmedCriteria.push("Major restrictions: not recorded in this directory.");
    }
    if (fact.minimumGpa !== null && fact.minimumGpaScale === "4.0") {
      if (input.gpa === undefined) {
        unconfirmedCriteria.push("Academic results: add a U.S. 4.0-scale GPA to check this rule.");
      } else if (input.gpa < fact.minimumGpa) {
        conflictsWithReportedRule = true;
      } else {
        matchedCriteria.push(`GPA meets the source-reported ${fact.minimumGpaScale}-scale threshold.`);
      }
    }
    if (!fact.eligibility) unconfirmedCriteria.push("Additional eligibility requirements are not recorded in this directory.");
    if (!fact.deadline) unconfirmedCriteria.push("Deadline not recorded; current availability is unknown.");

    // Do not guess across unspecified criteria or imply a guarantee of award.
    if (!conflictsWithReportedRule) {
      const opportunity = ListUniversityFactsResponse.shape.items.element.parse(fact);
      matches.push({
        institutionId: school.id,
        institutionName: school.name,
        countryCode: school.countryCode,
        city: school.city,
        opportunity,
        matchedCriteria,
        unconfirmedCriteria,
        deadlineStatus: fact.deadline ? "Source-reported date" : "Unknown",
      });
    }
  }

  matches.sort((a, b) =>
    a.institutionName.localeCompare(b.institutionName) ||
    a.opportunity.title.localeCompare(b.opportunity.title) ||
    a.opportunity.id.localeCompare(b.opportunity.id));
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 20;
  const matchCount = matches.length;
  const totalPages = Math.ceil(matchCount / pageSize);
  return {
    matches: matches.slice((page - 1) * pageSize, page * pageSize),
    matchCount,
    page,
    pageSize,
    totalPages,
    verifiedRecordCount: verified.length,
    unverifiedRecordCount: notExpired.length - verified.length,
    expiredRecordCount: all.length - notExpired.length,
    notice: "Potential leads only—not confirmation of eligibility, award, or an open application. Official pages control. Blank criteria and deadlines remain unknown.",
  };
}
