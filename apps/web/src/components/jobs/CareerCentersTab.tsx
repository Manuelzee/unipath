import { Link } from 'wouter';
import { ArrowRight, Building2, ExternalLink } from 'lucide-react';
import { getListSavedUniversitiesQueryKey, useListSavedUniversities } from '@workspace/api-client-react';

export function CareerCentersTab() {
  const q = useListSavedUniversities({ query: { queryKey: getListSavedUniversitiesQueryKey() } });
  if (q.isLoading) return <div className="loading-stack"><div className="skeleton skeleton-card" /><div className="skeleton skeleton-card" /></div>;
  if (q.isError) return <div className="state-card"><h3>We couldn't load your saved schools</h3><p>Please try again.</p><button className="button button-primary button-small" onClick={() => void q.refetch()} data-testid="button-retry-careers">Try again</button></div>;
  const list = q.data ?? [];
  if (!list.length) return <div className="state-card"><div className="state-icon"><Building2 size={22} /></div><h3>No saved schools yet</h3><p>Save schools you are considering, and their official websites will appear here as a starting point for career services.</p><Link href="/discover" className="button button-primary button-small" data-testid="link-discover-careers">Explore schools <ArrowRight size={15} /></Link></div>;
  return <div className="sj-stack">
    <p className="sj-body">UniPath has not verified a career-services page for any school. On each official site, look for <strong>Career Services</strong> or <strong>Student Employment</strong>.</p>
    <ul className="sj-schools">{list.map(s => { const site = s.university.website; return <li key={s.universityId} className="sj-card" data-testid={`row-career-${s.universityId}`}>
      <div><strong>{s.university.name}</strong><span className="sj-muted">{s.university.country}</span></div>
      {site ? <a href={/^https?:\/\//.test(site) ? site : `https://${site}`} target="_blank" rel="noopener noreferrer" className="button button-outline button-small" data-testid={`link-school-website-${s.universityId}`}>Official website <ExternalLink size={13} /></a>
        : <span className="sj-muted" data-testid={`text-no-website-${s.universityId}`}>No official website on record</span>}
      <small className="sj-muted">Career-services page not verified by UniPath.</small>
    </li>; })}</ul>
  </div>;
}
