import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { load } from "cheerio";
import sharp from "sharp";
import { eq, sql } from "drizzle-orm";
import { db, institutionDirectoryTable, institutionLogoAssetsTable, type InstitutionDirectoryRecord } from "@workspace/db";
import catalog from "../../data/logo-identity-catalog.json";
import { matchingCatalogRows, type CatalogRow, type LogoCandidate } from "../logos/discovery";
import { safeFetch } from "../logos/safeFetch";
import { cacheLogo, logoObject } from "../logos/storage";
import { prepareLogoImage } from "../logos/images";
import { normalizeSite, officialHost } from "./official";
import brandingManifest from "../../data/institution-branding-manifest.json";

export async function imageSourcesPausedUntil() {
  const [row] = await db.select({ checked: sql<Date>`greatest(
    max(logo_last_checked_at) FILTER (WHERE logo_last_error LIKE '%HTTP 429%'),
    max(branding_last_checked_at) FILTER (WHERE branding_last_error LIKE '%HTTP 429%'))`
  }).from(institutionDirectoryTable);
  const dbPause = row.checked ? new Date(row.checked).getTime() + 3600_000 : 0;
  const packagedPause = brandingManifest.sourcePausedUntil ? Date.parse(String(brandingManifest.sourcePausedUntil)) : 0;
  const until = Math.max(dbPause, packagedPause);
  return until ? new Date(until) : null;
}
export function permittedMediaLicense(license: string, copyrighted: string, author: string, restrictions: string) {
  if (restrictions.trim()) return false;
  const url = license.replace(/^http:/, "https:");
  if (/^https:\/\/creativecommons\.org\/publicdomain\/(zero|mark)\/1\.0\/?$/.test(url)) return copyrighted.toLowerCase() === "false";
  if (/^https:\/\/commons\.wikimedia\.org\/wiki\/Commons:Licensing#Material_in_the_public_domain$/.test(url)) return copyrighted.toLowerCase() === "false";
  return /^https:\/\/creativecommons\.org\/licenses\/by(?:-sa)?\/(?:1\.0|2\.0|2\.5|3\.0|4\.0)\/?$/.test(url) && !!author.trim();
}
function plain(value: string) { return load(value).text().replace(/\s+/g, " ").trim(); }
export async function campusCandidate(school: InstitutionDirectoryRecord): Promise<LogoCandidate | null> {
  if (!school.ipedsId || !school.website) return null;
  const rows = catalog.gzipBase64
    ? JSON.parse(gunzipSync(Buffer.from(catalog.gzipBase64, "base64"), { maxOutputLength: 5_000_000 }).toString()) as CatalogRow[] : [];
  const identities = [...new Set(matchingCatalogRows(school.ipedsId, school.website, rows).map(row => row.item.value.replace(/^http:/, "https:")))];
  if (identities.length !== 1 || !/^https:\/\/www\.wikidata\.org\/entity\/Q\d+$/.test(identities[0])) return null;
  const q = identities[0].split("/").pop()!;
  const entityResponse = await safeFetch(`https://www.wikidata.org/wiki/Special:EntityData/${q}.json`, 2_000_000, new Set(["www.wikidata.org"]));
  if (entityResponse.status !== 200) throw new Error(`Source identity request failed: HTTP ${entityResponse.status}.`);
  const entity = JSON.parse(entityResponse.body.toString()).entities?.[q];
  type Claim = { rank?: string; mainsnak: { datavalue?: { value: string } } };
  const values = (property: string) => (entity?.claims?.[property] ?? []) as Claim[];
  if (!values("P1771").some(row => row.mainsnak.datavalue?.value === String(school.ipedsId)) ||
    !values("P856").some(row => normalizeSite(row.mainsnak.datavalue?.value ?? "") === normalizeSite(school.website!))) return null;
  const image = values("P18").filter(row => row.rank !== "deprecated")
    .sort((a, b) => Number(b.rank === "preferred") - Number(a.rank === "preferred"))[0]?.mainsnak.datavalue?.value;
  if (!image || /logo|seal|mascot|coat.of.arms|\.svg$/i.test(image) ||
    values("P154").some(row => row.mainsnak.datavalue?.value === image)) return null;
  return commonsMedia(image, identities[0]);
}
export async function commonsMedia(filename: string, identitySource: string): Promise<LogoCandidate | null> {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({ action: "query", format: "json", prop: "imageinfo", iiprop: "url|extmetadata",
    iiurlwidth: "1280", titles: `File:${filename}`,
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Copyrighted|Artist|Restrictions" }).toString();
  const response = await safeFetch(url.href, 300_000, new Set(["commons.wikimedia.org"]));
  if (response.status !== 200) throw new Error(`Source media metadata request failed: HTTP ${response.status}.`);
  const data = JSON.parse(response.body.toString());
  const page = Object.values(data.query?.pages ?? {})[0] as { imageinfo?: { url: string; thumburl?: string; descriptionurl: string; extmetadata: Record<string, { value: string }> }[] } | undefined;
  const info = page?.imageinfo?.[0];
  if (!info) return null;
  const meta = info.extmetadata, author = plain(meta.Artist?.value ?? ""), copyrighted = meta.Copyrighted?.value ?? "";
  const licenseUrl = (meta.LicenseUrl?.value || (copyrighted.toLowerCase() === "false"
    ? "https://commons.wikimedia.org/wiki/Commons:Licensing#Material_in_the_public_domain" : "")).replace(/^http:/, "https:");
  if (!permittedMediaLicense(licenseUrl, copyrighted, author, plain(meta.Restrictions?.value ?? ""))) return null;
  const imageUrl = info.thumburl || info.url;
  if (new URL(imageUrl).hostname !== "upload.wikimedia.org" || new URL(info.descriptionurl).hostname !== "commons.wikimedia.org") return null;
  return { imageUrl, sourceUrl: info.descriptionurl, identitySource, licenseUrl,
    credit: `${filename} · ${author || "Public domain"} · ${plain(meta.LicenseShortName?.value ?? "Public domain")} · Wikimedia Commons`,
    usageNote: "Resized and converted to WebP. No affiliation or endorsement is implied." };
}
export function officialImage(raw: unknown, sourceUrl: string, website: string): LogoCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const image = raw as Record<string, unknown>;
  if (typeof image.license !== "string") return null;
  const creator = image.creator as Record<string, unknown> | string | undefined;
  const author = typeof creator === "string" ? creator : typeof creator?.name === "string" ? creator.name : "";
  const licenseUrl = image.license.replace(/^http:/, "https:");
  const pd = /publicdomain\/(zero|mark)/.test(licenseUrl);
  if (!permittedMediaLicense(licenseUrl, pd ? "false" : "true", author, "")) return null;
  const value = image.contentUrl ?? image.url;
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, sourceUrl);
    if (!officialHost(url.href, website)) return null;
    return { imageUrl: url.href, sourceUrl, identitySource: website, licenseUrl, credit: author || "Official institution media · public domain",
      usageNote: "Resized and converted to WebP. No affiliation or endorsement is implied." };
  } catch { return null; }
}
export async function cacheBrandingMedia(candidate: LogoCandidate, kind: "campus" | "mascot") {
  const [cached] = await db.select().from(institutionLogoAssetsTable)
    .where(eq(institutionLogoAssetsTable.sourceUrl, candidate.imageUrl)).limit(1);
  if (cached && (await logoObject(cached.objectKey).exists())[0]) return cached.hash;
  const response = await safeFetch(candidate.imageUrl, 6_000_000, new Set([new URL(candidate.imageUrl).hostname]));
  if (response.status !== 200) throw new Error(`Source media image failed: HTTP ${response.status}.`);
  const result = await prepareBrandingMedia(response.body, response.type, kind);
  const hash = createHash("sha256").update(result.data).digest("hex"), objectKey = `institution-branding/${hash}.webp`;
  await cacheLogo(objectKey, result.data);
  await db.insert(institutionLogoAssetsTable).values({ hash, objectKey, contentType: "image/webp",
    width: result.info.width, height: result.info.height, byteSize: result.data.length, sourceUrl: candidate.imageUrl,
    licenseUrl: candidate.licenseUrl, credit: candidate.credit }).onConflictDoNothing();
  return hash;
}
export async function prepareBrandingMedia(bytes: Buffer, type: string, kind: "campus" | "mascot") {
  let result;
  if (kind === "mascot") result = await prepareLogoImage(bytes, type);
  else {
    const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
    const avif = bytes.subarray(4, 8).toString() === "ftyp" && ["avif", "avis"].includes(bytes.subarray(8, 12).toString());
    if (!png && !jpeg && !webp && !avif) throw new Error("Source campus image is not a supported photograph.");
    const image = sharp(bytes, { limitInputPixels: 24_000_000, animated: false });
    const meta = await image.metadata();
    if (!["jpeg", "png", "webp", "avif"].includes(meta.format ?? "")) throw new Error("Source campus image is not a supported photograph.");
    result = await image.rotate().resize({ width: 1280, height: 720, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
  }
  if (result.info.width < 32 || result.info.height < 32) throw new Error("Source image is too small.");
  return result;
}
