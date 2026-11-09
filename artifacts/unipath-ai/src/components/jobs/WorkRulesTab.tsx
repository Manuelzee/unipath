import { useState } from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { getGetWorkGuidanceQueryKey, useGetWorkGuidance } from '@workspace/api-client-react';
import { fmtDate } from './shared';

export function WorkRulesTab() {
  const q = useGetWorkGuidance({ query: { queryKey: getGetWorkGuidanceQueryKey() } });
  const [code, setCode] = useState('');
  const countries = q.data?.countries ?? [];
  const current = countries.find(c => c.code === code) ?? countries[0];
  return <div className="sj-stack">
    <div className="sj-warn" role="note" data-testid="status-eligibility-banner"><AlertTriangle size={18} />
      <p><strong>Eligibility depends on your individual authorization.</strong> Confirm with your school's international office or Designated School Official (DSO) before accepting any work. UniPath does not guarantee eligibility, employment, or visa approval, and does not recommend unauthorized work.</p>
    </div>
    {q.isLoading ? <div className="loading-stack"><div className="skeleton skeleton-line" /><div className="skeleton skeleton-card" /></div>
      : q.isError ? <div className="state-card"><h3>We couldn't load official sources</h3><p>Please try again.</p><button className="button button-primary button-small" onClick={() => void q.refetch()} data-testid="button-retry-guidance">Try again</button></div>
      : !current ? <div className="state-card"><h3>No sources available</h3><p>Official sources have not been added yet.</p></div>
      : <>
        <label className="field sj-country"><span>Country</span>
          <select value={current.code} onChange={e => setCode(e.target.value)} data-testid="select-guidance-country">{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
        </label>
        <div className="sj-card">
          <h2 className="sj-h2">Official sources for {current.name}</h2>
          <ul className="sj-sources">{current.sources.map((s, i) => <li key={s.url} data-testid={`row-source-${i}`}>
            <a href={s.url} target="_blank" rel="noopener noreferrer" data-testid={`link-source-${i}`}>{s.title} <ExternalLink size={13} /></a>
            <span>{s.agency}</span>
            <small>Link last checked {fmtDate(s.checkedAt)}</small>
          </li>)}</ul>
          <p className="sj-muted" data-testid="text-guidance-note">{q.data?.note}</p>
        </div>
        {current.topics.length > 0 && <div className="sj-card">
          <h2 className="sj-h2">Topics to look up on these sources</h2>
          <div className="sj-chips">{current.topics.map(t => <span key={t} className="sj-chip" data-testid={`chip-topic-${t.toLowerCase().replace(/\s/g, '-')}`}>{t}</span>)}</div>
          <p className="sj-muted">UniPath does not summarize these rules. Read them on the official pages above.</p>
        </div>}
        {current.contact && <div className="sj-card"><h2 className="sj-h2">Who to ask</h2><p className="sj-body" data-testid="text-guidance-contact">{current.contact}</p></div>}
      </>}
    <p className="sj-muted" data-testid="text-coverage">Covered so far: United States, Canada, United Kingdom, and Australia. Other countries are not yet covered.</p>
  </div>;
}
