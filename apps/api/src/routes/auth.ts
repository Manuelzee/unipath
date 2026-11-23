import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  ChangePasswordBody, ChangePasswordResponse, DeleteAccountBody, GetAuthSessionResponse, ResetPasswordBody,
  SendAuthCodeBody, SendAuthCodeResponse, SignInWithPasswordBody, SignOutOtherSessionsResponse, SignUpWithPasswordBody,
  UpdateAccountBody, UpdateAccountResponse, VerifyAuthCodeBody,
  // Every sign-in endpoint returns the same AuthResult schema.
  SignInWithPasswordResponse as AuthResultSchema,
} from "@workspace/api-zod";
import { authCodesTable, authUsersTable, db, type AuthUserRecord } from "@workspace/db";
import { BurstLimiter } from "../lib/ai/burst";
import { publicOrigin } from "../lib/admin/security";
import { clientIp } from "../lib/clientIp";
import { CODE_TTL_SECONDS, consumeCode, issueCode, type CodeCheck, type CodePurpose } from "../lib/auth/codes";
import { EmailSendError, EmailUnavailableError, emailDelivery, sendCodeEmail } from "../lib/auth/email";
import { GoogleSignInError, createGoogleRequest, exchangeGoogleCode, googleConfigured } from "../lib/auth/google";
import { hashPassword, passwordProblem, verifyPassword } from "../lib/auth/password";
import { cookieBase, endOtherSessions, endSession, getAuth, readCookie, sessionCookieName, startSession } from "../lib/auth/session";
import { findUserByEmail, findUserByGoogleSubject, findUserById, isUniqueViolation, newUserId, publicUser } from "../lib/auth/users";
import { cleanName, normalizeEmail, safeRedirect } from "../lib/auth/validation";
import { requireAuth } from "../middlewares/requireAuth";
import { requireJson } from "../middlewares/requireJson";
import { deleteStudentData } from "./account";

/**
 * UniPath accounts. Registration takes a name, email and password, then the
 * 6-digit code emailed to that address; the account can be used only after
 * the code is entered. Signing in is email + password (or Google) and never
 * asks for a code. Successful sign-ins set the session cookie; see
 * lib/auth/session.ts.
 */
