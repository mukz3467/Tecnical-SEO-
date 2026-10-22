import * as cheerio from 'cheerio';
import { safeFetch, validateTargetUrl } from './security.ts';
import { CrawledPage, SitemapInfo, RobotsTxtInfo, SeoIssue } from './types.ts';

export interface CrawlOptions {
  targetDomain: string;
  seedUrl: string;
  sitemapUrl?: string;
  customUrls?: string[];
  maxPages?: number;
  delayMs?: number;
}

export class TechnicalSeoCrawler {
  private visitedUrls = new Set<string>();
  private queue: Array<{ url: string; depth: number }> = [];
  private crawledPages: CrawledPage[] = [];
  private sitemapDiscoveredUrls = new Set<string>();
  private internalLinksFound = new Map<string, Set<string>>(); // targetUrl -> Set of sourceUrls
  private issues: SeoIssue[] = [];

  constructor(private options: CrawlOptions) {}

  public async runCrawl(onProgress?: (progress: number, stage: string, message: string) => void): Promise<{
    crawledPages: CrawledPage[];
    sitemapInfo: SitemapInfo;
    robotsTxtInfo: RobotsTxtInfo;
    orphanPages: string[];
  }> {
    const maxPages = this.options.maxPages || 25;

    onProgress?.(5, 'crawling', 'Inspecting robots.txt and sitemap directives...');
    
    // 1. Fetch & Parse robots.txt
    const robotsTxtInfo = await this.withTimeout(
      this.auditRobotsTxt(),
      12000,
      {
        url: `${this.options.seedUrl.replace(/\/$/, '')}/robots.txt`,
        exists: false,
        content: '',
        rules: [],
        sitemaps: [],
        errors: ['robots.txt audit exceeded the 12-second stage limit; continuing crawl safely.'],
        warnings: []
      } satisfies RobotsTxtInfo
    );
    
    // 2. Discover & Parse Sitemap
    onProgress?.(15, 'crawling', 'Validating XML sitemaps and nested indexes...');
    const sitemapTarget = this.options.sitemapUrl || (robotsTxtInfo.sitemaps.length > 0 ? robotsTxtInfo.sitemaps[0] : `${this.options.seedUrl.replace(/\/$/, '')}/sitemap.xml`);
    const sitemapInfo = await this.withTimeout(
      this.auditSitemap(sitemapTarget),
      15000,
      {
        url: sitemapTarget,
        exists: false,
        type: 'error',
        urlCount: 0,
        errors: ['Sitemap audit exceeded the 15-second stage limit; continuing with discovered links.'],
        warnings: [],
        discoveredUrls: []
      } satisfies SitemapInfo
    );

    // Populate queue with seed URL
    this.enqueue(this.options.seedUrl, 0);

    // Enqueue sitemap URLs
    for (const sUrl of sitemapInfo.discoveredUrls) {
      this.sitemapDiscoveredUrls.add(this.normalizeUrl(sUrl));
      this.enqueue(sUrl, 1);
    }

    // Enqueue custom URLs if any
    if (this.options.customUrls) {
      for (const cUrl of this.options.customUrls) {
        this.enqueue(cUrl, 1);
      }
    }

    onProgress?.(25, 'crawling', `Starting crawl queue (${this.queue.length} seed targets)...`);

    let processedCount = 0;

    while (this.queue.length > 0 && this.visitedUrls.size < maxPages) {
      const item = this.queue.shift();
      if (!item) break;

      const normalized = this.normalizeUrl(item.url);
      if (this.visitedUrls.has(normalized)) continue;
      this.visitedUrls.add(normalized);

      processedCount++;
      const pct = Math.min(65, 25 + Math.round((processedCount / maxPages) * 40));
      onProgress?.(pct, 'crawling', `Crawling [${processedCount}/${maxPages}]: ${item.url}`);

      // Crawl individual page
      const page = await this.crawlSinglePage(item.url, item.depth);
      this.crawledPages.push(page);

      // Delay to respect server policies
      if (this.options.delayMs && this.options.delayMs > 0) {
        await new Promise(r => setTimeout(r, this.options.delayMs));
      }
    }

    // Identify orphan pages: Pages present in sitemap that received 0 internal incoming links
    const orphanPages: string[] = [];
    for (const sUrl of this.sitemapDiscoveredUrls) {
      const norm = this.normalizeUrl(sUrl);
      const incoming = this.internalLinksFound.get(norm);
      if ((!incoming || incoming.size === 0) && norm !== this.normalizeUrl(this.options.seedUrl)) {
        orphanPages.push(sUrl);
      }
    }

    onProgress?.(70, 'crawling', `Crawl complete. Analyzed ${this.crawledPages.length} pages.`);

    return {
      crawledPages: this.crawledPages,
      sitemapInfo,
      robotsTxtInfo,
      orphanPages
    };
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>(resolve => {
          timer = setTimeout(() => resolve(fallback), timeoutMs);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private enqueue(url: string, depth: number) {
    const normalized = this.normalizeUrl(url);
    if (!this.visitedUrls.has(normalized) && !this.queue.some(q => this.normalizeUrl(q.url) === normalized)) {
      // Check for infinite crawl loops / crawl traps
      if (this.isCrawlTrap(url)) return;
      this.queue.push({ url, depth });
    }
  }

  private isCrawlTrap(url: string): boolean {
    try {
      const u = new URL(url);
      const segments = u.pathname.split('/').filter(Boolean);
      // Repeated consecutive path segments: e.g., /category/category/category
      const seen = new Map<string, number>();
      for (const seg of segments) {
        const count = (seen.get(seg) || 0) + 1;
        if (count >= 3) return true;
        seen.set(seg, count);
      }
      // Excessive query parameters
      const paramsCount = Array.from(u.searchParams.keys()).length;
      if (paramsCount > 5) return true;
    } catch {
      return true;
    }
    return false;
  }

  private normalizeUrl(url: string): string {
    try {
      const u = new URL(url);
      let p = u.pathname;
      if (p.endsWith('/') && p.length > 1) {
        p = p.slice(0, -1);
      }
      return `${u.protocol}//${u.host}${p}${u.search}`;
    } catch {
      return url;
    }
  }

  private async auditRobotsTxt(): Promise<RobotsTxtInfo> {
    const robotsUrl = `${this.options.seedUrl.replace(/\/$/, '')}/robots.txt`;
    try {
      let content = '';
      const res = await safeFetch(robotsUrl, { timeoutMs: 6000 });
      if (res.status === 200) content = res.bodyText;

      if (!content) {
        return {
          url: robotsUrl,
          exists: false,
          content: '',
          rules: [],
          sitemaps: [],
          errors: ['robots.txt returned 404 or empty response. Search crawlers will assume full site access.'],
          warnings: ['Missing explicit robots.txt may allow indexing of accidental private or staging routes.']
        };
      }

      const lines = content.split('\n');
      const rules: Array<{ userAgent: string; disallow: string[]; allow: string[] }> = [];
      const sitemaps: string[] = [];
      const errors: string[] = [];
      const warnings: string[] = [];

      let currentAgent = '*';
      let currentDisallow: string[] = [];
      let currentAllow: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const colonIdx = trimmed.indexOf(':');
        if (colonIdx === -1) {
          errors.push(`Invalid robots.txt syntax: "${trimmed}"`);
          continue;
        }

        const directive = trimmed.substring(0, colonIdx).trim().toLowerCase();
        const value = trimmed.substring(colonIdx + 1).trim();

        if (directive === 'user-agent') {
          if (currentDisallow.length > 0 || currentAllow.length > 0) {
            rules.push({ userAgent: currentAgent, disallow: currentDisallow, allow: currentAllow });
          }
          currentAgent = value;
          currentDisallow = [];
          currentAllow = [];
        } else if (directive === 'disallow') {
          if (value) currentDisallow.push(value);
        } else if (directive === 'allow') {
          if (value) currentAllow.push(value);
        } else if (directive === 'sitemap') {
          sitemaps.push(value);
        }
      }

      if (currentDisallow.length > 0 || currentAllow.length > 0) {
        rules.push({ userAgent: currentAgent, disallow: currentDisallow, allow: currentAllow });
      }

      if (sitemaps.length === 0) {
        warnings.push('No Sitemap directive declared in robots.txt. Search engines should be explicitly pointed to sitemap location.');
      }

      return {
        url: robotsUrl,
        exists: true,
        content,
        rules,
        sitemaps,
        errors,
        warnings
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        url: robotsUrl,
        exists: false,
        content: '',
        rules: [],
        sitemaps: [],
        errors: [`Could not fetch robots.txt: ${errorMsg}`],
        warnings: []
      };
    }
  }

  private async auditSitemap(sitemapUrl: string): Promise<SitemapInfo> {
    try {
      let xmlText = '';
      const res = await safeFetch(sitemapUrl, { timeoutMs: 8000 });
      if (res.status === 200) xmlText = res.bodyText;

      if (!xmlText) {
        return {
          url: sitemapUrl,
          exists: false,
          type: 'not_found',
          urlCount: 0,
          errors: ['XML Sitemap not found at ' + sitemapUrl],
          warnings: ['Google relies on XML sitemaps for canonical URL discovery and fresh crawl prioritization.'],
          discoveredUrls: []
        };
      }

      const errors: string[] = [];
      const warnings: string[] = [];
      const discoveredUrls: string[] = [];

      const $ = cheerio.load(xmlText, { xmlMode: true });

      const isSitemapIndex = $('sitemapindex').length > 0;
      const isUrlSet = $('urlset').length > 0;

      if (!isSitemapIndex && !isUrlSet) {
        errors.push('Malformed XML sitemap: Missing standard <urlset> or <sitemapindex> root element.');
      }

      // Check staging / non-production URLs inside sitemap
      $('loc').each((_, el) => {
        const loc = $(el).text().trim();
        if (loc) {
          discoveredUrls.push(loc);
          if (loc.includes('staging.') || loc.includes('dev.') || loc.includes('localhost') || loc.includes('.internal')) {
            errors.push(`Staging or internal development URL leaked in public sitemap: ${loc}`);
          }
          if (loc.startsWith('http://')) {
            warnings.push(`Insecure HTTP URL in sitemap: ${loc}. Production sitemaps should list HTTPS canonicals.`);
          }
        }
      });

      return {
        url: sitemapUrl,
        exists: true,
        type: isSitemapIndex ? 'sitemapindex' : 'urlset',
        urlCount: discoveredUrls.length,
        errors,
        warnings,
        discoveredUrls
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        url: sitemapUrl,
        exists: false,
        type: 'error',
        urlCount: 0,
        errors: [`Error parsing sitemap: ${errorMsg}`],
        warnings: [],
        discoveredUrls: []
      };
    }
  }

  private async crawlSinglePage(pageUrl: string, depth: number): Promise<CrawledPage> {
    const startTime = Date.now();
    let status = 200;
    let statusText = 'OK';
    let headers: Record<string, string> = {};
    let html = '';
    let redirectChain: string[] = [pageUrl];

    try {
      const res = await safeFetch(pageUrl, { timeoutMs: 10000 });
      status = res.status;
      statusText = res.statusText;
      headers = res.headers;
      html = res.bodyText;
      redirectChain = res.redirectChain;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      status = 500;
      statusText = `Fetch Error: ${errorMsg}`;
    }

    const responseTimeMs = Date.now() - startTime;
    const contentType = headers['content-type'] || 'text/html';
    const contentLength = html.length;

    // Check for noindex & nofollow in X-Robots-Tag
    const xRobots = headers['x-robots-tag'] || '';
    const isNoindexHeader = xRobots.toLowerCase().includes('noindex');
    const isNofollowHeader = xRobots.toLowerCase().includes('nofollow');

    // Security headers
    const isHttps = pageUrl.startsWith('https://');
    const hasHsts = !!headers['strict-transport-security'];
    const hasCsp = !!headers['content-security-policy'];
    const hasXContentTypeOptions = !!headers['x-content-type-options'];

    if (status !== 200 || !contentType.includes('text/html')) {
      return {
        url: pageUrl,
        status,
        statusText,
        responseTimeMs,
        contentType,
        contentLength,
        redirectChain,
        h1s: [],
        h2Count: 0,
        h3Count: 0,
        imagesTotal: 0,
        imagesMissingAlt: 0,
        imagesMissingDimensions: 0,
        internalLinksCount: 0,
        externalLinksCount: 0,
        hasViewport: false,
        isNoindex: isNoindexHeader,
        isNofollow: isNofollowHeader,
        xRobotsTag: xRobots || undefined,
        wordCount: 0,
        isThinContentCandidate: false,
        hasStructuredData: false,
        structuredDataTypes: [],
        schemaErrors: [],
        mobileFriendlySignals: {
          hasViewport: false,
          isResponsive: false,
          missingTextCompression: !headers['content-encoding']
        },
        security: {
          isHttps,
          mixedContentFound: false,
          hasHsts,
          hasCsp,
          hasXContentTypeOptions
        }
      };
    }

    // Parse HTML with cheerio
    const $ = cheerio.load(html);

    // Title tag
    const title = $('title').first().text().trim() || undefined;

    // Meta description
    const metaDesc = $('meta[name="description"]').attr('content')?.trim() || 
                     $('meta[property="og:description"]').attr('content')?.trim();

    // Canonical tag
    const canonicalHref = $('link[rel="canonical"]').attr('href')?.trim();

    // Headings
    const h1s: string[] = [];
    $('h1').each((_, el) => {
      const text = $(el).text().trim();
      if (text) h1s.push(text);
    });
    const h2Count = $('h2').length;
    const h3Count = $('h3').length;

    // Images
    let imagesTotal = 0;
    let imagesMissingAlt = 0;
    let imagesMissingDimensions = 0;
    $('img').each((_, el) => {
      imagesTotal++;
      const alt = $(el).attr('alt');
      if (alt === undefined || alt === null) {
        imagesMissingAlt++;
      }
      const w = $(el).attr('width');
      const h = $(el).attr('height');
      if (!w || !h) {
        imagesMissingDimensions++;
      }
    });

    // Viewport & lang
    const viewportTag = $('meta[name="viewport"]').attr('content');
    const hasViewport = !!viewportTag && viewportTag.includes('width=');
    const htmlLang = $('html').attr('lang')?.trim();

    // Robots meta tag
    const robotsMeta = $('meta[name="robots"]').attr('content')?.toLowerCase() || '';
    const isNoindex = isNoindexHeader || robotsMeta.includes('noindex');
    const isNofollow = isNofollowHeader || robotsMeta.includes('nofollow');

    // Structured Data (JSON-LD, Microdata)
    const structuredDataTypes: string[] = [];
    const schemaErrors: string[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      const jsonRaw = $(el).html() || '';
      try {
        const parsed = JSON.parse(jsonRaw);
        const type = parsed['@type'];
        if (type) {
          if (Array.isArray(type)) structuredDataTypes.push(...type);
          else structuredDataTypes.push(type);
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        schemaErrors.push(`JSON-LD syntax error: ${errorMsg}`);
      }
    });

    // Word count & thin content heuristic
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const words = bodyText.split(' ').filter(w => w.length > 0);
    const wordCount = words.length;
    const isThinContentCandidate = wordCount < 120 && status === 200;

    // Mixed content detection
    let mixedContentFound = false;
    if (isHttps) {
      $('img, script, link, iframe').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('href');
        if (src && src.startsWith('http://')) {
          mixedContentFound = true;
        }
      });
    }

    // Links extraction & queueing
    let internalLinksCount = 0;
    let externalLinksCount = 0;

    $('a').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      const trimmedHref = href.trim();
      if (trimmedHref.startsWith('#') || trimmedHref.startsWith('mailto:') || trimmedHref.startsWith('tel:')) {
        return;
      }

      if (trimmedHref.startsWith('javascript:')) {
        return; // JS link limitation
      }

      try {
        const resolved = new URL(trimmedHref, pageUrl).toString();
        const resolvedHost = new URL(resolved).hostname;
        const currentHost = new URL(pageUrl).hostname;

        if (resolvedHost === currentHost) {
          internalLinksCount++;
          const targetNorm = this.normalizeUrl(resolved);
          if (!this.internalLinksFound.has(targetNorm)) {
            this.internalLinksFound.set(targetNorm, new Set());
          }
          this.internalLinksFound.get(targetNorm)!.add(this.normalizeUrl(pageUrl));

          // Queue link if within crawl depth
          if (depth < 3) {
            this.enqueue(resolved, depth + 1);
          }
        } else {
          externalLinksCount++;
        }
      } catch {
        // invalid URL
      }
    });

    return {
      url: pageUrl,
      status,
      statusText,
      responseTimeMs,
      contentType,
      contentLength,
      redirectChain,
      canonicalUrl: canonicalHref,
      title,
      metaDescription: metaDesc,
      h1s,
      h2Count,
      h3Count,
      imagesTotal,
      imagesMissingAlt,
      imagesMissingDimensions,
      internalLinksCount,
      externalLinksCount,
      hasViewport,
      htmlLang,
      isNoindex,
      isNofollow,
      xRobotsTag: xRobots || undefined,
      wordCount,
      isThinContentCandidate,
      hasStructuredData: structuredDataTypes.length > 0,
      structuredDataTypes,
      schemaErrors,
      mobileFriendlySignals: {
        hasViewport,
        isResponsive: hasViewport,
        missingTextCompression: !headers['content-encoding']
      },
      security: {
        isHttps,
        mixedContentFound,
        hasHsts,
        hasCsp,
        hasXContentTypeOptions
      }
    };
  }
}
