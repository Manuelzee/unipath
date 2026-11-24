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
  // Redirects (Google sign-in) and Set-Cookie headers go back to the browser unchanged.
  const send = () => fetch(target, { method: request.method, headers, body: readOnly ? undefined : request.body, redirect: "manual" });

  // The API's hosting plan sleeps when idle and takes up to about a minute to
  // wake. Read-only requests are retried through that window. Writes are not:
  // the first attempt may already have been processed.
  for (let attempt = 0; ; attempt++) {
    const last = !readOnly || attempt >= RETRY_DELAYS_MS.length;
    try {
      const response = await send();
      if (last || !WAKING_STATUSES.has(response.status)) return response;
      await response.body?.cancel();
    } catch {
      if (last) return startingUp();
    }
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
  }
}

const WAKING_STATUSES = new Set([502, 503, 504]);
const RETRY_DELAYS_MS = [1000, 2000, 3000, 5000, 7000, 9000, 10000, 10000];
const startingUp = () => Response.json(
  { error: "UniPath is starting up after a quiet period. Please try again in a few seconds." },
  { status: 503, headers: { "retry-after": "10", "cache-control": "no-store" } },
);
