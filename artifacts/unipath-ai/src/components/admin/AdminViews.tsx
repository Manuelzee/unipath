import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  getGetAdminAccessQueryKey, getGetAdminInstitutionQueryKey, getGetAdminStatusQueryKey,
  getListAdminInstitutionsQueryKey, useConfirmAdminSetup, useGetAdminAccess, useGetAdminInstitution,
  useGetAdminStatus, useListAdminInstitutions, useReviewAdminProposal, useRetryAdminInstitutionCheck,
  useRunAdminInstitutionCheck,
} from '@workspace/api-client-react';
import type { AdminSourceField, AdminVerificationJob, AdminVerificationProposal } from '@workspace/api-client-react';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Copy, ExternalLink, LoaderCircle, Lock, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import './admin.css';

export const PRODUCTION_URL = 'https://uni-path-explorer.replit.app';

const fmt = (d?: string | null) => d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
const errMsg = (e: unknown) => {
  const x = e as { data?: { error?: string; message?: string }; message?: string } | null;
  return x?.data?.error || x?.data?.message || x?.message || 'Request failed.';
};
const isProd = (env?: string) => (env ?? '').toLowerCase().startsWith('prod');

function tone(status: string) {
  const s = status.toLowerCase();
  if (/(match|approved|completed|succeeded|success|current|ok)/.test(s)) return 'ok';
  if (/(fail|error|conflict|reject|interrupt)/.test(s)) return 'bad';
  if (/(running|queued|in_progress|processing)/.test(s)) return 'run';
  if (/(pending|outdated|missing|unverified|unknown|review|source)/.test(s)) return 'warn';
  return '';
}
export function StatusPill({ status }: { status: string }) {
  return <span className={`adm-pill ${tone(status)}`} data-testid={`status-${status}`}>{status.replaceAll('_', ' ')}</span>;
}
function EnvBadge({ env }: { env: string }) {
  return <span className={`adm-env ${isProd(env) ? 'adm-env-prod' : 'adm-env-preview'}`} data-testid="badge-environment">{isProd(env) ? 'Production' : 'Preview / development'} · {env}</span>;
}
function Loading() { return <div className="loading-stack" aria-label="Loading"><div className="skeleton skeleton-line"/><div className="skeleton skeleton-card"/></div>; }
function Retry({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return <div className="adm-banner err" role="alert"><AlertTriangle size={17}/><div><strong>{msg}</strong><div style={{marginTop:8}}><button className="button button-outline button-small" onClick={onRetry} data-testid="button-admin-retry"><RefreshCw size={14}/> Try again</button></div></div></div>;
}
function Head({ kicker, title, body, action }: { kicker: string; title: string; body: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{kicker}</div><h1>{title}</h1><p>{body}</p></div>{action}</div>;
}

export function AccessDenied() {
  return <div className="page page-enter"><div className="state-card" data-testid="admin-access-denied"><div className="state-icon warning"><Lock size={21}/></div><h3>Admin access required</h3><p>This area is reserved for the UniPath owner. Your account is a student account, and no admin data was loaded.</p><Link href="/dashboard" className="button button-primary button-small">Back to my plan <ArrowRight size={15}/></Link></div></div>;
}

/* ---------- Setup ---------- */
export function AdminSetupView() {
  const qc = useQueryClient();
  const access = useGetAdminAccess({ query: { queryKey: getGetAdminAccessQueryKey() } });
  const confirm = useConfirmAdminSetup();
  const [agree, setAgree] = useState(false);
  const [copied, setCopied] = useState(false);
  const a = access.data;
  const copy = async () => { if (!a) return; try { await navigator.clipboard.writeText(a.userId); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); } };
  const submit = () => {
    if (!agree || !a?.canSetup) return;
    confirm.mutate({ data: { confirmed: true } }, { onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getGetAdminAccessQueryKey() });
      void qc.invalidateQueries({ queryKey: getGetAdminStatusQueryKey() });
    } });
  };
  return <div className="page page-enter"><Head kicker="OWNER SETUP" title="Claim admin access, deliberately." body="Admin is never granted automatically, by email, or by a browser setting. The server decides."/>
    {access.isLoading ? <Loading/> : access.isError || !a ? <Retry msg="Couldn’t read your access status." onRetry={() => void access.refetch()}/> : <div className="adm">
      <div className="adm-meta"><EnvBadge env={a.environment}/></div>
      <section className="adm-panel">
        <h2>Your immutable account ID</h2>
        <div className="adm-copy"><code className="adm-code" data-testid="text-user-id">{a.userId}</code><button className="button button-outline button-small" onClick={copy} data-testid="button-copy-user-id">{copied ? <><Check size={14}/> Copied</> : <><Copy size={14}/> Copy ID</>}</button></div>
        <h3>How the owner enables setup</h3>
        <ol className="adm-steps">
          <li>Copy the ID above (not your email address).</li>
          <li>In the server’s secrets for the <strong>{isProd(a.environment) ? 'production deployment' : 'preview / development workspace'}</strong>, set <code className="adm-code">UNIPATH_ADMIN_SETUP_USER_ID</code> to that ID.</li>
          <li>Preview and production are configured separately. After changing production secrets, republish.</li>
          <li>Return here, read the confirmation, and confirm.</li>
        </ol>
      </section>
      {a.isAdmin ? <div className="adm-banner" data-testid="text-setup-complete"><ShieldCheck size={17}/><div><strong>This account is an admin in this environment.</strong> <Link href="/admin" className="text-link" style={{display:'inline-flex'}}>Open dashboard <ArrowRight size={13}/></Link></div></div>
      : !a.setupConfigured ? <div className="adm-banner warn"><AlertTriangle size={17}/><div><strong>Setup isn’t configured on this server.</strong> No setup user ID is set for this environment. Your account remains a student account.</div></div>
      : !a.canSetup ? <div className="adm-banner warn"><Lock size={17}/><div><strong>This account isn’t the configured setup owner.</strong> Your account remains a student account.</div></div>
      : <section className="adm-panel">
        <h2>Confirm owner admin setup</h2>
        <label className="adm-check"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} data-testid="checkbox-confirm-setup"/><span>I am the owner of UniPath AI and I want this account ({a.userId}) to become an admin in the <strong>{a.environment}</strong> environment. I understand admins can run source checks and approve data changes.</span></label>
        <div className="adm-actions" style={{marginTop:14}}><button className="button button-primary button-small" disabled={!agree || confirm.isPending} onClick={submit} data-testid="button-confirm-setup">{confirm.isPending ? <><LoaderCircle size={14} className="spin"/> Confirming…</> : <><ShieldCheck size={14}/> Confirm admin setup</>}</button></div>
        {confirm.isError && <p className="form-error" role="alert" style={{marginTop:10}}>{errMsg(confirm.error)}</p>}
        {confirm.isSuccess && <p style={{color:'#23766b',fontSize:12,marginTop:10}} data-testid="text-setup-success">Setup confirmed. Access refreshed.</p>}
      </section>}
    </div>}
  </div>;
}

