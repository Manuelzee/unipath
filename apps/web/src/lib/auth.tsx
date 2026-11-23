/**
 * Client side of UniPath's own accounts. The session is an HttpOnly cookie the
 * API sets, so the browser never handles a token: this provider only asks
 * the API who is signed in and which sign-in methods it offers.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getAuthSession, signOut as signOutRequest } from '@workspace/api-client-react';
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
  /** True when the API could not be reached; everyone is treated as signed out. */
  unavailable: boolean;
  refresh: () => Promise<void>;
  /** Apply the account an auth endpoint just returned, without another request. */
  setUser: (user: AuthUser | null) => void;
  /** `beforeClear` runs in the same update that clears the user (navigate there, so no protected page redirects first). */
  signOut: (beforeClear?: () => void) => Promise<void>;
};

const defaultMethods: Methods = { password: true, emailCode: true, google: false };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ isLoaded: boolean; user: AuthUser | null; methods: Methods; emailDelivery: Delivery; unavailable: boolean }>(
    { isLoaded: false, user: null, methods: defaultMethods, emailDelivery: 'email', unavailable: false });
  const lastCheck = useRef(0);

  const refresh = useCallback(async () => {
    lastCheck.current = Date.now();
    try {
      const session = await getAuthSession({ cache: 'no-store' });
      setState({ isLoaded: true, user: session.user ?? null, methods: session.methods, emailDelivery: session.emailDelivery, unavailable: false });
    } catch {
      setState(current => ({ ...current, isLoaded: true, user: null, unavailable: true }));
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
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
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
