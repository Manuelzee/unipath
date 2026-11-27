import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@/lib/auth';
import { useLocation } from 'wouter';
import {
  getGetStudentDashboardQueryKey, getGetUniversityFilterOptionsQueryKey, getListSavedUniversitiesQueryKey, getListUniversitiesQueryKey,
  useGetUniversityFilterOptions, useListSavedUniversities, useListUniversities, useRemoveSavedUniversity, useSaveUniversity,
} from '@workspace/api-client-react';
import type { ListUniversitiesParams, University } from '@workspace/api-client-react';
import { ArrowLeft, ArrowRight, Scale, ShieldCheck, X } from 'lucide-react';
import { CurrencySelect, budgetLabel } from '@/components/profile/PreferenceFields';
import { RateNote, usePreferredCurrency, useUsdRate } from '@/components/money/currency';
import { ComparePanel, type Picked } from './TuitionCompare';
import { compareHref } from '@/components/workspace/shared';
import { CoveragePanel } from './CoveragePanel';
import { DiscoverFilters, EMPTY_FILTERS, type DiscoverFilterState } from './DiscoverFilters';
import { SchoolCard } from './SchoolCard';
import { getGetInstitutionBrandingCoverageQueryKey, getGetInstitutionLogoCoverageQueryKey, useGetInstitutionBrandingCoverage, useGetInstitutionLogoCoverage } from '@workspace/api-client-react';
import './InstitutionBranding.css';
import { EmptyBlock, ErrorBlock, LoadingBlock } from './StateViews';

const PAGE_SIZE = 24;

