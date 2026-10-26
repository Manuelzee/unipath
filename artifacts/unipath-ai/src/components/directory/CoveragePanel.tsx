import { getGetDirectoryCoverageQueryKey, useGetDirectoryCoverage } from '@workspace/api-client-react';
import { ExternalLink, Globe2 } from 'lucide-react';
import { formatDate } from './format';

export function CoveragePanel() {
  const q = useGetDirectoryCoverage({ query: { queryKey: getGetDirectoryCoverageQueryKey() } });
  if (q.isLoading) return <div className="coverage-panel" aria-busy="true"><div className="skeleton skeleton-line"/><div className="skeleton coverage-skel"/></div>;
  if (q.isError || !q.data) return <div className="coverage-panel coverage-error" role="alert"><span>Country coverage details are unavailable right now.</span><button className="button button-outline button-small" onClick={() => void q.refetch()} data-testid="button-retry-coverage">Retry</button></div>;
  const data = q.data;
  return <details className="coverage-panel" data-testid="panel-coverage">
    <summary><Globe2 size={16}/><span><strong>What this directory covers</strong><small>{data.countries.map(c => `${c.country} (partial)`).join(' · ') || 'No countries imported yet'} · global expansion pending licensed sources</small></span></summary>
    <p className="coverage-note">{data.worldwideNote}</p>
    <div className="coverage-grid">{data.countries.map(c => <div className="coverage-country" key={c.countryCode} data-testid={`coverage-${c.countryCode}`}>
      <div className="coverage-top"><strong>{c.country}</strong><span className="status-pill">{c.status}</span></div>
      <dl><div><dt>Institutions</dt><dd>{c.institutionCount.toLocaleString()}</dd></div><div><dt>Program records</dt><dd>{c.programCount.toLocaleString()}</dd></div><div><dt>Last imported</dt><dd>{formatDate(c.lastImportedAt) || 'Not imported'}</dd></div></dl>
      <p>{c.note}</p>
    </div>)}</div>
    {data.references.length > 0 && <div className="coverage-refs"><span className="eyebrow">EXTERNAL REFERENCES · NOT IMPORTED</span>{data.references.map(r => <div className="coverage-ref" key={r.name}><a href={r.url} target="_blank" rel="noreferrer">{r.name} <ExternalLink size={12}/></a><span>{r.access}</span><a href={r.termsUrl} target="_blank" rel="noreferrer" className="terms">Terms</a></div>)}</div>}
  </details>;
}
