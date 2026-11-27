import { getGetDirectoryCoverageQueryKey, useGetDirectoryCoverage } from '@workspace/api-client-react';
import { ExternalLink, Globe2 } from 'lucide-react';
import { formatDate } from './format';

const FEATURED = ['US', 'CA'];

export function CoveragePanel() {
  const q = useGetDirectoryCoverage({ query: { queryKey: getGetDirectoryCoverageQueryKey() } });
  if (q.isLoading) return <div className="coverage-panel" aria-busy="true"><div className="skeleton skeleton-line"/><div className="skeleton coverage-skel"/></div>;
  if (q.isError || !q.data) return <div className="coverage-panel coverage-error" role="alert"><span>Country coverage details are unavailable right now.</span><button className="button button-outline button-small" onClick={() => void q.refetch()} data-testid="button-retry-coverage">Retry</button></div>;
  const data = q.data;
  // The U.S. and Canada have their own sources and notes; other countries share
  // one worldwide source, so they are listed compactly with a single note.
  const featured = data.countries.filter(c => FEATURED.includes(c.countryCode));
  const others = data.countries.filter(c => !FEATURED.includes(c.countryCode) && c.institutionCount > 0)
    .sort((a, b) => b.institutionCount - a.institutionCount || a.country.localeCompare(b.country));
  const total = data.countries.reduce((n, c) => n + c.institutionCount, 0);
  return <details className="coverage-panel" data-testid="panel-coverage">
    <summary><Globe2 size={16}/><span><strong>What this directory covers</strong><small>{total ? `${total.toLocaleString()} institutions in ${data.countries.filter(c => c.institutionCount).length} countries: ${featured.map(c => c.country).join(', ')}${others.length ? ` and ${others.length} more outside Africa` : ''} · partial coverage, not independently verified` : 'No countries imported yet'}</small></span></summary>
    <p className="coverage-note">{data.worldwideNote}</p>
    <div className="coverage-grid">{featured.map(c => <div className="coverage-country" key={c.countryCode} data-testid={`coverage-${c.countryCode}`}>
      <div className="coverage-top"><strong>{c.country}</strong><span className="status-pill">{c.status}</span></div>
      <dl><div><dt>Institutions</dt><dd>{c.institutionCount.toLocaleString()}</dd></div><div><dt>Program records</dt><dd>{c.programCount.toLocaleString()}</dd></div><div><dt>Last imported</dt><dd>{formatDate(c.lastImportedAt) || 'Not imported'}</dd></div></dl>
      <p>{c.note}</p>
    </div>)}</div>
    {others.length > 0 && <div className="coverage-world" data-testid="coverage-world"><span className="eyebrow">OTHER COUNTRIES · RESEARCH ORGANIZATION REGISTRY</span>
      <ul>{others.map(c => <li key={c.countryCode} data-testid={`coverage-${c.countryCode}`}>{c.country} <b>{c.institutionCount.toLocaleString()}</b></li>)}</ul>
      <p>Name, city and website for each school. Programs, tuition, admissions and recognition are not supplied; confirm with each school and the country's education ministry. <a href="https://ror.org/" target="_blank" rel="noreferrer">ror.org <ExternalLink size={11}/></a></p>
    </div>}
    {data.references.length > 0 && <div className="coverage-refs"><span className="eyebrow">EXTERNAL REFERENCES · NOT IMPORTED</span>{data.references.map(r => <div className="coverage-ref" key={r.name}><a href={r.url} target="_blank" rel="noreferrer">{r.name} <ExternalLink size={12}/></a><span>{r.access}</span><a href={r.termsUrl} target="_blank" rel="noreferrer" className="terms">Terms</a></div>)}</div>}
  </details>;
}
