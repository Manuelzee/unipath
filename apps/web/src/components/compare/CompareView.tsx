import { Fragment, type ReactNode } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useUser } from '@/lib/auth';
import { Link, useLocation, useSearch } from 'wouter';
import {
  getGetUniversityQueryOptions, getListSavedUniversitiesQueryKey, useListSavedUniversities,
} from '@workspace/api-client-react';
import type { University } from '@workspace/api-client-react';
import { ExternalLink, Plus, RefreshCw, Scale, ShieldCheck, X } from 'lucide-react';
import { fmtMoney, fmtUsd } from '@/components/money/currency';
import { InstitutionLogo } from '@/components/directory/InstitutionLogo';
import { SourceBadge } from '@/components/directory/SchoolCard';
import { formatDate, formatRate, regionName } from '@/components/directory/format';
import { TUITION_LABELS } from '@/components/directory/TuitionQuote';
import { Unknown } from '@/components/directory/StateViews';
import { MAX_COMPARE, PageHeading, compareHref, safeHref } from '@/components/workspace/shared';

type Row = { label: string; render: (u: University) => ReactNode };
const NR = <Unknown>Not reported</Unknown>;
const listOr = (items: string[], max = 6) => items.length
  ? <>{items.slice(0, max).join(', ')}{items.length > max && <small>+{items.length - max} more</small>}</> : NR;
const link = (raw: string | null | undefined, label: string) => {
  const href = safeHref(raw);
  return href ? <a className="ws-link" href={href} target="_blank" rel="noopener noreferrer">{label} <ExternalLink size={11}/></a> : NR;
};

const SECTIONS: Array<{ title: string; rows: Row[] }> = [
  { title: 'OVERVIEW', rows: [
    { label: 'Location', render: u => [u.city, regionName(u.countryCode, u.state), u.country].filter(Boolean).join(', ') || NR },
    { label: 'Institution type', render: u => u.institutionType || NR },
    { label: 'Ownership', render: u => u.ownership || NR },
    { label: 'Degree levels', render: u => listOr(u.degreeLevels) },
    { label: 'Fields of study', render: u => u.majors.length ? <>{u.majors.length} source-reported<small>{u.majors.slice(0, 4).join(', ')}{u.majors.length > 4 ? '…' : ''}</small></> : NR },
    { label: 'Languages listed', render: u => listOr(u.languages) },
    { label: 'Applicant groups listed', render: u => listOr(u.applicantStatuses) },
  ] },
  { title: 'COSTS (PER ACADEMIC YEAR)', rows: [
    { label: 'Tuition', render: u => {
      const quotes = u.tuition?.quotes ?? [];
      if (!quotes.length) return NR;
      return quotes.map(q => <div className="cmp-quote" key={`${q.category}-${q.academicYear}`}>
        <strong>{fmtMoney(q.amount, q.currency)}</strong> · {TUITION_LABELS[q.category as keyof typeof TUITION_LABELS] ?? q.category}
        <small>{q.academicYear} · {q.scope}{q.status === 'outdated' ? ' · outdated figure' : ''}</small>
        {safeHref(q.sourceUrl) && <small><a className="ws-link" href={safeHref(q.sourceUrl)!} target="_blank" rel="noopener noreferrer">{q.sourceName} <ExternalLink size={10}/></a></small>}
      </div>);
    } },
    { label: 'Median debt at completion', render: u => u.medianDebtUsd != null ? <>{fmtUsd(u.medianDebtUsd)}{u.medianDebtYear && <small>Reporting year {u.medianDebtYear}</small>}</> : NR },
  ] },
  { title: 'OUTCOMES (SOURCE-REPORTED)', rows: [
    { label: 'Admission rate', render: u => u.admissionRate != null ? formatRate(u.admissionRate, u.admissionRateYear) : NR },
    { label: 'Completion rate', render: u => u.completionRate != null ? <>{formatRate(u.completionRate, u.completionRateYear)}{u.completionRateType && <small>{u.completionRateType}</small>}</> : NR },
    { label: 'Pell grant recipients', render: u => u.pellGrantRate != null ? formatRate(u.pellGrantRate, u.pellGrantRateYear) : NR },
  ] },
  { title: 'OFFICIAL LINKS', rows: [
    { label: 'Website', render: u => link(u.website, 'Homepage') },
    { label: 'Admissions', render: u => link(u.admissionsWebsite, 'Admissions page') },
    { label: 'Financial aid', render: u => link(u.financialAidWebsite, 'Financial aid page') },
  ] },
  { title: 'DATA & VERIFICATION', rows: [
    { label: 'Source', render: u => <>{u.dataSource}{safeHref(u.sourceUrl) && <small><a className="ws-link" href={safeHref(u.sourceUrl)!} target="_blank" rel="noopener noreferrer">Source page <ExternalLink size={10}/></a></small>}</> },
    { label: 'Reporting period', render: u => u.dataYear || NR },
    { label: 'Record imported', render: u => formatDate(u.lastUpdatedAt) ?? NR },
    { label: 'Independently verified', render: u => u.lastVerifiedAt ? formatDate(u.lastVerifiedAt) : <Unknown>Not independently verified</Unknown> },
  ] },
];

