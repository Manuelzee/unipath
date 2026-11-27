import { Link } from 'wouter';
import { getListUniversityScholarshipsQueryKey, useListUniversityScholarships } from '@workspace/api-client-react';
import { ArrowRight } from 'lucide-react';
import { ScholarshipCard } from './ScholarshipCard';
import '@/components/directory/funding-finder.css';

/** Scholarship and sponsorship programmes for one university and its country. */
export function UniversityScholarships({ id }: { id: string }) {
  const q = useListUniversityScholarships(id, { query: { queryKey: getListUniversityScholarshipsQueryKey(id), staleTime: 300_000 } });
  return <section className="detail-panel" data-testid="panel-scholarships"><span className="eyebrow">SCHOLARSHIPS &amp; SPONSORSHIPS</span>
    {q.isLoading ? <div className="funding-skeleton-card"/>
      : q.isError || !q.data ? <p className="resource-copy">Scholarship programmes could not be loaded. <button className="link-button" onClick={() => void q.refetch()}>Try again</button></p>
      : q.data.items.length
        ? <><div className="sch-list sch-list-compact">{q.data.items.map(p => <ScholarshipCard key={p.id} program={p} scope={p.scope}/>)}</div><p className="metric-footnote">{q.data.notice}</p></>
        : <p className="resource-copy">No programme in UniPath's scholarship list is tied to this university or its country. That does not mean none exist; check the school's own funding page.</p>}
    <Link href="/scholarships" className="sch-discover-link" data-testid="link-all-scholarships">See all scholarships and sponsorships <ArrowRight size={13}/></Link>
  </section>;
}
