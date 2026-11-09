/** Normalized listing shape every job provider must return. */
export interface JobListing {
  id: string;
  provider: string;
  providerName: string;
  title: string;
  employer: string | null;
  location: string | null;
  countryCode: string;
  category: string | null;
  contractTime: string | null;
  description: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryIsEstimated: boolean;
  postedAt: string | null;
  applyUrl: string;
  /** Always "unverified": no provider data confirms sponsorship. */
  sponsorship: "mentioned_unverified" | "not_mentioned";
  lastCheckedAt: string;
}

export interface JobSearchParams {
  countryCode: string;
  keywords?: string;
  city?: string;
  university?: string;
  category?: string;
  salaryMin?: number;
  jobType?: "part_time" | "full_time" | "internship" | "graduate";
  remote?: boolean;
  page: number;
}

export interface JobSearchResult {
  listings: JobListing[];
  total: number | null;
  page: number;
}

export interface JobProvider {
  id: string;
  name: string;
  attribution: { text: string; url: string };
  countries: readonly string[];
  isConfigured(): boolean;
  search(params: JobSearchParams): Promise<JobSearchResult>;
}

export class ProviderError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}
