import { ProviderError, type JobListing, type JobProvider, type JobSearchParams } from "./types";
import { auditAdzunaCredentials, readAdzunaCredentials } from "./adzunaCredentials";

const CURRENCY: Record<string, string> = {
  us: "USD", ca: "CAD", gb: "GBP", au: "AUD", de: "EUR", fr: "EUR", nl: "EUR",
  nz: "NZD", sg: "SGD", at: "EUR", be: "EUR", it: "EUR", es: "EUR", pl: "PLN", br: "BRL", in: "INR", mx: "MXN", za: "ZAR", ch: "CHF",
};

interface AdzunaResult {
  id?: string | number;
  title?: string;
  description?: string;
  redirect_url?: string;
  created?: string;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_is_predicted?: string | number;
  contract_time?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  category?: { label?: string };
}

const stripTags = (value: string) => value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

function normalize(raw: AdzunaResult, countryCode: string, checkedAt: string): JobListing | null {
  if (!raw.title || !raw.redirect_url || raw.id === undefined) return null;
  const description = stripTags(raw.description ?? "");
  return {
    id: `adzuna:${raw.id}`, provider: "adzuna", providerName: "Adzuna",
    title: stripTags(raw.title), employer: raw.company?.display_name ?? null,
    location: raw.location?.display_name ?? null, countryCode: countryCode.toUpperCase(),
    category: raw.category?.label ?? null, contractTime: raw.contract_time ?? null, description,
    salaryMin: raw.salary_min ?? null, salaryMax: raw.salary_max ?? null,
    salaryCurrency: raw.salary_min || raw.salary_max ? CURRENCY[countryCode.toLowerCase()] ?? null : null,
    salaryIsEstimated: String(raw.salary_is_predicted ?? "0") === "1",
    postedAt: raw.created ?? null, applyUrl: raw.redirect_url,
    sponsorship: /\bsponsor/i.test(description) ? "mentioned_unverified" : "not_mentioned",
    lastCheckedAt: checkedAt,
  };
}

export const adzunaProvider: JobProvider = {
  id: "adzuna",
  name: "Adzuna",
  attribution: { text: "Jobs by Adzuna", url: "https://www.adzuna.com" },
  // Adzuna country endpoints. Availability is controlled by Adzuna, not UniPath.
  countries: ["US", "CA", "GB", "AU", "DE", "FR", "NL", "NZ", "SG"],
  isConfigured: () => Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),

  async search(params: JobSearchParams) {
    const credentials = readAdzunaCredentials();
    const audit = auditAdzunaCredentials();
    if (!audit.ADZUNA_APP_ID.present || !audit.ADZUNA_APP_KEY.present) {
      throw new ProviderError("Adzuna is not connected. The site owner must add its API credentials.",
        503, "ADZUNA_NOT_CONFIGURED");
    }
    if (!audit.usableFormat) {
      throw new ProviderError("Adzuna credentials are incorrectly configured. The site owner must save the matching Application ID and Application Key from Adzuna.",
        503, "ADZUNA_CONFIGURATION_ERROR");
    }
    const code = params.countryCode.toLowerCase();
    const query = new URLSearchParams({
      app_id: credentials.appId, app_key: credentials.appKey,
      results_per_page: "20",
    });
    const words = [params.keywords, params.university, params.remote ? "remote" : "",
      params.jobType === "internship" ? "intern internship" : "",
      params.jobType === "graduate" ? "graduate" : ""].filter(Boolean).join(" ").trim();
    if (words) query.set("what", words);
    if (params.city) query.set("where", params.city);
    if (params.category) query.set("category", params.category);
    if (params.salaryMin) query.set("salary_min", String(params.salaryMin));
    if (params.jobType === "part_time") query.set("part_time", "1");
    if (params.jobType === "full_time") query.set("full_time", "1");

    const response = await fetch(`https://api.adzuna.com/v1/api/jobs/${code}/search/${params.page}?${query}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    }).catch(() => {
      throw new ProviderError("Adzuna could not be reached or timed out. Try again shortly.",
        503, "ADZUNA_NETWORK_ERROR", undefined, true);
    });
    if (response.status === 401 || response.status === 403) {
      throw new ProviderError(`Adzuna rejected the configured credentials or account access (upstream HTTP ${response.status}). The site owner must check the application in the Adzuna developer account.`,
        502, "ADZUNA_AUTH_FAILED", response.status);
    }
    if (response.status === 429) {
      throw new ProviderError("Adzuna rate limit reached. Try again shortly.",
        429, "ADZUNA_RATE_LIMITED", 429, true);
    }
    if (response.status >= 500) {
      throw new ProviderError(`Adzuna is temporarily unavailable (upstream HTTP ${response.status}). This response does not establish whether the credentials are valid.`,
        503, "ADZUNA_UNAVAILABLE", response.status, true);
    }
    if (!response.ok) {
      throw new ProviderError(`Adzuna rejected the search request (upstream HTTP ${response.status}). Check the search filters.`,
        502, "ADZUNA_REQUEST_REJECTED", response.status);
    }
    let body: { count?: number; results?: AdzunaResult[] };
    try {
      body = await response.json() as { count?: number; results?: AdzunaResult[] };
      if (!body || !Array.isArray(body.results)) throw new Error("Invalid response");
    } catch {
      throw new ProviderError("Adzuna returned an invalid response. Try again shortly.",
        502, "ADZUNA_INVALID_RESPONSE", response.status, true);
    }
    const checkedAt = new Date().toISOString();
    return {
      listings: (body.results ?? []).map(r => normalize(r, code, checkedAt)).filter((l): l is JobListing => l !== null),
      total: typeof body.count === "number" ? body.count : null,
      page: params.page,
    };
  },
};
