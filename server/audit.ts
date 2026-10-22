import { CrawledPage, SitemapInfo, RobotsTxtInfo, SeoIssue } from './types.ts';

export class TechnicalSeoAuditor {
  public static runAudit(
    crawledPages: CrawledPage[],
    sitemapInfo: SitemapInfo,
    robotsTxtInfo: RobotsTxtInfo,
    orphanPages: string[],
    targetDomain: string
  ): SeoIssue[] {
    const issues: SeoIssue[] = [];
    let issueSeq = 1;

    const addIssue = (item: Omit<SeoIssue, 'id' | 'fixStatus'> & { fixStatus?: SeoIssue['fixStatus'] }) => {
      issues.push({
        id: `ISSUE-${String(issueSeq++).padStart(3, '0')}`,
        fixStatus: item.fixStatus || (item.proposedFix?.isSafeToAutoApply ? 'available' : 'manual_only'),
        ...item
      });
    };

    // --- 1. ROBOTS.TXT CHECKS ---
    if (!robotsTxtInfo.exists) {
      addIssue({
        category: 'crawlability',
        severity: 'medium',
        title: 'Missing robots.txt File',
        description: 'robots.txt was not found (returned 404). Search crawlers will crawl all accessible routes without restriction.',
        evidence: `HTTP 404 at ${robotsTxtInfo.url}`,
        affectedUrl: robotsTxtInfo.url,
        recommendation: 'Create a standard robots.txt file declaring allowed paths and your XML sitemap location.',
        fixType: 'robots',
        proposedFix: {
          summary: 'Generate and deploy standard robots.txt with sitemap reference',
          targetFileOrElement: '/robots.txt',
          originalCode: '# (File was missing)',
          proposedCode: `User-agent: *\nAllow: /\n\nSitemap: https://${targetDomain}/sitemap.xml\n`,
          explanation: 'Standardizes crawl directives and allows search engines to instantly locate your sitemap.',
          isSafeToAutoApply: true
        }
      });
    } else {
      if (robotsTxtInfo.sitemaps.length === 0) {
        addIssue({
          category: 'crawlability',
          severity: 'medium',
          title: 'Missing Sitemap Directive in robots.txt',
          description: 'Your robots.txt exists but does not declare the Sitemap URL directive.',
          evidence: `robots.txt at ${robotsTxtInfo.url} lacks "Sitemap: ..." entry`,
          affectedUrl: robotsTxtInfo.url,
          recommendation: 'Add the canonical Sitemap URL to the bottom of robots.txt.',
          fixType: 'robots',
          proposedFix: {
            summary: 'Append Sitemap directive to robots.txt',
            targetFileOrElement: '/robots.txt',
            originalCode: robotsTxtInfo.content,
            proposedCode: `${robotsTxtInfo.content.trim()}\n\nSitemap: https://${targetDomain}/sitemap.xml\n`,
            explanation: 'Ensures Googlebot and Bingbot discover your sitemap index automatically.',
            isSafeToAutoApply: true
          }
        });
      }

      for (const err of robotsTxtInfo.errors) {
        addIssue({
          category: 'crawlability',
          severity: 'high',
          title: 'robots.txt Syntax Error',
          description: err,
          evidence: err,
          affectedUrl: robotsTxtInfo.url,
          recommendation: 'Fix line syntax in robots.txt.',
          fixType: 'robots'
        });
      }
    }

    // --- 2. SITEMAP CHECKS ---
    if (!sitemapInfo.exists) {
      addIssue({
        category: 'crawlability',
        severity: 'high',
        title: 'XML Sitemap Missing or Inaccessible',
        description: 'The search crawler could not locate an XML sitemap at the specified URL.',
        evidence: `404 or unparseable sitemap at ${sitemapInfo.url}`,
        affectedUrl: sitemapInfo.url,
        recommendation: 'Generate and serve a standard UTF-8 XML sitemap adhering to sitemaps.org schema.',
        fixType: 'sitemap',
        proposedFix: {
          summary: 'Generate clean XML sitemap with all 200 OK canonical pages',
          targetFileOrElement: '/sitemap.xml',
          proposedCode: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${crawledPages.filter(p => p.status === 200 && !p.isNoindex).map(p => `  <url>\n    <loc>${p.canonicalUrl || p.url}</loc>\n    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n  </url>`).join('\n')}\n</urlset>`,
          explanation: 'Creates a fully validated XML sitemap containing only live, indexable canonical URLs.',
          isSafeToAutoApply: true
        }
      });
    } else {
      for (const sErr of sitemapInfo.errors) {
        addIssue({
          category: 'crawlability',
          severity: 'high',
          title: 'Sitemap Integrity Issue',
          description: sErr,
          evidence: sErr,
          affectedUrl: sitemapInfo.url,
          recommendation: 'Remove non-production or malformed URLs from your XML sitemap.',
          fixType: 'sitemap',
          proposedFix: {
            summary: 'Regenerate sanitized XML sitemap without staging or broken URLs',
            targetFileOrElement: '/sitemap.xml',
            proposedCode: `<!-- Sanitized sitemap omitting non-production or 404 entries -->`,
            explanation: 'Purges leaked staging URLs and internal references from public index signals.',
            isSafeToAutoApply: true
          }
        });
      }
    }

    // --- 3. ORPHAN PAGES DETECTION ---
    for (const orphan of orphanPages) {
      addIssue({
        category: 'crawlability',
        severity: 'medium',
        title: 'Orphan Page Candidate Detected',
        description: 'This URL is declared in the sitemap or seed list, but received zero incoming internal links during crawl traversal.',
        evidence: `URL: ${orphan} (0 incoming links from crawled pages)`,
        affectedUrl: orphan,
        recommendation: 'Link to this page from relevant parent or navigation categories so search engine crawlers and users can discover it naturally.',
        fixType: 'manual'
      });
    }

    // Title index map for duplicate detection
    const titleMap = new Map<string, string[]>();

    // --- 4. PER-PAGE CHECKS ---
    for (const page of crawledPages) {
      // HTTP Status Code Checks
      if (page.status >= 400 && page.status < 500) {
        addIssue({
          category: 'crawlability',
          severity: 'critical',
          title: `Broken Link / Dead Page (HTTP ${page.status})`,
          description: `Page returned client error ${page.status} ${page.statusText}. Broken internal links degrade user experience and waste crawl budget.`,
          evidence: `HTTP ${page.status} on ${page.url}`,
          affectedUrl: page.url,
          recommendation: 'Remove dead internal links or configure a 301 permanent redirect to the nearest equivalent page.',
          fixType: 'manual'
        });
        continue;
      }

      if (page.status >= 500) {
        addIssue({
          category: 'crawlability',
          severity: 'critical',
          title: `Server Error Encountered (HTTP ${page.status})`,
          description: `Page returned server error ${page.status}. Search engine crawlers back off and de-index pages that repeatedly fail with 5xx status codes.`,
          evidence: `HTTP ${page.status} on ${page.url}`,
          affectedUrl: page.url,
          recommendation: 'Investigate application logs and resolve unhandled backend exceptions.',
          fixType: 'manual'
        });
        continue;
      }

      if (page.redirectChain.length > 2) {
        addIssue({
          category: 'crawlability',
          severity: 'medium',
          title: 'Redirect Chain Detected',
          description: `This URL underwent multiple redirect hops (${page.redirectChain.length - 1} hops) before reaching its destination. Chains dilute link equity and increase latency.`,
          evidence: `Hops: ${page.redirectChain.join(' -> ')}`,
          affectedUrl: page.url,
          recommendation: 'Update internal links to target the final destination directly, and update redirect rules to jump directly to the target URL.',
          fixType: 'manual'
        });
      }

      // Title Tag
      if (!page.title) {
        const fallbackTitle = `${targetDomain} - Page`;
        addIssue({
          category: 'onpage',
          severity: 'high',
          title: 'Missing <title> Tag',
          description: 'The page has no <title> tag. The title tag is one of the strongest primary relevance signals in search algorithms.',
          evidence: '<title> element is absent in <head>',
          affectedUrl: page.url,
          recommendation: 'Add a descriptive, unique title tag between 30 and 60 characters.',
          fixType: 'html_meta',
          proposedFix: {
            summary: 'Inject descriptive <title> tag into <head>',
            targetFileOrElement: '<head>',
            originalCode: '<head>',
            proposedCode: `<head>\n  <title>${fallbackTitle}</title>`,
            explanation: 'Ensures the page title is explicitly indexed in SERP snippets.',
            isSafeToAutoApply: true
          }
        });
      } else {
        // Track duplicate titles
        const cleanTitle = page.title.trim().toLowerCase();
        if (!titleMap.has(cleanTitle)) {
          titleMap.set(cleanTitle, []);
        }
        titleMap.get(cleanTitle)!.push(page.url);

        if (page.title.length < 20) {
          addIssue({
            category: 'onpage',
            severity: 'low',
            title: 'Title Tag Too Short',
            description: `Title tag is only ${page.title.length} characters ("${page.title}"). Search engines may rewrite short or vague titles.`,
            evidence: `Current title: "${page.title}" (${page.title.length} chars)`,
            affectedUrl: page.url,
            recommendation: 'Expand title with primary keywords and brand name to 30-60 characters.',
            fixType: 'html_meta'
          });
        } else if (page.title.length > 65) {
          addIssue({
            category: 'onpage',
            severity: 'low',
            title: 'Title Tag Truncation Risk (>60 chars)',
            description: `Title tag is ${page.title.length} characters and is likely to be truncated on Google desktop and mobile SERPs (approx. 600px limit).`,
            evidence: `Current title: "${page.title}" (${page.title.length} chars)`,
            affectedUrl: page.url,
            recommendation: 'Keep primary keyword near the beginning and trim length to under 60 characters.',
            fixType: 'html_meta'
          });
        }
      }

      // Meta Description
      if (!page.metaDescription) {
        addIssue({
          category: 'onpage',
          severity: 'medium',
          title: 'Missing Meta Description',
          description: 'No <meta name="description"> tag was found. While not a direct ranking factor, meta descriptions directly drive search snippet click-through rates (CTR).',
          evidence: '<meta name="description"> is absent in <head>',
          affectedUrl: page.url,
          recommendation: 'Add an engaging 120-155 character meta description outlining the unique value of the page.',
          fixType: 'html_meta',
          proposedFix: {
            summary: 'Inject default structured meta description into <head>',
            targetFileOrElement: '<head>',
            originalCode: '<head>',
            proposedCode: `<head>\n  <meta name="description" content="Discover key features, guides, and enterprise solutions on ${targetDomain}." />`,
            explanation: 'Populates CTR-driving snippet text for Google search results.',
            isSafeToAutoApply: true
          }
        });
      }

      // Canonical Tag
      if (!page.canonicalUrl) {
        addIssue({
          category: 'indexing',
          severity: 'high',
          title: 'Missing Canonical Tag',
          description: 'The page does not specify a rel="canonical" link. Without an explicit canonical, Googlebot must guess which URL version to index, risking duplicate content.',
          evidence: '<link rel="canonical"> is absent in <head>',
          affectedUrl: page.url,
          recommendation: 'Add a self-referential canonical tag pointing to the absolute HTTPS URL.',
          fixType: 'html_canonical',
          proposedFix: {
            summary: 'Inject self-referencing canonical tag into <head>',
            targetFileOrElement: '<head>',
            originalCode: '<head>',
            proposedCode: `<head>\n  <link rel="canonical" href="${page.url}" />`,
            explanation: 'Definitively designates this URL as the authoritative master version for indexing.',
            isSafeToAutoApply: true
          }
        });
      } else if (page.canonicalUrl.startsWith('http://') && page.url.startsWith('https://')) {
        addIssue({
          category: 'indexing',
          severity: 'high',
          title: 'Insecure Canonical Conflict',
          description: 'The page is served over secure HTTPS but its canonical tag points to an insecure HTTP URL.',
          evidence: `Page: ${page.url} vs Canonical: ${page.canonicalUrl}`,
          affectedUrl: page.url,
          recommendation: 'Update canonical tag to point to HTTPS.',
          fixType: 'html_canonical',
          proposedFix: {
            summary: 'Update canonical tag to HTTPS',
            targetFileOrElement: '<link rel="canonical">',
            originalCode: `<link rel="canonical" href="${page.canonicalUrl}" />`,
            proposedCode: `<link rel="canonical" href="${page.canonicalUrl.replace('http://', 'https://')}" />`,
            explanation: 'Eliminates conflicting protocol signals between page URL and canonical declaration.',
            isSafeToAutoApply: true
          }
        });
      }

      // Heading Structure & H1
      if (page.h1s.length === 0) {
        addIssue({
          category: 'onpage',
          severity: 'high',
          title: 'Missing Primary <h1> Heading',
          description: 'Page has no <h1> heading. An H1 gives search engines and screen readers immediate semantic context on the main topic.',
          evidence: '0 <h1> tags found in document body',
          affectedUrl: page.url,
          recommendation: 'Add a single, clear <h1> heading at the top of the main content.',
          fixType: 'onpage'
        });
      } else if (page.h1s.length > 1) {
        addIssue({
          category: 'onpage',
          severity: 'low',
          title: 'Multiple <h1> Tags Detected',
          description: `Page defines ${page.h1s.length} separate <h1> tags. While HTML5 allows multiple H1s inside section elements, best practice recommends a single primary H1 per page.`,
          evidence: `Found H1s: ${page.h1s.map(h => `"${h}"`).join(', ')}`,
          affectedUrl: page.url,
          recommendation: 'Consolidate headings so that only the main title uses <h1>, and subtopics use <h2> or <h3>.',
          fixType: 'onpage'
        });
      }

      // Images Alt & Dimensions (CLS Performance)
      if (page.imagesMissingAlt > 0) {
        addIssue({
          category: 'onpage',
          severity: 'medium',
          title: `Images Missing 'alt' Attributes (${page.imagesMissingAlt} items)`,
          description: `${page.imagesMissingAlt} image(s) lack an alt attribute, violating accessibility (WCAG 2.1) and preventing Google Image Search indexing.`,
          evidence: `${page.imagesMissingAlt} of ${page.imagesTotal} images have no alt attribute`,
          affectedUrl: page.url,
          recommendation: 'Add descriptive alt text to informative images or alt="" to decorative images.',
          fixType: 'html_image',
          proposedFix: {
            summary: 'Add fallback alt attributes to images',
            targetFileOrElement: '<img> tags',
            proposedCode: 'alt="Illustration of page content"',
            explanation: 'Restores compliance with accessibility standards and image search discovery.',
            isSafeToAutoApply: true
          }
        });
      }

      if (page.imagesMissingDimensions > 0) {
        addIssue({
          category: 'performance',
          severity: 'medium',
          title: `Images Missing Width/Height Attributes (${page.imagesMissingDimensions} items - CLS Risk)`,
          description: `${page.imagesMissingDimensions} image(s) lack explicit width and height dimensions. Browsers cannot allocate layout space before images load, causing Cumulative Layout Shift (CLS).`,
          evidence: `${page.imagesMissingDimensions} images missing width or height attributes`,
          affectedUrl: page.url,
          recommendation: 'Specify width and height attributes (or aspect-ratio in CSS) and add loading="lazy" for offscreen images.',
          fixType: 'html_image',
          proposedFix: {
            summary: 'Inject width, height, and loading="lazy" into image tags',
            targetFileOrElement: '<img> tags',
            proposedCode: 'width="800" height="450" loading="lazy"',
            explanation: 'Allows browsers to reserve layout geometry, directly mitigating Cumulative Layout Shift (CLS).',
            isSafeToAutoApply: true
          }
        });
      }

      // Viewport & Mobile Accessibility
      if (!page.hasViewport) {
        addIssue({
          category: 'crawlability',
          severity: 'critical',
          title: 'Missing Mobile Viewport Meta Tag',
          description: 'No <meta name="viewport"> tag detected. Since Google uses mobile-first indexing for 100% of sites, pages without a viewport fail mobile-friendliness.',
          evidence: '<meta name="viewport"> not found in <head>',
          affectedUrl: page.url,
          recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1.0"> to <head>.',
          fixType: 'html_meta',
          proposedFix: {
            summary: 'Inject mobile viewport meta tag',
            targetFileOrElement: '<head>',
            originalCode: '<head>',
            proposedCode: '<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
            explanation: 'Enables responsive mobile rendering required for Google Mobile-First Indexing.',
            isSafeToAutoApply: true
          }
        });
      }

      // HTML lang attribute
      if (!page.htmlLang) {
        addIssue({
          category: 'onpage',
          severity: 'medium',
          title: 'Missing HTML Language Attribute',
          description: 'The root <html> element is missing a "lang" attribute (e.g. lang="en"). This impairs screen readers and international geotargeting.',
          evidence: '<html> tag lacks lang="..." attribute',
          affectedUrl: page.url,
          recommendation: 'Add lang="en" (or appropriate language code) to the <html> tag.',
          fixType: 'html_meta',
          proposedFix: {
            summary: 'Add lang="en" to <html> tag',
            targetFileOrElement: '<html>',
            originalCode: '<html>',
            proposedCode: '<html lang="en">',
            explanation: 'Specifies document language for assistive technologies and search bots.',
            isSafeToAutoApply: true
          }
        });
      }

      // Structured Data
      if (page.schemaErrors.length > 0) {
        for (const sErr of page.schemaErrors) {
          addIssue({
            category: 'structured_data',
            severity: 'high',
            title: 'Structured Data Syntax Error',
            description: sErr,
            evidence: sErr,
            affectedUrl: page.url,
            recommendation: 'Repair JSON-LD script syntax and ensure all brackets and quotes are valid.',
            fixType: 'jsonld',
            proposedFix: {
              summary: 'Repair JSON-LD syntax with valid Schema.org structure',
              targetFileOrElement: '<script type="application/ld+json">',
              proposedCode: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "WebPage",
                "name": page.title || "Web Page",
                "url": page.url
              }, null, 2),
              explanation: 'Replaces invalid JSON-LD with valid, parseable Schema.org markup.',
              isSafeToAutoApply: true
            }
          });
        }
      }

      // Security: HTTPS & Mixed Content
      if (!page.security.isHttps) {
        addIssue({
          category: 'security',
          severity: 'high',
          title: 'Unencrypted HTTP Connection',
          description: 'The page is served over insecure HTTP. HTTPS is a confirmed Google ranking signal and fundamental browser security standard.',
          evidence: `URL protocol is ${page.url.substring(0, 5)}`,
          affectedUrl: page.url,
          recommendation: 'Enforce SSL/TLS certificates and configure 301 redirects from HTTP to HTTPS.',
          fixType: 'headers'
        });
      }

      if (page.security.mixedContentFound) {
        addIssue({
          category: 'security',
          severity: 'critical',
          title: 'Mixed Content Detected',
          description: 'Insecure HTTP resources (images, scripts, or styles) were found on this HTTPS page. Modern browsers block active mixed content.',
          evidence: 'HTTP asset references found in page source',
          affectedUrl: page.url,
          recommendation: 'Update all asset URLs to use HTTPS or protocol-relative paths.',
          fixType: 'manual'
        });
      }

      if (!page.security.hasHsts && page.security.isHttps) {
        addIssue({
          category: 'security',
          severity: 'low',
          title: 'Missing HSTS (HTTP Strict Transport Security) Header',
          description: 'Strict-Transport-Security header is not configured. HSTS instructs browsers to only connect via HTTPS, preventing SSL stripping attacks.',
          evidence: 'Strict-Transport-Security header missing from HTTP response',
          affectedUrl: page.url,
          recommendation: 'Add "Strict-Transport-Security: max-age=31536000; includeSubDomains; preload" to web server headers.',
          fixType: 'headers',
          proposedFix: {
            summary: 'Generate server configuration rule for HSTS header',
            targetFileOrElement: 'Web Server / CDN Headers',
            proposedCode: 'Strict-Transport-Security: max-age=31536000; includeSubDomains; preload',
            explanation: 'Enforces HTTPS communication at the transport layer.',
            isSafeToAutoApply: true
          }
        });
      }

      // Crawl Budget & Performance Heuristics
      if (page.responseTimeMs > 1200) {
        addIssue({
          category: 'performance',
          severity: 'high',
          title: `Slow Server Response Time (TTFB: ${page.responseTimeMs}ms)`,
          description: `Time to First Byte took ${page.responseTimeMs}ms. Google recommends a TTFB under 800ms. Slow servers reduce crawl rate and increase user bounce rate.`,
          evidence: `TTFB response time: ${page.responseTimeMs}ms`,
          affectedUrl: page.url,
          recommendation: 'Enable edge caching, optimize database queries, or use a CDN to decrease TTFB.',
          fixType: 'manual'
        });
      }

      // Thin content candidate heuristic
      if (page.isThinContentCandidate) {
        addIssue({
          category: 'onpage',
          severity: 'low',
          title: 'Thin Content Candidate (Heuristic Finding)',
          description: `Page body contains only ${page.wordCount} words. Note: This is an automated heuristic finding and not a confirmed Google manual penalty. Pages with low substantive content may struggle to rank for competitive queries.`,
          evidence: `Word count: ${page.wordCount} words`,
          affectedUrl: page.url,
          recommendation: 'Expand page copy with in-depth, unique content that addresses user search intent.',
          fixType: 'manual'
        });
      }
    }

    // --- 5. DUPLICATE TITLE TAGS ACROSS SITE ---
    titleMap.forEach((urls, title) => {
      if (urls.length > 1) {
        addIssue({
          category: 'onpage',
          severity: 'high',
          title: `Duplicate Title Tag Across ${urls.length} Pages`,
          description: `Multiple pages share the exact same <title> tag ("${title}"). Unique title tags are critical so search engines can distinguish page topics.`,
          evidence: `Shared by: ${urls.slice(0, 3).join(', ')}${urls.length > 3 ? ` and ${urls.length - 3} more` : ''}`,
          affectedUrl: urls[0],
          recommendation: 'Customize the title tag for each URL to reflect its specific contents.',
          fixType: 'manual'
        });
      }
    });

    return issues;
  }
}
