import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  getGetProgrammeFiltersQueryKey, getListProgrammesQueryKey, useGetProgrammeFilters, useListProgrammes,
  type ListProgrammesLevel, type ListProgrammesParams, type ListProgrammesSort,
} from '@workspace/api-client-react';
import { ArrowLeft, ArrowRight, BadgeCheck, GraduationCap, RotateCw, Search } from 'lucide-react';
import { ProgrammeCard } from './ProgrammeCard';
import './programmes.css';

const PAGE_SIZE = 12;

export function ProgrammesView() {
  const url = new URLSearchParams(window.location.search);
  const [search, setSearch] = useState(() => (url.get('search') ?? '').slice(0, 100));
  const [term, setTerm] = useState(search.trim());
  const [country, setCountry] = useState(() => /^[A-Z]{2}$/.test(url.get('country') ?? '') ? url.get('country')! : '');
  const [level, setLevel] = useState('');
  const [field, setField] = useState('');
  const [language, setLanguage] = useState('');
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [sort, setSort] = useState<ListProgrammesSort>('deadline');
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);

  const filters = useGetProgrammeFilters({ query: { queryKey: getGetProgrammeFiltersQueryKey(), staleTime: 60_000 } });
  const params = useMemo<ListProgrammesParams>(() => ({
    page, pageSize: PAGE_SIZE, sort,
    ...(term ? { search: term } : {}), ...(country ? { countryCode: country } : {}),
    ...(level ? { level: level as ListProgrammesLevel } : {}), ...(field ? { field } : {}),
    ...(language ? { language } : {}), ...(confirmedOnly ? { confirmedOnly: true } : {}),
  }), [page, sort, term, country, level, field, language, confirmedOnly]);
  const q = useListProgrammes(params, { query: { queryKey: getListProgrammesQueryKey(params), staleTime: 30_000 } });
  const set = <T,>(setter: (v: T) => void) => (value: T) => { setter(value); setPage(1); };
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / PAGE_SIZE)) : 1;
  const active = !!(term || country || level || field || language || confirmedOnly);
  const clear = () => { setSearch(''); setTerm(''); setCountry(''); setLevel(''); setField(''); setLanguage(''); setConfirmedOnly(false); setPage(1); };
  const f = filters.data;

  return <div className="page page-enter" data-testid="page-programmes">
    <div className="page-heading"><div><div className="eyebrow">PROGRAMMES</div><h1>Compare programmes, not just universities.</h1>
      <p>Tuition, deadlines, entry requirements and the documents each programme asks for, with the date we last checked them and a clear mark when the university itself confirmed them.</p></div></div>

    <div className="prg-search">
      <label className="prg-search-main"><Search size={18}/><input value={search} maxLength={100} onChange={e => setSearch(e.target.value)} placeholder="Search programmes, fields or universities" aria-label="Search programmes" data-testid="input-programme-search"/></label>
      <div className="prg-filter-row">
        <select value={country} onChange={e => set(setCountry)(e.target.value)} aria-label="Country" data-testid="select-programme-country"><option value="">All countries</option>{f?.countries.map(c => <option key={c.value} value={c.value}>{c.label} ({c.count})</option>)}</select>
        <select value={level} onChange={e => set(setLevel)(e.target.value)} aria-label="Level" data-testid="select-programme-level"><option value="">All levels</option>{f?.levels.map(l => <option key={l.value} value={l.value}>{l.label} ({l.count})</option>)}</select>
        <select value={field} onChange={e => set(setField)(e.target.value)} aria-label="Field of study" data-testid="select-programme-field"><option value="">All fields</option>{f?.fields.map(x => <option key={x.value} value={x.value}>{x.label} ({x.count})</option>)}</select>
        <select value={language} onChange={e => set(setLanguage)(e.target.value)} aria-label="Language" data-testid="select-programme-language"><option value="">Any language</option>{f?.languages.map(x => <option key={x.value} value={x.value}>{x.label} ({x.count})</option>)}</select>
      </div>
      <label className="prg-check"><input type="checkbox" checked={confirmedOnly} onChange={e => set(setConfirmedOnly)(e.target.checked)} data-testid="checkbox-confirmed-only"/>
        <span><BadgeCheck size={14}/> Only programmes confirmed by the university{f ? ` (${f.confirmed})` : ''}</span></label>
    </div>

    <div className="results-header"><div><h2>{country && f ? `Programmes in ${f.countries.find(c => c.value === country)?.label ?? country}` : 'Programmes'}</h2>
      <p data-testid="text-programme-count">{q.isLoading ? 'Searching…' : q.isError ? 'Search is unavailable right now.' : `${(q.data?.total ?? 0).toLocaleString()} ${q.data?.total === 1 ? 'programme' : 'programmes'}`}</p></div>
      <label className="sort-control"><span>Sort</span><select value={sort} onChange={e => set(setSort)(e.target.value as ListProgrammesSort)} data-testid="select-programme-sort">
        <option value="deadline">Deadline soonest</option><option value="name">Name (A–Z)</option><option value="updated">Recently checked</option></select></label>
      {active && <button className="clear-filters" onClick={clear} data-testid="button-clear-programme-filters">Clear filters</button>}
    </div>

    {q.isLoading ? <div className="prg-grid">{[0, 1, 2].map(i => <div key={i} className="skeleton skeleton-card" style={{ height: 240 }}/>)}</div>
      : q.isError || !q.data ? <div className="state-card" role="alert"><div className="state-icon warning"><RotateCw size={21}/></div><h3>Programmes did not load</h3><p>This is a loading problem, not an empty list.</p><button className="button button-primary button-small" onClick={() => void q.refetch()}>Try again</button></div>
      : q.data.items.length ? <div className="prg-grid">{q.data.items.map(p => <ProgrammeCard key={p.id} p={p}/>)}</div>
      : <div className="state-card" data-testid="empty-programmes"><div className="state-icon"><GraduationCap size={21}/></div>
          <h3>{f && f.total === 0 ? 'Programmes are being added' : 'No programmes match'}</h3>
          <p>{f && f.total === 0 ? 'We are adding programmes with checked details. Meanwhile, you can search all universities.' : 'Try fewer filters. We are still adding programmes, so a university can have more than shown here.'}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>{active && <button className="button button-outline button-small" onClick={clear}>Clear filters</button>}<Link href="/discover" className="button button-primary button-small">Search universities</Link></div></div>}

    {q.data && q.data.total > PAGE_SIZE && <div className="pagination-bar"><button className="button button-outline button-small" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || q.isFetching}><ArrowLeft size={14}/> Previous</button><span>Page {page} of {pages}</span><button className="button button-outline button-small" onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages || q.isFetching}>Next <ArrowRight size={14}/></button></div>}
  </div>;
}