/* ---------- Dashboard ---------- */
export function AdminDashboardView() {
  const access = useGetAdminAccess({ query: { queryKey: getGetAdminAccessQueryKey() } });
  if (access.isLoading) return <div className="page"><Loading/></div>;
  if (access.isError) return <div className="page"><Retry msg="Couldn’t confirm admin access." onRetry={() => void access.refetch()}/></div>;
  if (!access.data?.isAdmin) return <AccessDenied/>;
  return <AdminDashboardInner/>;
}

function AdminDashboardInner() {
  const status = useGetAdminStatus({ query: { queryKey: getGetAdminStatusQueryKey() } });
  const [search, setSearch] = useState(''); const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);
  const params = { search: q || undefined, page };
  const list = useListAdminInstitutions(params, { query: { queryKey: getListAdminInstitutionsQueryKey(params) } });
  const s = status.data;
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / Math.max(1, list.data.pageSize))) : 1;
  return <div className="page page-enter"><Head kicker="ADMIN · SOURCE VERIFICATION" title="Verification desk." body="Live counts from the database this app is connected to. Source support isn’t verification until reviewed."
    action={<a className="button button-outline button-small" href={PRODUCTION_URL} target="_blank" rel="noreferrer" data-testid="link-production">Open published app <ExternalLink size={14}/></a>}/>
    <div className="adm">
      {status.isLoading ? <Loading/> : status.isError || !s ? <Retry msg={`Couldn’t load database status. ${errMsg(status.error)}`} onRetry={() => void status.refetch()}/> : <>
        <div className="adm-meta"><EnvBadge env={s.environment}/><span>Database: <code>{s.databaseIdentity}</code></span><span>Checked {fmt(s.checkedAt)}</span><button className="text-link" style={{border:0,background:'none',cursor:'pointer'}} onClick={() => void status.refetch()} data-testid="button-refresh-status"><RefreshCw size={12}/> Refresh</button></div>
        {!isProd(s.environment) && <div className="adm-banner warn"><AlertTriangle size={17}/><div><strong>You’re viewing the preview database.</strong> These counts are not production. Production data lives at the published app and its own database.</div></div>}
        <div className="adm-stats">
          <div className="adm-stat"><span>Unique institutions</span><strong data-testid="text-unique-institutions">{s.uniqueInstitutionIds.toLocaleString()}</strong><small>{s.institutionCount.toLocaleString()} institution rows</small></div>
          <div className="adm-stat"><span>Program facts</span><strong>{s.programFacts.toLocaleString()}</strong><small>Source-reported records</small></div>
          <div className="adm-stat"><span>Saved profiles</span><strong data-testid="text-saved-profiles">{s.savedProfiles.toLocaleString()}</strong><small>Aggregate count only</small></div>
          <div className={`adm-stat ${s.pendingProposals ? 'pend' : ''}`}><span>Pending reviews</span><strong data-testid="text-pending">{s.pendingProposals}</strong><small className={s.failedChecks ? '' : ''}>{s.failedChecks} failed check{s.failedChecks === 1 ? '' : 's'}</small></div>
        </div>
        {s.automaticChangesRequireReview && <div className="adm-banner"><ShieldCheck size={17}/><div>Automatic checks only propose changes. Last-known-good values stay live until an admin approves.</div></div>}
      </>}
      <div className="adm-split">
        <section className="adm-panel" aria-label="Institutions">
          <h2>Institutions</h2>
          <label className="adm-search"><Search size={15}/><input value={search} onChange={e => setSearch(e.target.value)} maxLength={160} placeholder="Search by name" aria-label="Search institutions" data-testid="input-admin-search"/></label>
          {list.isLoading ? <Loading/> : list.isError ? <Retry msg="Couldn’t load institutions." onRetry={() => void list.refetch()}/> : !list.data?.items.length ? <p style={{color:'#80909a',fontSize:12,marginTop:14}}>No institutions match.</p> :
            <div className="adm-list">{list.data.items.map(i => <button key={i.id} className={`adm-row ${selected === i.id ? 'on' : ''}`} onClick={() => setSelected(i.id)} data-testid={`row-institution-${i.id}`}><strong>{i.name}</strong><span>{i.country} · {i.dataSource}{i.dataYear ? ` ${i.dataYear}` : ''}</span></button>)}</div>}
          {list.data && <div className="adm-pager"><button className="icon-button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} aria-label="Previous page" data-testid="button-prev-page"><ArrowLeft size={14}/></button><span>Page {list.data.page} of {pages} · {list.data.total.toLocaleString()} total</span><button className="icon-button" disabled={page >= pages} onClick={() => setPage(p => p + 1)} aria-label="Next page" data-testid="button-next-page"><ArrowRight size={14}/></button></div>}
        </section>
        <section className="adm-panel" aria-label="Institution detail">{selected ? <InstitutionDetail id={selected}/> : <div className="state-card" style={{border:0}}><div className="state-icon"><Search size={20}/></div><h3>Pick an institution</h3><p>Review its source fields, check history, and any proposed changes.</p></div>}</section>
      </div>
    </div>
  </div>;
}

function InstitutionDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const detail = useGetAdminInstitution(id, { query: { queryKey: getGetAdminInstitutionQueryKey(id), enabled: !!id } });
  const [conflict, setConflict] = useState<string | null>(null);
  const run = useRunAdminInstitutionCheck(); const retry = useRetryAdminInstitutionCheck(); const review = useReviewAdminProposal();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: getGetAdminInstitutionQueryKey(id) });
    void qc.invalidateQueries({ queryKey: getGetAdminStatusQueryKey() });
    void qc.invalidateQueries({ queryKey: ['/api/admin/institutions'] });
  };
  if (detail.isLoading) return <Loading/>;
  if (detail.isError || !detail.data) return <Retry msg={`Couldn’t load this institution. ${errMsg(detail.error)}`} onRetry={() => void detail.refetch()}/>;
  const { institution: inst, fields, jobs, proposals } = detail.data;
  const pending = proposals.filter(p => p.status.toLowerCase() === 'pending');
  const done = proposals.filter(p => p.status.toLowerCase() !== 'pending');
  return <div data-testid={`detail-${inst.id}`}>
    <div className="panel-heading" style={{alignItems:'flex-start'}}><div><span className="eyebrow">{inst.country} · {inst.dataSource} {inst.dataYear}</span><h2 style={{margin:'4px 0 2px'}}>{inst.name}</h2>{inst.website && <a className="text-link" href={inst.website.startsWith('http') ? inst.website : `https://${inst.website}`} target="_blank" rel="noreferrer">{inst.website} <ExternalLink size={11}/></a>}</div>
      <button className="button button-primary button-small" disabled={run.isPending} onClick={() => run.mutate({ id }, { onSettled: refresh })} data-testid="button-run-check">{run.isPending ? <><LoaderCircle size={14} className="spin"/> Running…</> : <><RefreshCw size={14}/> Run source check</>}</button></div>
    {run.isError && <p className="form-error" role="alert">{errMsg(run.error)}</p>}
    <div className="adm-banner" style={{fontSize:11}}><ShieldCheck size={15}/><div>A source page loading (HTTP 200) does not verify anything. A supported claim only creates a pending proposal. A field counts as verified only after a reviewer approves it. Supported checks: exact official identity name, and scoped pilot evidence where it exists. Other fields remain source-reported or unknown — never a global “verified” claim. Tuition amounts are not shown to students.</div></div>

    <h3>Source fields</h3>
    {fields.length ? <div className="adm-scroll"><table className="adm-table"><thead><tr><th>Field</th><th>Last-known-good value</th><th>Status</th><th>Source / checked</th></tr></thead><tbody>
      {fields.map((f: AdminSourceField) => <tr key={f.fieldKey} data-testid={`field-${f.fieldKey}`}><td><strong>{f.title}</strong></td><td>{f.value || <em style={{color:'#98a6af'}}>none</em>}{f.message && <div style={{color:'#80909a',fontSize:10,marginTop:3}}>{f.message}</div>}</td><td><StatusPill status={f.status}/></td><td>{f.sourceUrl ? <a href={f.sourceUrl} target="_blank" rel="noreferrer">{f.sourceUrl}</a> : 'No source URL'}<div style={{color:'#80909a',fontSize:10}}>{fmt(f.checkedAt)}</div></td></tr>)}
    </tbody></table></div> : <p style={{fontSize:12,color:'#80909a'}}>No source fields recorded.</p>}

    <h3>Pending changes ({pending.length})</h3>
    {conflict && <div className="adm-banner warn" role="alert" data-testid="text-proposal-conflict"><AlertTriangle size={15}/><div><strong>Not applied: conflict.</strong> The record changed after this proposal was made. The data has been refreshed. Review the current value and run a new source check if you need one.</div></div>}
    {pending.length ? pending.map(p => <ProposalCard key={p.id} p={p} pending={review.isPending && review.variables?.id === p.id} error={review.isError && review.variables?.id === p.id ? errMsg(review.error) : null} onDecide={(decision, note) => review.mutate({ id: p.id, data: { decision, note: note.trim() || undefined } }, { onSuccess: r => setConflict(r.status.toLowerCase() === 'conflict' ? r.id : null), onSettled: refresh })}/>) : <p style={{fontSize:12,color:'#80909a'}}>Nothing awaiting review.</p>}

    <h3>Check history</h3>
    {jobs.length ? jobs.map((j: AdminVerificationJob) => { const stale = j.status.toLowerCase() === 'running' && Date.now() - new Date(j.requestedAt).getTime() > 5 * 60 * 1000; const failed = /(fail|error|interrupt)/i.test(j.status) || !!j.error || stale; return <div className="adm-card" key={j.id} data-testid={`job-${j.id}`}>
      <div className="adm-actions" style={{justifyContent:'space-between'}}><span><StatusPill status={j.status}/> Requested {fmt(j.requestedAt)} · Completed {fmt(j.completedAt)}</span>
        {failed && <button className="button button-outline button-small" disabled={retry.isPending && retry.variables?.id === j.id} onClick={() => retry.mutate({ id: j.id }, { onSettled: refresh })} data-testid={`button-retry-job-${j.id}`}>{retry.isPending && retry.variables?.id === j.id ? <LoaderCircle size={13} className="spin"/> : <RefreshCw size={13}/>} Retry</button>}</div>
      {stale && <div style={{color:'#8a5a22'}}>Running for over 5 minutes. The check process may have been interrupted.</div>}
      {j.error && <div style={{color:'#a6453f'}}>Error: {j.error}</div>}
      {retry.isError && retry.variables?.id === j.id && <div className="form-error">{errMsg(retry.error)}</div>}
      {j.checks.map(c => <div key={c.fieldKey} style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}><StatusPill status={c.status}/><strong>{c.title}</strong><span>{c.message}</span>{c.sourceUrl && <a className="text-link" href={c.sourceUrl} target="_blank" rel="noreferrer">source <ExternalLink size={10}/></a>}</div>)}
    </div>; }) : <p style={{fontSize:12,color:'#80909a'}}>No checks have run for this institution.</p>}

    {done.length > 0 && <><h3>Reviewed changes</h3>{done.map(p => <div className="adm-card" key={p.id}><div className="adm-actions"><StatusPill status={p.status}/><strong>{p.fieldKey}</strong> → {p.value}</div><span>Reviewed {fmt(p.reviewedAt)}{p.reviewNote ? ` · “${p.reviewNote}”` : ''}</span></div>)}</>}
  </div>;
}

