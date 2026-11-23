import { type FormEvent, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { exportMyData, getGetAiStatusQueryKey, useDeleteMyData, useGetAiStatus } from '@workspace/api-client-react';
import type { DataDeletionResult } from '@workspace/api-client-react';
import { ArrowRight, Download, LoaderCircle, ShieldCheck, SlidersHorizontal, Trash2 } from 'lucide-react';
import { PageHeading, errorMessage } from '@/components/workspace/shared';
import { AccountPanel, DeleteAccount } from './AccountSettings';

export function SettingsView() {
  const ai = useGetAiStatus({ query: { queryKey: getGetAiStatusQueryKey(), staleTime: 30_000 } });

  return <div className="page page-enter">
    <PageHeading kicker="ACCOUNT CONTROLS" title="Settings." body="Manage your sign-in, preferences and the data UniPath keeps for you."/>
    <div className="settings-grid">
      <AccountPanel/>

      <section className="ws-panel">
        <div className="ws-head"><div><span className="eyebrow">PREFERENCES</span><h2>Profile &amp; matching</h2><p>Your answers shape matches and AI context. Change them any time.</p></div><div className="profile-icon"><SlidersHorizontal size={19}/></div></div>
        <div className="settings-item"><div><strong>Guided profile setup</strong><span>Walk through the five onboarding steps again.</span></div><Link href="/onboarding" className="button button-outline button-small">Open wizard <ArrowRight size={14}/></Link></div>
        <div className="settings-item"><div><strong>Full profile form</strong><span>Edit every field, priorities and budget on one page.</span></div><Link href="/profile" className="button button-outline button-small">Edit profile <ArrowRight size={14}/></Link></div>
      </section>

      <section className="ws-panel">
        <div className="ws-head"><div><span className="eyebrow">PLAN &amp; USAGE</span><h2>{ai.data?.plan === 'premium' ? 'Premium' : ai.data?.plan === 'student-plus' ? 'Student Plus' : 'Free'} plan</h2><p>Payments are not connected yet, so every working tool is free. Nothing is charged.</p></div></div>
        <div className="settings-item"><div><strong>AI assistant</strong><span>{ai.isLoading ? 'Checking…' : !ai.data ? 'Status unavailable' : ai.data.configured ? `${ai.data.usedToday} of ${ai.data.dailyLimit} requests used today (resets 00:00 UTC)` : 'Not connected yet'}</span></div>
          <Link href="/ai-assistant" className="ws-link">Open assistant <ArrowRight size={13}/></Link></div>
        <div className="settings-item"><div><strong>Plans &amp; billing</strong><span>See plan details and payment availability.</span></div>
          <div className="ws-row"><Link href="/plans" className="ws-link">Plans</Link><Link href="/billing" className="ws-link">Billing</Link></div></div>
      </section>

      <section className="ws-panel">
        <div className="ws-head"><div><span className="eyebrow">YOUR DATA</span><h2>Download a copy</h2><p>Your profile, shortlist, applications, tasks, saved AI notes and job tracker as a JSON file.</p></div><div className="profile-icon"><Download size={19}/></div></div>
        <ExportButton/>
      </section>

      <DeleteData/>
      <DeleteAccount/>
    </div>
    <div className="ws-notice"><ShieldCheck size={16}/><span>UniPath stores only what you enter, plus AI usage counts (no message text) to enforce fair-use limits. Your budget is private and never shared with schools.</span></div>
  </div>;
}

function ExportButton() {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const download = async () => {
    setState('busy');
    try {
      const data = await exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `unipath-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setState('done');
    } catch { setState('error'); }
  };
  return <div className="settings-item"><div><strong>Export my data</strong><span>{state === 'done' ? 'Download started.' : state === 'error' ? 'The export failed. Please try again.' : 'Prepared on demand; nothing is emailed.'}</span></div>
    <button className="button button-outline button-small" onClick={() => void download()} disabled={state === 'busy'} data-testid="button-export-data">
      {state === 'busy' ? <><LoaderCircle size={14} className="spin"/> Preparing…</> : <><Download size={14}/> Download JSON</>}</button></div>;
}

function DeleteData() {
  const remove = useDeleteMyData(); const qc = useQueryClient();
  const [confirm, setConfirm] = useState('');
  const [result, setResult] = useState<DataDeletionResult | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (confirm !== 'DELETE') return;
    remove.mutate({ data: { confirm: 'DELETE' } }, { onSuccess: data => {
      setResult(data); setConfirm('');
      // Every cached view of the deleted records must refetch; inactive ones are dropped.
      qc.removeQueries({ type: 'inactive' });
      void qc.invalidateQueries();
    } });
  };
  const labels: Record<string, string> = { profiles: 'Profile', savedUniversities: 'Saved schools', applications: 'Applications', tasks: 'Tasks', aiSavedItems: 'Saved AI notes', aiUsage: 'AI usage records', jobApplications: 'Tracked jobs' };
  return <section className="ws-panel danger-zone" style={{ gridColumn: '1 / -1' }}>
    <div className="ws-head"><div><span className="eyebrow">DANGER ZONE</span><h2>Delete my UniPath data</h2><p>Permanently removes your profile, shortlist, applications, tasks, saved AI notes, AI usage records and job tracker. Your account stays, so you can start fresh; to remove the account too, use “Delete my account” below. This cannot be undone.</p></div><div className="profile-icon" style={{ background: '#fbe9e7', color: '#a3463f' }}><Trash2 size={19}/></div></div>
    {result ? <div role="status" data-testid="text-deletion-result"><strong>{result.note}</strong>
      <ul className="result-list">{Object.entries(result.deleted).map(([k, v]) => <li key={k}>{labels[k] ?? k}: {v}</li>)}</ul></div>
      : <form className="ws-row" onSubmit={submit} style={{ alignItems: 'flex-end' }}>
        <label className="ws-label" style={{ flex: '1 1 220px' }}><span>Type DELETE to confirm</span>
          <input className="ws-input" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off" aria-describedby="delete-help" data-testid="input-confirm-delete"/></label>
        <button className="button button-danger" disabled={confirm !== 'DELETE' || remove.isPending} data-testid="button-delete-data">{remove.isPending ? 'Deleting…' : 'Delete my data'}</button>
        <small id="delete-help" className="ws-muted" style={{ flexBasis: '100%' }}>Consider downloading a copy first.</small>
      </form>}
    {remove.isError && <p className="form-error" role="alert">{errorMessage(remove.error, 'Nothing was deleted. Please try again.')}</p>}
  </section>;
}
