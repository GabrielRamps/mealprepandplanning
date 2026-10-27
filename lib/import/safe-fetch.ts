import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Server-side fetches of user-supplied links (PRD 12): http(s) only, no
// private or loopback addresses, at most 5 redirects, capped time and size.

export class FetchBlockedError extends Error {}
export class FetchTooLargeError extends Error {}

export const BROWSER_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** True for addresses a server-side fetch must never reach. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return ipv4Private(ip);
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Private(mapped[1]);
  return (
    v6 === "::" ||
    v6 === "::1" ||
    /^f[cd]/.test(v6) || // fc00::/7 unique local
    /^fe[89ab]/.test(v6) || // fe80::/10 link local
    v6.startsWith("ff") // multicast
  );
}

// Local testing against a mock server only; never honored in production.
const allowPrivate = () => process.env.NODE_ENV !== "production" && process.env.IMPORT_ALLOW_PRIVATE_FETCH === "1";

async function assertPublic(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchBlockedError("Only http and https links are supported");
  if (allowPrivate()) return;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new FetchBlockedError("That link points somewhere private");
  }
}

export type SafeResponse = { url: string; status: number; contentType: string; body: Buffer };

export async function safeFetch(
  input: string,
  opts: { timeoutMs?: number; maxBytes?: number; headers?: Record<string, string>; maxRedirects?: number } = {},
): Promise<SafeResponse> {
  const { timeoutMs = 15_000, maxBytes = 5 * 1024 * 1024, maxRedirects = 5 } = opts;
  const signal = AbortSignal.timeout(timeoutMs);
  let url = new URL(input);

  for (let hop = 0; ; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal,
      headers: { "user-agent": BROWSER_UA, accept: "*/*", ...opts.headers },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop >= maxRedirects) throw new FetchBlockedError("Too many redirects");
      await res.body?.cancel();
      url = new URL(res.headers.get("location")!, url);
      continue;
    }

    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > maxBytes) {
      await res.body?.cancel();
      throw new FetchTooLargeError("That page or file is too large");
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body?.getReader();
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new FetchTooLargeError("That page or file is too large");
      }
      chunks.push(value);
    }
    return {
      url: url.toString(),
      status: res.status,
      contentType: res.headers.get("content-type") ?? "",
      body: Buffer.concat(chunks),
    };
  }
}

/** Follows a short link (vm.tiktok.com) to where it lands, without downloading the page. */
export async function resolveRedirects(input: string, maxRedirects = 5): Promise<string> {
  let url = new URL(input);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublic(url);
    const res = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { "user-agent": BROWSER_UA } });
    await res.body?.cancel();
    const location = res.headers.get("location");
    if (!(res.status >= 300 && res.status < 400 && location)) return url.toString();
    url = new URL(location, url);
  }
  throw new FetchBlockedError("Too many redirects");
}
