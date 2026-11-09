import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, ExternalLink, Info, PlugZap, Search } from 'lucide-react';
import {
  getGetStudentProfileQueryKey, getListJobApplicationsQueryKey, getListJobProvidersQueryKey, getListSavedUniversitiesQueryKey,
  getSearchJobListingsQueryKey, useCreateJobApplication, useGetStudentProfile, useListJobProviders, useListSavedUniversities, useSearchJobListings,
} from '@workspace/api-client-react';
import type { JobListing, JobProvider, SearchJobListingsParams } from '@workspace/api-client-react';
import { GROUPS } from './CategoriesTab';
import { errorMessage, fmtDate } from './shared';

export const COUNTRY_NAMES: Record<string, string> = { US: 'United States', CA: 'Canada', GB: 'United Kingdom', AU: 'Australia', DE: 'Germany', FR: 'France', NL: 'Netherlands', NZ: 'New Zealand', SG: 'Singapore' };
const cName = (c: string) => COUNTRY_NAMES[c.toUpperCase()] ?? c.toUpperCase();
function matchCountry(v: string | undefined, list: string[]) {
  if (!v) return '';
  const t = v.trim().toLowerCase();
  return list.find(c => c.toLowerCase() === t || cName(c).toLowerCase() === t || (t === 'uk' && c === 'GB') || (t === 'usa' && c === 'US')) ?? '';
}
const status = (e: unknown) => (e as { status?: number } | null)?.status;
const fmtDT = (d: string) => { const x = new Date(d); return isNaN(x.getTime()) ? d : x.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); };
const money = (n: number, cur?: string | null) => { try { return cur ? new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n) : Math.round(n).toLocaleString(); } catch { return `${Math.round(n).toLocaleString()} ${cur}`; } };
function salary(l: JobListing) {
  const a = l.salaryMin ?? null, b = l.salaryMax ?? null;
  if (a == null && b == null) return null;
  const r = a != null && b != null && a !== b ? `${money(a, l.salaryCurrency)} - ${money(b, l.salaryCurrency)}` : money((a ?? b)!, l.salaryCurrency);
  return l.salaryCurrency ? `${r} (${l.salaryCurrency})` : r;
}

function ListingCard({ l, provider, saved, onSaved }: { l: JobListing; provider: JobProvider; saved: boolean; onSaved: () => void }) {
  const qc = useQueryClient();
  const create = useCreateJobApplication();
  const [open, setOpen] = useState(false);
  const sal = salary(l);
  const long = l.description.length > 260;
  const mentions = l.sponsorship === 'mentioned_unverified';
  const save = () => create.mutate({ data: {
    title: l.title.slice(0, 200), employer: (l.employer?.trim() || 'Employer not listed').slice(0, 200), location: l.location?.slice(0, 200) ?? null,
    countryCode: l.countryCode?.toUpperCase().slice(0, 2) || null, sourceUrl: l.applyUrl.slice(0, 1000),
    postedDate: l.postedAt ? l.postedAt.slice(0, 10) : null, sponsorshipClaim: mentions ? 'advertised_unverified' : 'not_stated',
    eligibilityStatus: 'unknown', status: 'saved',
  } }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListJobApplicationsQueryKey() }); onSaved(); } });
  return <li className="sj-card sj-listing" data-testid={`card-listing-${l.id}`}>
    <div className="sj-job-head"><div><strong>{l.title}</strong><span>{l.employer?.trim() || 'Employer not listed'}{l.location ? ` \u00b7 ${l.location}` : ''}</span></div></div>
    <div className="sj-badges">
      {l.category && <span className="sj-chip">{l.category}</span>}
      {l.contractTime && <span className="sj-chip">{l.contractTime.replace(/_/g, ' ')}</span>}
      <span className={`sj-spons ${mentions ? 'sj-sp-advertised_unverified' : 'sj-sp-not_stated'}`} data-testid={`badge-listing-sponsorship-${l.id}`}>{mentions ? 'Mentions sponsorship - unverified' : 'Sponsorship not mentioned'}</span>
    </div>
    <dl className="sj-facts">
      <div><dt>Salary</dt><dd>{sal ? <>{sal}{l.salaryIsEstimated && <em className="sj-est"> estimated by provider</em>}</> : 'Salary not listed'}</dd></div>
      <div><dt>Posted</dt><dd>{l.postedAt ? fmtDate(l.postedAt) : 'Posting date not provided'}</dd></div>
      <div><dt>Last checked</dt><dd>{fmtDT(l.lastCheckedAt)}</dd></div>
    </dl>
    {l.description && <p className="sj-small sj-desc">{open || !long ? l.description : `${l.description.slice(0, 260).trimEnd()}\u2026`}
      {long && <button type="button" className="sj-more" onClick={() => setOpen(o => !o)} data-testid={`button-toggle-description-${l.id}`}>{open ? 'Show less' : 'Show more'}</button>}</p>}
    <p className="sj-visa-line"><AlertTriangle size={13} /> Not checked for student visa work eligibility. Check your own authorization first.</p>
    <div className="sj-actions sj-listing-actions">
      <a href={l.applyUrl} target="_blank" rel="noopener noreferrer" className="button button-primary button-small" data-testid={`link-apply-${l.id}`}>Apply on employer site <ExternalLink size={13} /></a>
      <button type="button" className="button button-outline button-small" disabled={saved || create.isPending} onClick={save} data-testid={`button-save-listing-${l.id}`}>{saved ? <><Check size={13} /> Saved to tracker</> : create.isPending ? 'Saving\u2026' : 'Save to tracker'}</button>
      <a href={provider.attribution.url} target="_blank" rel="noopener noreferrer" className="sj-attr">{provider.attribution.text}</a>
    </div>
    {saved && <p className="sj-ok" role="status">Saved to My tracker with status Saved. Eligibility is marked unknown until you check.</p>}
    {create.isError && <p className="form-error" role="alert">{errorMessage(create.error, 'We couldn\u2019t save this listing. Please try again.')}</p>}
  </li>;
}

