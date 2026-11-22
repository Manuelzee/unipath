import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useSearch } from 'wouter';
import {
  getGetStudentDashboardQueryKey, getListApplicationTasksQueryKey, getListApplicationsQueryKey, getListSavedUniversitiesQueryKey, getListStudentDocumentsQueryKey,
  useAddApplicationChecklist, useCreateApplication, useCreateApplicationScopedTask, useDeleteApplication, useDeleteApplicationTask,
  useListApplications, useListSavedUniversities, useListStudentDocuments, useUpdateApplication, useUpdateApplicationTask,
} from '@workspace/api-client-react';
import type { Application, ApplicationStatus, ApplicationTask, SavedUniversity, StudentDocument } from '@workspace/api-client-react';
import {
  ArrowRight, CalendarClock, CheckCircle2, Circle, ClipboardList, Download, ExternalLink, FileText, ListChecks, LoaderCircle, Pencil, Plus, ShieldCheck, Trash2, X,
} from 'lucide-react';
import { InstitutionLogo } from '@/components/directory/InstitutionLogo';
import { schoolLocation } from '@/components/directory/format';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/components/directory/StateViews';
import { documentHref, formatBytes } from '@/components/documents/DocumentsView';
import {
  FINAL_STATUSES, LIFECYCLE, PageHeading, STATUS_HINT, STATUS_LABEL, STATUS_ORDER, StatusPill, cn, daysUntil, dueLabel,
  errorMessage, formatDay, lifecycleIndex, safeHref, todayIso,
} from '@/components/workspace/shared';

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetStudentDashboardQueryKey() });
    void qc.invalidateQueries({ queryKey: getListApplicationTasksQueryKey() });
  };
}

