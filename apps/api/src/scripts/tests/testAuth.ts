/**
 * Integration test for UniPath accounts against a real database, through the
 * real app (middleware order included):
 * - password sign-up needs an emailed code; sign-in, wrong passwords, sign-out;
 * - email-code sign-in creates accounts; codes expire, lock after 5 tries and
 *   cannot be resent instantly;
 * - password reset and change end other sessions; account deletion;
 * - an unverified sign-up cannot be used to take over the real owner's account;
 * - cross-site writes are refused; cookies are HttpOnly and SameSite=Lax;
 * - Google sign-in: state, PKCE, nonce, audience and verified-email checks,
 *   account linking.
 *
 * Email delivery and Google's token endpoint are stubbed; nothing leaves the
 * machine. Uses throwaway accounts on a reserved domain and removes them.
 *
 * Run: pnpm run test:integration (reads DATABASE_URL from .env)
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { eq, like } from "drizzle-orm";

process.env.LOG_LEVEL = "silent";
// Most tests cover the verified flow; one switches verification off.
process.env.EMAIL_VERIFICATION = "required";
process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";
delete process.env.APP_ORIGIN;

const { default: app } = await import("../../app");
const { authCodesTable, authSessionsTable, authUsersTable, db, pool } = await import("@workspace/db");
const { setMailer } = await import("../../lib/auth/email");

const DOMAIN = `auth-test-${randomUUID().slice(0, 8)}.example.invalid`;
const mail = (name: string) => `${name}@${DOMAIN}`;

// ---- Captured email ----
const outbox: Array<{ to: string; subject: string; text: string }> = [];
setMailer(async message => { outbox.push(message); });
/** Waits for an email to `to` whose subject matches (some emails are sent after the reply). */
async function waitForCode(to: string, subject: RegExp) {
  for (let i = 0; i < 40; i++) {
    const message = [...outbox].reverse().find(m => m.to === to && subject.test(m.subject));
    if (message) return message.text.match(/\b(\d{6})\b/)![1];
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`no email matching ${subject} was sent to ${to}`);
}
const lastCode = (to: string) => {
  const message = [...outbox].reverse().find(m => m.to === to);
  assert.ok(message, `no email was sent to ${to}`);
  return message.text.match(/\b(\d{6})\b/)![1];
};

// ---- Stubbed Google token endpoint ----
const realFetch = globalThis.fetch;
let googleClaims: Record<string, unknown> = {};
let lastChallenge = "";
const fakeJwt = (claims: Record<string, unknown>) =>
  [{ alg: "none" }, claims].map(part => Buffer.from(JSON.stringify(part)).toString("base64url")).join(".") + ".sig";
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url === "https://oauth2.googleapis.com/token") {
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get("client_secret"), "test-secret");
    assert.equal(body.get("grant_type"), "authorization_code");
    assert.equal(createHash("sha256").update(body.get("code_verifier") ?? "").digest("base64url"), lastChallenge, "PKCE verifier must match the challenge");
    return Response.json({ id_token: fakeJwt(googleClaims) });
  }
  return realFetch(input, init);
}) as typeof fetch;

