import { and, eq, inArray, isNull, notLike, or } from "drizzle-orm";
import { countriesIn } from "../countries";
import { db, institutionDirectoryTable as institutions, institutionFactsTable as facts,
  matchingEvidenceTable as evidence, type StudentProfileRecord, type InstitutionDirectoryRecord,
  type MatchingEvidence } from "@workspace/db";
import { findUniversities } from "../universities";
import { exchangeAmount } from "./exchange";
import { regionMatches } from "./region";
import { CLASSIFICATION_RANK, classifyMatch } from "./classify";

type Assessment = { status: string; message: string; sources: string[]; reportingYear: number | null; deadline: string | null };
type Factor = { weight: number; match: boolean | null; reason: string; missing: string };
const unknown = (message: string): Assessment => ({ status: "needs_verification", message, sources: [], reportingYear: null, deadline: null });
const named = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const undergrad = (s: string) => ["undergraduate","bachelor","associate"].includes(named(s));
const undergraduateSchool = (s: StudentProfileRecord) => undergrad(s.degreeLevel);
const countryMatch = (value: string, school: InstitutionDirectoryRecord) => {
  const n = named(value);
  return n === named(school.country) || n === named(school.countryCode) || countriesIn(value).includes(school.countryCode) ||
    (["usa","us","unitedstatesofamerica"].includes(n) && school.countryCode === "US") ||
    (["ca","can"].includes(n) && school.countryCode === "CA");
};
const budgetLimits: Record<string, number | null> = {
  under_5000: 5000, "5000_10000": 10000, "10000_20000": 20000,
  "20000_35000": 35000, "35000_50000": 50000, "50000_plus": null,
};
const recent = (date: string, days: number) => Date.now() - new Date(date + "T12:00:00Z").getTime() <= days * 86400_000;

export function assessTerm(profile: StudentProfileRecord, schoolEvidence: MatchingEvidence[], today = new Date().toISOString().slice(0, 10)): Assessment {
  if (!profile.startYear || profile.startTerm === "flexible") return unknown("Choose a start year and term to check official intake information.");
  if (profile.startYear < Number(today.slice(0, 4))) return unknown("Your preferred start year has passed. Choose a future year.");
  if (profile.admissionTrack === "unsure") return unknown("Start term availability needs verification. Select your application track for program-specific deadlines.");
  if (profile.applicantStatus === "international" && !schoolEvidence.some(row => row.kind === "intake" &&
    row.startTerm === profile.startTerm && row.startYear === profile.startYear &&
    row.admissionTrack === profile.admissionTrack && row.applicantStatus === "international"))
    return unknown("Start term availability needs verification for international applicants; the general intake page may use different deadlines.");
  const entry = schoolEvidence.find(row => row.kind === "intake" && row.startTerm === profile.startTerm &&
    row.startYear === profile.startYear && row.admissionTrack === profile.admissionTrack &&
    (row.degreeLevel === null || (undergrad(row.degreeLevel) && undergraduateSchool(profile)) ||
      named(row.degreeLevel) === named(profile.degreeLevel)) &&
    (row.program === null || named(row.program) === named(profile.major)));
  if (!entry || !recent(entry.sourceDate, 730)) return unknown("Start term availability needs verification. Check the institution's official admissions page.");
  if (entry.deadline && entry.deadline < today) {
    return { status: "deadline_passed",
      message: `${entry.deadlineType === "priority" ? "Priority" : "Application"} deadline has passed. This does not prove applications are closed; confirm current availability with admissions.`,
      sources: [entry.sourceUrl], reportingYear: null, deadline: entry.deadline };
  }
  return { status: "listed", message: `Official admissions lists this ${profile.startTerm} ${profile.startYear} ${profile.admissionTrack.replace("_", "-")} intake${entry.deadline ? `; ${entry.deadlineType === "priority" ? "priority" : "application"} deadline shown separately` : ""}. Verify program availability and current application status.`,
    sources: [entry.sourceUrl], reportingYear: null, deadline: entry.deadline };
}

