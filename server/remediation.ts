import * as cheerio from 'cheerio';
import { SeoIssue, AuditJob, CrawledPage } from './types.ts';

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
    _issue: SeoIssue,
    _job: AuditJob,
    _isAuthorized: boolean = false
  ): Promise<{ success: boolean; message: string; diff?: string }> {
    return {
      success: false,
      message: 'Live website writes are not configured. No changes were applied. Use the reviewed remediation report with an authorized source-control or hosting workflow.'
    };
  }

  public static rollbackFix(_issue: SeoIssue, _job: AuditJob): { success: boolean; message: string } {
    return {
      success: false,
      message: 'Rollback is unavailable because this application did not modify live website files.'
    };
  }

  /**
   * Generates an evidence-led remediation report. It is a review document, not a git-applicable patch.
   */
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
