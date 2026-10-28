import { createHash } from "node:crypto";
import type { MatchingEvidence, SourceCheck } from "@workspace/db";
import { safeFetch } from "../logos/safeFetch";

export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
export const sourceText = (body: string) => body.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
  .replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&")
  .replace(/&#8211;|&ndash;|&#8212;|&mdash;/g, "-").replace(/\s+/g, " ").trim();
const words = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function identitySupported(name: string, text: string) {
  const expected = words(name);
  return expected.length >= 10 && (` ${words(text)} `).includes(` ${expected} `);
}
export function evidenceDescription(row: MatchingEvidence) {
  if (row.kind === "tuition") return `Internal ${row.reportingYear ?? "unreported year"} tuition-and-fees category (${row.residenceRegion ?? "unreported category"}); source amounts are not returned.`;
  if (row.kind === "intake") return `${row.degreeLevel ?? "Unspecified degree"} / ${row.admissionTrack ?? "Unspecified track"} / ${row.startTerm} ${row.startYear} / ${row.deadlineType ?? "unclassified"} deadline ${row.deadline}`;
  return `${row.degreeLevel ?? "Unspecified degree"} / ${row.admissionTrack ?? "Unspecified track"} / opportunity listing only; individual eligibility is not established.`;
}
export function matchingSupported(row: MatchingEvidence, text: string) {
  // These parsers are intentionally limited to the explicitly researched UA pilot.
  // No generic website response can establish a program, price or scholarship.
  const url = new URL(row.sourceUrl);
  if (row.institutionId !== "nces-100751" || !["admissions.ua.edu", "afford.ua.edu"].includes(url.hostname)) return false;
  const plain = words(text);
  if (row.kind === "funding") return /\bscholarships?\b/.test(plain) && /\bfreshm[ae]n\b/.test(plain)
    && /\binternational\b/.test(plain) && row.admissionTrack === "first_year";
  if (row.kind !== "intake" || !row.startYear || !row.startTerm || !row.deadline
    || row.deadlineType !== "priority" || row.admissionTrack !== "first_year") return false;
  const [year, month, day] = row.deadline.split("-").map(Number);
  const monthName = new Date(Date.UTC(year, month - 1, day)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const dates = [words(`${monthName} ${day} ${year}`), words(`${monthName.slice(0, 3)} ${day} ${year}`)];
  const term = row.startTerm.toLowerCase();
  const position = plain.indexOf(`${term} ${row.startYear}`);
  if (position < 0 || !/\b(first year|freshm[ae]n)\b/.test(plain)) return false;
  const context = plain.slice(Math.max(0, position - 100), position + 500);
  return context.includes("priority") && dates.some(date => context.includes(date));
}
export async function fetchOfficialSource(url: string) {
  const host = new URL(url).hostname;
  const variants = new Set([host, host.startsWith("www.") ? host.slice(4) : `www.${host}`]);
  const response = await safeFetch(url, 1_500_000, variants);
  if (response.status !== 200) throw new Error(`HTTP_${response.status}`);
  if (!/text\/html|text\/plain|application\/xhtml/i.test(response.type)) throw new Error("UNSUPPORTED_SOURCE_FORMAT");
  return { text: sourceText(response.body.toString("utf8")), url: response.url, checkedAt: new Date().toISOString() };
}
export function failedSource(fieldKey: string, title: string, value: string, url: string, error: unknown): SourceCheck {
  const known = error instanceof Error && /^HTTP_\d{3}$/.test(error.message) ? error.message.replace("_", " ") : "Source unavailable, restricted, unsafe, oversized or timed out";
  return { fieldKey, title, value, sourceUrl: url, checkedAt: new Date().toISOString(), status: "error",
    message: `${known}. No existing verified value or verification date was changed.` };
}
