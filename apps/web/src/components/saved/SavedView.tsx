import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import {
  getGetStudentDashboardQueryKey, getListApplicationsQueryKey, getListSavedUniversitiesQueryKey,
  useListApplications, useListSavedUniversities, useRemoveSavedUniversity,
} from '@workspace/api-client-react';
import { ArrowRight, Bookmark, ClipboardList, Compass, Scale, Trash2, X } from 'lucide-react';
import { InstitutionLogo } from '@/components/directory/InstitutionLogo';
import { SourceBadge } from '@/components/directory/SchoolCard';
import { schoolLocation } from '@/components/directory/format';
import { tuitionStatusLabel } from '@/components/directory/TuitionPanel';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/components/directory/StateViews';
import { MAX_COMPARE, PageHeading, StatusPill, cn, compareHref } from '@/components/workspace/shared';


export function SavedView() {
  const saved = useListSavedUniversities({ query: { queryKey: getListSavedUniversitiesQueryKey() } });
  const apps = useListApplications({ query: { queryKey: getListApplicationsQueryKey() } });
  const remove = useRemoveSavedUniversity(); const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : p.length >= MAX_COMPARE ? p : [...p, id]);
  const unsave = (id: string) => remove.mutate({ universityId: id }, { onSuccess: () => {
    setPicked(p => p.filter(x => x !== id));
    void qc.invalidateQueries({ queryKey: getListSavedUniversitiesQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetStudentDashboardQueryKey() });
  } });

  const list = saved.data ?? [];
  return <div className="page page-enter">
    <PageHeading kicker="DISCOVER · SAVE · COMPARE" title="Your shortlist."
      body="Schools you saved while exploring. Compare up to four side by side, or start tracking an application."
      action={<Link href="/discover" className="button button-outline button-small"><Compass size={15}/> Find more schools</Link>}/>

    {saved.isLoading ? <LoadingBlock/> : saved.isError ? <ErrorBlock retry={() => void saved.refetch()}/> : !list.length ? (
      <EmptyBlock testId="empty-shortlist" title="Your shortlist starts here" body="Save schools that catch your eye in Discover or Matches, and they will appear here." action="Explore schools" onAction={() => setLocation('/discover')}/>
    ) : <>
      <div className="saved-grid">
        {list.map(entry => {
          const u = entry.university;
          const tracking = (apps.data ?? []).filter(a => a.universityId === entry.universityId);
          const isPicked = picked.includes(entry.universityId);
          return <article key={entry.universityId} className={cn('saved-card', isPicked && 'is-picked')} data-testid={`card-saved-${entry.universityId}`}>
            <div className="saved-card-top"><InstitutionLogo school={u} size="small" className="saved-mark"/>
              <div><h3>{u.name}</h3><p>{schoolLocation(u)}</p></div></div>
            <div className="ws-row"><SourceBadge school={u}/><span className="ws-chip">{tuitionStatusLabel(u.tuition)}</span></div>
            <div className="school-tags" style={{ minHeight: 0, marginTop: 0 }}>
              {u.degreeLevels.slice(0, 3).map(level => <span key={level}>{level}</span>)}
              {u.majors.length > 0 && <span>{u.majors.length} source-reported fields</span>}
            </div>
            {tracking.length > 0
              ? <Link href="/applications" className="ws-link" data-testid={`link-tracking-${entry.universityId}`}><ClipboardList size={13}/> Tracking: <StatusPill status={tracking[0].status}/>{tracking.length > 1 && ` +${tracking.length - 1}`}</Link>
              : <Link href={`/applications?university=${encodeURIComponent(entry.universityId)}`} className="ws-link" data-testid={`link-track-${entry.universityId}`}><ClipboardList size={13}/> Track an application</Link>}
            <div className="saved-card-actions">
              <label className="pick-toggle"><input type="checkbox" checked={isPicked} disabled={!isPicked && picked.length >= MAX_COMPARE} onChange={() => toggle(entry.universityId)} data-testid={`checkbox-compare-${entry.universityId}`}/> Compare</label>
              <span className="ws-spacer"/>
              <Link href={`/university/${entry.universityId}`} className="ws-link">Details <ArrowRight size={13}/></Link>
              <button className="icon-button remove-icon" aria-label={`Remove ${u.name} from shortlist`} disabled={remove.isPending} onClick={() => unsave(entry.universityId)} data-testid={`button-unsave-${entry.universityId}`}><Trash2 size={15}/></button>
            </div>
          </article>;
        })}
      </div>
      {remove.isError && <p className="form-error" role="alert">We couldn’t remove that school. Please try again.</p>}
      {picked.length > 0 && <div className="compare-tray" role="region" aria-label="Comparison selection">
        <Scale size={18}/><div><span>{picked.length} of {MAX_COMPARE} selected</span><br/><small>{picked.length < 2 ? 'Pick at least two schools to compare.' : 'Ready to compare.'}</small></div>
        <span className="ws-spacer"/>
        <button className="button button-light button-small" onClick={() => setPicked([])}><X size={14}/> Clear</button>
        <button className="button button-light button-small" disabled={picked.length < 2} onClick={() => setLocation(compareHref(picked))} data-testid="button-compare-selected">Compare side by side <ArrowRight size={14}/></button>
      </div>}
    </>}
    <div className="ws-notice"><Bookmark size={16}/><span>Your shortlist is private to your account. Saving a school does not contact the institution.</span></div>
  </div>;
}
