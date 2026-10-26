import { load } from "cheerio";
import robotsParser from "robots-parser";
import { safeFetch } from "./safeFetch";

export type LogoCandidate = { imageUrl: string; sourceUrl: string; identitySource: string; licenseUrl: string; credit: string; usageNote: string };
export type CatalogRow = { item: { value: string }; ipeds: { value: string }; logo: { value: string }; website?: { value: string } };
const note = "For institution identification only. Trademarks remain with their owners; no affiliation or endorsement is implied.";
const normalizeWebsite = (value: string) => {
  try { const u = new URL(value); return u.hostname.toLowerCase().replace(/^www\./, "") + u.pathname.replace(/\/+$/, ""); }
  catch { return ""; }
};
const isOpenPublicDomain = (value: string) => /public domain|cc0|cc-zero|publicdomain\/zero/i.test(value);

export function matchingCatalogRows(ipedsId: number | null, website: string | null, rows: CatalogRow[]) {
  if (!ipedsId || !website) return [];
  const matches = rows.filter((row) => row.ipeds.value === String(ipedsId) && row.website &&
    normalizeWebsite(row.website.value) === normalizeWebsite(website));
  const unique = new Map(matches.map((row) => [`${row.item.value}|${row.logo.value}`, row]));
  return [...unique.values()];
}

export async function commonsCandidate(row: CatalogRow): Promise<LogoCandidate | null> {
  const logo = new URL(row.logo.value);
  if (logo.hostname !== "commons.wikimedia.org" || !logo.pathname.startsWith("/wiki/Special:FilePath/")) return null;
  const filename = decodeURIComponent(logo.pathname.slice("/wiki/Special:FilePath/".length));
  const api = new URL("https://commons.wikimedia.org/w/api.php");
  api.search = new URLSearchParams({
    action: "query", format: "json", prop: "imageinfo", iiprop: "url|extmetadata",
    titles: `File:${filename}`, iiextmetadatafilter: "LicenseShortName|LicenseUrl|UsageTerms|Copyrighted|AttributionRequired|Artist|Restrictions",
  }).toString();
  const response = await safeFetch(api.href, 200_000, new Set(["commons.wikimedia.org"]));
  if (response.status !== 200) throw new Error(`Authorized image metadata request failed: HTTP ${response.status}.`);
  const data = JSON.parse(response.body.toString());
  const page = Object.values(data.query?.pages ?? {})[0] as { imageinfo?: { url: string; descriptionurl: string; extmetadata: Record<string, { value: string }> }[] } | undefined;
  const info = page?.imageinfo?.[0];
  if (!info) return null;
  const metadata = info.extmetadata;
  const license = `${metadata.LicenseShortName?.value ?? ""} ${metadata.UsageTerms?.value ?? ""}`;
  // Do not reuse copyrighted, attribution-required or unclear-license images automatically.
  if (!isOpenPublicDomain(license) || metadata.Copyrighted?.value?.toLowerCase() !== "false" ||
    metadata.AttributionRequired?.value?.toLowerCase() === "true") return null;
  if (new URL(info.url).hostname !== "upload.wikimedia.org" ||
    new URL(info.descriptionurl).hostname !== "commons.wikimedia.org") return null;
  const licenseUrl = metadata.LicenseUrl?.value?.replace(/^http:/, "https:") ||
    "https://commons.wikimedia.org/wiki/Commons:Licensing#Material_in_the_public_domain";
  if (!/^https:\/\/(creativecommons\.org|commons\.wikimedia\.org)\//.test(licenseUrl)) return null;
  return { imageUrl: info.url, sourceUrl: info.descriptionurl, identitySource: row.item.value.replace(/^http:/, "https:"),
    licenseUrl, credit: `${filename} · ${metadata.LicenseShortName?.value ?? "Public domain"} · Wikimedia Commons`, usageNote: note };
}

function jsonLdObjects(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(jsonLdObjects);
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  return [object, ...jsonLdObjects(object["@graph"])];
}

export function officialMetadataCandidate(html: string, institutionName: string, website: string): LogoCandidate | null {
  const origin = new URL(website);
  const $ = load(html);
  const normalizedName = (name: string) => name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  for (const script of $('script[type="application/ld+json"]').toArray()) {
    let objects: Record<string, unknown>[];
    try { objects = jsonLdObjects(JSON.parse($(script).text())); } catch { continue; }
    for (const object of objects) {
      const types = Array.isArray(object["@type"]) ? object["@type"] : [object["@type"]];
      if (!types.some((type) => ["CollegeOrUniversity", "EducationalOrganization", "Organization"].includes(String(type))) ||
        typeof object.name !== "string" || normalizedName(object.name) !== normalizedName(institutionName)) continue;
      const logo = object.logo;
      if (!logo || typeof logo !== "object") continue;
      const image = logo as Record<string, unknown>;
      if (typeof image.license !== "string" || !isOpenPublicDomain(image.license)) continue;
      const raw = image.contentUrl ?? image.url;
      if (typeof raw !== "string") continue;
      const url = new URL(raw, origin);
      const license = new URL(image.license);
      if (url.origin !== origin.origin || url.protocol !== "https:" ||
        license.hostname !== "creativecommons.org" || !/publicdomain\/zero|publicdomain\/mark/.test(license.pathname)) continue;
      return { imageUrl: url.href, sourceUrl: website, identitySource: website, licenseUrl: license.href,
        credit: institutionName + " · official website metadata", usageNote: note };
    }
  }
  return null;
}

export async function discoverOfficialMetadata(name: string, website: string) {
  const origin = new URL(website);
  if (origin.protocol !== "https:") return null;
  const hosts = new Set([origin.hostname]);
  const robotsUrl = new URL("/robots.txt", origin);
  const robots = await safeFetch(robotsUrl.href, 200_000, hosts);
  if (robots.status !== 200 && robots.status !== 404) return null;
  if (robots.status === 200 && robotsParser(robotsUrl.href, robots.body.toString()).isAllowed(website, "UniPathAI-LogoDiscovery") === false) return null;
  const page = await safeFetch(website, 2_000_000, hosts);
  if (page.status !== 200 || !page.type.includes("text/html")) return null;
  return officialMetadataCandidate(page.body.toString(), name, website);
}
