import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { ArrowLeft, ArrowRight, Eye, EyeOff, LoaderCircle, Mail, Terminal } from 'lucide-react';
import { resetPassword, sendAuthCode, signInWithPassword, signUpWithPassword, verifyAuthCode } from '@workspace/api-client-react';
import type { AuthResult, AuthSession } from '@workspace/api-client-react';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/components/workspace/shared';

type Mode = 'sign-in' | 'sign-up';
type Delivery = 'email' | 'server_log';
// Codes appear only while registering (and for password resets); signing in never asks for one.
type Step =
  | { kind: 'password' }
  | { kind: 'code'; email: string; delivery: Delivery; sentAt: number }
  | { kind: 'reset-email' }
  | { kind: 'reset'; email: string; delivery: Delivery; sentAt: number };

const RESEND_SECONDS = 30;
const googleErrors: Record<string, string> = {
  google_unavailable: 'Google sign-in isn’t set up on this server yet. Use your email instead.',
  google_cancelled: 'Google sign-in was cancelled. You can try again or use your email.',
  google_failed: 'We couldn’t finish signing in with Google. Please try again.',
  google_unverified: 'That Google account’s email isn’t verified, so it can’t be used here.',
  google_conflict: 'This email is already linked to a different Google account. Sign in with that account or with your email.',
};

/** A path inside the app to return to; anything else is ignored. */
export function safeReturnPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) return null;
  return /^\/(sign-in|sign-up)(\/|\?|$)/.test(value) ? null : value;
}

export function AuthFlow({ mode }: { mode: Mode }) {
  const auth = useAuth();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(useSearch());
  const returnTo = safeReturnPath(params.get('redirect'));
  const carry = returnTo ? `?redirect=${encodeURIComponent(returnTo)}` : '';
  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(googleErrors[params.get('error') ?? ''] ?? null);
  const [notice, setNotice] = useState<string | null>(null);

  const go = (next: Step) => { setError(null); setNotice(null); setStep(next); };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(null); setNotice(null);
    try { await action(); } catch (e) { setError(errorMessage(e, 'Something went wrong. Please try again.')); } finally { setBusy(false); }
  };
  const finish = (result: AuthResult, fallbackEmail: string) => {
    if (result.status === 'verification_required') {
      go({ kind: 'code', email: result.email ?? fallbackEmail, delivery: result.delivery ?? 'email', sentAt: Date.now() });
      return;
    }
    // Navigate before publishing the user so the signed-in redirect on this page never wins.
    setLocation(result.isNewUser ? '/onboarding' : returnTo ?? '/dashboard');
    auth.setUser(result.user ?? null);
  };
  const emailOff = auth.emailDelivery === 'unavailable';
  const signUp = mode === 'sign-up';

  if (auth.unavailable) return <Card title="We can’t reach UniPath right now" sub="Check your connection, then try again.">
    <button className="button button-primary auth-submit" onClick={() => void auth.refresh()} data-testid="button-auth-retry">Try again</button>
  </Card>;

  if (step.kind === 'code') {
    return <Card title="Confirm your email" sub={<>We sent a 6-digit code to <strong>{step.email}</strong>. Enter it to finish creating your account. It works for 10 minutes.</>}>
      <DeliveryNote delivery={step.delivery}/>
      <CodeForm busy={busy} label="Verify and continue" onSubmit={code => run(async () => {
        finish(await verifyAuthCode({ email: step.email, purpose: 'verify_email', code }), step.email);
      })}/>
      <Feedback error={error} notice={notice}/>
      <div className="auth-alt-row">
        <Resend sentAt={step.sentAt} busy={busy} onResend={() => run(async () => {
          const sent = await sendAuthCode({ email: step.email, purpose: 'verify_email' });
          setStep({ ...step, delivery: sent.delivery, sentAt: Date.now() }); setNotice('We sent a new code. Use the most recent one.');
        })}/>
        <button type="button" className="auth-text-button" onClick={() => go({ kind: 'password' })} data-testid="button-auth-change-email">Use a different email</button>
      </div>
    </Card>;
  }

  if (step.kind === 'reset') {
    return <Card title="Choose a new password" sub={<>If an account exists for <strong>{step.email}</strong>, we sent it a 6-digit reset code.</>}>
      <DeliveryNote delivery={step.delivery}/>
      <ResetForm busy={busy} email={step.email} onSubmit={(code, password) => run(async () => {
        finish(await resetPassword({ email: step.email, code, password }), step.email);
      })}/>
      <Feedback error={error} notice={notice}/>
      <div className="auth-alt-row">
        <Resend sentAt={step.sentAt} busy={busy} onResend={() => run(async () => {
          const sent = await sendAuthCode({ email: step.email, purpose: 'reset_password' });
          setStep({ ...step, delivery: sent.delivery, sentAt: Date.now() }); setNotice('If the account exists, a new code is on its way.');
        })}/>
        <button type="button" className="auth-text-button" onClick={() => go({ kind: 'password' })}>Back to sign in</button>
      </div>
    </Card>;
  }

  if (step.kind === 'reset-email') {
    const submit = (e: FormEvent) => { e.preventDefault(); void run(async () => {
      const sent = await sendAuthCode({ email, purpose: 'reset_password' });
      go({ kind: 'reset', email: sent.email, delivery: sent.delivery, sentAt: Date.now() });
    }); };
    return <Card title="Reset your password" sub="Enter your account’s email and we’ll send you a code to choose a new password.">
      {emailOff ? <EmailOff/> : <form className="auth-form" onSubmit={submit} noValidate>
        <EmailField value={email} onChange={setEmail}/>
        <Submit busy={busy} label="Email me a reset code" testId="button-send-reset"/>
      </form>}
      <Feedback error={error} notice={notice}/>
      <div className="auth-alt-row"><button type="button" className="auth-text-button" onClick={() => go({ kind: 'password' })}><ArrowLeft size={13}/> Back to sign in</button></div>
    </Card>;
  }

  // Password step: the sign-in or sign-up form.
  return <PasswordStep mode={mode} email={email} setEmail={setEmail} firstName={firstName} setFirstName={setFirstName}
    busy={busy} emailOff={emailOff} methods={auth.methods} returnTo={returnTo} carry={carry} feedback={<Feedback error={error} notice={notice}/>}
    onForgot={() => go({ kind: 'reset-email' })}
    onSignIn={password => run(async () => finish(await signInWithPassword({ email, password }), email))}
    onSignUp={(lastName, password) => run(async () => finish(await signUpWithPassword({ email, password, firstName, lastName }), email))}/>;
}