type F = { country: string; city: string; university: string; category: string; keywords: string; jobType: string; salaryMin: string; arrangement: string };

function SearchForm({ provider, initial, onSearch }: { provider: JobProvider; initial: F; onSearch: (f: F) => void }) {
  const [f, setF] = useState<F>(initial);
  const [err, setErr] = useState('');
  const set = (k: keyof F) => (e: { target: { value: string } }) => setF(c => ({ ...c, [k]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault(); setErr('');
    if (!f.country) return setErr('Choose a country.');
    if (f.salaryMin && !(Number(f.salaryMin) >= 0)) return setErr('Minimum salary must be a positive number.');
    onSearch(f);
  };
  return <form className="sj-card sj-form" onSubmit={submit} data-testid="form-job-search">
    <h2 className="sj-h2"><Search size={16} /> Search listings</h2>
    <div className="sj-grid">
      <label className="field"><span>Country</span><select value={f.country} onChange={set('country')} required data-testid="input-search-country"><option value="">Choose a country</option>{provider.countries.map(c => <option key={c} value={c.toUpperCase()}>{cName(c)}</option>)}</select></label>
      <label className="field"><span>City (optional)</span><input value={f.city} onChange={set('city')} maxLength={120} placeholder="e.g. Toronto" data-testid="input-search-city" /></label>
      <label className="field"><span>University (optional)</span><input value={f.university} onChange={set('university')} maxLength={160} data-testid="input-search-university" /></label>
      <label className="field"><span>Job category</span><select value={f.category} onChange={e => { const v = e.target.value; setF(c => ({ ...c, category: v, keywords: v || c.keywords })); }} data-testid="select-search-category"><option value="">Any category</option>
        {GROUPS.map(([g, items]) => <optgroup key={g} label={g}>{items.map(i => <option key={i} value={i}>{i}</option>)}</optgroup>)}</select></label>
      <label className="field"><span>Keywords</span><input value={f.keywords} onChange={set('keywords')} maxLength={120} placeholder="e.g. library assistant" data-testid="input-search-keywords" /></label>
      <label className="field"><span>Job type</span><select value={f.jobType} onChange={set('jobType')} data-testid="select-search-job-type"><option value="">Any</option><option value="part_time">Part-time</option><option value="internship">Internship</option><option value="graduate">Graduate</option><option value="full_time">Full-time</option></select></label>
      <label className="field"><span>Minimum salary (yearly, local currency)</span><input type="number" min={0} inputMode="numeric" value={f.salaryMin} onChange={set('salaryMin')} data-testid="input-search-salary-min" /></label>
      <label className="field"><span>Work arrangement</span><select value={f.arrangement} onChange={set('arrangement')} data-testid="select-search-arrangement"><option value="">Any</option><option value="remote">Remote</option></select></label>
    </div>
    <p className="sj-muted">Hybrid and on-site roles can't be filtered with this provider. University and on-campus searches are keyword-based and may not return campus roles; check your school's own job board too.</p>
    {err && <p className="form-error" role="alert">{err}</p>}
    <div className="sj-actions"><button className="button button-primary button-small" data-testid="button-search-jobs"><Search size={14} /> Search jobs</button></div>
  </form>;
}

function Results({ params, provider, setPage }: { params: SearchJobListingsParams; provider: JobProvider; setPage: (p: number) => void }) {
  const q = useSearchJobListings(params, { query: { queryKey: getSearchJobListingsQueryKey(params), retry: false, staleTime: 60_000 } });
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const page = params.page ?? 1;
  if (q.isLoading) return <div className="loading-stack" aria-busy="true"><div className="skeleton skeleton-card" /><div className="skeleton skeleton-card" /><div className="skeleton skeleton-card" /></div>;
  if (q.isError) {
    if (status(q.error) === 503) return <NotConnected />;
    return <div className="state-card" role="alert" data-testid="status-search-error"><h3>{status(q.error) === 429 ? 'Too many searches right now' : 'The job provider did not respond'}</h3><p>{errorMessage(q.error, 'Please try again in a moment.')}</p><button className="button button-primary button-small" onClick={() => void q.refetch()} data-testid="button-retry-search">Try again</button></div>;
  }
  const d = q.data!;
  const prov = d.provider ?? provider;
  const attr = <p className="sj-muted" data-testid="text-provider-attribution"><a className="text-link" href={prov.attribution.url} target="_blank" rel="noopener noreferrer">{prov.attribution.text} <ExternalLink size={12} /></a></p>;
  if (!d.listings.length) return <div className="sj-stack"><div className="state-card" data-testid="status-search-empty"><div className="state-icon"><Search size={22} /></div><h3>{page > 1 ? 'No more listings' : 'No listings found'}</h3><p>Try fewer filters, a broader keyword, or a different city.</p>{page > 1 && <button className="button button-outline button-small" onClick={() => setPage(page - 1)} data-testid="button-search-prev">Previous page</button>}</div>{attr}</div>;
  const hasNext = d.total != null ? page * 20 < d.total && page < 50 : d.listings.length > 0 && page < 50;
  return <div className="sj-stack">
    <div className="sj-row-between"><p className="sj-body" data-testid="text-search-count">{d.total != null ? `${d.total.toLocaleString()} listings reported by ${prov.name}` : `Listings from ${prov.name}`} &middot; page {d.page}</p>{attr}</div>
    <ul className="sj-jobs">{d.listings.map(l => <ListingCard key={l.id} l={l} provider={prov} saved={saved.has(l.id)} onSaved={() => setSaved(s => new Set(s).add(l.id))} />)}</ul>
    <div className="sj-pager"><button className="button button-outline button-small" disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="button-search-prev">Previous</button><span>Page {page}</span><button className="button button-outline button-small" disabled={!hasNext} onClick={() => setPage(page + 1)} data-testid="button-search-next">Next</button></div>
  </div>;
}

function NotConnected() {
  return <div className="state-card" data-testid="status-search-not-connected"><div className="state-icon"><PlugZap size={22} /></div><h3>Job search is not connected yet</h3><p>The site owner needs to add the provider's API credentials. Until then, you can still track jobs you find yourself and read official work-rule sources.</p></div>;
}

export function FindJobsTab() {
  const pq = useListJobProviders({ query: { queryKey: getListJobProvidersQueryKey() } });
  const prof = useGetStudentProfile({ query: { queryKey: getGetStudentProfileQueryKey(), retry: false } });
  const savedU = useListSavedUniversities({ query: { queryKey: getListSavedUniversitiesQueryKey(), retry: false } });
  const [params, setParams] = useState<SearchJobListingsParams | null>(null);
  const provider = useMemo(() => (pq.data ?? []).find(p => p.configured) ?? null, [pq.data]);
  const intro = <div className="sj-honest" data-testid="status-find-note"><Info size={18} /><p><strong>Listings come from a connected job provider, not from UniPath.</strong> They are shown as the provider returns them. None are checked for student visa work eligibility, and sponsorship mentions are unverified.</p></div>;
  if (pq.isLoading || prof.isLoading || savedU.isLoading) return <div className="sj-stack">{intro}<div className="loading-stack"><div className="skeleton skeleton-card" /></div></div>;
  if (pq.isError) return <div className="sj-stack">{intro}{status(pq.error) === 503 ? <NotConnected /> : <div className="state-card"><h3>We couldn't load job providers</h3><p>{errorMessage(pq.error, 'Please try again.')}</p><button className="button button-primary button-small" onClick={() => void pq.refetch()} data-testid="button-retry-providers">Try again</button></div>}</div>;
  if (!provider) return <div className="sj-stack">{intro}<NotConnected /></div>;
  const initial: F = { country: matchCountry(prof.data?.profile?.studyCountry, provider.countries).toUpperCase(), city: '', university: savedU.data?.[0]?.university.name ?? '', category: '', keywords: '', jobType: '', salaryMin: '', arrangement: '' };
  const run = (f: F) => {
    const p: SearchJobListingsParams = { provider: provider.id, country: f.country, page: 1 };
    if (f.city.trim()) p.city = f.city.trim();
    if (f.university.trim()) p.university = f.university.trim();
    if (f.category) p.category = f.category;
    if (f.keywords.trim()) p.keywords = f.keywords.trim();
    if (f.jobType) p.jobType = f.jobType as SearchJobListingsParams['jobType'];
    if (f.salaryMin) p.salaryMin = Number(f.salaryMin);
    if (f.arrangement === 'remote') p.remote = true;
    setParams(p);
  };
  return <div className="sj-stack">
    {intro}
    <SearchForm provider={provider} initial={initial} onSearch={run} />
    {params ? <Results params={params} provider={provider} setPage={pg => { setParams(p => p && { ...p, page: pg }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
      : <div className="state-card" data-testid="status-search-idle"><div className="state-icon"><Search size={22} /></div><h3>Choose a country and search</h3><p>Results appear here with their posting date, salary if listed, and a link to apply on the employer's site.</p></div>}
  </div>;
}
