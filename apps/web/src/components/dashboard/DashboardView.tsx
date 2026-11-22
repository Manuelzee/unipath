import { type FormEvent, type ReactNode, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@/lib/auth';
import { Link } from 'wouter';
import {
  getGetStudentDashboardQueryKey, getGetStudentProfileQueryKey, getGetStudentRecommendationsQueryKey, getListApplicationTasksQueryKey,
  getListApplicationsQueryKey, getListSavedUniversitiesQueryKey,
  useCreateApplicationTask, useDeleteApplicationTask, useGetStudentDashboard, useGetStudentProfile, useGetStudentRecommendations,
  useListApplicationTasks, useListSavedUniversities, useRemoveSavedUniversity, useUpdateApplicationTask,
} from '@workspace/api-client-react';
import type { ApplicationTask, DashboardSummary } from '@workspace/api-client-react';
import {
  ArrowRight, Bookmark, CalendarClock, CheckCircle2, Circle, ClipboardList, Compass, GraduationCap, History, Plus, ShieldCheck, Trash2, X,
} from 'lucide-react';
import { SourceBadge } from '@/components/directory/SchoolCard';
import { InstitutionLogo, LinkedInstitutionLogo } from '@/components/directory/InstitutionLogo';
import { schoolLocation } from '@/components/directory/format';
import { ErrorBlock, LoadingBlock } from '@/components/directory/StateViews';
import {
  ClassificationBadge, PageHeading, STATUS_LABEL, StatusPill, cn, daysUntil, dueLabel, formatDay, todayIso,
} from '@/components/workspace/shared';

export function DashboardView() {
  const summary = useGetStudentDashboard({ query: { queryKey: getGetStudentDashboardQueryKey() } });
  const saved = useListSavedUniversities({ query: { queryKey: getListSavedUniversitiesQueryKey() } });
  const tasks = useListApplicationTasks({ query: { queryKey: getListApplicationTasksQueryKey() } });
  const busy = summary.isLoading || saved.isLoading || tasks.isLoading;
  const failed = summary.isError || saved.isError || tasks.isError;
  const s = summary.data;

  return <div className="page page-enter">
    <PageHeading kicker="YOUR JOURNEY, YOUR PACE" title="A plan that’s yours." body="A few small steps can take you somewhere wonderful."
      action={<Link href="/discover" className="button button-primary button-small"><Compass size={15}/> Explore schools</Link>}/>
    {busy ? <LoadingBlock/> : failed || !s ? <ErrorBlock retry={() => { void summary.refetch(); void saved.refetch(); void tasks.refetch(); }}/> : <>
      <WelcomePanel summary={s}/>
      <div className="summary-grid summary-grid-4">
        <div className="summary-card summary-feature"><span className="summary-label">SCHOOLS YOU’RE CONSIDERING</span><strong data-testid="text-saved-count">{s.savedCount}</strong><span>Good things start with curiosity.</span><Bookmark size={20}/></div>
        <div className="summary-card"><span className="summary-label">ACTIVE APPLICATIONS</span><strong data-testid="text-active-applications">{s.activeApplications}</strong><span>{s.totalApplications ? `${s.totalApplications} tracked in total` : 'Track one from your shortlist.'}</span><ClipboardList size={19}/></div>
        <div className="summary-card"><span className="summary-label">OPEN STEPS</span><strong data-testid="text-open-tasks">{s.openTasks}</strong><span>{s.overdueTasks.length ? <span style={{ color: '#a3463f', fontWeight: 700 }}>{s.overdueTasks.length} overdue</span> : 'One at a time is just right.'}</span><Circle size={19}/></div>
        <div className="summary-card"><span className="summary-label">COMPLETED STEPS</span><strong data-testid="text-completed-tasks">{s.completedTasks}</strong><span>Look how far you’ve come.</span><CheckCircle2 size={20}/></div>
      </div>
      <div className="dashboard-columns"><ShortlistPanel/><TasksPanel tasks={tasks.data ?? []}/></div>
      <div className="ws-grid-2 dash-section">
        <div className="dash-stack"><DeadlinesPanel summary={s}/><StatusOverview summary={s}/></div>
        <div className="dash-stack"><RecommendedPanel/><ActivityPanel summary={s}/></div>
      </div>
      <div className="dashboard-footnote"><ShieldCheck size={16}/> School records come from imported official sources (partial U.S. and Canada coverage); verify cost, admissions, and program details with each institution.</div>
    </>}
  </div>;
}

function WelcomePanel({ summary }: { summary: DashboardSummary }) {
  const { user } = useUser();
  const pc = summary.profileCompletion;
  const complete = pc.percent >= 100;
  return <section className="welcome-panel" data-testid="panel-welcome">
    <div><span className="eyebrow">WELCOME{user?.firstName ? `, ${user.firstName.toUpperCase()}` : ''}</span>
      <h2>{complete ? 'Your profile is complete.' : pc.completed === 0 ? 'Let’s start with your story.' : 'Your profile is taking shape.'}</h2>
      <p>{complete ? 'Your matches and AI guidance use everything you shared. Update it whenever plans change.'
        : `Still to add: ${pc.missing.slice(0, 3).join(', ')}${pc.missing.length > 3 ? ` and ${pc.missing.length - 3} more` : ''}. Better answers give better matches.`}</p>
      <Link href={complete ? '/recommendations' : '/onboarding'} className="button button-light button-small" data-testid="link-complete-profile">
        {complete ? 'See my matches' : 'Complete my profile'} <ArrowRight size={14}/></Link></div>
    <div className="completion-meter"><strong data-testid="text-profile-completion">{pc.percent}%</strong>
      <div className="meter" role="progressbar" aria-valuenow={pc.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completion"><i style={{ transform: `scaleX(${pc.percent / 100})` }}/></div>
      <small>{pc.completed} of {pc.total} profile answers</small></div>
  </section>;
}

function ShortlistPanel() {
  const saved = useListSavedUniversities({ query: { queryKey: getListSavedUniversitiesQueryKey() } });
  const remove = useRemoveSavedUniversity(); const qc = useQueryClient();
  const list = saved.data ?? [];
  return <section className="content-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR SHORTLIST</span><h2>Schools on your mind</h2></div><Link href="/saved" className="text-link">Manage &amp; compare <ArrowRight size={15}/></Link></div>
    {list.length ? <div className="saved-list">{list.slice(0, 6).map(entry => <div className="saved-row" key={entry.universityId} data-testid={`saved-university-${entry.universityId}`}>
      <InstitutionLogo school={entry.university} size="small" className="saved-mark"/>
      <div className="saved-name"><strong>{entry.university.name}</strong><span>{schoolLocation(entry.university)}</span></div>
      <SourceBadge school={entry.university}/>
      <Link href={`/university/${entry.universityId}`} className="icon-button" aria-label={`View ${entry.university.name}`}><ArrowRight size={17}/></Link>
      <button className="icon-button remove-icon" aria-label={`Remove ${entry.university.name}`} data-testid={`button-remove-school-${entry.universityId}`}
        onClick={() => remove.mutate({ universityId: entry.universityId }, { onSuccess: () => {
          void qc.invalidateQueries({ queryKey: getListSavedUniversitiesQueryKey() });
          void qc.invalidateQueries({ queryKey: getGetStudentDashboardQueryKey() });
        } })}><X size={17}/></button>
    </div>)}{list.length > 6 && <Link href="/saved" className="text-link" style={{ marginTop: 10 }}>View all {list.length} saved schools <ArrowRight size={13}/></Link>}</div>
      : <EmptyCard icon={<Bookmark size={22}/>} title="Your shortlist starts here" body="Save schools that catch your eye and compare them as your plans take shape." href="/discover" action="Explore schools"/>}
  </section>;
}

function TasksPanel({ tasks }: { tasks: ApplicationTask[] }) {
  const create = useCreateApplicationTask(); const update = useUpdateApplicationTask(); const del = useDeleteApplicationTask(); const qc = useQueryClient();
  const [title, setTitle] = useState(''); const [date, setDate] = useState(''); const [show, setShow] = useState(false);
  const refresh = () => {
    for (const key of [getListApplicationTasksQueryKey(), getGetStudentDashboardQueryKey(), getListApplicationsQueryKey()]) void qc.invalidateQueries({ queryKey: key });
  };
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;
    create.mutate({ data: { title: title.trim(), dueDate: date, universityId: '' } }, { onSuccess: () => { setTitle(''); setDate(''); setShow(false); refresh(); } });
  };
  const today = todayIso();
  // Open tasks first (soonest due), then completed ones.
  const ordered = [...tasks].sort((a, b) => Number(a.completed) - Number(b.completed) || a.dueDate.localeCompare(b.dueDate));
  return <section className="content-panel tasks-panel"><div className="panel-heading"><div><span className="eyebrow">LITTLE BY LITTLE</span><h2>Next steps</h2></div>
    <button className="icon-button add-task-button" onClick={() => setShow(!show)} aria-label={show ? 'Close new task form' : 'Add a task'} aria-expanded={show} data-testid="button-add-task">{show ? <X size={18}/> : <Plus size={18}/>}</button></div>
    {show && <form className="add-task-form" onSubmit={add}><input required value={title} onChange={e => setTitle(e.target.value)} placeholder="What would you like to do?" aria-label="Task title" data-testid="input-task-title"/>
      <input required type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="Due date" data-testid="input-task-date"/>
      <button className="button button-primary button-small" disabled={create.isPending} data-testid="button-save-task">{create.isPending ? 'Adding…' : 'Add step'}</button>
      {create.isError && <p className="form-error">Couldn’t add this step. Please try again.</p>}</form>}
    {ordered.length ? <div className="task-list">{ordered.slice(0, 8).map(task => {
      const overdue = !task.completed && task.dueDate < today;
      return <div className={cn('task-row', task.completed && 'task-complete', overdue && 'task-overdue')} key={task.id} data-testid={`task-${task.id}`}>
        <button className="task-check" aria-label={task.completed ? `Mark "${task.title}" incomplete` : `Mark "${task.title}" complete`} onClick={() => update.mutate({ id: task.id, data: { completed: !task.completed } }, { onSuccess: refresh })} data-testid={`button-complete-task-${task.id}`}>{task.completed ? <CheckCircle2 size={19}/> : <Circle size={19}/>}</button>
        {task.universityId && <LinkedInstitutionLogo id={task.universityId}/>}
        <div className="task-copy"><strong>{task.title}</strong>
          <span>{task.completed ? `Done · ${formatDay(task.dueDate)}` : `${dueLabel(task.dueDate)} · ${formatDay(task.dueDate)}`}{task.applicationId != null && <> · <Link href="/applications" className="task-app-label">application task</Link></>}</span></div>
        <button className="icon-button task-delete" aria-label={`Delete task "${task.title}"`} onClick={() => del.mutate({ id: task.id }, { onSuccess: refresh })} data-testid={`button-delete-task-${task.id}`}><Trash2 size={15}/></button>
      </div>;
    })}{ordered.length > 8 && <Link href="/applications" className="text-link" style={{ marginTop: 10 }}>See all tasks in Applications <ArrowRight size={13}/></Link>}</div>
      : <EmptyCard icon={<CheckCircle2 size={22}/>} title="Room for your first step" body="Add a task you want to remember, like exploring entry requirements or asking for a recommendation."/>}
  </section>;
}

function DeadlinesPanel({ summary }: { summary: DashboardSummary }) {
  return <section className="content-panel" data-testid="panel-deadlines"><div className="panel-heading"><div><span className="eyebrow">COMING UP</span><h2>Upcoming deadlines</h2></div><Link href="/applications" className="text-link">Applications <ArrowRight size={15}/></Link></div>
    {summary.upcomingDeadlines.length ? summary.upcomingDeadlines.map(d => {
      const [, m, day] = d.deadline.split('-');
      const n = daysUntil(d.deadline);
      return <Link key={d.applicationId} href="/applications" className="deadline-row">
        <span className="deadline-date"><b>{Number(day)}</b><span>{formatDay(d.deadline, { month: 'short' }).toUpperCase() || m}</span></span>
        <span className="deadline-copy"><strong>{d.universityName}</strong><span>{d.programName ? `${d.programName} · ` : ''}{n === 0 ? 'Today' : `${n} day${n === 1 ? '' : 's'} left`} · {STATUS_LABEL[d.status]}</span></span>
        <ArrowRight size={15} color="#7b8b96"/></Link>;
    }) : <p className="ws-muted" style={{ borderTop: '1px solid #edf1f2', paddingTop: 12, margin: 0 }}>No upcoming deadlines recorded. Add the deadline from each school’s official page to your application tracker.</p>}
    {summary.overdueTasks.length > 0 && <p className="inline-warning ws-row" style={{ marginTop: 12, flexWrap: 'nowrap', alignItems: 'flex-start' }}><CalendarClock size={14} style={{ flex: 'none', marginTop: 1 }}/><span>{summary.overdueTasks.length} task{summary.overdueTasks.length === 1 ? ' is' : 's are'} overdue: {summary.overdueTasks.slice(0, 2).map(t => t.title).join(', ')}{summary.overdueTasks.length > 2 ? '…' : ''}</span></p>}
    <p className="ai-caveat" style={{ marginTop: 10 }}>Deadlines are the ones you recorded. Confirm them with each institution.</p>
  </section>;
}

function StatusOverview({ summary }: { summary: DashboardSummary }) {
  const max = Math.max(1, ...summary.applicationsByStatus.map(r => r.count));
  return <section className="content-panel" data-testid="panel-status-overview"><div className="panel-heading"><div><span className="eyebrow">APPLICATION STATUS</span><h2>Where things stand</h2></div></div>
    {summary.applicationsByStatus.length ? <div className="status-bars">{summary.applicationsByStatus.map(r => <div className="status-bar" key={r.status}>
      <StatusPill status={r.status}/><span className="track" aria-hidden><i style={{ transform: `scaleX(${r.count / max})` }}/></span><b>{r.count}</b></div>)}</div>
      : <EmptyCard icon={<ClipboardList size={22}/>} title="No applications tracked yet" body="Start tracking from your shortlist to see your progress here." href="/saved" action="Open shortlist"/>}
  </section>;
}

function RecommendedPanel() {
  const profile = useGetStudentProfile({ query: { queryKey: getGetStudentProfileQueryKey() } });
  const hasProfile = !!profile.data?.profile;
  const recs = useGetStudentRecommendations({ query: { queryKey: getGetStudentRecommendationsQueryKey(), enabled: hasProfile, staleTime: 5 * 60_000 } });
  const top = (recs.data?.items ?? []).filter(r => r.classification !== 'requirements_not_met').slice(0, 3);
  return <section className="content-panel" data-testid="panel-recommended"><div className="panel-heading"><div><span className="eyebrow">MATCHED TO YOU</span><h2>Recommended for you</h2></div><Link href="/recommendations" className="text-link">All matches <ArrowRight size={15}/></Link></div>
    {profile.isLoading || (hasProfile && recs.isLoading) ? <div className="skeleton skeleton-card"/>
      : !hasProfile ? <EmptyCard icon={<GraduationCap size={22}/>} title="Tell us what you’re looking for" body="Complete your profile to see schools that fit your preferences." href="/onboarding" action="Start my profile"/>
        : recs.isError ? <p className="ws-muted">Matches couldn’t load just now. <button className="ws-link" onClick={() => void recs.refetch()}>Try again</button></p>
          : top.length ? top.map(r => <Link key={r.university.id} href={`/university/${r.university.id}`} className="rec-mini">
            <InstitutionLogo school={r.university} size="small" className="saved-mark"/>
            <span className="deadline-copy"><strong>{r.university.name}</strong><span>{schoolLocation(r.university)}</span></span>
            <ClassificationBadge value={r.classification}/></Link>)
            : <p className="ws-muted">No verified matches yet. Try widening your study country or degree level.</p>}
    <p className="ai-caveat" style={{ marginTop: 10 }}>Preference estimates, not admission predictions.</p>
  </section>;
}

function ActivityPanel({ summary }: { summary: DashboardSummary }) {
  return <section className="content-panel" data-testid="panel-activity"><div className="panel-heading"><div><span className="eyebrow">RECENTLY</span><h2>Recent activity</h2></div></div>
    {summary.recentActivity.length ? summary.recentActivity.map((a, i) => <Link key={`${a.at}-${i}`} href={a.href} className="activity-row">
      <span className="activity-dot">{a.kind === 'saved' ? <Bookmark size={14}/> : <ClipboardList size={14}/>}</span>
      <span className="activity-copy"><strong>{a.label}</strong><span>{new Date(a.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span></span></Link>)
      : <p className="ws-muted ws-row" style={{ margin: 0, flexWrap: 'nowrap' }}><History size={13} style={{ flex: 'none' }}/> Your saved schools and application updates will appear here.</p>}
  </section>;
}

function EmptyCard({ icon, title, body, href, action }: { icon: ReactNode; title: string; body: string; href?: string; action?: string }) {
  return <div className="state-card"><div className="state-icon">{icon}</div><h3>{title}</h3><p>{body}</p>
    {href && action && <Link href={href} className="button button-primary button-small">{action} <ArrowRight size={15}/></Link>}</div>;
}