function PasswordStep(props: {
  mode: Mode; email: string; setEmail: (v: string) => void; firstName: string; setFirstName: (v: string) => void;
  busy: boolean; emailOff: boolean; methods: AuthSession['methods']; returnTo: string | null; carry: string; feedback: ReactNode;
  onForgot: () => void; onSignIn: (password: string) => void; onSignUp: (lastName: string, password: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [lastName, setLastName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const signUp = props.mode === 'sign-up';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const issue = !props.email.trim() ? 'Enter your email address.'
      : signUp && !props.firstName.trim() ? 'Enter your first name.'
      : !password ? 'Enter your password.'
      : signUp && password.length < 8 ? 'Use at least 8 characters for your password.' : null;
    setProblem(issue);
    if (issue) return;
    if (signUp) props.onSignUp(lastName.trim(), password); else props.onSignIn(password);
  };
  return <Card title={signUp ? 'Your next chapter starts here' : 'Welcome back'} sub={signUp ? 'Create an account to make your plan yours.' : 'Pick up where your plans left off.'}>
    <GoogleButton returnTo={props.returnTo} shown={props.methods.google}/>
    {signUp && props.emailOff ? <EmailOff/> : <form className="auth-form" onSubmit={submit} noValidate>
      {signUp && <div className="auth-name-row">
        <TextField label="First name" value={props.firstName} onChange={props.setFirstName} autoComplete="given-name" testId="input-auth-first-name"/>
        <TextField label="Last name" optional value={lastName} onChange={setLastName} autoComplete="family-name" testId="input-auth-last-name"/>
      </div>}
      <EmailField value={props.email} onChange={props.setEmail}/>
      <PasswordField value={password} onChange={setPassword} isNew={signUp}
        action={!signUp && <button type="button" className="auth-text-button auth-forgot" onClick={props.onForgot} data-testid="button-forgot-password">Forgot password?</button>}/>
      <Submit busy={props.busy} label={signUp ? 'Create account' : 'Sign in'} testId={signUp ? 'button-sign-up' : 'button-sign-in'}/>
    </form>}
    {problem ? <p className="auth-error" role="alert">{problem}</p> : props.feedback}
    <Switch mode={props.mode} carry={props.carry}/>
  </Card>;
}

function Card({ title, sub, children }: { title: string; sub: ReactNode; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Move focus to each new step's heading so screen readers announce the
  // change, unless a field in the step (the code box) already took focus.
  useEffect(() => {
    const card = heading.current?.parentElement;
    if (card && !card.contains(document.activeElement)) heading.current?.focus({ preventScroll: true });
  }, [title]);
  return <section className="auth-card" aria-labelledby="auth-title">
    <img src={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/logo.svg`} alt="" className="auth-logo"/>
    <h2 id="auth-title" ref={heading} tabIndex={-1}>{title}</h2>
    <p className="auth-sub">{sub}</p>
    {children}
  </section>;
}

function GoogleButton({ returnTo, shown }: { returnTo: string | null; shown: boolean }) {
  if (!shown) return null;
  const href = `/api/auth/google/start${returnTo ? `?redirect=${encodeURIComponent(returnTo)}` : ''}`;
  return <>
    <a className="auth-google" href={href} data-testid="button-google">
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
      Continue with Google
    </a>
    <div className="auth-divider"><span>or</span></div>
  </>;
}

function TextField({ label, value, onChange, autoComplete, testId, optional }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string; testId: string; optional?: boolean }) {
  return <label className="auth-field"><span>{label}{optional && <em> (optional)</em>}</span>
    <input value={value} onChange={e => onChange(e.target.value)} autoComplete={autoComplete} maxLength={60} required={!optional} data-testid={testId}/></label>;
}

function EmailField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <label className="auth-field"><span>Email address</span>
    <input type="email" value={value} onChange={e => onChange(e.target.value)} autoComplete="email" inputMode="email" maxLength={254} required spellCheck={false} data-testid="input-auth-email"/></label>;
}

function PasswordField({ value, onChange, isNew, action, label = 'Password', testId = 'input-auth-password' }: { value: string; onChange: (v: string) => void; isNew: boolean; action?: ReactNode; label?: string; testId?: string }) {
  const [visible, setVisible] = useState(false);
  return <div className="auth-field">
    <div className="auth-label-row"><label htmlFor={testId}>{label}</label>{action}</div>
    <div className="auth-password">
      <input id={testId} type={visible ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} autoComplete={isNew ? 'new-password' : 'current-password'}
        minLength={isNew ? 8 : undefined} maxLength={128} required aria-describedby={isNew ? `${testId}-hint` : undefined} data-testid={testId}/>
      <button type="button" className="auth-eye" onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}>{visible ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
    </div>
    {isNew && <small id={`${testId}-hint`} className="auth-hint">At least 8 characters. A short phrase is easy to remember and hard to guess.</small>}
  </div>;
}

function CodeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <label className="auth-field"><span>6-digit code</span>
    <input className="auth-code" value={value} onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code"
      pattern="[0-9]{6}" maxLength={6} required autoFocus data-testid="input-auth-code"/></label>;
}

function CodeForm({ busy, label, onSubmit }: { busy: boolean; label: string; onSubmit: (code: string) => void }) {
  const [code, setCode] = useState('');
  const submitted = useRef('');
  const send = (value: string) => { if (value.length === 6 && !busy) { submitted.current = value; onSubmit(value); } };
  return <form className="auth-form" onSubmit={e => { e.preventDefault(); send(code); }} noValidate>
    <CodeField value={code} onChange={value => { setCode(value); if (value.length === 6 && value !== submitted.current) send(value); }}/>
    <Submit busy={busy} label={label} disabled={code.length !== 6} testId="button-verify-code"/>
  </form>;
}

function ResetForm({ busy, email, onSubmit }: { busy: boolean; email: string; onSubmit: (code: string, password: string) => void }) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  return <form className="auth-form" onSubmit={e => {
    e.preventDefault();
    const issue = code.length !== 6 ? 'Enter the 6-digit code from your email.' : password.length < 8 ? 'Use at least 8 characters for your new password.' : null;
    setProblem(issue); if (!issue) onSubmit(code, password);
  }} noValidate>
    <input type="email" value={email} autoComplete="username" readOnly hidden/>
    <CodeField value={code} onChange={setCode}/>
    <PasswordField value={password} onChange={setPassword} isNew label="New password" testId="input-auth-new-password"/>
    {problem && <p className="auth-error" role="alert">{problem}</p>}
    <Submit busy={busy} label="Save password and sign in" testId="button-reset-password"/>
  </form>;
}

function Submit({ busy, label, testId, disabled }: { busy: boolean; label: string; testId: string; disabled?: boolean }) {
  return <button className="button button-primary auth-submit" disabled={busy || disabled} data-testid={testId}>
    {busy ? <><LoaderCircle size={16} className="spin"/> Please wait…</> : <>{label} <ArrowRight size={16}/></>}</button>;
}

function Resend({ sentAt, busy, onResend }: { sentAt: number; busy: boolean; onResend: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const wait = Math.max(0, RESEND_SECONDS - Math.floor((now - sentAt) / 1000));
  return <button type="button" className="auth-text-button" disabled={busy || wait > 0} onClick={onResend} data-testid="button-resend-code">
    {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}</button>;
}

function Feedback({ error, notice }: { error: string | null; notice: string | null }) {
  if (error) return <p className="auth-error" role="alert" data-testid="text-auth-error">{error}</p>;
  if (notice) return <p className="auth-notice" role="status">{notice}</p>;
  return null;
}

function DeliveryNote({ delivery }: { delivery: Delivery }) {
  if (delivery !== 'server_log') return null;
  return <div className="auth-dev-note" role="note" data-testid="text-dev-code-note"><Terminal size={15}/><span><strong>Development server:</strong> email isn’t set up yet, so the code was written to the API server’s terminal output instead of being emailed.</span></div>;
}

function EmailOff() {
  return <div className="auth-dev-note" role="note"><Mail size={15}/><span>Registration isn’t available on this server yet because email isn’t set up. Existing accounts can still sign in with their password.</span></div>;
}

function Switch({ mode, carry }: { mode: Mode; carry: string }) {
  return mode === 'sign-up'
    ? <p className="auth-switch">Already have an account? <Link href={`/sign-in${carry}`} data-testid="link-to-sign-in">Sign in</Link></p>
    : <p className="auth-switch">New to UniPath AI? <Link href={`/sign-up${carry}`} data-testid="link-to-sign-up">Create an account</Link></p>;
}
