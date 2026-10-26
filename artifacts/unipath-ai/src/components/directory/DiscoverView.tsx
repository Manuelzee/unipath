import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/react';
import { useLocation } from 'wouter';
import {
  getGetStudentDashboardQueryKey, getGetUniversityFilterOptionsQueryKey, getListSavedUniversitiesQueryKey, getListUniversitiesQueryKey,
  useGetUniversityFilterOptions, useListSavedUniversities, useListUniversities, useRemoveSavedUniversity, useSaveUniversity,
} from '@workspace/api-client-react';
import type { ListUniversitiesParams, University } from '@workspace/api-client-react';
import { ArrowLeft, ArrowRight, ShieldCheck, X } from 'lucide-react';
import { CoveragePanel } from './CoveragePanel';
import { DiscoverFilters, EMPTY_FILTERS, type DiscoverFilterState } from './DiscoverFilters';
import { SchoolCard } from './SchoolCard';
import { EmptyBlock, ErrorBlock, LoadingBlock } from './StateViews';

const PAGE_SIZE = 24;

export function DiscoverView() {
  const [filters, setFilters] = useState<DiscoverFilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const { isSignedIn } = useUser(); const [, setLocation] = useLocation(); const qc = useQueryClient();
  const options = useGetUniversityFilterOptions({ query: { queryKey: getGetUniversityFilterOptionsQueryKey() } });

  const update = (patch: Partial<DiscoverFilterState>) => { setFilters(f => ({ ...f, ...patch })); setPage(1); };

  // Guard against stale country/region values that no longer exist in current filter options.
  useEffect(() => {
    const o = options.data; if (!o) return;
    setFilters(f => {
      let next = f;
      if (f.countryCode && !o.countries.some(c => c.code === f.countryCode)) next = { ...next, countryCode: '', state: '' };
      if (next.state && !o.regions.some(r => r.countryCode === next.countryCode && r.code === next.state)) next = { ...next, state: '' };
      if (next !== f) setPage(1);
      return next;
    });
  }, [options.data]);

  const params = useMemo<ListUniversitiesParams>(() => {
    const p: ListUniversitiesParams = { page, pageSize: PAGE_SIZE };
    const s = filters.search.trim(); if (s) p.search = s;
    if (filters.countryCode) p.countryCode = filters.countryCode;
    if (filters.countryCode && filters.countryCode !== 'CA' && filters.state) p.state = filters.state;
    const city = filters.city.trim(); if (city) p.city = city;
    if (filters.institutionType) p.institutionType = filters.institutionType;
    if (filters.ownership) p.ownership = filters.ownership;
    if (filters.degreeLevel) p.degreeLevel = filters.degreeLevel;
    if (filters.major) p.major = filters.major;
    if (filters.language) p.language = filters.language;
    if (filters.applicantStatus) p.applicantStatus = filters.applicantStatus;
    if (filters.fundingOnly) p.fundingOnly = true;
    return p;
  }, [filters, page]);

  const results = useListUniversities(params, { query: { queryKey: getListUniversitiesQueryKey(params) } });
  const saved = useListSavedUniversities({ query: { enabled: !!isSignedIn, queryKey: getListSavedUniversitiesQueryKey() } });
  const save = useSaveUniversity(); const remove = useRemoveSavedUniversity();
  const savedIds = new Set((saved.data || []).map(s => s.universityId));
  const pendingId = save.isPending ? save.variables?.data.universityId : remove.isPending ? remove.variables?.universityId : undefined;
  const total = results.data?.total ?? 0; const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const active = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  const clear = () => { setFilters(EMPTY_FILTERS); setPage(1); };

  const toggleSave = (school: University) => {
    if (!isSignedIn) { setLocation('/sign-up'); return; }
    const onSuccess = () => { void qc.invalidateQueries({ queryKey: getListSavedUniversitiesQueryKey() }); void qc.invalidateQueries({ queryKey: getGetStudentDashboardQueryKey() }); };
    if (savedIds.has(school.id)) remove.mutate({ universityId: school.id }, { onSuccess });
    else save.mutate({ data: { universityId: school.id } }, { onSuccess });
  };
  const countryName = options.data?.countries.find(c => c.code === filters.countryCode)?.name;

  return <div className="page page-enter">
    <div className="page-heading"><div><div className="eyebrow">INSTITUTION DIRECTORY</div><h1>Find a place to study.</h1><p>Search imported official institution records by country, region, and what the sources actually report.</p></div></div>
    <div className="data-notice"><ShieldCheck size={17}/><span><strong>Honest about the gaps.</strong> Coverage is partial: U.S. records come from NCES IPEDS, and Canadian records come from a limited government co-op and internship program listing, not a full list of Canadian institutions or an accreditation register. When a source doesn't report a detail, we show it as unknown instead of guessing.</span></div>
    <CoveragePanel/>
    {options.isError && <div className="inline-warning" role="alert">Filter options failed to load. Search still works. <button onClick={() => void options.refetch()} data-testid="button-retry-filters">Retry</button></div>}
    <DiscoverFilters filters={filters} options={options.data} onChange={update}/>
    <div className="results-header"><div><h2>{countryName ? `Institutions in ${countryName}` : 'Institutions'}</h2><p data-testid="text-result-count">{results.isLoading ? 'Searching...' : `${total.toLocaleString()} matching imported records`}</p></div>{active && <button className="clear-filters" onClick={clear} data-testid="button-clear-filters"><X size={13}/> Clear filters</button>}</div>
    {results.isLoading ? <LoadingBlock/> : results.isError ? <ErrorBlock retry={() => void results.refetch()}/> : results.data?.items.length
      ? <div className="school-grid" aria-busy={results.isFetching}>{results.data.items.map(s => <SchoolCard key={s.id} school={s} saved={savedIds.has(s.id)} saving={pendingId === s.id} onSave={() => toggleSave(s)}/>)}</div>
      : <EmptyBlock testId="empty-results" title="No records match these filters" body={filters.language || filters.applicantStatus || filters.fundingOnly ? 'Many sources do not report language, applicant status, or funding. Those schools are unknown here, not excluded by the school itself. Try removing those filters.' : 'Try a broader search or clear your filters to browse every imported record.'} action="Clear search and filters" onAction={clear}/>}
    {total > 0 && <div className="pagination-bar"><button className="button button-outline button-small" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || results.isFetching} data-testid="button-prev-page"><ArrowLeft size={14}/> Previous</button><span>Page {page} of {totalPages}</span><button className="button button-outline button-small" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages || results.isFetching} data-testid="button-next-page">Next <ArrowRight size={14}/></button></div>}
  </div>;
}
