import { type FormEvent, useState } from 'react';
import { useLocation } from 'wouter';
import { changePassword, deleteAccount, signOutOtherSessions, updateAccount } from '@workspace/api-client-react';
import { Check, KeyRound, LoaderCircle, LogOut, Trash2, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/components/workspace/shared';

type Status = { kind: 'idle' | 'busy' | 'done' | 'error'; message?: string };
const idle: Status = { kind: 'idle' };
async function attempt(set: (s: Status) => void, action: () => Promise<string | undefined>) {
  set({ kind: 'busy' });
  try { set({ kind: 'done', message: await action() }); } catch (e) { set({ kind: 'error', message: errorMessage(e, 'That didn’t work. Please try again.') }); }
}
function StatusLine({ status }: { status: Status }) {
  if (status.kind === 'error') return <p className="form-error" role="alert">{status.message}</p>;
  if (status.kind === 'done' && status.message) return <p className="ws-muted" role="status" style={{ color: '#23766b' }}>{status.message}</p>;
  return null;
}

/** Name, sign-in methods, password and sessions for the signed-in account. */
export function AccountPanel() {
  const { user, setUser, methods } = useAuth();
  const [first, setFirst] = useState(user?.firstName ?? '');
  const [last, setLast] = useState(user?.lastName ?? '');
  const [nameStatus, setNameStatus] = useState<Status>(idle);
  const [sessionsStatus, setSessionsStatus] = useState<Status>(idle);
  if (!user) return null;
  const nameChanged = first.trim() !== user.firstName || last.trim() !== user.lastName;
  const saveName = (e: FormEvent) => {
    e.preventDefault();
    void attempt(setNameStatus, async () => { setUser(await updateAccount({ firstName: first.trim(), lastName: last.trim() })); return 'Name saved.'; });
  };
  return <section className="ws-panel">
    <div className="ws-head"><div><span className="eyebrow">ACCOUNT</span><h2>Sign-in &amp; security</h2><p>Your UniPath account: how you sign in and where you’re signed in.</p></div><div className="profile-icon"><KeyRound size={19}/></div></div>
    <div className="settings-item"><div><strong>{user.email}</strong><span>{user.emailVerified ? 'Verified email address' : 'Email not verified yet'}</span></div></div>
    <form className="settings-item" onSubmit={saveName} style={{ alignItems: 'flex-end' }}>
      <label className="ws-label" style={{ flex: '1 1 130px' }}><span>First name</span><input className="ws-input" value={first} onChange={e => setFirst(e.target.value)} maxLength={60} autoComplete="given-name" required data-testid="input-account-first-name"/></label>
      <label className="ws-label" style={{ flex: '1 1 130px' }}><span>Last name</span><input className="ws-input" value={last} onChange={e => setLast(e.target.value)} maxLength={60} autoComplete="family-name" data-testid="input-account-last-name"/></label>
      <button className="button button-outline button-small" disabled={!nameChanged || !first.trim() || nameStatus.kind === 'busy'} data-testid="button-save-name">
        {nameStatus.kind === 'busy' ? <><LoaderCircle size={14} className="spin"/> Saving…</> : <><UserRound size={14}/> Save name</>}</button>
      <div style={{ flexBasis: '100%' }}><StatusLine status={nameStatus}/></div>
    </form>
    <div className="settings-item"><div><strong>Ways to sign in</strong><span>
      {[user.hasPassword && 'Email and password', user.googleConnected && 'Google'].filter(Boolean).join(' · ') || 'No password yet: add one below'}
      {!user.googleConnected && methods.google && '. Continue with Google works too if your Google account uses this email.'}
    </span></div></div>
    <PasswordForm/>
    <div className="settings-item"><div><strong>Other devices</strong><span>Sign out everywhere except this browser.</span></div>
      <button className="button button-outline button-small" disabled={sessionsStatus.kind === 'busy'} data-testid="button-sign-out-others"
        onClick={() => void attempt(setSessionsStatus, async () => { const { revoked } = await signOutOtherSessions(); return revoked ? `Signed out of ${revoked} other session${revoked === 1 ? '' : 's'}.` : 'No other sessions were signed in.'; })}>
        <LogOut size={14}/> Sign out others</button>
      <div style={{ flexBasis: '100%' }}><StatusLine status={sessionsStatus}/></div>
    </div>
  </section>;
}

function PasswordForm() {
  const { user, setUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [status, setStatus] = useState<Status>(idle);
  if (!user) return null;
  const has = user.hasPassword;
  if (!open) return <div className="settings-item"><div><strong>Password</strong><span>{has ? 'Change the password you sign in with.' : 'Add a password to sign in without an email code.'}</span>{status.kind === 'done' && <StatusLine status={status}/>}</div>
    <button className="button button-outline button-small" onClick={() => { setOpen(true); setStatus(idle); }} data-testid="button-change-password"><KeyRound size={14}/> {has ? 'Change password' : 'Add password'}</button></div>;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (next.length < 8) { setStatus({ kind: 'error', message: 'Use at least 8 characters for your new password.' }); return; }
    void attempt(setStatus, async () => {
      setUser(await changePassword({ newPassword: next, ...(has ? { currentPassword: current } : {}) }));
      setOpen(false); setCurrent(''); setNext('');
      return 'Password saved. Other devices were signed out.';
    });
  };
  return <form className="settings-item" onSubmit={submit} style={{ alignItems: 'flex-end' }}>
    <input type="email" value={user.email} autoComplete="username" readOnly hidden/>
    {has && <label className="ws-label" style={{ flex: '1 1 150px' }}><span>Current password</span><input className="ws-input" type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" required data-testid="input-current-password"/></label>}
    <label className="ws-label" style={{ flex: '1 1 150px' }}><span>New password</span><input className="ws-input" type="password" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required data-testid="input-new-password"/><small>At least 8 characters.</small></label>
    <div className="ws-row">
      <button className="button button-primary button-small" disabled={status.kind === 'busy'} data-testid="button-save-password">{status.kind === 'busy' ? <><LoaderCircle size={14} className="spin"/> Saving…</> : <><Check size={14}/> Save</>}</button>
      <button type="button" className="button button-outline button-small" onClick={() => { setOpen(false); setStatus(idle); }}>Cancel</button>
    </div>
    <div style={{ flexBasis: '100%' }}><StatusLine status={status}/></div>
  </form>;
}

/** Permanently deletes the account and everything in it, then signs out. */
export function DeleteAccount() {
  const { signOut } = useAuth();
  const [, setLocation] = useLocation();
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<Status>(idle);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (confirm !== 'DELETE') return;
    void attempt(setStatus, async () => {
      await deleteAccount({ confirm: 'DELETE' });
      await signOut(() => setLocation('/'));
      return undefined;
    });
  };
  return <section className="ws-panel danger-zone" style={{ gridColumn: '1 / -1' }}>
    <div className="ws-head"><div><span className="eyebrow">DANGER ZONE</span><h2>Delete my account</h2><p>Permanently deletes your account, your sign-in methods and every UniPath record above, then signs you out everywhere. This cannot be undone.</p></div><div className="profile-icon" style={{ background: '#fbe9e7', color: '#a3463f' }}><Trash2 size={19}/></div></div>
    <form className="ws-row" onSubmit={submit} style={{ alignItems: 'flex-end' }}>
      <label className="ws-label" style={{ flex: '1 1 220px' }}><span>Type DELETE to confirm</span>
        <input className="ws-input" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off" data-testid="input-confirm-delete-account"/></label>
      <button className="button button-danger" disabled={confirm !== 'DELETE' || status.kind === 'busy'} data-testid="button-delete-account">{status.kind === 'busy' ? 'Deleting…' : 'Delete my account'}</button>
    </form>
    <StatusLine status={status}/>
  </section>;
}
