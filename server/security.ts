import { URL } from 'url';
import dns from 'dns';
import { promisify } from 'util';

const lookupAsync = promisify(dns.lookup);

// List of private IPv4 CIDR blocks
function isPrivateIp(ip: string): boolean {
  // IPv4 loopback & special
  if (ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0' || ip === '::') {
    return true;
  }

  // IPv4 parts check
  const parts = ip.split('.').map(p => parseInt(p, 10));
  if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
    // 10.0.0.0 - 10.255.255.255
    if (parts[0] === 10) return true;
    // 172.16.0.0 - 172.31.255.255
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0 - 192.168.255.255
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 127.0.0.0 - 127.255.255.255
    if (parts[0] === 127) return true;
    // 169.254.0.0 - 169.254.255.255 (Link-local, AWS/GCP metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0 - 0.255.255.255
    if (parts[0] === 0) return true;
    // 100.64.0.0 - 100.127.255.255 (Shared Address Space)
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  }

  // IPv6 unique local fc00::/7 or link-local fe80::/10
  if (ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd') || ip.toLowerCase().startsWith('fe80:')) {
    return true;
  }

  return false;
}

export interface SecurityCheckResult {
  isSafe: boolean;
  reason?: string;
  normalizedUrl?: string;
  isSandboxUrl?: boolean;
}

export async function validateTargetUrl(rawUrl: string, allowSandbox: boolean = true): Promise<SecurityCheckResult> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isSafe: false, reason: 'URL is required.' };
  }

  let parsed: URL;
  try {
    let clean = rawUrl.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    parsed = new URL(clean);
  } catch {
    return { isSafe: false, reason: 'Invalid URL format.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { isSafe: false, reason: 'Only HTTP and HTTPS protocols are permitted.' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Check for built-in sandbox / demonstration mode
  if (hostname === 'sandbox.local' || hostname === 'autoindex.sandbox' || parsed.pathname.startsWith('/api/sandbox-site')) {
    return {
      isSafe: true,
      normalizedUrl: parsed.origin + parsed.pathname,
      isSandboxUrl: true
    };
  }

  // Block localhost, metadata endpoints, and internal words
  const blockedHostnames = [
    'localhost',
    'metadata.google.internal',
    'metadata',
    'instance-data',
    '169.254.169.254'
  ];

  if (blockedHostnames.includes(hostname) || hostname.endsWith('.internal') || hostname.endsWith('.local')) {
    return { isSafe: false, reason: 'Access to private internal hostnames or cloud metadata is blocked (SSRF Protection).' };
  }

  // Resolve DNS to verify actual IP
  try {
    const { address } = await lookupAsync(hostname);
    if (isPrivateIp(address)) {
      return {
        isSafe: false,
        reason: `Access to private or local network IP (${address}) is blocked (SSRF Protection).`
      };
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { isSafe: false, reason: `Failed to resolve domain '${hostname}': ${errorMsg}` };
  }

  return {
    isSafe: true,
    normalizedUrl: parsed.origin + parsed.pathname,
    isSandboxUrl: false
  };
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
  const maxBytes = options.maxBytes ?? 4 * 1024 * 1024; // 4MB
  const maxRedirects = options.maxRedirects ?? 5;
  const redirectChain: string[] = [targetUrl];

  let currentUrl = targetUrl;
  let redirectsRemaining = maxRedirects;

  const startTime = Date.now();

  while (redirectsRemaining >= 0) {
    const validation = await validateTargetUrl(currentUrl);
    if (!validation.isSafe && !validation.isSandboxUrl) {
      throw new Error(`SSRF Blocked redirect to unsafe URL: ${currentUrl} (${validation.reason})`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(currentUrl, {
        method: 'GET',
        headers: {
          'User-Agent': options.userAgent || 'AutoIndexAI-Crawler/1.0 (+https://autoindex.ai/bot; legitimate technical SEO audit)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br'
        },
        signal: controller.signal,
        redirect: 'manual'
      });

      clearTimeout(timer);
      const responseTimeMs = Date.now() - startTime;

      const headers: Record<string, string> = {};
      resp.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      // Handle redirects manually to validate and record each hop safely
      if ([301, 302, 303, 307, 308].includes(resp.status)) {
        const location = resp.headers.get('location');
        if (!location) {
          return {
            ok: resp.ok,
            status: resp.status,
            statusText: resp.statusText,
            headers,
            bodyText: '',
            responseTimeMs,
            finalUrl: currentUrl,
            redirectChain
          };
        }

        const nextUrl = new URL(location, currentUrl).toString();
        redirectChain.push(nextUrl);

        if (redirectChain.filter(u => u === nextUrl).length > 2) {
          throw new Error(`Redirect loop detected: ${nextUrl}`);
        }

        currentUrl = nextUrl;
        redirectsRemaining--;
        continue;
      }

      // Read response body up to maxBytes
      const arrayBuffer = await resp.arrayBuffer();
      if (arrayBuffer.byteLength > maxBytes) {
        throw new Error(`Response exceeds safety limit of ${maxBytes / (1024 * 1024)}MB`);
      }

      const decoder = new TextDecoder('utf-8');
      const bodyText = decoder.decode(arrayBuffer);

      return {
        ok: resp.ok,
        status: resp.status,
        statusText: resp.statusText,
        headers,
        bodyText,
        responseTimeMs,
        finalUrl: currentUrl,
        redirectChain
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('abort')) {
        throw new Error(`Connection timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
  }

  throw new Error(`Exceeded maximum redirect limit of ${maxRedirects}`);
}
