/**
 * Opt-in live diagnostic. Run from this package with:
 * pnpm exec tsx src/scripts/testAdzunaLive.ts
 *
 * ESM + ES2022 support top-level await in this .ts file.
 * Never log request URLs, headers, credentials, or arbitrary exception objects.
 */
import { adzunaProvider } from "../lib/jobProviders/adzuna";
import { ProviderError } from "../lib/jobProviders/types";

const emit = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`);
const credentialsPresent = {
  ADZUNA_APP_ID: Boolean(process.env.ADZUNA_APP_ID),
  ADZUNA_APP_KEY: Boolean(process.env.ADZUNA_APP_KEY),
};
emit({ check: "server_environment", present: credentialsPresent });
if (!adzunaProvider.isConfigured()) {
  emit({ result: "blocked", error: "Required Adzuna secrets are missing." });
  process.exitCode = 1;
} else {
  const originalFetch = globalThis.fetch;
  const responses: Array<{ status: number; exception?: string; display?: string }> = [];
  // Observe the actual provider request without logging its credential-bearing URL.
  globalThis.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    const observation: typeof responses[number] = { status: response.status };
    if (!response.ok) {
      try {
        const body = await response.clone().json() as Record<string, unknown>;
        // Only known safe provider messages; never echo arbitrary response content.
        if (body.exception === "AUTH_FAIL") observation.exception = "AUTH_FAIL";
        if (body.display === "Authorisation failed") observation.display = "Authorisation failed";
      } catch { /* An HTTP status is sufficient for non-JSON failures. */ }
    }
    responses.push(observation);
    return response;
  };
  try {
    const result = await adzunaProvider.search({
      countryCode: "US",
      keywords: "student",
      jobType: "part_time",
      page: 1,
    });
    emit({ check: "real_us_part_time_student_search", responses,
      total: result.total, returned: result.listings.length,
      result: result.listings.length ? "listings_returned" : "no_listings_returned" });
    for (const listing of result.listings.slice(0, 3)) {
      // Application URLs may carry public provider tracking, but must not carry
      // this application's credentials. Do not print a URL if it contains either.
      const safe = [process.env.ADZUNA_APP_ID, process.env.ADZUNA_APP_KEY]
        .every(secret => !secret || !listing.applyUrl.includes(secret));
      emit({ title: listing.title, employer: listing.employer,
        location: listing.location, salaryMin: listing.salaryMin,
        salaryMax: listing.salaryMax, currency: listing.salaryCurrency,
        salaryIsEstimated: listing.salaryIsEstimated,
        postedAt: listing.postedAt,
        applicationUrl: safe ? listing.applyUrl : "[REDACTED]",
        lastCheckedAt: listing.lastCheckedAt });
    }
  } catch (error) {
    emit({ check: "real_us_part_time_student_search", result: "failed", responses,
      error: error instanceof ProviderError ? error.message : "Unexpected provider failure (details suppressed to protect credentials)." });
    process.exitCode = 1;
  } finally {
    globalThis.fetch = originalFetch;
  }
}
