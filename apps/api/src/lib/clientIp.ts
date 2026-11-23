import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";

/**
 * The visitor's IP address, for rate limits. When the web host proxies /api
 * (Cloudflare Pages Function, apps/web/functions), every request arrives from
 * the proxy's addresses, so the proxy passes the real address in a header that
 * is trusted only together with the shared PROXY_SHARED_SECRET.
 */
export function clientIp(req: Pick<Request, "get" | "ip">): string {
  const secret = process.env.PROXY_SHARED_SECRET?.trim();
  const forwarded = req.get("x-unipath-client-ip")?.trim();
  if (secret && forwarded && forwarded.length <= 64) {
    const given = Buffer.from(req.get("x-unipath-proxy-secret") ?? "");
    const expected = Buffer.from(secret);
    if (given.length === expected.length && timingSafeEqual(given, expected)) return forwarded;
  }
  return req.ip ?? "unknown";
}