export function CompareView() {
  const search = useSearch(); const [, setLocation] = useLocation();
  const ids = [...new Set(new URLSearchParams(search).getAll('id').filter(Boolean))].slice(0, MAX_COMPARE);
  const setIds = (next: string[]) => setLocation(next.length ? compareHref(next) : '/compare', { replace: true });
  const queries = useQueries({ queries: ids.map(id => ({ ...getGetUniversityQueryOptions(id), staleTime: 30_000 })) });
  const { isSignedIn } = useUser();
  const saved = useListSavedUniversities({ query: { queryKey: getListSavedUniversitiesQueryKey(), enabled: !!isSignedIn } });
  const available = (saved.data ?? []).filter(s => !ids.includes(s.universityId));

  return <div className="page page-enter">
    <PageHeading kicker="COMPARE" title="Side by side."
      body="Source-backed facts with their reporting years and verification dates. Missing means the source didn’t report it, not that it doesn’t exist."
      action={isSignedIn ? <Link href="/saved" className="button button-outline button-small"><Scale size={15}/> From my shortlist</Link> : undefined}/>

    {ids.length > 0 && <div className="cmp-scroll" data-testid="table-compare">
      <table className="cmp-grid">
        <thead><tr><th scope="col"><span className="sr-only">Attribute</span></th>
          {ids.map((id, i) => {
            const q = queries[i];
            return <th scope="col" key={id}>{q?.isLoading ? <div className="skeleton skeleton-line" style={{ width: '80%' }}/> : q?.data ? <div className="cmp-school">
              <div className="ws-row"><InstitutionLogo school={q.data} size="small"/><span className="ws-spacer"/>
                <button className="icon-button" aria-label={`Remove ${q.data.name} from comparison`} onClick={() => setIds(ids.filter(x => x !== id))} data-testid={`button-remove-compare-${id}`}><X size={14}/></button></div>
              <Link href={`/university/${id}`}>{q.data.name}</Link><SourceBadge school={q.data}/></div>
              : <div className="cmp-school"><span className="unknown-value">Couldn’t load this school.</span>
                <div className="ws-row"><button className="ws-link" onClick={() => void q?.refetch()}><RefreshCw size={12}/> Retry</button>
                  <button className="ws-link ws-link-muted" onClick={() => setIds(ids.filter(x => x !== id))}>Remove</button></div></div>}</th>;
          })}</tr></thead>
        <tbody>{SECTIONS.map(section => <Fragment key={section.title}>
          <tr className="cmp-section"><th scope="rowgroup" colSpan={ids.length + 1}>{section.title}</th></tr>
          {section.rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>
            {ids.map((id, i) => <td key={id}>{queries[i]?.data ? row.render(queries[i].data as University) : <span className="unknown-value">—</span>}</td>)}</tr>)}
        </Fragment>)}</tbody>
      </table>
    </div>}

    {ids.length < MAX_COMPARE && <section className="ws-panel" style={{ marginTop: ids.length ? 16 : 0 }}>
      <div className="ws-head"><div><span className="eyebrow">{ids.length ? 'ADD ANOTHER SCHOOL' : 'CHOOSE SCHOOLS'}</span>
        <h2>{ids.length ? `Compare up to ${MAX_COMPARE} schools` : 'Pick schools to compare'}</h2>
        <p>{isSignedIn ? 'Choose from your shortlist, or save more schools from Discover.' : 'Sign in to compare schools from your shortlist, or use the comparison tray in Discover.'}</p></div></div>
      {isSignedIn ? saved.isLoading ? <div className="skeleton skeleton-line"/> : available.length
        ? <div className="cmp-picker">{available.map(s => <button key={s.universityId} className="ws-chip-button" onClick={() => setIds([...ids, s.universityId])} data-testid={`button-add-compare-${s.universityId}`}><Plus size={13}/> {s.university.name}</button>)}</div>
        : <p className="ws-muted">{saved.data?.length ? 'Every school on your shortlist is already in this comparison.' : 'Your shortlist is empty.'} <Link href="/discover" className="text-link" style={{ display: 'inline-flex' }}>Explore schools</Link></p>
        : <div className="ws-row"><Link href="/sign-in" className="button button-primary button-small">Sign in</Link><Link href="/discover" className="button button-outline button-small">Explore schools</Link></div>}
    </section>}

    <div className="ws-notice"><ShieldCheck size={16}/><span>Values come from imported official datasets (partial coverage) and may differ by program, applicant category and year. Compare reporting years and scopes before deciding, and confirm current figures on each institution’s official pages.</span></div>
  </div>;
}
