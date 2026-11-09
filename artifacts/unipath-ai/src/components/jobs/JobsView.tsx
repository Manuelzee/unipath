import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Search, Scale, BriefcaseBusiness, LayoutGrid, Building2, ClipboardList, FileText, ShieldCheck } from 'lucide-react';
import { OverviewTab } from './OverviewTab';
import { WorkRulesTab } from './WorkRulesTab';
import { CareerCentersTab } from './CareerCentersTab';
import { TrackerTab } from './TrackerTab';
import { CategoriesTab } from './CategoriesTab';
import { ResumeTab } from './ResumeTab';
import { FindJobsTab } from './FindJobsTab';
import { EligibilityTab } from './EligibilityTab';
import './jobs.css';

const TITLE = 'Global Student Jobs | UniPath AI';
const DESC = 'Search job listings from a connected provider, track jobs, read official work-rule sources for international students, and draft a resume from your own words. UniPath does not check listings for visa eligibility.';

function usePageMeta() {
  useEffect(() => {
    const prevTitle = document.title;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const created = !meta;
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
    const prevDesc = meta.content;
    document.title = TITLE; meta.content = DESC;
    return () => { document.title = prevTitle; if (created) meta?.remove(); else if (meta) meta.content = prevDesc; };
  }, []);
}

const TABS = [
  { id: 'find', label: 'Find jobs', icon: Search },
  { id: 'overview', label: 'Overview', icon: BriefcaseBusiness },
  { id: 'categories', label: 'Job categories', icon: LayoutGrid },
  { id: 'eligibility', label: 'Eligibility assistant', icon: Scale },
  { id: 'rules', label: 'Work rules', icon: ShieldCheck },
  { id: 'careers', label: 'Career centers', icon: Building2 },
  { id: 'tracker', label: 'My tracker', icon: ClipboardList },
  { id: 'resume', label: 'Resume builder', icon: FileText },
] as const;
export type TabId = typeof TABS[number]['id'];

export function JobsView() {
  usePageMeta();
  const [tab, setTab] = useState<TabId>('find');
  const [prefill, setPrefill] = useState<{ title: string; jobType: string } | null>(null);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = TABS.length - 1;
    if (n < 0) return;
    e.preventDefault(); setTab(TABS[n].id); refs.current[n]?.focus();
  };
  return <div className="page page-enter sj">
    <header className="sj-hero">
      <span className="eyebrow">GLOBAL STUDENT JOBS</span>
      <h1 data-testid="text-jobs-heading">Global Student Jobs</h1>
      <p>Listings from a connected job provider, official sources, a tracker for jobs you find yourself, and a plain resume template. Your work eligibility depends on your own authorization, so confirm every step with your school.</p>
    </header>
    <div className="sj-tabs" role="tablist" aria-label="Global Student Jobs sections">
      {TABS.map((t, i) => { const Icon = t.icon; const on = tab === t.id; return <button key={t.id} ref={el => { refs.current[i] = el; }} role="tab" id={`sj-tab-${t.id}`} aria-selected={on} aria-controls={`sj-panel-${t.id}`} tabIndex={on ? 0 : -1} className={on ? 'sj-tab sj-tab-on' : 'sj-tab'} onClick={() => setTab(t.id)} onKeyDown={e => onKey(e, i)} data-testid={`tab-${t.id === 'rules' ? 'work-rules' : t.id === 'careers' ? 'career-centers' : t.id === 'find' ? 'find-jobs' : t.id}`}><Icon size={15} />{t.label}</button>; })}
    </div>
    <section role="tabpanel" id={`sj-panel-${tab}`} aria-labelledby={`sj-tab-${tab}`} className="sj-panel" tabIndex={0}>
      {tab === 'find' && <FindJobsTab />}
      {tab === 'eligibility' && <EligibilityTab goSearch={() => setTab('find')} />}
      {tab === 'overview' && <OverviewTab go={setTab} />}
      {tab === 'rules' && <WorkRulesTab />}
      {tab === 'careers' && <CareerCentersTab />}
      {tab === 'categories' && <CategoriesTab onPick={p => { setPrefill(p); setTab('tracker'); }} />}
      {tab === 'tracker' && <TrackerTab prefill={prefill} clearPrefill={() => setPrefill(null)} />}
      {tab === 'resume' && <ResumeTab />}
    </section>
  </div>;
}