const inDays = (n: number) => {
  const d = new Date(Date.now() + n * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type Filter = 'all' | 'active' | 'outcomes';

export function ApplicationsView() {
  const apps = useListApplications({ query: { queryKey: getListApplicationsQueryKey() } });
  const saved = useListSavedUniversities({ query: { queryKey: getListSavedUniversitiesQueryKey() } });
  const documents = useListStudentDocuments({ query: { queryKey: getListStudentDocumentsQueryKey() } });
  const search = useSearch();
  const requested = new URLSearchParams(search).get('university') ?? '';
  const [adding, setAdding] = useState(!!requested);
  const [filter, setFilter] = useState<Filter>('all');
  useEffect(() => { if (requested) setAdding(true); }, [requested]);

  const list = apps.data ?? [];
  const counts = useMemo(() => {
    const c = (statuses: ApplicationStatus[]) => list.filter(a => statuses.includes(a.status)).length;
    return {
      planning: c(['interested', 'researching']),
      preparing: c(['preparing_documents', 'ready_to_apply']),
      submitted: c(['submitted', 'under_review']),
      outcomes: c(FINAL_STATUSES),
    };
  }, [list]);
  const shown = list.filter(a => filter === 'all' ? true : filter === 'active' ? !FINAL_STATUSES.includes(a.status) : FINAL_STATUSES.includes(a.status));

  return <div className="page page-enter">
    <PageHeading kicker="PREPARE · APPLY · TRACK" title="Your applications."
      body="Organize every application in one place. You apply directly on each institution’s official site; UniPath never submits anything for you."
      action={<button className="button button-primary button-small" onClick={() => setAdding(a => !a)} aria-expanded={adding} data-testid="button-toggle-add-application">
        {adding ? <><X size={15}/> Close</> : <><Plus size={15}/> Track an application</>}</button>}/>

    {adding && <AddApplicationPanel saved={saved.data ?? []} loadingSaved={saved.isLoading} existing={list}
      initialUniversityId={requested} onDone={() => setAdding(false)}/>}

    {apps.isLoading ? <LoadingBlock/> : apps.isError ? <ErrorBlock retry={() => void apps.refetch()}/> : !list.length ? (
      !adding && <EmptyBlock testId="empty-applications" title="No applications tracked yet"
        body="Start from a school on your shortlist. Track its status, deadline you copied from the official site, and the documents you need."
        action="Track an application" onAction={() => setAdding(true)}/>
    ) : <>
      <div className="pipeline" data-testid="application-pipeline">
        <Stage label="PLANNING" value={counts.planning} hint="Interested or researching"/>
        <Stage label="PREPARING" value={counts.preparing} hint="Documents or ready to apply"/>
        <Stage label="SUBMITTED" value={counts.submitted} hint="Submitted or under review"/>
        <Stage label="OUTCOMES" value={counts.outcomes} hint="Accepted, rejected or waitlisted"/>
      </div>
      <div className="filter-pills" role="group" aria-label="Filter applications">
        {(['all', 'active', 'outcomes'] as const).map(f => <button key={f} className={cn('ws-chip-button', filter === f && 'is-on')} aria-pressed={filter === f} onClick={() => setFilter(f)} data-testid={`filter-applications-${f}`}>
          {f === 'all' ? `All (${list.length})` : f === 'active' ? 'In progress' : 'Outcomes'}</button>)}
      </div>
      {shown.length ? <div className="app-list">{shown.map(app => <ApplicationCard key={app.id} app={app} documents={(documents.data ?? []).filter(d => d.applicationId === app.id)}/>)}</div>
        : <EmptyBlock title="Nothing in this view" body="Try another filter."/>}
    </>}

    <div className="ws-notice"><ShieldCheck size={16}/><span>Student-managed tracker. Statuses, deadlines and links are your own records unless marked as a directory listing. Always confirm requirements and deadlines on the institution’s official pages. UniPath does not submit applications or guarantee any outcome.</span></div>
  </div>;
}

function Stage({ label, value, hint }: { label: string; value: number; hint: string }) {
  return <div className="pipeline-stage"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>;
}

function AddApplicationPanel({ saved, loadingSaved, existing, initialUniversityId, onDone }: {
  saved: SavedUniversity[]; loadingSaved: boolean; existing: Application[]; initialUniversityId: string; onDone: () => void;
}) {
  const create = useCreateApplication(); const refresh = useRefresh();
  const [universityId, setUniversityId] = useState(initialUniversityId);
  const [programName, setProgramName] = useState('');
  const [intake, setIntake] = useState('');
  const [status, setStatus] = useState<ApplicationStatus>('interested');
  const [deadline, setDeadline] = useState('');
  const [applicationUrl, setApplicationUrl] = useState('');
  const [urlTouched, setUrlTouched] = useState(false);
  const picked = saved.find(s => s.universityId === universityId)?.university;
  const known = initialUniversityId && !saved.some(s => s.universityId === initialUniversityId);

  useEffect(() => { if (!universityId && initialUniversityId) setUniversityId(initialUniversityId); }, [initialUniversityId, universityId]);
  // Suggest the directory's application page until the student types their own link.
  useEffect(() => {
    if (!urlTouched) setApplicationUrl(safeHref(picked?.applicationWebsite) ?? safeHref(picked?.admissionsWebsite) ?? '');
  }, [picked, urlTouched]);

  const duplicate = existing.some(a => a.universityId === universityId && (a.programName ?? '').trim().toLowerCase() === programName.trim().toLowerCase());
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!universityId) return;
    create.mutate({ data: {
      universityId, programName: programName.trim() || null, intake: intake.trim() || null, status,
      deadline: deadline || null, applicationUrl: applicationUrl.trim() || null,
    } }, { onSuccess: () => { refresh(); onDone(); } });
  };

  return <form className="ws-panel add-app-panel page-enter" onSubmit={submit} data-testid="form-add-application">
    <div className="ws-head"><div><span className="eyebrow">NEW TRACKER</span><h2>Track an application</h2><p>Pick a school from your shortlist. Everything else is optional and can be changed later.</p></div></div>
    {loadingSaved ? <div className="skeleton skeleton-line"/> : !saved.length ? <div className="fact-empty"><strong>Your shortlist is empty</strong><p>Save schools from Discover first, then come back to track an application. <Link href="/discover" className="text-link" style={{ display: 'inline-flex' }}>Explore schools <ArrowRight size={13}/></Link></p></div> : <>
      <div className="ws-form-grid">
        <label className="ws-label wide"><span>School (from your shortlist)</span>
          <select className="ws-select" required value={universityId} onChange={e => setUniversityId(e.target.value)} data-testid="select-application-university">
            <option value="">Choose a saved school</option>
            {saved.map(s => <option key={s.universityId} value={s.universityId}>{s.university.name} · {schoolLocation(s.university)}</option>)}
          </select>
          {known && <small>The school you selected isn’t on your shortlist yet. Save it from its page first.</small>}
        </label>
        <label className="ws-label"><span>Program (optional)</span><input className="ws-input" maxLength={200} value={programName} onChange={e => setProgramName(e.target.value)} placeholder="e.g. BSc Computer Science" data-testid="input-application-program"/></label>
        <label className="ws-label"><span>Intake (optional)</span><input className="ws-input" maxLength={80} value={intake} onChange={e => setIntake(e.target.value)} placeholder="e.g. Fall 2027" data-testid="input-application-intake"/></label>
        <label className="ws-label"><span>Status</span>
          <select className="ws-select" value={status} onChange={e => setStatus(e.target.value as ApplicationStatus)} data-testid="select-application-status">
            {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select><small>{STATUS_HINT[status]}</small></label>
        <label className="ws-label"><span>Your deadline (optional)</span><input className="ws-input" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} data-testid="input-application-deadline"/>
          <small>Copy it from the institution’s official page. UniPath does not verify it.</small></label>
        <label className="ws-label wide"><span>Official application link (optional)</span>
          <input className="ws-input" type="url" maxLength={1000} value={applicationUrl} onChange={e => { setUrlTouched(true); setApplicationUrl(e.target.value); }} placeholder="https://" data-testid="input-application-url"/>
          {!urlTouched && applicationUrl && <small>Prefilled from the directory listing. Confirm it is the right page for your program.</small>}
        </label>
      </div>
      {duplicate && <p className="inline-warning">You already track this school{programName.trim() ? ' and program' : ''}. You can still add another tracker for a different program.</p>}
      <div className="form-footer">
        <span>You will submit your application directly to the institution.</span>
        <button className="button button-primary" disabled={!universityId || create.isPending} data-testid="button-create-application">
          {create.isPending ? <><LoaderCircle size={16} className="spin"/> Adding…</> : <>Start tracking <ArrowRight size={16}/></>}</button>
      </div>
      {create.isError && <p className="form-error" role="alert">{errorMessage(create.error, 'We couldn’t add this application. Please try again.')}</p>}
    </>}
  </form>;
}

