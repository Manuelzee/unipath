/**
 * Cloudflare Pages Function: forwards every /api/* request to the API server
 * (Render), so the browser only ever talks to this site. The session cookie
 * therefore stays first-party; browsers block cookies on cross-site API calls.
 *
 * Pages project settings (Settings > Variables and Secrets):
 * - API_ORIGIN: the API server's origin, e.g. https://unipath-api.onrender.com
 * - PROXY_SHARED_SECRET (secret): the same value as on the API server. It lets
 *   the API trust the visitor IP passed below for its sign-in rate limits.
 */
interface Env {
  API_ORIGIN?: string;
  PROXY_SHARED_SECRET?: string;
}

// Connection-level headers belong to one hop and must not be forwarded.
const HOP_BY_HOP = ["connection", "keep-alive", "proxy-connection", "transfer-encoding", "upgrade", "te", "trailer"];

export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
  const apiOrigin = env.API_ORIGIN?.trim().replace(/\/+$/, "");
  if (!apiOrigin) {
    return Response.json({ error: "This site's API address (API_ORIGIN) is not configured." }, { status: 503 });
  }
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, apiOrigin);

  const headers = new Headers(request.headers);
  for (const name of HOP_BY_HOP) headers.delete(name);
  // Only this proxy may set these; never pass on a visitor's own values.
  headers.delete("x-unipath-client-ip");
  headers.delete("x-unipath-proxy-secret");
  const visitorIp = request.headers.get("cf-connecting-ip");
  if (visitorIp && env.PROXY_SHARED_SECRET) {
    headers.set("x-unipath-client-ip", visitorIp);
    headers.set("x-unipath-proxy-secret", env.PROXY_SHARED_SECRET);
  }
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", "https");

  const readOnly = request.method === "GET" || request.method === "HEAD";
  // Buffered so a write can be sent again after the API wakes (uploads are at most 10 MB).
  const body = readOnly ? undefined : await request.arrayBuffer();
  // Redirects (Google sign-in) and Set-Cookie headers go back to the browser unchanged.
  const send = () => fetch(target, { method: request.method, headers, body, redirect: "manual" });

  // The API's hosting plan sleeps when idle and takes up to about a minute to
  // wake. Read-only requests are retried through that window.
  if (readOnly) {
    for (let attempt = 0; ; attempt++) {
      const last = attempt >= RETRY_DELAYS_MS.length;
      try {
        const response = await send();
        if (last || !WAKING_STATUSES.has(response.status)) return response;
        await response.body?.cancel();
      } catch {
        if (last) return startingUp();
      }
      await wait(RETRY_DELAYS_MS[attempt]);
    }
  }

  // A write is sent again only when the reply proves the app never saw it:
  // an error page from the host while the API was asleep or restarting (the
  // app itself always answers in JSON). Then wait for the API and resend once.
  let response: Response;
  try { response = await send(); } catch { return startingUp(); }
  if (!WAKING_STATUSES.has(response.status) || fromApp(response)) return response;
  await response.body?.cancel();
  if (!await awake(apiOrigin)) return startingUp();
  try { return await send(); } catch { return startingUp(); }
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const fromApp = (response: Response) => (response.headers.get("content-type") ?? "").includes("application/json");

/** Polls the API's health check until it answers (about a minute at most). */
async function awake(apiOrigin: string): Promise<boolean> {
  for (const delay of [0, ...RETRY_DELAYS_MS]) {
    await wait(delay);
    try {
      const health = await fetch(`${apiOrigin}/api/healthz`, { headers: { accept: "application/json" } });
      await health.body?.cancel();
      if (health.ok) return true;
    } catch { /* still waking */ }
  }
  return false;
}

const WAKING_STATUSES = new Set([502, 503, 504]);
const RETRY_DELAYS_MS = [1000, 2000, 3000, 5000, 7000, 9000, 10000, 10000];
const startingUp = () => Response.json(
  { error: "UniPath is starting up after a quiet period. Please try again in a few seconds." },
  { status: 503, headers: { "retry-after": "10", "cache-control": "no-store" } },
);
