import { Link } from 'wouter';
import { getGetUniversityQueryKey, useGetUniversity } from '@workspace/api-client-react';
import { RefreshCw, X } from 'lucide-react';
import { fmtMoney, fmtUsd } from '@/components/money/currency';
import { tuitionStatusLabel } from './TuitionPanel';

export type Picked = { id: string; name: string };

function Amount({ n, year, rate, currency }: { n: number | null | undefined; year?: number | null; rate: number | null; currency: string }) {
  if (n == null) return <span className="cmp-unknown">Not reported</span>;
  return <>{fmtUsd(n)}{currency !== 'USD' && rate && <small>about {fmtMoney(n * rate, currency)}</small>}{year !== undefined && <small>{year ? `Reported for ${year}` : 'Year not provided'}</small>}</>;
}

function Row({ id, name, rate, currency, onRemove }: { id: string; name: string; rate: number | null; currency: string; onRemove: () => void }) {
  const q = useGetUniversity(id, { query: { queryKey: getGetUniversityQueryKey(id), staleTime: 30_000 } });
  if (q.isLoading) return <tr><td colSpan={6}><div className="skeleton skeleton-line"/></td></tr>;
  if (q.isError || !q.data) return <tr><td>{name}</td><td colSpan={4} className="cmp-unknown">Could not load this record. <button className="fx-retry" onClick={() => void q.refetch()}><RefreshCw size={11}/> Retry</button></td><td><button className="icon-button" onClick={onRemove} aria-label={`Remove ${name}`}><X size={14}/></button></td></tr>;
  const s = q.data; const t = s.tuition;
  return <tr data-testid={`row-compare-${id}`}>
    <td><Link href={`/university/${id}`} className="text-link">{s.name}</Link><small>{tuitionStatusLabel(t)}</small></td>
    <td><Amount n={t?.inStateAmount} year={t?.inStateYear} rate={rate} currency={currency}/></td>
    <td><Amount n={t?.outOfStateAmount} year={t?.outOfStateYear} rate={rate} currency={currency}/><small>Not international tuition</small></td>
    <td><Amount n={t?.internationalAmount} rate={rate} currency={currency}/></td>
    <td><small>Record updated {t?.recordUpdatedAt ? new Date(t.recordUpdatedAt).toLocaleDateString() : new Date(s.lastUpdatedAt).toLocaleDateString()}</small>{t?.sourceUrl && <a className="text-link" href={t.sourceUrl} target="_blank" rel="noreferrer">Source</a>}</td>
    <td><button className="icon-button" onClick={onRemove} aria-label={`Remove ${s.name}`} data-testid={`button-remove-compare-${id}`}><X size={14}/></button></td>
  </tr>;
}

export function ComparePanel({ picked, rate, currency, onRemove }: { picked: Picked[]; rate: number | null; currency: string; onRemove: (id: string) => void }) {
  return <section className="cmp-panel" data-testid="panel-compare">
    <span className="eyebrow">TUITION COMPARISON</span>
    <h2 style={{margin:'4px 0 4px',fontSize:18}}>Side by side, per academic year</h2>
    <p style={{fontSize:12,color:'#5d7081',margin:'0 0 10px'}}>USD figures from the source. Missing means not reported, not free. Out-of-state is not verified international tuition.</p>
    <table className="cmp-table"><thead><tr><th>School</th><th>In-state</th><th>Out-of-state</th><th>International</th><th>Data</th><th/></tr></thead>
      <tbody>{picked.map(p => <Row key={p.id} id={p.id} name={p.name} rate={rate} currency={currency} onRemove={() => onRemove(p.id)}/>)}</tbody></table>
  </section>;
}
