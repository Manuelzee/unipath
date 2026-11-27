import { Link } from 'wouter';
import { getListUniversityProgrammesQueryKey, useListUniversityProgrammes } from '@workspace/api-client-react';
import { ArrowRight } from 'lucide-react';
import { ProgrammeCard } from './ProgrammeCard';
import './programmes.css';

/** Programmes with checked details at one university (the "Programmes" tab). */
export function UniversityProgrammes({ id, name }: { id: string; name: string }) {
  const q = useListUniversityProgrammes(id, { query: { queryKey: getListUniversityProgrammesQueryKey(id), staleTime: 60_000 } });
  return <section className="detail-panel" data-testid="panel-programmes"><span className="eyebrow">PROGRAMMES WITH CHECKED DETAILS</span>
    {q.isLoading ? <div className="skeleton skeleton-card"/>
      : q.isError || !q.data ? <p className="resource-copy">Programmes could not be loaded. <button className="link-button" onClick={() => void q.refetch()}>Try again</button></p>
      : q.data.items.length
        ? <div className="prg-grid prg-grid-compact">{q.data.items.map(p => <ProgrammeCard key={p.id} p={p}/>)}</div>
        : <p className="resource-copy">UniPath has not added programmes with checked details for {name} yet. That does not mean it has none: see the Fields of Study tab and the university's own website.</p>}
    <Link href="/programmes" className="sch-discover-link" data-testid="link-all-programmes">Browse all programmes <ArrowRight size={13}/></Link>
  </section>;
}
