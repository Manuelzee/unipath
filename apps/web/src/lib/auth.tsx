/**
 * Authentication facade. With a Clerk publishable key this is plain Clerk.
 * Without one (a fresh local checkout), every visitor is signed out: public
 * pages work, protected pages redirect home, and sign-in screens explain how
 * to configure Clerk. Nothing is ever signed in without Clerk.
 */
import type { ComponentProps, ReactNode } from 'react';
import * as Clerk from '@clerk/react';

export const clerkPublishableKey: string | undefined = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() || undefined;
export const authConfigured = !!clerkPublishableKey;

type UseUser = typeof Clerk.useUser;
type UseClerk = typeof Clerk.useClerk;

const signedOutUser = { isLoaded: true, isSignedIn: false, user: null } as unknown as ReturnType<UseUser>;
const noClerk = {
  signOut: async () => undefined,
  openUserProfile: () => undefined,
} as unknown as ReturnType<UseClerk>;

// `authConfigured` is fixed at build time, so each hook is always called the same way.
export const useUser: UseUser = authConfigured ? Clerk.useUser : () => signedOutUser;
export const useClerk: UseClerk = authConfigured ? Clerk.useClerk : () => noClerk;

export function AuthProvider(props: Omit<ComponentProps<typeof Clerk.ClerkProvider>, 'publishableKey'>) {
  if (!clerkPublishableKey) return <>{props.children}</>;
  return <Clerk.ClerkProvider {...props} publishableKey={clerkPublishableKey}/>;
}

export function Show({ when, children }: { when: 'signed-in' | 'signed-out'; children: ReactNode }) {
  if (authConfigured) return <Clerk.Show when={when}>{children}</Clerk.Show>;
  return when === 'signed-out' ? <>{children}</> : null;
}

function NotConfigured() {
  return <div className="state-card" data-testid="setup-auth" role="status">
    <h3>Sign-in isn’t configured yet</h3>
    <p>Add <code>VITE_CLERK_PUBLISHABLE_KEY</code> and <code>CLERK_SECRET_KEY</code> to the <code>.env</code> file in the project root, then restart <code>pnpm dev</code>. See README.md, “Authentication”.</p>
  </div>;
}

export function SignIn(props: ComponentProps<typeof Clerk.SignIn>) {
  return authConfigured ? <Clerk.SignIn {...props}/> : <NotConfigured/>;
}
export function SignUp(props: ComponentProps<typeof Clerk.SignUp>) {
  return authConfigured ? <Clerk.SignUp {...props}/> : <NotConfigured/>;
}