// ---- A tiny browser: keeps cookies, sends same-origin requests ----
let base = "";
class Browser {
  cookies = new Map<string, string>();
  lastSetCookie: string[] = [];
  async request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await realFetch(base + path, {
      method, redirect: "manual",
      headers: {
        origin: base, ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(this.cookies.size ? { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ") } : {}), ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    this.lastSetCookie = res.headers.getSetCookie();
    for (const header of this.lastSetCookie) {
      const [pair, ...attributes] = header.split(";");
      const [name, value] = [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)];
      const expired = attributes.some(a => /^\s*expires=Thu, 01 Jan 1970/i.test(a)) || attributes.some(a => /^\s*max-age=0\b/i.test(a));
      if (expired || !value) this.cookies.delete(name); else this.cookies.set(name, value);
    }
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data, location: res.headers.get("location") ?? "" };
  }
  get = (path: string) => this.request("GET", path);
  post = (path: string, body?: unknown) => this.request("POST", path, body);
  async me() { return (await this.get("/api/auth/session")).data.user as { id: string; email: string; hasPassword: boolean; googleConnected: boolean; emailVerified: boolean } | null; }
}

async function signUpAndVerify(browser: Browser, email: string, password = "correct horse battery") {
  const res = await browser.post("/api/auth/sign-up", { email, password, firstName: "Ada" });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const verified = await browser.post("/api/auth/codes/verify", { email, purpose: "verify_email", code: lastCode(email) });
  assert.equal(verified.status, 200, JSON.stringify(verified.data));
  return verified.data;
}

const tests: Array<[string, () => Promise<void>]> = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);

test("signed out: session is null and every method is offered", async () => {
  const res = await new Browser().get("/api/auth/session");
  assert.equal(res.status, 200);
  assert.equal(res.data.user, null);
  assert.deepEqual(res.data.methods, { password: true, google: true });
  assert.equal(res.data.emailDelivery, "email");
  assert.equal((await new Browser().get("/api/me/export")).status, 401);
});

test("sign-up rejects bad input before creating anything", async () => {
  const b = new Browser();
  assert.equal((await b.post("/api/auth/sign-up", { email: mail("bad"), password: "short", firstName: "Ada" })).status, 400);
  assert.equal((await b.post("/api/auth/sign-up", { email: "not-an-email", password: "long enough pw", firstName: "Ada" })).status, 400);
  assert.equal((await b.post("/api/auth/sign-up", { email: mail("bad"), password: "long enough pw", firstName: "  " })).status, 400);
  const same = await b.post("/api/auth/sign-up", { email: mail("same"), password: mail("same"), firstName: "Ada" });
  assert.equal(same.status, 400);
  assert.match(same.data.error, /isn’t your email/);
  assert.equal((await db.select().from(authUsersTable).where(eq(authUsersTable.email, mail("bad")))).length, 0);
});

test("password sign-up emails a code and does not sign in until it is used", async () => {
  const b = new Browser();
  const email = mail("ada");
  const res = await b.post("/api/auth/sign-up", { email: ` ${email.toUpperCase()} `, password: "correct horse battery", firstName: " Ada ", lastName: "Lovelace" });
  assert.equal(res.status, 200);
  assert.equal(res.data.status, "verification_required");
  assert.equal(res.data.email, email, "email is normalized");
  assert.equal(b.cookies.size, 0, "no session before verification");
  assert.match(outbox.at(-1)!.subject, /Confirm your email/);
  // Signing in before verifying asks for the code again instead of signing in.
  const early = await b.post("/api/auth/sign-in", { email, password: "correct horse battery" });
  assert.equal(early.data.status, "verification_required");
  assert.equal(b.cookies.size, 0);
  assert.equal((await b.post("/api/auth/codes/verify", { email, purpose: "verify_email", code: "000000" === lastCode(email) ? "111111" : "000000" })).status, 400);
  const ok = await b.post("/api/auth/codes/verify", { email, purpose: "verify_email", code: lastCode(email) });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.status, "signed_in");
  assert.equal(ok.data.isNewUser, true);
  assert.deepEqual([ok.data.user.firstName, ok.data.user.lastName, ok.data.user.hasPassword, ok.data.user.emailVerified], ["Ada", "Lovelace", true, true]);
  assert.equal(ok.data.user.passwordHash, undefined, "the hash never leaves the server");
  const cookie = b.lastSetCookie.find(c => c.startsWith("unipath_session="))!;
  assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i); assert.match(cookie, /Path=\//);
  assert.equal((await b.me())?.email, email);
  assert.equal((await b.get("/api/me/export")).status, 200);
  assert.equal((await b.get("/api/me/export")).data.account.email, email, "export includes the account");
});

