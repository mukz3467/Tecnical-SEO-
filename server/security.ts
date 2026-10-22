import { URL } from 'node:url';
import dns from 'node:dns/promises';
import net, { isIP } from 'node:net';

function ipv4ToNumber(ip: string): number | undefined {
  if (!net.isIPv4(ip)) return undefined;
  return ip.split('.').reduce((n, part) => ((n * 256) + Number(part)) >>> 0, 0);
}

function inV4Range(ip: string, network: string, prefix: number): boolean {
  const value = ipv4ToNumber(ip);
  const base = ipv4ToNumber(network);
  if (value === undefined || base === undefined) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (base & mask);
}

function isPrivateIp(ipRaw: string): boolean {
  const ip = ipRaw.toLowerCase().split('%')[0];
  const version = isIP(ip);
  if (version === 4) {
    const blocked = [
      ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10],
      ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
      ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16],
      ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
      ['224.0.0.0', 4], ['240.0.0.0', 4]
    ] as const;
    return blocked.some(([network, prefix]) => inV4Range(ip, network, prefix));
  }
  if (version === 6) {
    if (ip === '::' || ip === '::1') return true;
    // IPv4-mapped IPv6 must be checked using the embedded IPv4 address.
    const mapped = ip.match(/^(?:::ffff:)(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mapped) return isPrivateIp(mapped[1]);
    // IPv4-compatible/translated forms are not accepted as public destinations.
    if (ip.startsWith('::ffff:') || ip.startsWith('64:ff9b:')) return true;
    // Unique-local, link-local, multicast, and non-global IPv6 ranges.
    if (/^(fc|fd|fe[89ab]|ff)/.test(ip)) return true;
    // Only globally routable 2000::/3 is allowed. This blocks unspecified special ranges.
    return !/^2[0-9a-f]{0,3}:/.test(ip);
  }
  return true;
}

export interface SecurityCheckResult {
  isSafe: boolean;
  reason?: string;
  normalizedUrl?: string;
  isSandboxUrl?: boolean;
}

function isSandboxHost(hostname: string): boolean {
  return hostname === 'sandbox.local' || hostname === 'autoindex.sandbox';
}

export async function validateTargetUrl(rawUrl: string, allowSandbox = true): Promise<SecurityCheckResult> {
  if (!rawUrl || typeof rawUrl !== 'string') return { isSafe: false, reason: 'URL is required.' };

  let parsed: URL;
  try {
    const clean = rawUrl.trim();
    parsed = new URL(/^https?:\/\//i.test(clean) ? clean : `https://${clean}`);
  } catch {
    return { isSafe: false, reason: 'Invalid URL format.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { isSafe: false, reason: 'Only HTTP and HTTPS protocols are permitted.' };
  }
  if (parsed.username || parsed.password) return { isSafe: false, reason: 'URLs containing embedded credentials are not allowed.' };

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (allowSandbox && isSandboxHost(hostname)) {
    return { isSafe: true, normalizedUrl: parsed.origin + parsed.pathname, isSandboxUrl: true };
  }
  if (isSandboxHost(hostname)) return { isSafe: false, reason: 'Sandbox URLs are not allowed for this operation.' };

  if (hostname === 'localhost' || hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') || hostname.endsWith('.internal') ||
      hostname === 'metadata.google.internal' || hostname === 'metadata' ||
      hostname === 'instance-data') {
    return { isSafe: false, reason: 'Access to private/internal hostnames and cloud metadata is blocked (SSRF protection).' };
  }

  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) return { isSafe: false, reason: `Access to private or non-public IP (${hostname}) is blocked.` };
  } else {
    try {
      const records = await dns.lookup(hostname, { all: true, verbatim: true });
      if (!records.length || records.some(record => isPrivateIp(record.address))) {
        return { isSafe: false, reason: 'The hostname resolves to a private, reserved, or non-public IP address.' };
      }
    } catch (err) {
      return { isSafe: false, reason: `Failed to resolve domain '${hostname}': ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  return { isSafe: true, normalizedUrl: parsed.origin + parsed.pathname, isSandboxUrl: false };
}

export async function safeFetch(
  targetUrl: string,
  options: {
    userAgent?: string;
    timeoutMs?: number;
    maxBytes?: number;
    redirectCount?: number;
    maxRedirects?: number;
  } = {}
): Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodyText: string;
  responseTimeMs: number;
  finalUrl: string;
  redirectChain: string[];
}> {
  const timeoutMs = options.timeoutMs ?? 10000;
  const maxBytes = options.maxBytes ?? 4 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? 5;
  const redirectChain = [targetUrl];
  let currentUrl = targetUrl;
  const startTime = Date.now();

  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    const validation = await validateTargetUrl(currentUrl, true);
    if (!validation.isSafe) throw new Error(`SSRF blocked unsafe URL: ${currentUrl} (${validation.reason})`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(currentUrl, {
        method: 'GET',
        headers: {
          'User-Agent': options.userAgent || 'AutoIndexAI-Crawler/1.0',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        },
        signal: controller.signal,
        redirect: 'manual'
      });
      const responseTimeMs = Date.now() - startTime;
      const headers: Record<string, string> = {};
      resp.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });

      if ([301, 302, 303, 307, 308].includes(resp.status)) {
        clearTimeout(timer);
        const location = resp.headers.get('location');
        if (!location) return { ok: resp.ok, status: resp.status, statusText: resp.statusText, headers, bodyText: '', responseTimeMs, finalUrl: currentUrl, redirectChain };
        if (redirects === maxRedirects) throw new Error(`Exceeded maximum redirect limit of ${maxRedirects}`);
        const nextUrl = new URL(location, currentUrl).toString();
        if (redirectChain.includes(nextUrl)) throw new Error(`Redirect loop detected: ${nextUrl}`);
        redirectChain.push(nextUrl);
        currentUrl = nextUrl;
        continue;
      }

      const contentLength = Number(resp.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        await resp.body?.cancel();
        throw new Error(`Response exceeds safety limit of ${maxBytes} bytes`);
      }
      if (!resp.body) {
        return { ok: resp.ok, status: resp.status, statusText: resp.statusText, headers, bodyText: '', responseTimeMs, finalUrl: currentUrl, redirectChain };
      }

      const reader = resp.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytesRead = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value.byteLength;
        if (bytesRead > maxBytes) {
          await reader.cancel();
          throw new Error(`Response exceeds safety limit of ${maxBytes} bytes`);
        }
        chunks.push(value);
      }
      const merged = new Uint8Array(bytesRead);
      let offset = 0;
      for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
      return {
        ok: resp.ok, status: resp.status, statusText: resp.statusText, headers,
        bodyText: new TextDecoder('utf-8').decode(merged),
        responseTimeMs, finalUrl: currentUrl, redirectChain
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (controller.signal.aborted) throw new Error(`Connection timed out after ${timeoutMs}ms`);
      throw new Error(errorMsg);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Exceeded maximum redirect limit of ${maxRedirects}`);
}
