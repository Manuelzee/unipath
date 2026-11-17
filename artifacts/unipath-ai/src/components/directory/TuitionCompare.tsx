import { Link } from 'wouter';
import { getGetUniversityQueryKey, useGetUniversity } from '@workspace/api-client-react';
import { RefreshCw, X } from 'lucide-react';
import { tuitionStatusLabel } from './TuitionPanel';
import { QuoteAmount, QuoteSource, TuitionSourceRates } from './TuitionQuote';

export type Picked = { id: string; name: string };

function Row({ id, name, rate, currency, onRemove }: { id: string; name: string; rate: number | null; currency: string; onRemove: () => void }) {
  const q = useGetUniversity(id, { query: { queryKey: getGetUniversityQueryKey(id), staleTime: 30_000 } });
  if (q.isLoading) return <tr><td colSpan={7}><div className="skeleton skeleton-line"/></td></tr>;
  if (q.isError || !q.data) return <tr><td>{name}</td><td colSpan={5} className="cmp-unknown">Could not load this record. <button className="fx-retry" onClick={() => void q.refetch()}><RefreshCw size={11}/> Retry</button></td><td><button className="icon-button" onClick={onRemove} aria-label={`Remove ${name}`}><X size={14}/></button></td></tr>;
  const s = q.data; const t = s.tuition;
  return <tr data-testid={`row-compare-${id}`}>
    <td><Link href={`/university/${id}`} className="text-link">{s.name}</Link><small>{tuitionStatusLabel(t)}</small></td>
    {(['in_state', 'out_of_state', 'domestic', 'international'] as const).map(category =>
      <td key={category}><QuoteAmount quote={t?.quotes?.find(q => q.category === category)} rate={rate} currency={currency}/>
        {category === 'out_of_state' && <small>Not international tuition</small>}</td>)}
    <td><small>Directory updated {new Date(s.lastUpdatedAt).toLocaleDateString()}</small>
      {t?.quotes?.map(quote => <div key={quote.category}><small>{quote.category.replaceAll('_', ' ')}</small><QuoteSource quote={quote}/></div>)}
      <TuitionSourceRates quotes={t?.quotes ?? []} currency={currency}/></td>
    <td><button className="icon-button" onClick={onRemove} aria-label={`Remove ${s.name}`} data-testid={`button-remove-compare-${id}`}><X size={14}/></button></td>
  </tr>;
}

export function ComparePanel({ picked, rate, currency, onRemove }: { picked: Picked[]; rate: number | null; currency: string; onRemove: (id: string) => void }) {
  return <section className="cmp-panel" data-testid="panel-compare">
    <span className="eyebrow">TUITION COMPARISON</span>
    <h2 style={{margin:'4px 0 4px',fontSize:18}}>Side by side, per academic year</h2>
    <p style={{fontSize:12,color:'#5d7081',margin:'0 0 10px'}}>Original source currencies and indicative conversions. Compare academic years and scopes: tuition-only averages, tuition with fees and arts-program figures are not equivalent quotes. Missing means not reported, not free. U.S. out-of-state is not international tuition.</p>
    <table className="cmp-table"><thead><tr><th>School</th><th>U.S. in-state</th><th>U.S. out-of-state</th><th>Domestic</th><th>International</th><th>Data</th><th/></tr></thead>
      <tbody>{picked.map(p => <Row key={p.id} id={p.id} name={p.name} rate={rate} currency={currency} onRemove={() => onRemove(p.id)}/>)}</tbody></table>
  </section>;
}