test("a verified email cannot be registered again", async () => {
  const res = await new Browser().post("/api/auth/sign-up", { email: mail("ada"), password: "another password", firstName: "Eve" });
  assert.equal(res.status, 409);
});

test("sign-out ends the session on the server, not just in the browser", async () => {
  const b = new Browser();
  await b.post("/api/auth/sign-in", { email: mail("ada"), password: "correct horse battery" });
  const stolen = new Map(b.cookies);
  assert.equal((await b.post("/api/auth/sign-out")).status, 204);
  assert.equal(await b.me(), null);
  const replay = new Browser(); replay.cookies = stolen;
  assert.equal(await replay.me(), null, "a copied cookie stops working after sign-out");
});

test("wrong password is refused with a message that does not reveal which part was wrong", async () => {
  const b = new Browser();
  const wrong = await b.post("/api/auth/sign-in", { email: mail("ada"), password: "wrong password!" });
  const unknown = await b.post("/api/auth/sign-in", { email: mail("nobody"), password: "wrong password!" });
  assert.equal(wrong.status, 401); assert.equal(unknown.status, 401);
  assert.equal(wrong.data.error, unknown.data.error);
  assert.equal(b.cookies.size, 0);
  const right = await b.post("/api/auth/sign-in", { email: mail("ada").toUpperCase(), password: "correct horse battery" });
  assert.equal(right.data.status, "signed_in");
  assert.equal(right.data.isNewUser, false);
});

test("cross-site writes are refused even with a valid session", async () => {
  const b = new Browser();
  await b.post("/api/auth/sign-in", { email: mail("ada"), password: "correct horse battery" });
  assert.equal((await b.request("POST", "/api/auth/sign-out", undefined, { origin: "https://evil.example" })).status, 403);
  assert.equal((await b.request("POST", "/api/auth/sign-out", undefined, { "sec-fetch-site": "cross-site" })).status, 403);
  assert.ok(await b.me(), "still signed in");
  // A plain HTML form post (no CORS preflight) is refused before any handler runs.
  const form = await realFetch(`${base}/api/auth/sign-out`, {
    method: "POST", body: "x=1",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: [...b.cookies].map(([k, v]) => `${k}=${v}`).join("; ") },
  });
  assert.equal(form.status, 415);
  assert.ok(await b.me(), "still signed in after the form post");
});

test("codes never sign anyone in: only registration and password resets use them", async () => {
  const b = new Browser();
  assert.equal((await b.post("/api/auth/codes", { email: mail("nocode"), purpose: "sign_in" })).status, 400);
  assert.equal((await b.post("/api/auth/codes/verify", { email: mail("nocode"), purpose: "sign_in", code: "123456" })).status, 400);
  assert.equal((await b.post("/api/auth/codes/verify", { email: mail("ada"), purpose: "verify_email", code: "123456" })).status, 400,
    "an existing account cannot be entered with a code");
  assert.equal(b.cookies.size, 0);
  assert.equal(await b.me(), null);
});

test("registration codes cannot be resent instantly", async () => {
  const b = new Browser();
  const email = mail("resend");
  await b.post("/api/auth/sign-up", { email, password: "correct horse battery", firstName: "Rio" });
  assert.equal((await b.post("/api/auth/codes", { email, purpose: "verify_email" })).status, 429);
});

test("a code locks after five wrong tries and expired codes are refused", async () => {
  const b = new Browser();
  const email = mail("lock");
  await b.post("/api/auth/sign-up", { email, password: "correct horse battery", firstName: "Lee" });
  const code = lastCode(email);
  const wrong = code === "123456" ? "654321" : "123456";
  const results: number[] = [];
  let last: any;
  for (let i = 0; i < 5; i++) { last = await b.post("/api/auth/codes/verify", { email, purpose: "verify_email", code: wrong }); results.push(last.status); }
  assert.deepEqual(results, [400, 400, 400, 400, 400]);
  assert.match(last.data.error, /Too many wrong tries/);
  assert.equal((await b.post("/api/auth/codes/verify", { email, purpose: "verify_email", code })).status, 400, "the right code no longer works");
  const email2 = mail("expired");
  await b.post("/api/auth/sign-up", { email: email2, password: "correct horse battery", firstName: "Ana" });
  await db.update(authCodesTable).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(authCodesTable.email, email2));
  const expired = await b.post("/api/auth/codes/verify", { email: email2, purpose: "verify_email", code: lastCode(email2) });
  assert.equal(expired.status, 400);
  assert.match(expired.data.error, /expired/);
  assert.equal(b.cookies.size, 0);
});

