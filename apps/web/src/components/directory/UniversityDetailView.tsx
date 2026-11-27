import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@/lib/auth';
import { Link, useLocation } from 'wouter';
import { getGetStudentDashboardQueryKey, getGetUniversityQueryKey, getListSavedUniversitiesQueryKey, useGetUniversity, useListSavedUniversities, useRemoveSavedUniversity, useSaveUniversity } from '@workspace/api-client-react';
import { ArrowLeft, Bookmark, Check, ClipboardList, LoaderCircle, ShieldCheck } from 'lucide-react';
import { SourceBadge } from './SchoolCard';
import { cn, formatDate, isWorldRecord, schoolLocation } from './format';
import { InstitutionLogo } from './InstitutionLogo';
import { BrandingPanel, CampusBanner, verifiedColors } from './InstitutionBranding';
import type { CSSProperties } from 'react';
import { ErrorBlock, LoadingBlock } from './StateViews';
import { UniversityTabs, type TabId } from './UniversityTabs';
import { AdmissionsPanel, FieldsPanel, FundingPanel, LinksPanel, OverviewPanel } from './UniversityPanels';
import { ReviewedEvidencePanel } from './ReviewedEvidencePanel';
import { TuitionPanel } from './TuitionPanel';
import { usePageMeta } from '@/lib/pageMeta';

export function UniversityDetailView({ id }: { id: string }) {
  const q = useGetUniversity(id, { query: { queryKey: getGetUniversityQueryKey(id), staleTime: 30_000, refetchInterval: 60_000 } });
  const { isSignedIn } = useUser(); const [, setLocation] = useLocation(); const qc = useQueryClient();
  const saved = useListSavedUniversities({ query: { enabled: !!isSignedIn, queryKey: getListSavedUniversitiesQueryKey() } });
  const save = useSaveUniversity(); const remove = useRemoveSavedUniversity();
  const [tab, setTab] = useState<TabId>('overview');
  usePageMeta(q.data?.name ?? null, q.data ? `${q.data.name}${q.data.city ? `, ${q.data.city}` : ''}, ${q.data.country}: official links, scholarships and the source of every detail on UniPath AI.` : undefined);
  const isSaved = (saved.data || []).some(x => x.universityId === id);
  const busy = save.isPending || remove.isPending;
  const toggle = () => {
    if (!isSignedIn) { setLocation('/sign-up'); return; }
    const onSuccess = () => { void qc.invalidateQueries({ queryKey: getListSavedUniversitiesQueryKey() }); void qc.invalidateQueries({ queryKey: getGetStudentDashboardQueryKey() }); };
    if (isSaved) remove.mutate({ universityId: id }, { onSuccess }); else if (q.data) save.mutate({ data: { universityId: id } }, { onSuccess });
  };
  if (q.isLoading) return <div className="page"><LoadingBlock/></div>;
  if (q.isError || !q.data) return <div className="page"><ErrorBlock retry={() => void q.refetch()}/></div>;
  const school = q.data;
  const colors = verifiedColors(school);
  const brandStyle = colors ? ({ '--brand-primary': colors.primary, '--brand-secondary': colors.secondary, '--brand-fg': colors.fg } as CSSProperties) : undefined;
  return <div className="page page-enter">
    <Link href="/discover" className="back-link" data-testid="link-back-discover"><ArrowLeft size={16}/> Back to explore</Link>
    <CampusBanner school={school}/>
    <div className={cn('detail-hero', colors && 'has-brand')} style={brandStyle} data-testid="hero-university"><div className={`detail-monogram cover-${school.id.length % 4}`}><InstitutionLogo school={school} size="large" showSource/></div><div><SourceBadge school={school}/><p className="school-location detail-location">{schoolLocation(school)}</p><h1 data-testid="text-university-name">{school.name}</h1><p className="detail-subtitle">{school.institutionType || 'Institution type not reported'} · {school.ownership || 'Ownership not reported'}</p></div>
      <button className={cn('button', isSaved ? 'button-outline' : 'button-primary', !isSaved && colors?.fg ? 'button-brand' : undefined)} onClick={toggle} disabled={busy} data-testid="button-save-university">{busy ? <LoaderCircle className="spin" size={16}/> : isSaved ? <Check size={16}/> : <Bookmark size={16}/>} {isSaved ? 'Saved to my plan' : 'Save to my plan'}</button>{isSaved && <Link href={`/applications?university=${encodeURIComponent(id)}`} className="button button-outline" data-testid="link-track-application"><ClipboardList size={16}/> Track application</Link>}{colors && <span className="brand-rule" aria-hidden/>}</div>
    <div className="detail-notice"><ShieldCheck size={18}/><span>{school.countryCode === 'CA' && !isWorldRecord(school) ? 'Source-listed institution or campus from a government co-op and internship program listing. The list may include historical or outdated names. Current operation, recognition and admissions are not verified. ' : isWorldRecord(school) ? 'Listed in the Research Organization Registry (ROR): name, location and website only. Programs, tuition, admissions and recognition are not supplied; check recognition with the country\u2019s education ministry. ' : 'Source-reported data only. '}{school.lastVerifiedAt ? `Independently verified ${formatDate(school.lastVerifiedAt)}.` : 'This record has not been independently verified.'} Unknown means the source didn’t say. Confirm requirements, programs, and deadlines with the institution.</span></div>
    <UniversityTabs active={tab} onChange={setTab}/>
    <div className="detail-columns">
      <div className="detail-main" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} key={tab}>
        {tab === 'overview' && <><OverviewPanel school={school}/><TuitionPanel school={school}/><ReviewedEvidencePanel id={school.id}/></>}
        {tab === 'fields' && <FieldsPanel school={school}/>}
        {tab === 'admissions' && <AdmissionsPanel school={school}/>}
        {tab === 'funding' && <FundingPanel school={school}/>}
        {tab === 'links' && <LinksPanel school={school}/>}
      </div>
      <aside className="detail-aside"><BrandingPanel school={school} colors={colors}/><div className="detail-panel source-panel"><span className="eyebrow">SOURCE & DATA</span><p>{school.dataSource}</p>
        <div className="source-meta"><span>Source reporting period</span><strong>{school.dataYear || 'Not provided'}</strong></div>
        <div className="source-meta"><span>Directory record imported</span><strong>{formatDate(school.lastUpdatedAt)}</strong></div>
        <div className="source-meta"><span>Independent verification</span><strong>{formatDate(school.lastVerifiedAt) || 'Unavailable'}</strong></div>
        <button className="source-link link-button" onClick={() => setTab('links')} data-testid="button-view-links">All official links</button>
      </div><div className="tip-card"><strong>Keep it personal</strong><p>Compare this school against your priorities, location, and goals.</p><Link href="/profile">Update my profile</Link></div></aside>
    </div>
  </div>;
}