export async function assessBudget(profile: StudentProfileRecord, school: InstitutionDirectoryRecord, rows: MatchingEvidence[]): Promise<Assessment> {
  const choice = profile.budgetChoice ?? (profile.annualBudgetUsd > 0 ? "custom" : "none");
  if (choice === "none") return unknown("No budget selected; affordability has not been assessed.");
  if (choice === "aid_needed") return unknown("Funding needs verification. A scholarship is never guaranteed.");
  const cap = choice === "custom" ? (profile.customBudget ?? profile.annualBudgetUsd) : budgetLimits[choice];
  if (choice === "50000_plus") return unknown("Your budget starts at 50,000 with no maximum. Enter your own budget for a precise affordability check.");
  if (cap == null || !Number.isFinite(cap) || cap <= 0) return unknown("Choose an upper budget or enter a custom amount to assess affordability.");
  if (profile.applicantStatus !== "domestic" || school.countryCode !== "US" ||
    !countryMatch(profile.residenceCountry, school))
    return unknown("Applicant tuition category needs verification; domestic U.S. figures cannot be assumed for international students.");
  const region = regionMatches(profile.residenceRegion, school.state, school.countryCode)
    ? school.state : "out_of_state";
  const entry = rows.find(row => row.kind === "tuition" && row.applicantStatus === "domestic" &&
    (region === "out_of_state" ? row.residenceRegion === region
      : !!row.residenceRegion && regionMatches(row.residenceRegion, school.state, school.countryCode)) &&
    row.degreeLevel && undergrad(row.degreeLevel) &&
    undergraduateSchool(profile) && profile.admissionTrack !== "graduate" && row.amount !== null && row.currency &&
    row.reportingYear && row.budgetScope === "tuition_and_fees" &&
    recent(row.sourceDate, 550) && row.reportingYear >= new Date().getFullYear() - 1);
  if (!entry || entry.amount === null || !entry.currency)
    return unknown("Budget information needs verification. A current source-reported figure for your applicant category is unavailable.");
  const converted = await exchangeAmount(entry.amount, entry.currency, profile.budgetCurrency);
  if (converted === null) return unknown("Currency conversion needs verification. Current official exchange rates are unavailable.");
  const currencyNote = converted.rateDate ? `Currency estimate uses European Central Bank reference rates dated ${converted.rateDate}; actual exchange charges may differ. ` : "";
  const note = currencyNote + (region === school.state ? "Residency and final charges need confirmation." : "Final charges and applicant category need confirmation.");
  const shared = { sources: converted.sourceUrl ? [entry.sourceUrl, converted.sourceUrl] : [entry.sourceUrl],
    reportingYear: entry.reportingYear, deadline: null };
  if (converted.value < cap) {
    return profile.budgetScope === "total"
      ? { status: "needs_verification", message: `The reported tuition-and-fees component may fit, but total education expenses need verification. ${note}`, ...shared }
      : { status: "may_fit", message: `The source-reported tuition-and-fees estimate may fit the upper end of your selected budget. ${note} Scholarships are not guaranteed.`, ...shared };
  }
  return profile.budgetScope === "total"
    ? { status: "above_budget", message: `The verified tuition-and-fees component alone exceeds the upper end of your selected total budget. Check current aid and eligibility before deciding. ${note}`, ...shared }
    : { status: "needs_verification", message: `The source combines tuition and required fees, so tuition alone cannot be compared reliably to your limit. ${note}`, ...shared };
}

export function assessFunding(profile: StudentProfileRecord, rows: MatchingEvidence[]): Assessment {
  const found = rows.find(row => row.kind === "funding" && row.supported === true &&
    recent(row.sourceDate, 550) &&
    (!row.admissionTrack || row.admissionTrack === profile.admissionTrack) &&
    (!row.degreeLevel || (undergrad(row.degreeLevel) && undergraduateSchool(profile))));
  return found ? { status: "available", message: "The university officially lists scholarship opportunities for this application track. Individual eligibility, awards and deadlines require verification; funding is not guaranteed.",
    sources: [found.sourceUrl], reportingYear: null, deadline: null }
    : unknown("Scholarship opportunities and eligibility need verification. An official university homepage is not proof of available funding.");
}