function DeadlineChip({ app }: { app: Application }) {
  if (!app.deadline) return <span className="ws-chip"><CalendarClock size={12}/> No deadline recorded</span>;
  const n = daysUntil(app.deadline);
  const pending = !['submitted', 'under_review', ...FINAL_STATUSES].includes(app.status);
  const tone = pending && n < 0 ? 'ws-chip-bad' : pending && n <= 14 ? 'ws-chip-warn' : '';
  return <span className={cn('ws-chip', tone)} title="Your recorded deadline. Confirm it on the official page.">
    <CalendarClock size={12}/> Your deadline {formatDay(app.deadline)}{pending ? ` · ${n < 0 ? `${Math.abs(n)} days ago` : n === 0 ? 'today' : `${n} days left`}` : ''}
  </span>;
}

function ApplicationCard({ app, documents }: { app: Application; documents: StudentDocument[] }) {
  const refresh = useRefresh();
  const update = useUpdateApplication(); const remove = useDeleteApplication();
  const addTask = useCreateApplicationScopedTask(); const checklist = useAddApplicationChecklist();
  const toggleTask = useUpdateApplicationTask(); const deleteTask = useDeleteApplicationTask();
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [notes, setNotes] = useState(app.notes ?? '');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDate, setTaskDate] = useState(inDays(7));
  useEffect(() => { setNotes(app.notes ?? ''); }, [app.notes]);

  const u = app.university;
  const name = u?.name ?? 'A university no longer in the directory';
  const step = lifecycleIndex(app.status);
  const done = app.tasks.filter(t => t.completed).length;
  const links = useMemo(() => {
    const out: Array<{ href: string; label: string }> = [];
    const add = (raw: string | null | undefined, label: string) => { const href = safeHref(raw); if (href && !out.some(l => l.href === href)) out.push({ href, label }); };
    add(app.applicationUrl, 'Your saved application link');
    add(u?.applicationWebsite, 'Application page (directory listing)');
    add(u?.admissionsWebsite, 'Admissions page (directory listing)');
    if (!u?.admissionsWebsite) add(u?.website, 'School homepage (directory listing)');
    return out;
  }, [app.applicationUrl, u]);

  const setStatus = (status: ApplicationStatus) => update.mutate({ id: app.id, data: { status } }, { onSuccess: refresh });
  const saveNotes = () => update.mutate({ id: app.id, data: { notes: notes.trim() || null } }, { onSuccess: refresh });
  const submitTask = (e: FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !taskDate) return;
    addTask.mutate({ id: app.id, data: { title: taskTitle.trim(), dueDate: taskDate } }, { onSuccess: () => { setTaskTitle(''); refresh(); } });
  };

  return <article className="app-card" data-testid={`card-application-${app.id}`}>
    <div className="app-card-head">
      {u ? <InstitutionLogo school={u} size="small" className="saved-mark"/> : <div className="saved-mark state-icon" style={{ margin: 0 }}><ClipboardList size={18}/></div>}
      <div className="app-title">
        <h3>{u ? <Link href={`/university/${u.id}`} className="text-link" style={{ display: 'inline', fontSize: 'inherit', color: 'inherit' }}>{name}</Link> : name}</h3>
        <p>{u ? schoolLocation(u) : 'Directory record unavailable'}{(app.programName || app.intake) && <span className="app-sub"> · {[app.programName, app.intake].filter(Boolean).join(' · ')}</span>}</p>
      </div>
      <label className="app-status-select"><span className="sr-only">Application status for {name}</span>
        <select className="ws-select" value={app.status} disabled={update.isPending} onChange={e => setStatus(e.target.value as ApplicationStatus)} data-testid={`select-status-${app.id}`}>
          {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select></label>
    </div>
    <div className="app-meta"><StatusPill status={app.status}/><DeadlineChip app={app}/>
      <span className="ws-chip"><ListChecks size={12}/> {done}/{app.tasks.length} tasks done</span></div>
    <ol className="lifecycle" aria-label={`Progress: ${LIFECYCLE[step]}`}>
      {LIFECYCLE.map((label, i) => <li key={label} className={cn(i < step && 'is-done', i === step && 'is-current')} aria-current={i === step ? 'step' : undefined}>{label}</li>)}
    </ol>

    <div className="app-body">
      <section aria-label="Tasks">
        <p className="app-section-title">TASKS &amp; DOCUMENT CHECKLIST</p>
        {app.tasks.length ? app.tasks.map((task: ApplicationTask) => {
          const overdue = !task.completed && task.dueDate < todayIso();
          return <div key={task.id} className={cn('app-task', task.completed && 'task-complete', overdue && 'task-overdue')} data-testid={`app-task-${task.id}`}>
            <button className="task-check" aria-label={task.completed ? `Mark "${task.title}" incomplete` : `Mark "${task.title}" complete`} disabled={toggleTask.isPending}
              onClick={() => toggleTask.mutate({ id: task.id, data: { completed: !task.completed } }, { onSuccess: refresh })}>
              {task.completed ? <CheckCircle2 size={18}/> : <Circle size={18}/>}</button>
            <div className="task-copy"><strong>{task.title}</strong><span>{task.completed ? `Done · was due ${formatDay(task.dueDate)}` : `${dueLabel(task.dueDate)} · ${formatDay(task.dueDate)}`}</span></div>
            <button className="icon-button task-delete" aria-label={`Delete task "${task.title}"`} onClick={() => deleteTask.mutate({ id: task.id }, { onSuccess: refresh })}><Trash2 size={14}/></button>
          </div>;
        }) : <p className="ws-muted">No tasks yet. Add your own, or start from a common document checklist.</p>}
        <form className="inline-form" onSubmit={submitTask}>
          <input className="ws-input" required maxLength={200} value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Add a task, e.g. Request transcript" aria-label="Task title" data-testid={`input-app-task-${app.id}`}/>
          <input className="ws-input" required type="date" value={taskDate} onChange={e => setTaskDate(e.target.value)} aria-label="Task due date"/>
          <button className="button button-primary button-small" disabled={addTask.isPending} data-testid={`button-add-app-task-${app.id}`}>{addTask.isPending ? 'Adding…' : 'Add'}</button>
        </form>
        <div className="ws-row" style={{ marginTop: 10 }}>
          <button className="ws-link" disabled={checklist.isPending} onClick={() => checklist.mutate({ id: app.id }, { onSuccess: refresh })} data-testid={`button-checklist-${app.id}`}>
            {checklist.isPending ? <LoaderCircle size={13} className="spin"/> : <ListChecks size={13}/>} Add common document checklist</button>
          <span className="ws-muted">Generic reminders, not this school’s verified requirements.</span>
        </div>
        {(addTask.isError || checklist.isError || toggleTask.isError || deleteTask.isError) && <p className="form-error" role="alert">That change didn’t save. Please try again.</p>}
      </section>

      <aside className="app-side">
        <div>
          <p className="app-section-title">OFFICIAL LINKS</p>
          {links.length ? <div className="app-links">{links.map(l => <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="ws-link">{l.label} <ExternalLink size={12}/></a>)}</div>
            : <p className="ws-muted">No link recorded. Find the official application page on the school’s website.</p>}
        </div>
        <div>
          <p className="app-section-title">DOCUMENTS</p>
          <div className="app-docs">
            {documents.map(d => <a key={d.id} href={documentHref(d.id)} download className="ws-link"><Download size={12}/> {d.title} <span className="ws-muted">({formatBytes(d.sizeBytes)})</span></a>)}
            <Link href={`/documents?application=${app.id}`} className="ws-link" data-testid={`link-upload-for-${app.id}`}><FileText size={12}/> {documents.length ? 'Manage documents' : 'Upload a document for this application'}</Link>
          </div>
        </div>
        <label className="ws-label"><span>Notes</span>
          <textarea className="ws-textarea" maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Portal login hints, contacts, fee notes…" data-testid={`input-notes-${app.id}`}/>
        </label>
        {notes !== (app.notes ?? '') && <div className="ws-row"><button className="button button-outline button-small" onClick={saveNotes} disabled={update.isPending}>Save notes</button>
          <button className="ws-link ws-link-muted" onClick={() => setNotes(app.notes ?? '')}>Discard</button></div>}
      </aside>
    </div>

    {editing && <EditDetails app={app} onClose={() => setEditing(false)}/>}

    <div className="app-footer">
      {!editing && <button className="ws-link" onClick={() => setEditing(true)} data-testid={`button-edit-application-${app.id}`}><Pencil size={13}/> Edit details</button>}
      <span className="ws-spacer"/>
      <span className="ws-muted">Updated {new Date(app.updatedAt).toLocaleDateString()}</span>
      {confirmRemove
        ? <span className="confirm-inline" role="alert">Remove this tracker and its tasks?
            <button className="button button-danger button-small" disabled={remove.isPending} onClick={() => remove.mutate({ id: app.id }, { onSuccess: refresh })} data-testid={`button-confirm-remove-${app.id}`}>{remove.isPending ? 'Removing…' : 'Remove'}</button>
            <button className="ws-link ws-link-muted" onClick={() => setConfirmRemove(false)}>Cancel</button></span>
        : <button className="ws-link ws-danger-link" onClick={() => setConfirmRemove(true)} data-testid={`button-remove-application-${app.id}`}><Trash2 size={13}/> Remove</button>}
    </div>
    {(update.isError || remove.isError) && <p className="form-error" role="alert">{errorMessage(update.error ?? remove.error, 'That change didn’t save. Please try again.')}</p>}
  </article>;
}

