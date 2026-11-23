import { createHash, randomBytes } from "node:crypto";

/**
 * "Continue with Google" using OpenID Connect's authorization-code flow with
 * PKCE. The ID token comes straight from Google's token endpoint over TLS, so
 * its claims (issuer, audience, expiry, nonce) are checked without fetching
 * signing keys (OpenID Connect Core 3.1.3.7).
 */
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

const clientId = () => process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
export const googleConfigured = () => !!(clientId() && clientSecret());

export type GoogleRequest = { url: string; state: string; nonce: string; verifier: string };
export type GoogleIdentity = { subject: string; email: string; emailVerified: boolean; firstName: string; lastName: string };

export function createGoogleRequest(redirectUri: string): GoogleRequest {
  const state = randomBytes(24).toString("base64url");
  const nonce = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: clientId(), redirect_uri: redirectUri, response_type: "code", scope: "openid email profile",
    state, nonce, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  }).toString();
  return { url: url.toString(), state, nonce, verifier };
}

export class GoogleSignInError extends Error {}

export async function exchangeGoogleCode(code: string, verifier: string, nonce: string, redirectUri: string): Promise<GoogleIdentity> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      code, code_verifier: verifier, client_id: clientId(), client_secret: clientSecret(),
      redirect_uri: redirectUri, grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new GoogleSignInError(`Google token endpoint returned ${response.status}`);
  const { id_token: idToken } = await response.json() as { id_token?: unknown };
  if (typeof idToken !== "string") throw new GoogleSignInError("Google returned no ID token");
  const claims = decodeJwtPayload(idToken);
  if (!ISSUERS.has(String(claims.iss))) throw new GoogleSignInError("Unexpected ID token issuer");
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(clientId())) throw new GoogleSignInError("ID token is for another client");
  if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) throw new GoogleSignInError("ID token expired");
  if (claims.nonce !== nonce) throw new GoogleSignInError("ID token nonce mismatch");
  if (typeof claims.sub !== "string" || !claims.sub || typeof claims.email !== "string") throw new GoogleSignInError("ID token lacks an account or email");
  return {
    subject: claims.sub, email: claims.email,
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
    firstName: typeof claims.given_name === "string" ? claims.given_name.slice(0, 60) : "",
    lastName: typeof claims.family_name === "string" ? claims.family_name.slice(0, 60) : "",
  };
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new GoogleSignInError("Malformed ID token");
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as unknown;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) return payload as Record<string, unknown>;
  } catch { /* fall through */ }
  throw new GoogleSignInError("Malformed ID token");
}
