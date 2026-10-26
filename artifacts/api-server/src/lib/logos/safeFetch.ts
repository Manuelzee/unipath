import { lookup } from "node:dns/promises";
import https from "node:https";
import ipaddr from "ipaddr.js";

export function publicAddress(value: string) {
  try {
    const address = ipaddr.process(value);
    return address.range() === "unicast";
  } catch { return false; }
}

/** HTTPS only, public IPs only, pinned DNS, bounded bodies/timeouts and checked redirects. */
export async function safeFetch(raw: string, maxBytes = 2_000_000, allowedHosts?: Set<string>, depth = 0): Promise<{ status: number; body: Buffer; type: string; url: string }> {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
    (allowedHosts && !allowedHosts.has(url.hostname))) throw new Error("Unsafe or unapproved source URL.");
  if (depth > 4) throw new Error("Source redirected too many times.");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((address) => !publicAddress(address.address))) throw new Error("Private network source rejected.");
  const selected = addresses[0];
  const response = await new Promise<{ status: number; body: Buffer; type: string; location?: string }>((resolve, reject) => {
    const request = https.get(url, {
      headers: { "User-Agent": "UniPathAI-LogoDiscovery/1.0 (institution identification; respects robots.txt)", Accept: "*/*" },
      // Pin the validated address, preventing DNS rebinding between validation and use.
      lookup: ((_host: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
        if (options.all) callback(null, [selected]); else callback(null, selected.address, selected.family);
      }) as NonNullable<https.RequestOptions["lookup"]>,
    }, (res) => {
      const status = res.statusCode ?? 500;
      if (status >= 300 && status < 400) { res.resume(); resolve({ status, body: Buffer.alloc(0), type: "", location: res.headers.location }); return; }
      if (Number(res.headers["content-length"]) > maxBytes) { res.destroy(); reject(new Error("Source exceeds size limit.")); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) { res.destroy(); reject(new Error("Source exceeds size limit.")); return; }
        chunks.push(chunk);
      });
      res.on("end", () => resolve({ status, body: Buffer.concat(chunks), type: String(res.headers["content-type"] ?? "") }));
      res.on("error", () => reject(new Error("Source response failed.")));
    });
    request.setTimeout(12_000, () => request.destroy(new Error("Source request timed out.")));
    request.on("error", () => reject(new Error("Source request failed.")));
  });
  if (response.location && response.status >= 300 && response.status < 400) {
    return safeFetch(new URL(response.location, url).href, maxBytes, allowedHosts, depth + 1);
  }
  return { ...response, url: url.href };
}
