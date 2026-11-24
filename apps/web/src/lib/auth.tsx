/**
 * Client side of UniPath's own accounts. The session is an HttpOnly cookie the
 * API sets, so the browser never handles a token: this provider only asks
 * the API who is signed in and which sign-in methods it offers.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, getAuthSession, signOut as signOutRequest } from '@workspace/api-client-react';
import type { AuthSession, AuthUser } from '@workspace/api-client-react';

export type { AuthUser };
type Methods = AuthSession['methods'];
type Delivery = AuthSession['emailDelivery'];

type AuthContextValue = {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
  methods: Methods;
  emailDelivery: Delivery;
  /** True when registration needs the emailed code and password resets are offered. */
  emailVerification: boolean;
  /** True when the API could not be reached and nobody was signed in. */
  unavailable: boolean;
  /** True while the API is being retried (it sleeps when idle and takes up to a minute to wake). */
  waking: boolean;
  refresh: () => Promise<void>;
  /** Apply the account an auth endpoint just returned, without another request. */
  setUser: (user: AuthUser | null) => void;
  /** `beforeClear` runs in the same update that clears the user (navigate there, so no protected page redirects first). */
  signOut: (beforeClear?: () => void) => Promise<void>;
};

const defaultMethods: Methods = { password: true, google: false };
const AuthContext = createContext<AuthContextValue | null>(null);
// About a minute in all: long enough for the API's hosting plan to wake from sleep.
const RETRY_DELAYS_MS = [1500, 3000, 5000, 8000, 10000, 12000, 15000];
/** Network failures and server-side errors can clear up on their own; other errors will not. */
const transient = (error: unknown) => !(error instanceof ApiError) || error.status >= 500 || error.status === 429;
type State = { isLoaded: boolean; user: AuthUser | null; methods: Methods; emailDelivery: Delivery; emailVerification: boolean; unavailable: boolean; waking: boolean };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(
    { isLoaded: false, user: null, methods: defaultMethods, emailDelivery: 'email', emailVerification: false, unavailable: false, waking: false });
  const lastCheck = useRef(0);
  const latestRun = useRef(0);

  const refresh = useCallback(async () => {
    lastCheck.current = Date.now();
    const run = ++latestRun.current;
    for (let attempt = 0; ; attempt++) {
      try {
        const session = await getAuthSession({ cache: 'no-store' });
        if (run !== latestRun.current) return;
        setState({ isLoaded: true, user: session.user ?? null, methods: session.methods, emailDelivery: session.emailDelivery, emailVerification: session.emailVerification, unavailable: false, waking: false });
        return;
      } catch (error) {
        if (run !== latestRun.current) return;
        if (!transient(error) || attempt >= RETRY_DELAYS_MS.length) {
          // A failed check is not a sign-out: whoever was signed in stays signed in.
          setState(current => ({ ...current, isLoaded: true, waking: false, unavailable: !current.user }));
          return;
        }
        setState(current => (current.waking ? current : { ...current, waking: true }));
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Notice a sign-in or sign-out in another tab when this one is shown again.
    const onVisible = () => { if (document.visibilityState === 'visible' && Date.now() - lastCheck.current > 60_000) void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const setUser = useCallback((user: AuthUser | null) => setState(current => ({ ...current, isLoaded: true, user })), []);
  const signOut = useCallback(async (beforeClear?: () => void) => {
    try { await signOutRequest(); } finally { beforeClear?.(); setUser(null); }
  }, [setUser]);

  const value = useMemo<AuthContextValue>(() => ({ ...state, isSignedIn: !!state.user, refresh, setUser, signOut }), [state, refresh, setUser, signOut]);
  return <AuthContext.Provider value={value}>
    {children}
    {state.waking && <div className="waking-toast" role="status" aria-live="polite" data-testid="toast-waking">
      <span className="waking-spinner" aria-hidden="true"/>
      <span><strong>Starting UniPath…</strong> The server rests when it’s quiet and can take up to a minute to wake. You don’t need to do anything.</span>
    </div>}
  </AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}

/** Who is signed in. `isLoaded` is false until the API has answered. */
export function useUser() {
  const { isLoaded, isSignedIn, user } = useAuth();
  return { isLoaded, isSignedIn, user };
}

/** Renders children only once the session is known and matches `when`. */
export function Show({ when, children }: { when: 'signed-in' | 'signed-out'; children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  return (when === 'signed-in') === isSignedIn ? <>{children}</> : null;
}

/** A display name for the account. */
export const displayName = (user: AuthUser | null | undefined) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email?.split('@')[0] || 'Student';
