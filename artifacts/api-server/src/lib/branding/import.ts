import { and, asc, eq, ne } from "drizzle-orm";
import { db, institutionDirectoryTable as table, type InstitutionDirectoryRecord } from "@workspace/db";
import { campusCandidate, cacheBrandingMedia, officialImage, imageSourcesPausedUntil } from "./media";
import { curatedColors, curatedMascot, explicitColors, institutionMetadata, metadataMascot, officialLinks, officialPage, sourceFor } from "./official";
import { refreshBrandingStatus } from "./manifest";
import type { LogoCandidate } from "../logos/discovery";
const safeError = (caught: unknown) => caught instanceof Error && /^(Source |SVG |Logo )/.test(caught.message)
  ? caught.message.slice(0, 180) : "Branding source/image validation or storage failed; existing verified fields preserved.";

async function setVerified(school: InstitutionDirectoryRecord, status: "colorsVerificationStatus" | "mascotVerificationStatus" | "mascotImageVerificationStatus" | "campusImageVerificationStatus", values: Partial<typeof table.$inferInsert>) {
  return (await db.update(table).set({ ...values, [status]: "verified", brandingLastVerifiedAt: new Date() })
    .where(and(eq(table.id, school.id), ne(table[status], "verified"))).returning({ id: table.id })).length;
}
export async function runBrandingDiscovery(options: { limit: number; id?: string; recheck?: boolean }) {
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 1000) throw new Error("Branding limit must be 1–1000.");
  const all = await db.select().from(table).where(eq(table.isActive, true)).orderBy(asc(table.id));
  const schools = all.filter(row => (!options.id || row.id === options.id) && (options.recheck || !row.brandingLastCheckedAt ||
    Date.now() - row.brandingLastCheckedAt.getTime() > (row.brandingLastError === "Image checks deferred by source cooldown."
      ? 3600_000 : (row.brandingLastError ? 1 : 30) * 86400_000)))
    .sort((a, b) => Number(!!sourceFor(b)) - Number(!!sourceFor(a)) ||
      Number(b.logoVerificationStatus === "verified") - Number(a.logoVerificationStatus === "verified")).slice(0, options.limit);
  const report = { attempted: 0, colors: 0, mascots: 0, mascotImages: 0, campusImages: 0, errors: 0 };
  for (const school of schools) {
    report.attempted++;
    let error: string | null = null;
    let imagesDeferred = false;
    let mascotImage: LogoCandidate | null = null, campusImage: LogoCandidate | null = null;
    try {
      if (school.website) {
        try {
        const curated = sourceFor(school);
        if (curated) {
          if (school.colorsVerificationStatus !== "verified") {
            const page = await officialPage(curated.colorsUrl, school.website);
            const colors = curatedColors(page.html, curated.primaryLabel, curated.secondaryLabel);
            if (colors) report.colors += await setVerified(school, "colorsVerificationStatus", {
              ...colors, colorsSourceUrl: page.url, colorsUsageNote: curated.usageNote, colorsLastVerifiedAt: new Date() });
          }
          if (school.mascotVerificationStatus !== "verified") {
            const page = await officialPage(curated.mascotUrl, school.website), name = curatedMascot(page.html, curated.mascotName);
            if (name) report.mascots += await setVerified(school, "mascotVerificationStatus", {
              mascotName: name, mascotSourceUrl: page.url, mascotLastVerifiedAt: new Date() });
          }
          if (school.mascotImageVerificationStatus !== "verified") await db.update(table).set({
            mascotImageVerificationStatus: "review_required", mascotImageSourceUrl: curated.imagePolicyUrl,
          }).where(and(eq(table.id, school.id), ne(table.mascotImageVerificationStatus, "verified")));
        } else if (school.colorsVerificationStatus !== "verified" || school.mascotVerificationStatus !== "verified" ||
          school.mascotImageVerificationStatus !== "verified" || school.campusImageVerificationStatus !== "verified") {
          const homepage = await officialPage(school.website.replace(/^http:/, "https:"), school.website);
          let pages = [homepage];
          const guide = officialLinks(homepage.html, homepage.url, school.website, /brand(?:ing)?|visual.identity/i)[0];
          if (guide) {
            const page = await officialPage(guide, school.website); pages.push(page);
            const colorPage = officialLinks(page.html, page.url, school.website, /colou?rs|palette/i)[0];
            if (colorPage && colorPage !== guide) pages.push(await officialPage(colorPage, school.website));
          }
          const mascotPage = officialLinks(homepage.html, homepage.url, school.website, /\bmascot\b|\btraditions\b/i)[0];
          if (mascotPage && !pages.some(page => page.url === mascotPage)) pages.push(await officialPage(mascotPage, school.website));
          for (const page of pages) {
            const meta = institutionMetadata(page.html, school.name);
            const colors = explicitColors(page.html, school.name), mascot = metadataMascot(meta);
            if (colors) report.colors += await setVerified(school, "colorsVerificationStatus", { ...colors,
              colorsSourceUrl: page.url, colorsLastVerifiedAt: new Date(), colorsUsageNote: "Exact values from explicitly labelled official brand metadata. No endorsement implied." });
            if (mascot) report.mascots += await setVerified(school, "mascotVerificationStatus", {
              mascotName: mascot, mascotSourceUrl: page.url, mascotLastVerifiedAt: new Date() });
            if (meta?.mascot && typeof meta.mascot === "object") mascotImage ??= officialImage((meta.mascot as Record<string, unknown>).image, page.url, school.website);
            campusImage ??= officialImage(meta?.campusImage, page.url, school.website);
          }
        }
        } catch (caught) { error = safeError(caught); report.errors++; }
        const pause = await imageSourcesPausedUntil();
        imagesDeferred = !!pause && pause.getTime() > Date.now();
        if (imagesDeferred && !error) error = "Image checks deferred by source cooldown.";
        if (!pause || pause.getTime() <= Date.now()) {
          if (school.campusImageVerificationStatus !== "verified") {
            campusImage ??= await campusCandidate(school);
            if (campusImage) {
              const hash = await cacheBrandingMedia(campusImage, "campus");
              report.campusImages += await setVerified(school, "campusImageVerificationStatus", {
                campusImageUrl: campusImage.imageUrl, campusImageAssetHash: hash, campusImageSourceUrl: campusImage.sourceUrl,
                campusImageLicenseUrl: campusImage.licenseUrl, campusImageCredit: campusImage.credit, campusImageLastVerifiedAt: new Date() });
            }
          }
          if (mascotImage && school.mascotImageVerificationStatus !== "verified") {
            const [current] = await db.select({ status: table.mascotVerificationStatus }).from(table).where(eq(table.id, school.id));
            if (current.status === "verified") {
              const hash = await cacheBrandingMedia(mascotImage, "mascot");
              report.mascotImages += await setVerified(school, "mascotImageVerificationStatus", {
                mascotImageUrl: mascotImage.imageUrl, mascotImageAssetHash: hash, mascotImageSourceUrl: mascotImage.sourceUrl,
                mascotImageLicenseUrl: mascotImage.licenseUrl, mascotImageCredit: mascotImage.credit });
            }
          }
        }
      }
    } catch (caught) {
      error = safeError(caught);
      report.errors++;
    }
    for (const status of ["colorsVerificationStatus", "mascotVerificationStatus", "mascotImageVerificationStatus", "campusImageVerificationStatus"] as const) {
      if (imagesDeferred && (status === "mascotImageVerificationStatus" || status === "campusImageVerificationStatus")) continue;
      await db.update(table).set({ [status]: error ? "error" : "not_found" })
        .where(and(eq(table.id, school.id), ne(table[status], "verified"), ne(table[status], "review_required")));
    }
    await db.update(table).set({ brandingLastCheckedAt: new Date(), brandingLastError: error }).where(eq(table.id, school.id));
    console.log(JSON.stringify({ id: school.id, error }));
    if (error?.includes("HTTP 429")) break;
    await new Promise(resolve => setTimeout(resolve, 1200));
  }
  await refreshBrandingStatus();
  return report;
}