export function DiscoverView() {
  const logoCoverage = useGetInstitutionLogoCoverage({ query: { queryKey: getGetInstitutionLogoCoverageQueryKey(), staleTime: 30_000, refetchInterval: 60_000 } });
  const branding = useGetInstitutionBrandingCoverage({ query: { queryKey: getGetInstitutionBrandingCoverageQueryKey(), staleTime: 30_000, refetchInterval: 60_000 } });
  const [filters, setFilters] = useState<DiscoverFilterState>(() => {
    const url = new URLSearchParams(window.location.search);
    const country = url.get('country')?.toUpperCase();
    return { ...EMPTY_FILTERS, fundingOnly: url.get('fundingOnly') === 'true', countryCode: country && /^[A-Z]{2}$/.test(country) ? country : '' };
  });
  const [page, setPage] = useState(1);
  const [maxTuition, setMaxTuition] = useState(''); const [tuitionCurrency, setTuitionCurrency, savedBudget] = usePreferredCurrency(); const [applyMsg, setApplyMsg] = useState('');
  const [tuitionRate, setTuitionRate] = useState<'in_state' | 'out_of_state' | 'domestic' | 'international'>('out_of_state');
  const [picked, setPicked] = useState<Picked[]>([]); const [showCompare, setShowCompare] = useState(false);
  const fx = useUsdRate(tuitionCurrency);
  const maxTrim = maxTuition.trim(); const maxNum = maxTrim === '' ? null : Number(maxTrim);
  const maxInvalid = maxNum != null && (!Number.isFinite(maxNum) || maxNum < 0 || maxNum > 1_000_000_000_000);
  const budgetActive = maxNum != null && !maxInvalid;
  // Native-currency filters need no FX. The server verifies every cross rate
  // against the actual source currencies and returns an explicit error if needed.
  const searchBlocked = maxInvalid;
  const CEIL: Record<string, number> = { under_5000: 5000, '5000_10000': 10000, '10000_20000': 20000, '20000_35000': 35000, '35000_50000': 50000 };
  const applySaved = () => {
    const b = savedBudget; if (!b) return;
    if (b.budgetScope === 'total') { setApplyMsg('Your saved budget covers total cost, so it cannot be used as a tuition-only maximum. Enter a tuition amount yourself.'); return; }
    const ceil = b.budgetChoice === 'custom' ? b.customBudget : CEIL[b.budgetChoice];
    if (ceil == null) { setApplyMsg(`"${budgetLabel(b.budgetChoice, b.budgetCurrency)}" has no upper limit, so it cannot be applied as a maximum.`); return; }
    setMaxTuition(String(ceil)); setTuitionCurrency(b.budgetCurrency); setPage(1);
    setApplyMsg(`Applied ${budgetLabel(b.budgetChoice, b.budgetCurrency)}${b.budgetChoice === 'custom' ? '' : ' (using its upper limit)'} as a tuition maximum.`);
  };
  const togglePick = (s: University) => setPicked(p => p.some(x => x.id === s.id) ? p.filter(x => x.id !== s.id) : p.length >= 4 ? p : [...p, { id: s.id, name: s.name }]);
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
    if (budgetActive) { p.maxAnnualTuition = maxNum as number; p.tuitionCurrency = tuitionCurrency; p.tuitionRate = tuitionRate; }
    return p;
  }, [filters, page, budgetActive, maxNum, tuitionCurrency, tuitionRate]);

  const results = useListUniversities(params, { query: { queryKey: getListUniversitiesQueryKey(params), enabled: !searchBlocked, staleTime: 30_000, refetchInterval: 60_000 } });
  const saved = useListSavedUniversities({ query: { enabled: !!isSignedIn, queryKey: getListSavedUniversitiesQueryKey() } });
  const save = useSaveUniversity(); const remove = useRemoveSavedUniversity();
  const savedIds = new Set((saved.data || []).map(s => s.universityId));
  const pendingId = save.isPending ? save.variables?.data.universityId : remove.isPending ? remove.variables?.universityId : undefined;
  const total = results.data?.total ?? 0; const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const active = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS) || maxTrim !== '';
  const clear = () => { setFilters(EMPTY_FILTERS); setMaxTuition(''); setPage(1); };

  const toggleSave = (school: University) => {
    if (!isSignedIn) { setLocation('/sign-up'); return; }
    const onSuccess = () => { void qc.invalidateQueries({ queryKey: getListSavedUniversitiesQueryKey() }); void qc.invalidateQueries({ queryKey: getGetStudentDashboardQueryKey() }); };
    if (savedIds.has(school.id)) remove.mutate({ universityId: school.id }, { onSuccess });
    else save.mutate({ data: { universityId: school.id } }, { onSuccess });
  };
  const countryName = options.data?.countries.find(c => c.code === filters.countryCode)?.name;

  return <div className="page page-enter">
    <div className="page-heading"><div><div className="eyebrow">INSTITUTION DIRECTORY</div><h1>Find a place to study.</h1><p>Search imported official institution records by country, region, and what the sources actually report.</p></div></div>
    <div className="data-notice"><ShieldCheck size={17}/><span><strong>Honest about the gaps.</strong> U.S. records come from NCES IPEDS. Universities in more than 150 other countries (outside Africa) come from the Research Organization Registry, which lists names, cities and websites only. Canada also has a pilot from a government co-op and internship listing. None of these is an accreditation register. When a source doesn't report a detail, we show it as unknown instead of guessing.</span></div>
    <CoveragePanel/>
    <p className="logo-coverage-note">{logoCoverage.data
      ? `${logoCoverage.data.rows.filter(row => row.status === 'verified').reduce((sum, row) => sum + row.count, 0).toLocaleString()} verified logos · Checks attempted for ${logoCoverage.data.rows.filter(row => row.status !== 'not_checked').reduce((sum, row) => sum + row.count, 0).toLocaleString()} institutions. Other schools use name placeholders; a placeholder is not an official logo.`
      : logoCoverage.isError ? 'Logo verification counts could not be loaded. Unavailable images use name placeholders.'
      : 'Institution logos are shown only after identity and reuse checks. Other schools use name placeholders.'}</p>
    <div className="brand-coverage" data-testid="text-branding-coverage" aria-live="polite">{branding.data ? <>
      <span>Verified branding of <b>{branding.data.total.toLocaleString()}</b> records:</span>
      <span><b>{branding.data.logos.toLocaleString()}</b> logos</span><span><b>{branding.data.colors.toLocaleString()}</b> color sets</span>
      <span><b>{branding.data.mascots.toLocaleString()}</b> mascot names</span><span><b>{branding.data.mascotImages.toLocaleString()}</b> mascot images</span>
      <span><b>{branding.data.campusImages.toLocaleString()}</b> campus photos</span><span>({branding.data.attempted.toLocaleString()} checked)</span>
      <span>Coverage is incomplete; missing branding means not yet verified, not absent. {branding.data.note}</span>
    </> : branding.isError ? <span>Branding coverage counts could not be loaded. This is not a zero count.</span> : <span>Loading branding coverage counts...</span>}</div>
    {options.isError && <div className="inline-warning" role="alert">Filter options could not be loaded. Institution data may be temporarily unavailable. <button onClick={() => void options.refetch()} data-testid="button-retry-filters">Retry</button></div>}
    <DiscoverFilters filters={filters} options={options.data} onChange={update}/>
    <div className="tu-filter" data-testid="panel-tuition-filter">
      <div className="tu-filter-head"><strong>Annual tuition budget (optional)</strong><span style={{fontSize:11,color:'#687b8c'}}>Leave blank to include every school</span>{savedBudget && savedBudget.budgetChoice !== 'none' && <button type="button" className="pref-skip" onClick={applySaved} data-testid="button-apply-saved-budget">Apply my saved budget</button>}</div>
      {applyMsg && <p className="fx-note" role="status" data-testid="text-apply-budget">{applyMsg}</p>}
      <div className="tu-filter-grid">
        <label>MAXIMUM PER YEAR<input inputMode="decimal" value={maxTuition} onChange={e => { setMaxTuition(e.target.value); setPage(1); }} placeholder="e.g. 25000" aria-invalid={maxInvalid} data-testid="input-max-tuition"/></label>
        <label>CURRENCY<CurrencySelect value={tuitionCurrency} onChange={v => { setTuitionCurrency(v); setPage(1); }} testId="select-tuition-currency"/></label>
        <label>COMPARE AGAINST<select value={tuitionRate} onChange={e => { setTuitionRate(e.target.value as typeof tuitionRate); setPage(1); }} data-testid="select-tuition-rate"><option value="out_of_state">U.S. out-of-state (not international)</option><option value="in_state">U.S. in-state</option><option value="domestic">Domestic (B.C. arts programs)</option><option value="international">International (B.C. arts programs)</option></select></label>
      </div>
      {maxInvalid && <p className="tu-error" role="alert">Enter a number from 0 to 1,000,000,000,000. Search is paused until this is corrected.</p>}
      <RateNote currency={tuitionCurrency}/>
      <p className="filter-footnote" style={{marginTop:8}}>{budgetActive ? 'Only schools with a source-reported, year-labelled figure for this category are shown. Historical figures can match: this is not a current-price affordability guarantee. Schools with unknown tuition are left out, not judged unaffordable.' : 'Tuition coverage is partial. Many schools have no imported figure.'} U.S. out-of-state is not international tuition. Non-U.S. coverage is limited to matched B.C. institutions and annual arts-program figures; other programs and countries remain unknown. Read the scope, included fees and academic year before comparing.</p>
    </div>
    <div className="results-header"><div><h2>{countryName ? `Institutions in ${countryName}` : 'Institutions'}</h2><p data-testid="text-result-count">{searchBlocked ? 'Search paused — no budget-filtered result is available.' : results.isLoading ? 'Searching...' : results.isError ? 'Institution search is unavailable—not a zero-record result.' : `${total.toLocaleString()} matching imported records`}</p></div>{active && <button className="clear-filters" onClick={clear} data-testid="button-clear-filters"><X size={13}/> Clear filters</button>}</div>
    {searchBlocked ? <p className="tu-warn" role="status">Correct the budget before viewing matching schools. Unfiltered schools are not presented as budget matches.</p> : results.isLoading ? <LoadingBlock/> : results.isError ? <ErrorBlock retry={() => void results.refetch()} title="Institution search couldn’t load" body="We could not apply this search. If a currency rate is unavailable, retry, choose the source currency, or clear the budget. This is not a confirmed zero-results search."/> : results.data?.items.length
      ? <div className="school-grid" aria-busy={results.isFetching}>{results.data.items.map(s => { const on = picked.some(x => x.id === s.id); return <div key={s.id} className="cmp-card-wrap"><SchoolCard school={s} saved={savedIds.has(s.id)} saving={pendingId === s.id} onSave={() => toggleSave(s)}/><button className={'cmp-pick' + (on ? ' is-on' : '')} disabled={!on && picked.length >= 4} onClick={() => togglePick(s)} aria-pressed={on} data-testid={`button-compare-${s.id}`}><Scale size={13}/> {on ? 'Selected to compare' : picked.length >= 4 ? 'Compare limit reached (4)' : 'Compare tuition'}</button></div>; })}</div>
      : <EmptyBlock testId="empty-results" title="No records match these filters" body={budgetActive ? 'No school has a source-reported tuition figure for this rate within your budget. Unknown tuition is excluded, so this does not mean no school is affordable. Try another rate or clear the budget.' : filters.language || filters.applicantStatus || filters.fundingOnly ? 'Many sources do not report language, applicant status, or funding. Those schools are unknown here, not excluded by the school itself. Try removing those filters.' : 'Try a broader search or clear your filters to browse every imported record.'} action="Clear search and filters" onAction={clear}/>}
    {!searchBlocked && !results.isError && total > 0 && <div className="pagination-bar"><button className="button button-outline button-small" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || results.isFetching} data-testid="button-prev-page"><ArrowLeft size={14}/> Previous</button><span>Page {page} of {totalPages}</span><button className="button button-outline button-small" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages || results.isFetching} data-testid="button-next-page">Next <ArrowRight size={14}/></button></div>}
    {picked.length > 0 && <div className="cmp-tray" data-testid="tray-compare"><strong style={{fontSize:13}}>{picked.length} of 4 selected</strong>{picked.map(p => <span key={p.id} className="cmp-chip">{p.name}<button onClick={() => setPicked(x => x.filter(y => y.id !== p.id))} aria-label={`Remove ${p.name}`} data-testid={`button-unpick-${p.id}`}><X size={12}/></button></span>)}
      <div className="cmp-actions"><button className="button button-light button-small" disabled={picked.length < 2} onClick={() => setShowCompare(v => !v)} data-testid="button-open-compare">{picked.length < 2 ? 'Pick at least 2' : showCompare ? 'Hide comparison' : 'Compare tuition'}</button><button className="button button-light button-small" disabled={picked.length < 2} onClick={() => setLocation(compareHref(picked.map(p => p.id)))} data-testid="button-open-full-compare">Full comparison</button><button className="button button-outline button-small" style={{color:'#eef3f6'}} onClick={() => { setPicked([]); setShowCompare(false); }} data-testid="button-clear-compare">Clear</button></div></div>}
    {showCompare && picked.length >= 2 && <ComparePanel picked={picked} rate={fx.rate} currency={tuitionCurrency} onRemove={id => setPicked(x => x.filter(y => y.id !== id))}/>}
  </div>;
}