test("an unverified sign-up cannot hijack the real owner's account", async () => {
  const victim = mail("victim");
  const attacker = new Browser();
  await attacker.post("/api/auth/sign-up", { email: victim, password: "attacker password", firstName: "Mallory" });
  const blocked = await attacker.post("/api/auth/sign-in", { email: victim, password: "attacker password" });
  assert.equal(blocked.data.status, "verification_required", "no access without the code from the inbox");
  assert.equal(attacker.cookies.size, 0);
  // The real owner resets the password with a code sent to their inbox.
  const owner = new Browser();
  await owner.post("/api/auth/codes", { email: victim, purpose: "reset_password" });
  const code = await waitForCode(victim, /Reset your UniPath AI password/);
  const ok = await owner.post("/api/auth/password-reset", { email: victim, code, password: "the real owner's passphrase" });
  assert.equal(ok.data.status, "signed_in");
  assert.equal((await attacker.post("/api/auth/sign-in", { email: victim, password: "attacker password" })).status, 401);
});

test("password reset: same reply for unknown emails, new password works, other sessions end", async () => {
  const email = mail("ada");
  const laptop = new Browser();
  await laptop.post("/api/auth/sign-in", { email, password: "correct horse battery" });
  assert.ok(await laptop.me());
  const phone = new Browser();
  const before = outbox.length;
  const unknown = await phone.post("/api/auth/codes", { email: mail("ghost"), purpose: "reset_password" });
  const known = await phone.post("/api/auth/codes", { email, purpose: "reset_password" });
  assert.equal(unknown.status, 200); assert.equal(known.status, 200);
  assert.deepEqual(Object.keys(unknown.data).sort(), Object.keys(known.data).sort());
  await new Promise(r => setTimeout(r, 300)); // reset emails are sent after the reply
  assert.equal(outbox.slice(before).filter(m => m.to === mail("ghost")).length, 0, "no email for an unknown address");
  assert.match(outbox.at(-1)!.subject, /Reset your UniPath AI password/);
  assert.equal((await phone.post("/api/auth/password-reset", { email, code: lastCode(email), password: "short" })).status, 400);
  const reset = await phone.post("/api/auth/password-reset", { email, code: lastCode(email), password: "a brand new passphrase" });
  assert.equal(reset.status, 200, JSON.stringify(reset.data));
  assert.equal(reset.data.status, "signed_in");
  assert.equal(await laptop.me(), null, "the laptop session was ended");
  assert.equal((await new Browser().post("/api/auth/sign-in", { email, password: "correct horse battery" })).status, 401);
  assert.equal((await new Browser().post("/api/auth/sign-in", { email, password: "a brand new passphrase" })).data.status, "signed_in");
});

test("changing the password needs the current one and ends other sessions only", async () => {
  const email = mail("ada");
  const here = new Browser(); const there = new Browser();
  await here.post("/api/auth/sign-in", { email, password: "a brand new passphrase" });
  await there.post("/api/auth/sign-in", { email, password: "a brand new passphrase" });
  assert.equal((await here.request("POST", "/api/auth/password", { currentPassword: "nope nope nope", newPassword: "third password here" })).status, 400);
  const ok = await here.request("POST", "/api/auth/password", { currentPassword: "a brand new passphrase", newPassword: "third password here" });
  assert.equal(ok.status, 200);
  assert.ok(await here.me(), "this browser stays signed in");
  assert.equal(await there.me(), null, "the other one is signed out");
});