function factors(profile: StudentProfileRecord, school: InstitutionDirectoryRecord,
  programTitles: string[], affordability: Assessment, startTerm: Assessment, funding: Assessment): Factor[] {
  const list: Factor[] = [];
  const put = (weight: number, match: boolean | null, reason: string, missing: string) => list.push({ weight, match, reason, missing });
  const targetCountry = profile.studyCountry.trim();
  if (targetCountry && !/^(any|any country|still exploring)$/i.test(targetCountry))
    put(4, countryMatch(targetCountry, school), `In your preferred country: ${school.country}.`, "preferred country");
  if (profile.preferredLocation.trim()) {
    const target = named(profile.preferredLocation);
    put(2, target === named(school.city) || regionMatches(profile.preferredLocation, school.state, school.countryCode),
      `Matches your preferred location: ${profile.preferredLocation}.`, "preferred city or region");
  }
  const level = named(profile.degreeLevel);
  if (level) {
    const available = school.degreeTypes.map(named);
    const categories = school.degreeLevels.map(named);
    const has = level === "bachelor" ? available.includes("bachelor") || (categories.includes("undergraduate") && /4.year/i.test(school.institutionType))
      : level === "associate" ? available.includes("associate") || /2.year/i.test(school.institutionType)
        : level === "master" ? available.includes("master") || available.includes("masters")
          : level === "doctorate" ? available.some(t => /doctor|phd/.test(t))
            : categories.includes(level);
    put(4, has ? true : available.length || categories.length ? null : null,
      `Offers source-listed ${profile.degreeLevel} study.`, "requested degree level");
  }
  if (profile.major.trim()) {
    const wanted = named(profile.major);
    const offered = [...school.majors, ...programTitles].some(v => named(v).includes(wanted) || wanted.includes(named(v)) && named(v).length > 3);
    put(4, offered ? true : null, `Official source lists a related field or program: ${profile.major}.`, "requested field of study");
  }
  if (profile.preferredLanguage.trim()) {
    const known = school.languages.some(v => named(v) === named(profile.preferredLanguage));
    put(1, known ? true : null, `Instruction language listed: ${profile.preferredLanguage}.`, "language of instruction");
  }
  if (profile.grades.trim() || profile.englishTest.trim() || profile.englishScore.trim())
    put(2, null, "", "comparable academic and admission requirements");
  if (profile.applicantStatus !== "unsure") {
    const accepted = school.applicantStatuses.some(v => named(v) === named(profile.applicantStatus));
    put(1, accepted ? true : null, `Source lists ${profile.applicantStatus} applicants.`, "applicant category");
  }
  if (profile.startTerm !== "flexible" && profile.startYear)
    put(3, startTerm.status === "listed" ? true : null, "Official admissions lists your preferred intake.", "start term and program deadline");
  if (profile.budgetChoice && !["none","aid_needed"].includes(profile.budgetChoice))
    put(3, affordability.status === "may_fit" ? true : affordability.status === "above_budget" ? false : null,
      "Source-reported costs may fit your private budget; actual charges and aid need confirmation.", "verified affordability for your budget");
  if (profile.budgetChoice === "aid_needed") put(3, funding.status === "available" ? true : null,
    "Official scholarship opportunities are listed; eligibility needs verification.", "scholarship eligibility");
  const ordered = profile.topPriorities.filter(v => profile.priorities.includes(v));
  for (const key of profile.priorities) {
    const idx = ordered.indexOf(key);
    const weight = idx === -1 ? 1 : 5 - idx;
    const assessment = key === "affordability" ? affordability : key === "scholarships" ? funding
      : key === "major" ? { status: list.find(v => v.missing === "requested field of study")?.match === true ? "listed" : "needs_verification" }
        : key === "graduate_opportunities" ? { status: school.degreeLevels.some(v => named(v) === "graduate") ? "listed" : "needs_verification" } : null;
    const match = assessment?.status === "listed" || assessment?.status === "available" || assessment?.status === "may_fit" ? true
      : assessment?.status === "above_budget" ? false : null;
    put(weight, match, match ? `One of your ranked priorities is supported by source information: ${key.replace(/_/g, " ")}.` : "",
      `${key.replace(/_/g, " ")} evidence`);
  }
  return list;
}

