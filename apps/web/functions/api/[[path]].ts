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

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  // Redirects (Google sign-in) and Set-Cookie headers go back to the browser unchanged.
  return fetch(target, { method: request.method, headers, body: hasBody ? request.body : undefined, redirect: "manual" });
}
