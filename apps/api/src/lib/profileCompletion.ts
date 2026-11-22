import type { StudentProfileRecord } from "@workspace/db/schema";

type ProfileLike = Pick<StudentProfileRecord,
  "residenceCountry" | "citizenship" | "studyCountry" | "currentQualification" | "degreeLevel" |
  "major" | "grades" | "graduationYear" | "budgetChoice" | "preferredLanguage" | "englishTest" | "applicantStatus">;

const filled = (value: string | null | undefined) => !!value && value.trim().length > 0;

/** Fields the onboarding wizard asks for, in the order students see them. */
export const PROFILE_CHECKS: Array<[label: string, done: (p: ProfileLike) => boolean]> = [
  ["Country of residence", p => filled(p.residenceCountry)],
  ["Citizenship", p => filled(p.citizenship)],
  ["Intended study country", p => filled(p.studyCountry)],
  ["Applicant status", p => p.applicantStatus === "domestic" || p.applicantStatus === "international"],
  ["Current qualification", p => filled(p.currentQualification)],
  ["Degree level", p => filled(p.degreeLevel)],
  ["Intended major", p => filled(p.major)],
  ["Grades or GPA", p => filled(p.grades)],
  ["Graduation year", p => p.graduationYear != null],
  // "No budget" is a valid answer; only an unanswered question is incomplete.
  ["Budget preference", p => p.budgetChoice != null],
  ["Preferred language of instruction", p => filled(p.preferredLanguage)],
  // "Not taken yet" and "Not required" are valid answers.
  ["English test status", p => filled(p.englishTest)],
];

export function profileCompletion(profile: ProfileLike | null | undefined) {
  const total = PROFILE_CHECKS.length;
  if (!profile) return { percent: 0, completed: 0, total, missing: PROFILE_CHECKS.map(([label]) => label) };
  const missing = PROFILE_CHECKS.filter(([, done]) => !done(profile)).map(([label]) => label);
  const completed = total - missing.length;
  return { percent: Math.round((100 * completed) / total), completed, total, missing };
}
