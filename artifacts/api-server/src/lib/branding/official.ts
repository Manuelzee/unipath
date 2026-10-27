import { load } from "cheerio";
import robotsParser from "robots-parser";
import { safeFetch } from "../logos/safeFetch";
import type { InstitutionDirectoryRecord } from "@workspace/db";

export const curatedSources = [{
  id: "nces-100751", ipedsId: 100751, website: "https://www.ua.edu/",
  colorsUrl: "https://brand.ua.edu/colors", primaryLabel: "Crimson Flame", secondaryLabel: "Pachyderm",
  mascotUrl: "https://www.ua.edu/about/traditions", mascotName: "Big Al",
  imagePolicyUrl: "https://brand.ua.edu/marks-seals",
  usageNote: "Crimson Flame is in the primary palette; Pachyderm is a secondary palette color. Secondary colors are decorative only, no more than 20% of a design. No tints/shades or secondary-color headlines. Mascot artwork requires separate permission.",
}];
export const normalizeSite = (value: string) => {
  try { const u = new URL(value); return u.hostname.replace(/^www\./, "").toLowerCase() + u.pathname.replace(/\/+$/, ""); }
  catch { return ""; }
};
const normalizeName = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
export const validHex = (value: unknown): value is string => typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value);
export function sourceFor(school: Pick<InstitutionDirectoryRecord, "id" | "ipedsId" | "website">) {
  return curatedSources.find(source => source.id === school.id && source.ipedsId === school.ipedsId &&
    school.website && normalizeSite(source.website) === normalizeSite(school.website));
}
export function officialHost(url: string, website: string) {
  try {
    const u = new URL(url), root = new URL(website).hostname.replace(/^www\./, "").toLowerCase();
    return u.protocol === "https:" && (u.hostname === root || u.hostname.endsWith("." + root));
  } catch { return false; }
}
const robotCache = new Map<string, { at: number; parser: ReturnType<typeof robotsParser> }>();
export async function officialPage(url: string, website: string) {
  if (!officialHost(url, website)) throw new Error("Source identity does not match official institution domain.");
  const u = new URL(url);
  const allowed = new Set([u.hostname, u.hostname.replace(/^www\./, ""), "www." + u.hostname.replace(/^www\./, "")]);
  let cached = robotCache.get(u.origin);
  if (!cached || Date.now() - cached.at > 86400_000) {
    const robots = await safeFetch(u.origin + "/robots.txt", 200_000, allowed);
    if (![200, 404].includes(robots.status)) throw new Error(`Source robots request failed: HTTP ${robots.status}.`);
    cached = { at: Date.now(), parser: robotsParser(u.origin + "/robots.txt", robots.status === 200 ? robots.body.toString() : "") };
    robotCache.set(u.origin, cached);
  }
  if (cached.parser.isAllowed(url, "UniPathAI-LogoDiscovery") === false) throw new Error("Source robots rules disallow this page.");
  const response = await safeFetch(url, 2_000_000, allowed);
  if (response.status !== 200) throw new Error(`Source official page failed: HTTP ${response.status}.`);
  if (!response.type.includes("text/html")) throw new Error("Source official page is not HTML.");
  return { html: response.body.toString(), url: response.url };
}
export function textOnly(html: string) {
  const $ = load(html); $("script,style,nav,header,footer").remove();
  $("br").replaceWith(" ");
  $("h1,h2,h3,h4,p,li,td,dt,dd,section,div").append(" ");
  return $("body").text().replace(/\s+/g, " ").trim();
}
export function curatedColors(html: string, primaryLabel: string, secondaryLabel: string) {
  const text = textOnly(html);
  const p = /\bPRIMARY\s*COLO[U]?RS\b/i.exec(text);
  const rest = p ? text.slice(p.index + p[0].length) : "";
  const s = /\bSECONDARY\s*COLO[U]?RS\b/i.exec(rest);
  const primary = s ? rest.slice(0, s.index) : undefined;
  const after = s ? rest.slice(s.index + s[0].length) : "";
  // Guide prose mentions "metallic colors" before the palette; it is not a section boundary.
  const secondary = after;
  const find = (section: string | undefined, label: string) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const value = section?.match(new RegExp(escaped + "[\\s\\S]{0,220}?\\bHEX\\s*#?([0-9A-F]{6})\\b", "i"))?.[1];
    return value ? "#" + value.toUpperCase() : null;
  };
  const a = find(primary, primaryLabel), b = find(secondary, secondaryLabel);
  return a && b ? { primaryColorHex: a, secondaryColorHex: b } : null;
}
export function curatedMascot(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("\\bmascot\\s+(?:(?:is|named)\\s+|:\\s*)?" + escaped + "\\b", "i").test(textOnly(html)) ? name : null;
}
function objects(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(objects);
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  return [row, ...objects(row["@graph"])];
}
export function institutionMetadata(html: string, name: string) {
  const $ = load(html);
  for (const script of $('script[type="application/ld+json"]').toArray()) {
    try {
      for (const object of objects(JSON.parse($(script).text()))) {
        const types = [object["@type"]].flat();
        if (types.some(type => ["CollegeOrUniversity", "EducationalOrganization"].includes(String(type))) &&
          typeof object.name === "string" && normalizeName(object.name) === normalizeName(name)) return object;
      }
    } catch { /* Invalid structured data is not verification. */ }
  }
  return null;
}
export function explicitColors(html: string, institutionName: string) {
  const meta = institutionMetadata(html, institutionName);
  const brand = meta?.brand as Record<string, unknown> | undefined;
  if (brand && validHex(brand.primaryColor) && validHex(brand.secondaryColor)) {
    return { primaryColorHex: brand.primaryColor.toUpperCase(), secondaryColorHex: brand.secondaryColor.toUpperCase() };
  }
  // Require explicit semantic labels, never sample CSS, a logo, theme-color or an image.
  const text = textOnly(html);
  const find = (role: string) => text.match(new RegExp("\\b" + role + " (?:brand )?colou?r\\s*(?:hex)?\\s*[:=]\\s*(#[0-9a-f]{6})\\b", "i"))?.[1]?.toUpperCase();
  const primary = find("primary"), secondary = find("secondary");
  return primary && secondary ? { primaryColorHex: primary, secondaryColorHex: secondary } : null;
}
export function metadataMascot(meta: Record<string, unknown> | null) {
  const raw = meta?.mascot;
  const value = typeof raw === "string" ? raw : raw && typeof raw === "object" ? (raw as Record<string, unknown>).name : null;
  return typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 80 ? value.trim() : null;
}
export function officialLinks(html: string, page: string, website: string, pattern: RegExp) {
  const $ = load(html);
  return [...new Set($("a[href]").toArray().flatMap(element => {
    const anchor = $(element);
    if (!pattern.test(anchor.text() + " " + anchor.attr("href"))) return [];
    try { const url = new URL(anchor.attr("href")!, page); url.hash = ""; return officialHost(url.href, website) ? [url.href] : []; }
    catch { return []; }
  }))];
}
