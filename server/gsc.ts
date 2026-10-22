import { createSign } from 'node:crypto';
import { GoogleSearchConsoleStatus, CrawledPage, SitemapInfo } from './types.ts';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters';
const INSPECTION_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function getServiceAccount(): ServiceAccount | undefined {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    let parsed: ServiceAccount;
    try {
      parsed = JSON.parse(raw) as ServiceAccount;
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON.');
    }
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.');
    }
    return { ...parsed, private_key: parsed.private_key.replace(/\\n/g, '\n'), token_uri: parsed.token_uri || TOKEN_URL };
  }

  const clientEmail = process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (clientEmail && privateKey) return { client_email: clientEmail, private_key: privateKey, token_uri: TOKEN_URL };
  return undefined;
}

async function getAccessToken(account: ServiceAccount, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({
    iss: account.client_email,
    scope,
    aud: account.token_uri || TOKEN_URL,
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(account.private_key).toString('base64url')}`;
  const response = await fetch(account.token_uri || TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(15000)
  });
  const payload = await response.json().catch(() => ({})) as { access_token?: string; error_description?: string; error?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(`Google authentication failed (${response.status}): ${payload.error_description || payload.error || 'No access token returned'}`);
  }
  return payload.access_token;
}

async function googleRequest(url: string, token: string, init: RequestInit = {}): Promise<{ response: Response; data: any }> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {})
    },
    signal: init.signal || AbortSignal.timeout(20000)
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export class GoogleSearchConsoleIntegration {
  public static async executeWorkflow(
    targetDomain: string,
    sitemapUrl: string,
    crawledPages: CrawledPage[],
    sitemapInfo: SitemapInfo,
    credentials?: { clientEmail?: string; privateKey?: string }
  ): Promise<GoogleSearchConsoleStatus> {
    const propertyUrl = `sc-domain:${targetDomain.toLowerCase()}`;
    const sitemapTarget = /^https?:\/\//i.test(sitemapUrl) ? sitemapUrl : `https://${targetDomain}/sitemap.xml`;
    let account: ServiceAccount | undefined;
    try {
      account = credentials?.clientEmail && credentials?.privateKey
        ? { client_email: credentials.clientEmail, private_key: credentials.privateKey.replace(/\\n/g, '\n'), token_uri: TOKEN_URL }
        : getServiceAccount();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid Google service-account configuration.';
      return {
        connected: false,
        authMethod: 'unconfigured',
        propertyUrl,
        isVerified: false,
        sitemapSubmitted: false,
        sitemapSubmissionResult: `NOT SUBMITTED: ${message}`,
        inspectionSummary: {
          totalInspected: 0, indexedCount: 0, notIndexedCount: 0,
          verdict: 'Google credentials invalid',
          coverageIssues: [message],
          note: 'No Google API operation was performed because the server-side credentials could not be parsed.'
        },
        indexingApiStatus: {
          supported: false,
          notice: 'No Indexing API notification was sent.',
          eligiblePages: []
        }
      };
    }
    const coverageIssues: string[] = [];
    const eligiblePages = crawledPages
      .filter(p => p.structuredDataTypes.includes('JobPosting') || p.structuredDataTypes.includes('BroadcastEvent'))
      .map(p => p.url);

    const base: GoogleSearchConsoleStatus = {
      connected: false,
      authMethod: 'unconfigured',
      propertyUrl,
      isVerified: false,
      sitemapSubmitted: false,
      inspectionSummary: {
        totalInspected: 0, indexedCount: 0, notIndexedCount: 0,
        verdict: 'Not checked', coverageIssues,
        note: 'Google indexing status is only reported after a successful URL Inspection API response. Sitemap submission does not guarantee crawling or indexing.'
      },
      indexingApiStatus: {
        supported: false,
        notice: eligiblePages.length
          ? `Found ${eligiblePages.length} pages with potentially eligible structured-data types. This does not prove full Indexing API eligibility; no Indexing API notification was sent.`
          : 'No potentially eligible JobPosting/BroadcastEvent pages detected. Ordinary pages cannot use the Google Indexing API.',
        eligiblePages
      }
    };

    if (!account) {
      return {
        ...base,
        sitemapSubmissionResult: 'NOT SUBMITTED: configure GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL and GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY on the server, then grant the service account access to the verified Search Console property.',
        inspectionSummary: { ...base.inspectionSummary, note: 'Google APIs were not called because server-side credentials are missing. Local crawl diagnostics are not Google indexing results.' }
      };
    }

    try {
      const token = await getAccessToken(account, GSC_SCOPE);
      const sitesResult = await googleRequest('https://www.googleapis.com/webmasters/v3/sites', token);
      if (!sitesResult.response.ok) {
        throw new Error(`Could not verify Search Console access (HTTP ${sitesResult.response.status}): ${sitesResult.data?.error?.message || 'Google API error'}`);
      }
      const availableSites: Array<{ siteUrl?: string; permissionLevel?: string }> = sitesResult.data?.siteEntry || [];
      const propertyAccessible = availableSites.some(site => site.siteUrl === propertyUrl);
      if (!propertyAccessible) {
        return {
          ...base,
          authMethod: 'service_account',
          sitemapSubmissionResult: `NOT SUBMITTED: the authenticated service account cannot access the exact Search Console property ${propertyUrl}. Add its client email as a user of that verified property, then retry.`,
          inspectionSummary: {
            ...base.inspectionSummary,
            verdict: 'Search Console property access not confirmed',
            coverageIssues: [`Property ${propertyUrl} was not present in the accessible Search Console site list.`],
            note: 'No sitemap submission or URL Inspection was attempted because the exact property was not confirmed as accessible.'
          }
        };
      }
      const sitemapApiUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propertyUrl)}/sitemaps/${encodeURIComponent(sitemapTarget)}`;
      const submission = await googleRequest(sitemapApiUrl, token, { method: 'PUT' });
      const sitemapSubmitted = submission.response.ok;
      const sitemapSubmissionResult = sitemapSubmitted
        ? `Google Search Console accepted the sitemap submission (HTTP ${submission.response.status}) for property ${propertyUrl}. This is not an indexing guarantee.`
        : `SITEMAP SUBMISSION FAILED (HTTP ${submission.response.status}): ${submission.data?.error?.message || 'Google API returned an error.'}`;
      if (!sitemapSubmitted) coverageIssues.push(`Sitemap submission failed: ${submission.data?.error?.message || `HTTP ${submission.response.status}`}`);

      let inspectionToken: string | undefined;
      try {
        inspectionToken = await getAccessToken(account, INSPECTION_SCOPE);
      } catch (error) {
        coverageIssues.push(`URL Inspection authentication failed: ${error instanceof Error ? error.message : 'Unknown authentication error'}`);
      }

      let totalInspected = 0;
      let indexedCount = 0;
      let notIndexedCount = 0;
      const pagesToInspect = crawledPages.filter(p => p.status === 200 && /^https?:\/\//i.test(p.url)).slice(0, 200);

      if (inspectionToken) {
        for (const page of pagesToInspect) {
          try {
            const { response, data } = await googleRequest(
              'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
              inspectionToken,
              { method: 'POST', body: JSON.stringify({ inspectionUrl: page.url, siteUrl: propertyUrl }) }
            );
            if (!response.ok) {
              coverageIssues.push(`URL Inspection failed for ${page.url} (HTTP ${response.status}): ${data?.error?.message || 'Google API error'}`);
              continue;
            }
            const result = data?.inspectionResult?.indexStatusResult;
            if (!result) {
              coverageIssues.push(`Google returned no index status result for ${page.url}.`);
              continue;
            }
            totalInspected++;
            if (result.verdict === 'PASS') indexedCount++;
            else notIndexedCount++;
            if (result.verdict !== 'PASS') {
              coverageIssues.push(`${page.url}: Google verdict ${result.verdict || 'unknown'}; ${result.coverageState || result.indexingState || 'No additional coverage detail'}.`);
            }
          } catch (error) {
            coverageIssues.push(`URL Inspection failed for ${page.url}: ${error instanceof Error ? error.message : 'request error'}`);
          }
        }
      }

      const note = inspectionToken
        ? 'Counts come only from successful Google URL Inspection API responses. URLs that could not be inspected are excluded. Sitemap submission does not guarantee indexing.'
        : 'Sitemap submission was attempted, but URL Inspection authentication failed. Local crawl results are not Google indexing status.';
      return {
        connected: true,
        authMethod: 'service_account',
        propertyUrl,
        isVerified: true,
        sitemapSubmitted,
        sitemapSubmissionTime: sitemapSubmitted ? new Date().toISOString() : undefined,
        sitemapSubmissionResult,
        inspectionSummary: {
          totalInspected, indexedCount, notIndexedCount,
          verdict: totalInspected ? `Google URL Inspection checked ${totalInspected} URL(s)` : 'No Google URL Inspection results available',
          coverageIssues, note
        },
        indexingApiStatus: {
          supported: false,
          notice: eligiblePages.length
            ? `Found ${eligiblePages.length} potentially eligible page(s), but no Indexing API notification was sent. Eligibility must be verified against Google's current rules.`
            : 'No potentially eligible JobPosting/BroadcastEvent pages detected. Ordinary pages use sitemap discovery and URL Inspection diagnostics.',
          eligiblePages
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Google API error';
      return {
        ...base,
        sitemapSubmissionResult: `Google Search Console request failed: ${message}`,
        inspectionSummary: {
          ...base.inspectionSummary,
          verdict: 'Google API request failed',
          coverageIssues: [...coverageIssues, message],
          note: 'No Google submission or indexing status is claimed unless the corresponding API response confirms it.'
        }
      };
    }
  }
}