test("name updates and sign-out-others", async () => {
  const a = new Browser(); const b = new Browser();
  await a.post("/api/auth/sign-in", { email: mail("ada"), password: "third password here" });
  await b.post("/api/auth/sign-in", { email: mail("ada"), password: "third password here" });
  assert.equal((await a.request("PATCH", "/api/auth/me", { firstName: "", lastName: "x" })).status, 400);
  const named = await a.request("PATCH", "/api/auth/me", { firstName: "Augusta Ada", lastName: "King" });
  assert.equal(named.data.firstName, "Augusta Ada");
  assert.ok((await a.post("/api/auth/sign-out-others")).data.revoked >= 1);
  assert.ok(await a.me()); assert.equal(await b.me(), null);
});

test("an expired session is treated as signed out", async () => {
  const b = new Browser();
  await b.post("/api/auth/sign-in", { email: mail("ada"), password: "third password here" });
  const user = await b.me();
  await db.update(authSessionsTable).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(authSessionsTable.userId, user!.id));
  assert.equal(await b.me(), null);
  assert.equal((await b.get("/api/me/export")).status, 401);
});

async function googleSignIn(b: Browser, claims: Record<string, unknown>, redirect = "/saved") {
  const start = await b.get(`/api/auth/google/start?redirect=${encodeURIComponent(redirect)}`);
  assert.equal(start.status, 302);
  const url = new URL(start.location);
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  lastChallenge = url.searchParams.get("code_challenge")!;
  const state = JSON.parse(Buffer.from(b.cookies.get("unipath_google_oauth")!, "base64url").toString());
  googleClaims = { iss: "https://accounts.google.com", aud: process.env.GOOGLE_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 300, nonce: state.nonce, email_verified: true, ...claims };
  return b.get(`/api/auth/google/callback?code=test-code&state=${encodeURIComponent(url.searchParams.get("state")!)}`);
}

test("Google: new accounts go to onboarding, returning ones go back where they were", async () => {
  const b = new Browser();
  const first = await googleSignIn(b, { sub: "google-sub-1", email: mail("lin"), given_name: "Lin", family_name: "Wei" });
  assert.equal(first.location, "/onboarding");
  const me = await b.me();
  assert.deepEqual([me?.email, me?.googleConnected, me?.hasPassword, me?.emailVerified], [mail("lin"), true, false, true]);
  assert.equal(b.cookies.has("unipath_google_oauth"), false, "the one-time state cookie is cleared");
  // An account without a password can add one without a current password.
  assert.equal((await b.request("POST", "/api/auth/password", { newPassword: "first password set" })).data.hasPassword, true);
  const again = await googleSignIn(new Browser(), { sub: "google-sub-1", email: mail("lin") }, "/compare?ids=a");
  assert.equal(again.location, "/compare?ids=a");
  const offsite = await googleSignIn(new Browser(), { sub: "google-sub-1", email: mail("lin") }, "//evil.example/x");
  assert.equal(offsite.location, "/dashboard", "open redirects are refused");
});

test("Google links to an existing verified account with the same email and keeps its password", async () => {
  const b = new Browser();
  const res = await googleSignIn(b, { sub: "google-sub-ada", email: mail("ada").toUpperCase() });
  assert.equal(res.location, "/saved");
  const me = await b.me();
  assert.deepEqual([me?.email, me?.googleConnected, me?.hasPassword], [mail("ada"), true, true]);
});

test("Google refuses a bad state, a wrong audience, a wrong nonce and an unverified email", async () => {
  const b = new Browser();
  await b.get("/api/auth/google/start");
  assert.match((await b.get("/api/auth/google/callback?code=x&state=forged")).location, /error=google_failed/);
  assert.match((await googleSignIn(new Browser(), { sub: "s2", email: mail("x"), aud: "someone-else" })).location, /error=google_failed/);
  assert.match((await googleSignIn(new Browser(), { sub: "s3", email: mail("x"), nonce: "replayed" })).location, /error=google_failed/);
  assert.match((await googleSignIn(new Browser(), { sub: "s4", email: mail("x"), email_verified: false })).location, /error=google_unverified/);
  assert.match((await new Browser().get("/api/auth/google/callback?error=access_denied")).location, /error=google_cancelled/);
  assert.equal((await db.select().from(authUsersTable).where(eq(authUsersTable.email, mail("x")))).length, 0);
});

