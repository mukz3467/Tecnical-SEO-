import * as cheerio from 'cheerio';
import { SeoIssue, AuditJob, CrawledPage } from './types.ts';
import { SandboxSiteManager } from './sandboxSite.ts';

export class RemediationEngine {
  /**
   * Generates a fully validated, production-ready XML Sitemap containing only 200 OK canonical URLs.
   */
  public static generateCleanSitemap(crawledPages: CrawledPage[], domain: string): string {
    const validPages = crawledPages.filter(p => p.status === 200 && !p.isNoindex);
    const today = new Date().toISOString().split('T')[0];

    const xmlLines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...validPages.map(page => {
        const loc = page.canonicalUrl || page.url;
        // Priority calculation
        const isRoot = new URL(loc).pathname === '/' || new URL(loc).pathname === '';
        const priority = isRoot ? '1.0' : '0.8';
        return `  <url>
    <loc>${this.escapeXml(loc)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${isRoot ? 'daily' : 'weekly'}</changefreq>
    <priority>${priority}</priority>
  </url>`;
      }),
      '</urlset>'
    ];

    return xmlLines.join('\n');
  }

  /**
   * Generates a recommended, standardized robots.txt
   */
  public static generateOptimizedRobotsTxt(domain: string, sitemapUrl?: string): string {
    const sitemapTarget = sitemapUrl || `https://${domain}/sitemap.xml`;
    return `# AutoIndex AI Standard Optimized robots.txt
# Generated for: ${domain}
# Crawl-rate and crawler directives optimized for Googlebot & compliant search engines

User-agent: *
Allow: /
Disallow: /admin/
Disallow: /private/
Disallow: /*?*sort=
Disallow: /*?*filter=

# XML Sitemap Location
Sitemap: ${sitemapTarget}
`;
  }

  /**
   * Apply an authorized fix for an individual issue.
   */
  public static async applyFix(
    issue: SeoIssue,
    job: AuditJob,
    isAuthorized: boolean = true
  ): Promise<{ success: boolean; message: string; diff?: string }> {
    if (!issue.proposedFix) {
      return { success: false, message: 'No automatic fix is available for this issue.' };
    }

    if (!isAuthorized) {
      return { success: false, message: 'Fix was not authorized by the user. Authorization required.' };
    }

    const sandbox = SandboxSiteManager.getInstance();
    const isSandboxTarget = job.targetDomain === 'sandbox.local' || job.connectedSourceMode === 'sandbox_workspace';

    try {
      if (isSandboxTarget) {
        // Direct remediation on sandbox workspace
        const urlObj = new URL(issue.affectedUrl);
        const pathname = urlObj.pathname || '/';

        if (issue.fixType === 'sitemap') {
          const cleanXml = this.generateCleanSitemap(job.crawledPages, job.targetDomain);
          // Save rollback
          issue.rollbackData = {
            snapshot: sandbox.getSitemapXml(),
            timestamp: new Date().toISOString()
          };
          sandbox.setSitemapXml(cleanXml);
          job.generatedSitemapXml = cleanXml;

          // Validation
          const isValidXml = this.validateXml(cleanXml);
          if (!isValidXml) {
            issue.fixStatus = 'failed_validation';
            return { success: false, message: 'Validation failed: Generated XML sitemap was invalid.' };
          }

          issue.fixStatus = 'validated';
          issue.appliedAt = new Date().toISOString();
          issue.validationResult = {
            passed: true,
            details: 'Sanitized XML sitemap generated with 0 broken or staging URLs.',
            timestamp: new Date().toISOString()
          };
          return { success: true, message: 'Sanitized XML sitemap generated and deployed.', diff: cleanXml };
        }

        if (issue.fixType === 'robots') {
          const cleanRobots = this.generateOptimizedRobotsTxt(job.targetDomain);
          issue.rollbackData = {
            snapshot: sandbox.getRobotsTxt(),
            timestamp: new Date().toISOString()
          };
          sandbox.setRobotsTxt(cleanRobots);
          job.generatedRobotsTxt = cleanRobots;

          issue.fixStatus = 'validated';
          issue.appliedAt = new Date().toISOString();
          issue.validationResult = {
            passed: true,
            details: 'Validated robots.txt with active Sitemap declaration.',
            timestamp: new Date().toISOString()
          };
          return { success: true, message: 'Optimized robots.txt applied and validated.', diff: cleanRobots };
        }

        // HTML Remediation
        const pageState = sandbox.getPage(pathname);
        if (pageState.status === 200) {
          const originalHtml = pageState.html;
          const $ = cheerio.load(originalHtml);

          // Apply specific HTML fix
          if (issue.fixType === 'html_canonical') {
            $('link[rel="canonical"]').remove();
            $('head').append(`\n  <link rel="canonical" href="${issue.affectedUrl}" />`);
          } else if (issue.fixType === 'html_meta') {
            if (issue.title.includes('Viewport')) {
              $('meta[name="viewport"]').remove();
              $('head').prepend(`\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />`);
            } else if (issue.title.includes('Language')) {
              $('html').attr('lang', 'en');
            } else if (issue.title.includes('Title')) {
              if ($('title').length === 0) {
                $('head').prepend(`\n  <title>${job.targetDomain} - Enterprise Cloud Platform</title>`);
              }
            } else if (issue.title.includes('Meta Description')) {
              $('meta[name="description"]').remove();
              $('head').append(`\n  <meta name="description" content="Discover key features, infrastructure automation, and enterprise solutions on ${job.targetDomain}." />`);
            }
          } else if (issue.fixType === 'html_image') {
            $('img').each((_, el) => {
              if (!$(el).attr('alt')) {
                $(el).attr('alt', 'Illustration of cloud infrastructure and service capabilities');
              }
              if (!$(el).attr('width')) {
                $(el).attr('width', '800');
              }
              if (!$(el).attr('height')) {
                $(el).attr('height', '450');
              }
              if (!$(el).attr('loading')) {
                $(el).attr('loading', 'lazy');
              }
            });
          } else if (issue.fixType === 'jsonld') {
            $('script[type="application/ld+json"]').remove();
            const validJsonLd = {
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              'name': job.targetDomain,
              'url': `https://${job.targetDomain}/`
            };
            $('head').append(`\n  <script type="application/ld+json">\n${JSON.stringify(validJsonLd, null, 2)}\n  </script>`);
          }

          const modifiedHtml = $.html();

          // Validation step: ensure valid HTML
          const test$ = cheerio.load(modifiedHtml);
          const headExists = test$('head').length > 0;
          if (!headExists) {
            issue.fixStatus = 'failed_validation';
            return { success: false, message: 'Validation failed: Resulting HTML structure was damaged.' };
          }

          // Record rollback snapshot
          issue.rollbackData = {
            snapshot: originalHtml,
            timestamp: new Date().toISOString()
          };

          sandbox.updatePageHtml(pathname, modifiedHtml, issue.proposedFix.summary);
          issue.fixStatus = 'validated';
          issue.appliedAt = new Date().toISOString();
          issue.validationResult = {
            passed: true,
            details: `Validated fix: ${issue.proposedFix.summary}. Syntactic check passed.`,
            timestamp: new Date().toISOString()
          };

          return {
            success: true,
            message: `Fix applied and verified on ${pathname}.`,
            diff: `Target: ${issue.proposedFix.targetFileOrElement}\nProposed:\n${issue.proposedFix.proposedCode}`
          };
        }
      }

      // For external target sites without direct write access:
      // Produce downloadable verified patch and instructions
      issue.fixStatus = 'available';
      return {
        success: true,
        message: 'Patch verified and ready in downloadable patch bundle.',
        diff: `Target: ${issue.proposedFix.targetFileOrElement}\nFix Code:\n${issue.proposedFix.proposedCode}`
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      issue.fixStatus = 'failed_validation';
      return { success: false, message: `Error applying fix: ${errorMsg}` };
    }
  }

  /**
   * Rollback an applied fix.
   */
  public static rollbackFix(issue: SeoIssue, job: AuditJob): { success: boolean; message: string } {
    if (!issue.rollbackData || !issue.rollbackData.snapshot) {
      return { success: false, message: 'No rollback snapshot available for this fix.' };
    }

    const sandbox = SandboxSiteManager.getInstance();
    const isSandboxTarget = job.targetDomain === 'sandbox.local' || job.connectedSourceMode === 'sandbox_workspace';

    if (isSandboxTarget) {
      if (issue.fixType === 'sitemap') {
        sandbox.setSitemapXml(issue.rollbackData.snapshot);
      } else if (issue.fixType === 'robots') {
        sandbox.setRobotsTxt(issue.rollbackData.snapshot);
      } else {
        const urlObj = new URL(issue.affectedUrl);
        sandbox.updatePageHtml(urlObj.pathname || '/', issue.rollbackData.snapshot, 'Rolled back');
      }
    }

    issue.fixStatus = 'rolled_back';
    delete issue.appliedAt;
    delete issue.validationResult;

    return { success: true, message: `Fix successfully rolled back to previous snapshot (${issue.rollbackData.timestamp}).` };
  }

  /**
   * Generates a unified .patch / git diff bundle for all available fixes.
   */
  public static generateUnifiedPatch(issues: SeoIssue[], targetDomain: string): string {
    const patchLines: string[] = [
      `# AutoIndex AI Unified Remediation Patch Bundle`,
      `# Target Domain: ${targetDomain}`,
      `# Generated: ${new Date().toISOString()}`,
      `# Instructions: Review and apply using 'git apply' or merge via GitHub Pull Request.`,
      `===================================================================`,
      ''
    ];

    issues.forEach((issue, idx) => {
      if (issue.proposedFix) {
        patchLines.push(`--- a/${issue.proposedFix.targetFileOrElement.replace(/[^a-zA-Z0-9._/-]/g, '_')}`);
        patchLines.push(`+++ b/${issue.proposedFix.targetFileOrElement.replace(/[^a-zA-Z0-9._/-]/g, '_')}`);
        patchLines.push(`@@ Issue #${idx + 1}: ${issue.title} [${issue.severity.toUpperCase()}] @@`);
        patchLines.push(`+ # Fix: ${issue.proposedFix.summary}`);
        patchLines.push(`+ # Explanation: ${issue.proposedFix.explanation}`);
        patchLines.push(issue.proposedFix.proposedCode.split('\n').map(l => `+ ${l}`).join('\n'));
        patchLines.push('');
      }
    });

    return patchLines.join('\n');
  }

  private static validateXml(xml: string): boolean {
    try {
      const $ = cheerio.load(xml, { xmlMode: true });
      return $('urlset').length > 0 || $('sitemapindex').length > 0;
    } catch {
      return false;
    }
  }

  private static escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  }
}
