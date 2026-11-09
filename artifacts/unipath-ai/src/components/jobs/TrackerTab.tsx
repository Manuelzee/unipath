import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ExternalLink, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  getListJobApplicationsQueryKey, useCreateJobApplication, useDeleteJobApplication,
  useListJobApplications, useUpdateJobApplication,
} from '@workspace/api-client-react';
import type { JobApplication, JobApplicationInput } from '@workspace/api-client-react';
import { ELIGIBILITY, JOB_TYPES, SPONSORSHIP, STATUSES, errorMessage, fmtDate } from './shared';

type Form = Record<'title' | 'employer' | 'jobType' | 'location' | 'countryCode' | 'sourceUrl' | 'postedDate' | 'sponsorshipClaim' | 'authorizationNote' | 'status' | 'appliedDate' | 'interviewDate' | 'employerResponse' | 'notes' | 'eligibilityStatus', string>;
const EMPTY: Form = { title: '', employer: '', jobType: 'on_campus', location: '', countryCode: '', sourceUrl: '', postedDate: '', sponsorshipClaim: 'advertised_unverified', authorizationNote: '', status: 'saved', appliedDate: '', interviewDate: '', employerResponse: '', notes: '', eligibilityStatus: 'unknown' };
const fromJob = (j: JobApplication): Form => ({ title: j.title, employer: j.employer, jobType: j.jobType, location: j.location ?? '', countryCode: j.countryCode ?? '', sourceUrl: j.sourceUrl ?? '', postedDate: j.postedDate?.slice(0, 10) ?? '', sponsorshipClaim: j.sponsorshipClaim, authorizationNote: j.authorizationNote ?? '', status: j.status, appliedDate: j.appliedDate?.slice(0, 10) ?? '', interviewDate: j.interviewDate?.slice(0, 10) ?? '', employerResponse: j.employerResponse ?? '', notes: j.notes ?? '', eligibilityStatus: j.eligibilityStatus ?? 'unknown' });
const n = (v: string) => v.trim() || null;
const today = new Date().toISOString().slice(0, 10);

function JobForm({ initial, editingId, onDone }: { initial: Form; editingId: number | null; onDone: () => void }) {
  const qc = useQueryClient();
  const create = useCreateJobApplication(); const update = useUpdateJobApplication();
  const [f, setF] = useState<Form>(initial);
  const [local, setLocal] = useState('');
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF(c => ({ ...c, [k]: e.target.value }));
  const pending = create.isPending || update.isPending;
  const err = create.error || update.error;
  const submit = (e: FormEvent) => {
    e.preventDefault(); setLocal('');
    if (!f.title.trim() || !f.employer.trim()) return setLocal('Add a job title and employer.');
    if (f.sourceUrl.trim() && !/^https?:\/\/\S+$/i.test(f.sourceUrl.trim())) return setLocal('Posting URL must start with http:// or https://');
    if (f.countryCode.trim() && !/^[A-Za-z]{2}$/.test(f.countryCode.trim())) return setLocal('Country code must be two letters, such as US or CA.');
    const data: JobApplicationInput = {
      title: f.title.trim(), employer: f.employer.trim(), jobType: f.jobType as JobApplicationInput['jobType'], location: n(f.location),
      countryCode: n(f.countryCode)?.toUpperCase() ?? null, sourceUrl: n(f.sourceUrl), postedDate: n(f.postedDate),
      sponsorshipClaim: f.sponsorshipClaim as JobApplicationInput['sponsorshipClaim'], authorizationNote: n(f.authorizationNote),
      status: f.status as JobApplicationInput['status'], appliedDate: n(f.appliedDate), interviewDate: n(f.interviewDate),
      employerResponse: n(f.employerResponse), notes: n(f.notes),
      eligibilityStatus: f.eligibilityStatus as JobApplicationInput['eligibilityStatus'],
    };
    const ok = { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListJobApplicationsQueryKey() }); onDone(); } };
    if (editingId != null) update.mutate({ id: editingId, data }, ok); else create.mutate({ data }, ok);
  };
  const txt = (k: keyof Form, label: string, props: Record<string, unknown> = {}) => <label className="field"><span>{label}</span><input value={f[k]} onChange={set(k)} data-testid={`input-job-${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}`} {...props} /></label>;
  const sel = (k: keyof Form, label: string, opts: Record<string, string>) => <label className="field"><span>{label}</span><select value={f[k]} onChange={set(k)} data-testid={`select-job-${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}`}>{Object.entries(opts).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
  return <form className="sj-card sj-form" onSubmit={submit} data-testid="form-job">
    <div className="sj-row-between"><h2 className="sj-h2">{editingId != null ? 'Edit tracked job' : 'Add a job you found'}</h2><button type="button" className="icon-button" aria-label="Close form" onClick={onDone} data-testid="button-cancel-job"><X size={17} /></button></div>
    <p className="sj-muted">You enter these details yourself. UniPath does not check postings.</p>
    <div className="sj-grid">
      {txt('title', 'Job title', { required: true, maxLength: 200, placeholder: 'e.g. Library student assistant' })}
      {txt('employer', 'Employer', { required: true, maxLength: 200 })}
      {sel('jobType', 'Job type', JOB_TYPES)}
      {sel('status', 'Status', STATUSES)}
      {txt('location', 'Location', { maxLength: 200, placeholder: 'City or campus' })}
      {txt('countryCode', 'Country code', { maxLength: 2, placeholder: 'US' })}
      {txt('sourceUrl', 'Posting URL', { type: 'url', maxLength: 1000, placeholder: 'https://' })}
      {txt('postedDate', 'Posted date', { type: 'date', max: today })}
      {sel('sponsorshipClaim', 'Sponsorship claim', SPONSORSHIP)}
      {sel('eligibilityStatus', 'Eligibility (your note)', ELIGIBILITY)}
      {txt('appliedDate', 'Applied date', { type: 'date' })}
      {txt('interviewDate', 'Interview date', { type: 'date' })}
    </div>
    <p className="sj-muted" data-testid="text-eligibility-help">Eligibility is your own note after checking with your school or the immigration authority. It is not a UniPath determination.</p>
    <label className="field"><span>Work authorization note</span><textarea rows={2} maxLength={1000} value={f.authorizationNote} onChange={set('authorizationNote')} placeholder="What your DSO or international office told you" data-testid="input-job-authorization-note" /></label>
    <label className="field"><span>Employer response</span><textarea rows={2} maxLength={1000} value={f.employerResponse} onChange={set('employerResponse')} data-testid="input-job-employer-response" /></label>
    <label className="field"><span>Notes</span><textarea rows={3} maxLength={2000} value={f.notes} onChange={set('notes')} data-testid="input-job-notes" /></label>
    {(local || err) && <p className="form-error" role="alert" data-testid="text-job-error">{local || errorMessage(err, 'We couldn\u2019t save this job. Please try again.')}</p>}
    <div className="sj-actions"><button type="button" className="button button-outline button-small" onClick={onDone}>Cancel</button><button className="button button-primary button-small" disabled={pending} data-testid="button-save-job">{pending ? 'Saving\u2026' : editingId != null ? 'Save changes' : 'Save job'}</button></div>
  </form>;
}

