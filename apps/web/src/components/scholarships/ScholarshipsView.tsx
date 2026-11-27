import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  getListScholarshipsQueryKey, useListScholarships,
  type ListScholarshipsLevel, type ListScholarshipsParams, type ListScholarshipsSponsorType,
} from '@workspace/api-client-react';
import { ArrowRight, GraduationCap, RotateCw, Search, ShieldCheck } from 'lucide-react';
import { LEVEL_LABEL, SPONSOR_LABEL, ScholarshipCard } from './ScholarshipCard';
import '@/components/directory/funding-finder.css';
import './scholarships.css';

export function ScholarshipsView() {
  const [country, setCountry] = useState('');
  const [level, setLevel] = useState('');
  const [sponsorType, setSponsorType] = useState('');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 300); return () => clearTimeout(t); }, [search]);
  const params = useMemo<ListScholarshipsParams>(() => ({
    ...(country ? { country } : {}), ...(level ? { level: level as ListScholarshipsLevel } : {}),
    ...(sponsorType ? { sponsorType: sponsorType as ListScholarshipsSponsorType } : {}), ...(term ? { search: term } : {}),
  }), [country, level, sponsorType, term]);
  // The country list comes from the unfiltered request, so it never shrinks while filtering.
  const all = useListScholarships(undefined, { query: { queryKey: getListScholarshipsQueryKey(), staleTime: 300_000 } });
  const q = useListScholarships(params, { query: { queryKey: getListScholarshipsQueryKey(params), staleTime: 300_000 } });
  const filtered = !!(country || level || sponsorType || term);

  return <div className="page page-enter funding-finder" data-testid="page-scholarships">
    <header className="funding-heading">
      <div><div className="eyebrow">SCHOLARSHIPS &amp; SPONSORSHIPS</div><h1>Funding to study abroad, from the people who award it.</h1>
        <p>Government, university and foundation programmes for study outside Africa, each linked to its official page. Use them as leads: amounts, deadlines and who can apply change every year, so always confirm on the sponsor's site.</p></div>
      <div className="funding-heading-mark" aria-hidden="true"><GraduationCap size={24}/><span>OFFICIAL LINKS ONLY</span></div>
    </header>

    <section className="funding-trust-note" aria-label="About this list"><div className="funding-trust-icon"><ShieldCheck size={19}/></div><div>
      <strong>A curated list, not an application service.</strong>
      <p>{all.data?.notice ?? 'Leads to check, not offers.'}{all.data ? ` List reviewed ${new Date(`${all.data.reviewedAt}T00:00:00Z`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}.` : ''}</p>
    </div><Link href="/discover?fundingOnly=true" className="sch-discover-link">Universities with their own awards <ArrowRight size={13}/></Link></section>

    <div className="sch-filters" role="search">
      <label className="sch-search"><Search size={16}/><input value={search} maxLength={100} onChange={e => setSearch(e.target.value)} placeholder="Search by name or sponsor" aria-label="Search scholarships" data-testid="input-scholarship-search"/></label>
      <label className="funding-field"><span>Study destination</span><select value={country} onChange={e => setCountry(e.target.value)} data-testid="select-scholarship-country">
        <option value="">All destinations</option>
        <option value="multi">Several countries</option>
        {all.data?.countries.map(c => <option key={c.code} value={c.code}>{c.name} ({c.count})</option>)}
      </select></label>
      <label className="funding-field"><span>Study level</span><select value={level} onChange={e => setLevel(e.target.value)} data-testid="select-scholarship-level">
        <option value="">Any level</option>{Object.entries(LEVEL_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></label>
      <label className="funding-field"><span>Sponsor</span><select value={sponsorType} onChange={e => setSponsorType(e.target.value)} data-testid="select-scholarship-sponsor">
        <option value="">Any sponsor</option>{Object.entries(SPONSOR_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></label>
    </div>

    {q.isLoading ? <><div className="funding-skeleton-card"/><div className="funding-skeleton-card"/></>
      : q.isError || !q.data ? <section className="funding-state" role="alert"><div className="funding-state-icon"><RotateCw size={20}/></div><h2>Scholarships did not load</h2><p>This is a loading problem, not an empty list.</p><button className="button button-primary button-small" onClick={() => void q.refetch()}>Try again</button></section>
      : <>
        <p className="sch-count" data-testid="text-scholarship-count">{q.data.total} {q.data.total === 1 ? 'programme' : 'programmes'}{filtered ? ' match these filters' : ''}</p>
        {q.data.items.length
          ? <div className="sch-list">{q.data.items.map(program => <ScholarshipCard key={program.id} program={program}/>)}</div>
          : <section className="funding-state"><h2>No programmes match</h2><p>Try another destination or level. This list covers major programmes only; universities also run their own awards, so check each school's funding page.</p><button className="button button-outline button-small" onClick={() => { setCountry(''); setLevel(''); setSponsorType(''); setSearch(''); }} data-testid="button-clear-scholarship-filters">Clear filters</button></section>}
      </>}
    <p className="funding-page-foot"><ShieldCheck size={13}/> UniPath is not affiliated with these sponsors and does not submit applications or guarantee awards.</p>
  </div>;
}