function ProposalCard({ p, pending, error, onDecide }: { p: AdminVerificationProposal; pending: boolean; error: string | null; onDecide: (d: 'approve' | 'reject', note: string) => void }) {
  const [note, setNote] = useState('');
  const [inspected, setInspected] = useState(false);
  const noteOk = note.trim().length >= 20;
  return <div className="adm-card" data-testid={`proposal-${p.id}`}>
    <div className="adm-actions"><StatusPill status={p.status}/><strong>{p.fieldKey}</strong></div>
    <div>Current: <strong>{p.previousValue ?? 'none'}</strong> → Proposed: <strong>{p.value}</strong></div>
    <div>Source: <a className="text-link" style={{display:'inline-flex'}} href={p.sourceUrl} target="_blank" rel="noreferrer">{p.sourceUrl} <ExternalLink size={10}/></a> · checked {fmt(p.checkedAt)}</div>
    <textarea value={note} maxLength={1000} onChange={e => setNote(e.target.value)} placeholder="Note grounded in the source: what on the official page supports this? (required to approve, at least 20 characters)" aria-label="Review note" data-testid={`input-note-${p.id}`}/>
    <span style={{fontSize:10,color:noteOk?'#23766b':'#80909a'}}>{note.trim().length}/20 characters minimum to approve. Reject doesn't need a note.</span>
    <label className="adm-check" style={{fontSize:11}}><input type="checkbox" checked={inspected} onChange={e => setInspected(e.target.checked)} data-testid={`checkbox-inspected-${p.id}`}/><span>I opened the official source above and confirmed it supports this exact value.</span></label>
    <div className="adm-actions">
      <button className="button button-primary button-small" disabled={pending || !noteOk || !inspected} onClick={() => onDecide('approve', note)} data-testid={`button-approve-${p.id}`}>{pending ? <LoaderCircle size={13} className="spin"/> : <Check size={13}/>} Approve & apply</button>
      <button className="button button-outline button-small adm-danger" disabled={pending} onClick={() => onDecide('reject', note)} data-testid={`button-reject-${p.id}`}>Reject</button>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