export function TrackerTab({ prefill, clearPrefill }: { prefill: { title: string; jobType: string } | null; clearPrefill: () => void }) {
  const qc = useQueryClient();
  const q = useListJobApplications({ query: { queryKey: getListJobApplicationsQueryKey() } });
  const del = useDeleteJobApplication();
  const [editing, setEditing] = useState<{ id: number | null; form: Form } | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [fs, setFs] = useState({ status: '', jobType: '', sponsorship: '' });
  useEffect(() => { if (prefill) { setEditing({ id: null, form: { ...EMPTY, title: prefill.title, jobType: prefill.jobType } }); clearRef.current(); } }, [prefill]);
  const clearRef = useRef(clearPrefill); clearRef.current = clearPrefill;
  const all = q.data ?? [];
  const jobs = all.filter(j => (!fs.status || j.status === fs.status) && (!fs.jobType || j.jobType === fs.jobType) && (!fs.sponsorship || j.sponsorshipClaim === fs.sponsorship));
  const filterSel = (k: keyof typeof fs, label: string, opts: Record<string, string>) => <label className="field"><span>{label}</span><select value={fs[k]} onChange={e => setFs(c => ({ ...c, [k]: e.target.value }))} data-testid={`select-filter-${k}`}><option value="">All</option>{Object.entries(opts).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
  const upcoming = all.filter(j => j.interviewDate && j.interviewDate.slice(0, 10) >= today).sort((a, b) => a.interviewDate!.localeCompare(b.interviewDate!));
  const remove = (id: number) => del.mutate({ id }, { onSuccess: () => { setConfirmId(null); void qc.invalidateQueries({ queryKey: getListJobApplicationsQueryKey() }); } });
  return <div className="sj-stack">
    <div className="sj-row-between"><p className="sj-body">Jobs you found on official employer or university sites. Only you add them here.</p>
      {!editing && <button className="button button-primary button-small" onClick={() => setEditing({ id: null, form: EMPTY })} data-testid="button-add-job"><Plus size={15} /> Add job</button>}</div>
    {editing && <JobForm key={editing.id ?? 'new'} initial={editing.form} editingId={editing.id} onDone={() => setEditing(null)} />}
    {upcoming.length > 0 && <div className="sj-card sj-upcoming" data-testid="section-upcoming-interviews"><h2 className="sj-h2"><CalendarClock size={16} /> Upcoming interviews</h2>
      <ul>{upcoming.map(j => <li key={j.id} data-testid={`text-upcoming-${j.id}`}><strong>{fmtDate(j.interviewDate)}</strong> {j.title}, {j.employer}</li>)}</ul></div>}
    {q.isLoading ? <div className="loading-stack"><div className="skeleton skeleton-card" /><div className="skeleton skeleton-card" /></div>
      : q.isError ? <div className="state-card"><h3>We couldn't load your tracker</h3><p>{errorMessage(q.error, 'Please try again.')}</p><button className="button button-primary button-small" onClick={() => void q.refetch()} data-testid="button-retry-jobs">Try again</button></div>
      : all.length > 0 && <div className="sj-filters" data-testid="section-job-filters">{filterSel('status', 'Status', STATUSES)}{filterSel('jobType', 'Job type', JOB_TYPES)}{filterSel('sponsorship', 'Sponsorship claim', SPONSORSHIP)}</div>}
    {q.isLoading || q.isError ? null
      : all.length > 0 && !jobs.length ? <div className="state-card" data-testid="status-filter-empty"><h3>No jobs match these filters</h3><button className="button button-outline button-small" onClick={() => setFs({ status: '', jobType: '', sponsorship: '' })} data-testid="button-clear-filters">Clear filters</button></div>
      : !jobs.length ? <div className="state-card" data-testid="status-tracker-empty"><div className="state-icon"><CalendarClock size={22} /></div><h3>Nothing tracked yet</h3><p>When you find a job on an official site, add it here to keep its posting date, status, and sponsorship label together.</p>{!editing && <button className="button button-primary button-small" onClick={() => setEditing({ id: null, form: EMPTY })} data-testid="button-add-first-job">Add your first job</button>}</div>
      : <ul className="sj-jobs">{jobs.map(j => <li key={j.id} className="sj-card sj-job" data-testid={`row-job-${j.id}`}>
        <div className="sj-job-head"><div><strong data-testid={`text-job-title-${j.id}`}>{j.title}</strong><span>{j.employer}{j.location ? ` \u00b7 ${j.location}` : ''}{j.countryCode ? ` \u00b7 ${j.countryCode}` : ''}</span></div>
          <span className={`sj-status sj-s-${j.status}`} data-testid={`status-job-${j.id}`}>{STATUSES[j.status] ?? j.status}</span></div>
        <div className="sj-badges"><span className="sj-chip">{JOB_TYPES[j.jobType] ?? j.jobType}</span><span className={`sj-elig sj-el-${j.eligibilityStatus ?? 'unknown'}`} title="Your own note, not a UniPath determination" data-testid={`badge-eligibility-${j.id}`}>{ELIGIBILITY[j.eligibilityStatus ?? 'unknown'] ?? j.eligibilityStatus}</span><span className={`sj-spons sj-sp-${j.sponsorshipClaim}`} data-testid={`badge-sponsorship-${j.id}`}>{SPONSORSHIP[j.sponsorshipClaim] ?? j.sponsorshipClaim}</span></div>
        <dl className="sj-facts">
          <div><dt>Posted</dt><dd data-testid={`text-posted-${j.id}`}>{j.postedDate ? fmtDate(j.postedDate) : 'Posting date not entered'}</dd></div>
          {j.appliedDate && <div><dt>Applied</dt><dd>{fmtDate(j.appliedDate)}</dd></div>}
          {j.interviewDate && <div><dt>Interview</dt><dd data-testid={`text-interview-${j.id}`}>{fmtDate(j.interviewDate)}</dd></div>}
        </dl>
        {j.authorizationNote && <p className="sj-small"><b>Authorization note:</b> {j.authorizationNote}</p>}
        {j.employerResponse && <p className="sj-small"><b>Employer response:</b> {j.employerResponse}</p>}
        {j.notes && <p className="sj-small">{j.notes}</p>}
        <div className="sj-actions">
          {j.sourceUrl && /^https?:\/\//i.test(j.sourceUrl) && <a href={j.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-link" data-testid={`link-posting-${j.id}`}>Posting <ExternalLink size={13} /></a>}
          <button className="button button-outline button-small" onClick={() => setEditing({ id: j.id, form: fromJob(j) })} data-testid={`button-edit-job-${j.id}`}><Pencil size={13} /> Edit</button>
          {confirmId === j.id ? <span className="sj-confirm" role="alert">Delete this job?
            <button className="button button-small sj-danger" disabled={del.isPending} onClick={() => remove(j.id)} data-testid={`button-confirm-delete-job-${j.id}`}>{del.isPending ? 'Deleting\u2026' : 'Delete'}</button>
            <button className="button button-outline button-small" onClick={() => setConfirmId(null)} data-testid={`button-cancel-delete-job-${j.id}`}>Keep</button></span>
            : <button className="icon-button" aria-label={`Delete ${j.title}`} onClick={() => { del.reset(); setConfirmId(j.id); }} data-testid={`button-delete-job-${j.id}`}><Trash2 size={15} /></button>}
        </div>
        {confirmId === j.id && del.isError && <p className="form-error" role="alert">{errorMessage(del.error, 'We couldn\u2019t delete this job. Please try again.')}</p>}
      </li>)}</ul>}
  </div>;
}