function EditDetails({ app, onClose }: { app: Application; onClose: () => void }) {
  const update = useUpdateApplication(); const refresh = useRefresh();
  const [programName, setProgramName] = useState(app.programName ?? '');
  const [intake, setIntake] = useState(app.intake ?? '');
  const [deadline, setDeadline] = useState(app.deadline ?? '');
  const [applicationUrl, setApplicationUrl] = useState(app.applicationUrl ?? '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    update.mutate({ id: app.id, data: {
      programName: programName.trim() || null, intake: intake.trim() || null,
      deadline: deadline || null, applicationUrl: applicationUrl.trim() || null,
    } }, { onSuccess: () => { refresh(); onClose(); } });
  };
  return <form className="ai-review" onSubmit={submit} style={{ marginTop: 14 }}>
    <div className="ws-form-grid">
      <label className="ws-label"><span>Program</span><input className="ws-input" maxLength={200} value={programName} onChange={e => setProgramName(e.target.value)}/></label>
      <label className="ws-label"><span>Intake</span><input className="ws-input" maxLength={80} value={intake} onChange={e => setIntake(e.target.value)}/></label>
      <label className="ws-label"><span>Your deadline</span><input className="ws-input" type="date" value={deadline} onChange={e => setDeadline(e.target.value)}/><small>From the official page; not verified by UniPath.</small></label>
      <label className="ws-label"><span>Application link</span><input className="ws-input" type="url" maxLength={1000} value={applicationUrl} onChange={e => setApplicationUrl(e.target.value)} placeholder="https://"/></label>
    </div>
    <div className="ws-row">
      <button className="button button-primary button-small" disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save details'}</button>
      <button type="button" className="ws-link ws-link-muted" onClick={onClose}>Cancel</button>
    </div>
    {update.isError && <p className="form-error" role="alert">{errorMessage(update.error, 'We couldn’t save these details.')}</p>}
  </form>;
}