test("a refused email gives a clear error instead of a server failure", async () => {
  setMailer(async () => { throw Object.assign(new Error("Can't send mail"), { responseCode: 450, response: "450 You can only send testing emails to your own email address" }); });
  try {
    const res = await new Browser().post("/api/auth/sign-up", { email: mail("refused"), password: "correct horse battery", firstName: "Rae" });
    assert.equal(res.status, 502);
    assert.match(res.data.error, /couldn’t send the email/);
  } finally {
    setMailer(async message => { outbox.push(message); });
  }
});

test("with email verification off, sign-up signs in at once and existing emails cannot be taken over", async () => {
  process.env.EMAIL_VERIFICATION = "off";
  try {
    const b = new Browser();
    assert.equal((await b.get("/api/auth/session")).data.emailVerification, false);
    const email = mail("noverify");
    const before = outbox.length;
    const res = await b.post("/api/auth/sign-up", { email, password: "correct horse battery", firstName: "Nia" });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.deepEqual([res.data.status, res.data.isNewUser, res.data.user.emailVerified], ["signed_in", true, false]);
    assert.equal(outbox.length, before, "no email is sent");
    assert.equal((await b.me())?.email, email);
    const again = await new Browser().post("/api/auth/sign-up", { email, password: "someone else's password", firstName: "Eve" });
    assert.equal(again.status, 409, "an existing account cannot be re-registered");
    assert.equal((await new Browser().post("/api/auth/sign-in", { email, password: "someone else's password" })).status, 401);
    const signIn = await new Browser().post("/api/auth/sign-in", { email, password: "correct horse battery" });
    assert.equal(signIn.data.status, "signed_in", "unverified accounts can sign in while verification is off");
    // Turning verification on later asks these accounts to confirm their email.
    process.env.EMAIL_VERIFICATION = "required";
    const later = await new Browser().post("/api/auth/sign-in", { email, password: "correct horse battery" });
    assert.equal(later.data.status, "verification_required");
  } finally {
    process.env.EMAIL_VERIFICATION = "required";
  }
});

test("deleting the account removes it, its sessions and its data", async () => {
  const b = new Browser();
  await signUpAndVerify(b, mail("leaving"));
  const me = await b.me();
  assert.equal((await b.post("/api/auth/account-deletion", { confirm: "nope" })).status, 400);
  assert.equal((await b.post("/api/auth/account-deletion", { confirm: "DELETE" })).status, 204);
  assert.equal(await b.me(), null);
  assert.equal((await db.select().from(authUsersTable).where(eq(authUsersTable.id, me!.id))).length, 0);
  assert.equal((await db.select().from(authSessionsTable).where(eq(authSessionsTable.userId, me!.id))).length, 0);
  assert.equal((await new Browser().post("/api/auth/sign-in", { email: mail("leaving"), password: "correct horse battery" })).status, 401);
});

async function cleanup() {
  await db.delete(authUsersTable).where(like(authUsersTable.email, `%@${DOMAIN}`));
  await db.delete(authCodesTable).where(like(authCodesTable.email, `%@${DOMAIN}`));
}

async function main() {
  const server = app.listen(0);
  await new Promise(r => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let failed = 0;
  try {
    for (const [name, fn] of tests) {
      try { await fn(); console.log(`PASS ${name}`); }
      catch (error) { failed++; console.error(`FAIL ${name}\n  ${(error as Error).stack ?? (error as Error).message}`); }
    }
  } finally {
    await cleanup();
    server.close();
    await pool.end();
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
}

void main();