export async function getRecommendations(profile: StudentProfileRecord) {
  const country = profile.studyCountry.trim();
  const chosen = country && !/^(any|any country|still exploring)$/i.test(country);
  // Narrow in the database: the worldwide directory has tens of thousands of
  // schools. Without a study country, ROR-only entries (name, city and website,
  // nothing to match on) are left out to keep this fast.
  const codes = chosen ? countriesIn(country) : [];
  const active = await db.select().from(institutions).where(and(eq(institutions.isActive, true),
    codes.length ? inArray(institutions.countryCode, codes) : chosen ? undefined : or(isNull(institutions.sourceKey), notLike(institutions.sourceKey, "ror:%"))));
  const candidates = chosen ? active.filter(school => countryMatch(country, school)) : active;
  const [evidenceRows, programRows] = await Promise.all([
    db.select().from(evidence),
    db.select({ institutionId: facts.institutionId, title: facts.title, fieldsOfStudy: facts.fieldsOfStudy })
      .from(facts).where(eq(facts.kind, "program")),
  ]);
  const evidenceById = new Map<string, MatchingEvidence[]>();
  for (const row of evidenceRows) evidenceById.set(row.institutionId, [...(evidenceById.get(row.institutionId) ?? []), row]);
  const programsById = new Map<string, string[]>();
  for (const row of programRows)
    programsById.set(row.institutionId, [...(programsById.get(row.institutionId) ?? []), row.title, ...row.fieldsOfStudy]);
  const ranked = await Promise.all(candidates.map(async school => {
    const rows = evidenceById.get(school.id) ?? [];
    const [affordability, startTerm, funding] = await Promise.all([
      // There are only a few private fee records; avoid fetching rates for every unknown school.
      rows.some(row => row.kind === "tuition") ? assessBudget(profile, school, rows)
        : Promise.resolve(unknown("Budget information needs verification. No current source-reported tuition category is available.")),
      Promise.resolve(assessTerm(profile, rows)), Promise.resolve(assessFunding(profile, rows)),
    ]);
    const parts = factors(profile, school, programsById.get(school.id) ?? [], affordability, startTerm, funding);
    const total = parts.reduce((n, item) => n + item.weight, 0);
    const covered = parts.filter(item => item.match !== null).reduce((n, item) => n + item.weight, 0);
    const positive = parts.filter(item => item.match === true).reduce((n, item) => n + item.weight, 0);
    const score = total ? Math.round(100 * positive / total) : 0;
    const evidenceCoverage = total ? Math.round(100 * covered / total) : 0;
    const missingInformation = [...new Set(parts.filter(item => item.match === null).map(item => item.missing))].slice(0, 12);
    // Hard requirements are checked separately from the weighted score. Only
    // verified evidence can mark one as unmet; unknown evidence never does.
    const unmetRequirements = affordability.status === "above_budget"
      ? ["verified tuition and fees exceed your total budget"] : [];
    const CORE: Record<string, string> = { "preferred country": "study country", "requested degree level": "degree level", "requested field of study": "field of study" };
    const core = parts.filter(item => item.missing in CORE);
    const supportedCoreCriteria = core.length && core.every(item => item.match === true) ? core.map(item => CORE[item.missing]) : [];
    const { classification, reason: classificationReason } = classifyMatch({ score, evidenceCoverage, unmetRequirements, missingInformation, supportedCoreCriteria });
    return { school, score, evidenceCoverage, classification, classificationReason,
      reasons: [...new Set(parts.filter(item => item.match === true).map(item => item.reason))].slice(0, 8),
      missingInformation, affordability, startTerm, funding };
  }));
  ranked.sort((a, b) => (a.classification === "requirements_not_met" ? 1 : 0) - (b.classification === "requirements_not_met" ? 1 : 0) ||
    b.score - a.score || b.evidenceCoverage - a.evidenceCoverage ||
    CLASSIFICATION_RANK[a.classification] - CLASSIFICATION_RANK[b.classification] || a.school.name.localeCompare(b.school.name));
  const winners = ranked.filter(row => row.score > 0).slice(0, 15);
  const detail = await findUniversities(winners.map(v => v.school.id));
  return { items: winners.flatMap(({ school, ...rest }) => {
      const university = detail.get(school.id);
      return university ? [{ university, ...rest }] : [];
    }),
    methodology: "Weighted points for your saved country, location, degree, program, academic profile, intake, budget and ranked priorities. Unsupported or outdated evidence receives no matching points and reduces evidence coverage. Each school is then classified: Strong Match (score 70+ with at least 60% of criteria checked), Potential Match (your study country, degree level and field of study are supported but other requirements need confirmation), Insufficient Information (core criteria cannot be checked and under 40% of criteria are covered) or Requirements Not Met (a verified requirement, such as a total-cost budget, is not satisfied; this is checked separately and a high score cannot override it). Your private budget is never displayed as a school price.",
    disclaimer: "These are preference estimates, not admission probabilities or guarantees of acceptance, funding, costs, program entry, or employment. Confirm requirements and deadlines on each university's official pages.",
    totalCandidates: candidates.length, profileUpdatedAt: profile.updatedAt.toISOString(), generatedAt: new Date().toISOString() };
}