const router: IRouter = Router();
router.use("/auth", requireJson, (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

const MINUTE = 60_000;
const RESEND_AFTER_SECONDS = 30;
// Per server process. Behind several instances, put a shared limiter in front as well.
// Sign-in limits count failures only, so a school network sharing one IP is
// not locked out by its own successful sign-ins.
const limits = {
  signUpsByIp: new BurstLimiter(20, 15 * MINUTE),
  failedSignInsByIp: new BurstLimiter(50, 15 * MINUTE),
  failedSignInsByEmail: new BurstLimiter(10, 15 * MINUTE),
  codeResend: new BurstLimiter(1, RESEND_AFTER_SECONDS * 1000),
  codesByEmail: new BurstLimiter(6, 60 * MINUTE),
  codesByIp: new BurstLimiter(60, 60 * MINUTE),
  codeChecksByIp: new BurstLimiter(60, 15 * MINUTE),
  accountByUser: new BurstLimiter(10, 15 * MINUTE),
};
const ip = clientIp;

class AuthFailure extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const fail = (status: number, message: string) => new AuthFailure(status, message);
const tooMany = () => fail(429, "Too many attempts. Please wait a few minutes and try again.");
const emailOff = () => fail(503, "Email codes aren’t available on this server yet. Try Continue with Google, or ask the site owner to set up email.");
const take = (limiter: BurstLimiter, key: string) => { if (!limiter.take(key)) throw tooMany(); };

type Handler = (req: Request, res: Response) => Promise<void>;
const handle = (handler: Handler) => async (req: Request, res: Response, next: (error?: unknown) => void) => {
  try { await handler(req, res); } catch (error) {
    if (error instanceof AuthFailure) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof EmailUnavailableError) { const e = emailOff(); res.status(e.status).json({ error: e.message }); return; }
    if (error instanceof EmailSendError) {
      res.status(502).json({ error: "We couldn’t send the email with your code just now. Please try again in a few minutes." }); return;
    }
    next(error);
  }
};

const requireEmail = (value: string) => {
  const email = normalizeEmail(value);
  if (!email) throw fail(400, "Enter a valid email address.");
  return email;
};
const codeProblem: Record<Exclude<CodeCheck, "ok">, string> = {
  invalid: "That code isn’t right. Check the most recent email and try again.",
  expired: "That code has expired. Send yourself a new one.",
  locked: "Too many wrong tries for that code. Send yourself a new one.",
};

/** Emails a code unless one was sent moments ago (that code still works). */
async function sendCode(email: string, purpose: CodePurpose, { quietCooldown = false } = {}) {
  const mode = emailDelivery();
  if (mode === "unavailable") throw emailOff();
  if (!limits.codeResend.take(`${purpose}:${email}`)) {
    if (quietCooldown) return mode;
    throw fail(429, `Wait ${RESEND_AFTER_SECONDS} seconds before asking for another code.`);
  }
  if (!limits.codesByEmail.take(email)) throw tooMany();
  const code = await issueCode(email, purpose);
  return sendCodeEmail(email, code, purpose, CODE_TTL_SECONDS / 60);
}

async function signIn(req: Request, res: Response, user: AuthUserRecord, isNewUser: boolean) {
  await startSession(req, res, user.id);
  res.json(AuthResultSchema.parse({ status: "signed_in", user: publicUser(user), isNewUser }));
}

async function updateUser(id: string, values: Partial<typeof authUsersTable.$inferInsert>) {
  const [user] = await db.update(authUsersTable).set({ ...values, updatedAt: new Date() }).where(eq(authUsersTable.id, id)).returning();
  if (!user) throw fail(400, "That account no longer exists.");
  return user;
}

/** Inserts a verified account; when a parallel request created it first, returns that one. */
async function createVerifiedUser(values: Omit<typeof authUsersTable.$inferInsert, "id">) {
  try {
    const [user] = await db.insert(authUsersTable).values({ id: newUserId(), emailVerifiedAt: new Date(), ...values }).returning();
    return { user, isNewUser: true };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await findUserByEmail(values.email);
    if (!existing) throw error;
    return { user: existing, isNewUser: false };
  }
}

router.get("/auth/session", handle(async (req, res) => {
  const { userId } = getAuth(req);
  const user = userId ? await findUserById(userId) : undefined;
  if (userId && !user) await endSession(req, res);
  const delivery = emailDelivery();
  res.json(GetAuthSessionResponse.parse({
    user: user ? publicUser(user) : null,
    methods: { password: true, google: googleConfigured() },
    emailDelivery: delivery,
  }));
}));

router.post("/auth/sign-up", handle(async (req, res) => {
  const body = SignUpWithPasswordBody.safeParse(req.body);
  if (!body.success) throw fail(400, "Enter your first name, your email and a password of at least 8 characters.");
  const email = requireEmail(body.data.email);
  const firstName = cleanName(body.data.firstName);
  if (!firstName) throw fail(400, "Enter your first name.");
  const problem = passwordProblem(body.data.password, email);
  if (problem) throw fail(400, problem);
  take(limits.signUpsByIp, ip(req));
  if (emailDelivery() === "unavailable") throw emailOff();
  const existing = await findUserByEmail(email);
  if (existing?.emailVerifiedAt) throw fail(409, "An account with this email already exists. Sign in instead, or reset your password.");
  const values = { passwordHash: await hashPassword(body.data.password), firstName, lastName: cleanName(body.data.lastName) };
  // An unverified account belongs to whoever proves the address first, so a
  // repeat sign-up replaces its password rather than being refused.
  if (existing) await updateUser(existing.id, values);
  else {
    try { await db.insert(authUsersTable).values({ id: newUserId(), email, ...values }); } catch (error) {
      if (isUniqueViolation(error)) throw fail(409, "An account with this email was just created. Sign in instead.");
      throw error;
    }
  }
  const delivery = await sendCode(email, "verify_email", { quietCooldown: true });
  res.json(AuthResultSchema.parse({ status: "verification_required", email, delivery }));
}));

router.post("/auth/sign-in", handle(async (req, res) => {
  const body = SignInWithPasswordBody.safeParse(req.body);
  if (!body.success) throw fail(400, "Enter your email and password.");
  const email = requireEmail(body.data.email);
  if (limits.failedSignInsByIp.isFull(ip(req)) || limits.failedSignInsByEmail.isFull(email)) throw tooMany();
  const user = await findUserByEmail(email);
  const correct = await verifyPassword(body.data.password, user?.passwordHash);
  if (!user || !correct) {
    limits.failedSignInsByIp.take(ip(req));
    limits.failedSignInsByEmail.take(email);
    throw fail(401, "That email and password don’t match. Check them and try again, or reset your password.");
  }
  // Registration is finished only once the emailed code is entered.
  if (!user.emailVerifiedAt) {
    const delivery = await sendCode(email, "verify_email", { quietCooldown: true });
    res.json(AuthResultSchema.parse({ status: "verification_required", email, delivery }));
    return;
  }
  await signIn(req, res, user, false);
}));

router.post("/auth/codes", handle(async (req, res) => {
  const body = SendAuthCodeBody.safeParse(req.body);
  if (!body.success) throw fail(400, "Enter a valid email address.");
  const email = requireEmail(body.data.email);
  const purpose = body.data.purpose;
  take(limits.codesByIp, ip(req));
  const mode = emailDelivery();
  if (mode === "unavailable") throw emailOff();
  // Codes confirm a new account or reset a password; they never sign anyone in.
  // Only real accounts get them, but the reply is identical either way and is
  // sent before the email, so it does not reveal who has an account.
  const user = await findUserByEmail(email);
  const wanted = purpose === "reset_password" ? !!user : !!user && !user.emailVerifiedAt;
  if (wanted) {
    if (!limits.codeResend.take(`${purpose}:${email}`)) throw fail(429, `Wait ${RESEND_AFTER_SECONDS} seconds before asking for another code.`);
    if (!limits.codesByEmail.take(email)) throw tooMany();
    void issueCode(email, purpose)
      .then(code => sendCodeEmail(email, code, purpose, CODE_TTL_SECONDS / 60))
      .catch(() => req.log.error({ purpose }, "Could not send an account email"));
  }
  res.json(SendAuthCodeResponse.parse({ email, purpose, delivery: mode, expiresInSeconds: CODE_TTL_SECONDS, resendAfterSeconds: RESEND_AFTER_SECONDS }));
}));

router.post("/auth/codes/verify", handle(async (req, res) => {
  const body = VerifyAuthCodeBody.safeParse(req.body);
  if (!body.success) throw fail(400, "Enter the 6-digit code from your email.");
  const email = requireEmail(body.data.email);
  take(limits.codeChecksByIp, ip(req));
  const check = await consumeCode(email, body.data.purpose, body.data.code);
  if (check !== "ok") throw fail(400, codeProblem[check]);
  // The only purpose is verify_email: entering the code finishes registration.
  const existing = await findUserByEmail(email);
  if (!existing) throw fail(400, codeProblem.invalid);
  const firstVerification = !existing.emailVerifiedAt;
  const user = firstVerification ? await updateUser(existing.id, { emailVerifiedAt: new Date() }) : existing;
  await signIn(req, res, user, firstVerification);
}));

router.post("/auth/password-reset", handle(async (req, res) => {
  const body = ResetPasswordBody.safeParse(req.body);
  if (!body.success) throw fail(400, "Enter the 6-digit code from your email and a new password of at least 8 characters.");
  const email = requireEmail(body.data.email);
  const problem = passwordProblem(body.data.password, email);
  if (problem) throw fail(400, problem);
  take(limits.codeChecksByIp, ip(req));
  const check = await consumeCode(email, "reset_password", body.data.code);
  if (check !== "ok") throw fail(400, codeProblem[check]);
  const existing = await findUserByEmail(email);
  if (!existing) throw fail(400, codeProblem.invalid);
  const user = await updateUser(existing.id, { passwordHash: await hashPassword(body.data.password), emailVerifiedAt: existing.emailVerifiedAt ?? new Date() });
  await endOtherSessions(user.id, null);
  req.auth = { userId: null, sessionId: null };
  await signIn(req, res, user, false);
}));

router.post("/auth/sign-out", handle(async (req, res) => {
  await endSession(req, res);
  res.status(204).end();
}));

router.post("/auth/sign-out-others", requireAuth, handle(async (req, res) => {
  const { userId, sessionId } = getAuth(req);
  res.json(SignOutOtherSessionsResponse.parse({ revoked: await endOtherSessions(userId!, sessionId) }));
}));

router.patch("/auth/me", requireAuth, handle(async (req, res) => {
  const body = UpdateAccountBody.safeParse(req.body);
  const firstName = cleanName(body.data?.firstName);
  if (!body.success || !firstName) throw fail(400, "Enter your first name (up to 60 characters).");
  const user = await updateUser(getAuth(req).userId!, { firstName, lastName: cleanName(body.data.lastName) });
  res.json(UpdateAccountResponse.parse(publicUser(user)));
}));

router.post("/auth/password", requireAuth, handle(async (req, res) => {
  const body = ChangePasswordBody.safeParse(req.body);
  if (!body.success) throw fail(400, "Enter a new password of at least 8 characters.");
  const { userId, sessionId } = getAuth(req);
  take(limits.accountByUser, userId!);
  const existing = await findUserById(userId!);
  if (!existing) throw fail(401, "Sign in again to change your password.");
  if (existing.passwordHash && !await verifyPassword(body.data.currentPassword ?? "", existing.passwordHash))
    throw fail(400, "Your current password isn’t right.");
  const problem = passwordProblem(body.data.newPassword, existing.email);
  if (problem) throw fail(400, problem);
  const user = await updateUser(existing.id, { passwordHash: await hashPassword(body.data.newPassword) });
  await endOtherSessions(user.id, sessionId);
  res.json(ChangePasswordResponse.parse(publicUser(user)));
}));

router.post("/auth/account-deletion", requireAuth, handle(async (req, res) => {
  if (!DeleteAccountBody.safeParse(req.body).success) throw fail(400, "Type DELETE to confirm. Nothing was deleted.");
  const userId = getAuth(req).userId!;
  const deleted = await deleteStudentData(userId);
  // Sessions go with the account by foreign key; pending codes are removed too.
  const [account] = await db.delete(authUsersTable).where(eq(authUsersTable.id, userId)).returning({ email: authUsersTable.email });
  if (account) await db.delete(authCodesTable).where(eq(authCodesTable.email, account.email));
  res.clearCookie(sessionCookieName(), cookieBase());
  req.auth = { userId: null, sessionId: null };
  req.log.info({ deleted }, "Student deleted their account");
  res.status(204).end();
}));

// ---- Google (browser redirects, not JSON) ----
const GOOGLE_COOKIE = "unipath_google_oauth";
const GOOGLE_COOKIE_PATH = "/api/auth/google";
type GoogleState = { state: string; nonce: string; verifier: string; redirect: string; redirectUri: string };

const signInError = (res: Response, code: string) => res.redirect(302, `/sign-in?error=${code}`);

router.get("/auth/google/start", (req, res) => {
  const origin = publicOrigin(req);
  if (!googleConfigured() || !origin) { signInError(res, "google_unavailable"); return; }
  const redirectUri = `${origin}/api/auth/google/callback`;
  const request = createGoogleRequest(redirectUri);
  const stored: GoogleState = { state: request.state, nonce: request.nonce, verifier: request.verifier, redirect: safeRedirect(req.query.redirect), redirectUri };
  res.cookie(GOOGLE_COOKIE, Buffer.from(JSON.stringify(stored)).toString("base64url"), { ...cookieBase(), path: GOOGLE_COOKIE_PATH, maxAge: 10 * MINUTE });
  res.redirect(302, request.url);
});

function readGoogleState(req: Request): GoogleState | null {
  try {
    const value = JSON.parse(Buffer.from(readCookie(req, GOOGLE_COOKIE) ?? "", "base64url").toString("utf8")) as Partial<GoogleState>;
    return [value.state, value.nonce, value.verifier, value.redirect, value.redirectUri].every(v => typeof v === "string") ? value as GoogleState : null;
  } catch { return null; }
}
const sameText = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

router.get("/auth/google/callback", async (req, res, next) => {
  const stored = readGoogleState(req);
  res.clearCookie(GOOGLE_COOKIE, { ...cookieBase(), path: GOOGLE_COOKIE_PATH });
  if (typeof req.query.error === "string") { signInError(res, "google_cancelled"); return; }
  const { code, state } = req.query;
  if (!stored || typeof code !== "string" || typeof state !== "string" || !sameText(state, stored.state)) { signInError(res, "google_failed"); return; }
  try {
    const identity = await exchangeGoogleCode(code, stored.verifier, stored.nonce, stored.redirectUri);
    const email = normalizeEmail(identity.email);
    if (!identity.emailVerified || !email) { signInError(res, "google_unverified"); return; }
    let user = await findUserByGoogleSubject(identity.subject);
    let isNewUser = false;
    if (!user) {
      const existing = await findUserByEmail(email);
      if (existing?.googleSubject) { signInError(res, "google_conflict"); return; }
      if (existing) {
        // Google has verified this address. An unverified account's password
        // may have been set by someone else, so it is discarded.
        user = await updateUser(existing.id, {
          googleSubject: identity.subject,
          emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
          passwordHash: existing.emailVerifiedAt ? existing.passwordHash : null,
          firstName: existing.firstName || cleanName(identity.firstName),
          lastName: existing.lastName || cleanName(identity.lastName),
        });
      } else {
        ({ user, isNewUser } = await createVerifiedUser({ email, googleSubject: identity.subject, firstName: cleanName(identity.firstName), lastName: cleanName(identity.lastName) }));
      }
    }
    await startSession(req, res, user.id);
    res.redirect(302, isNewUser ? "/onboarding" : stored.redirect);
  } catch (error) {
    if (error instanceof GoogleSignInError || (error instanceof Error && error.name === "TimeoutError")) {
      req.log.warn({ reason: error.message }, "Google sign-in failed");
      signInError(res, "google_failed"); return;
    }
    next(error);
  }
});

export default router;
