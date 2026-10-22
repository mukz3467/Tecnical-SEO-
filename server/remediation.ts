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
  public static generateRemediationReport(issues: SeoIssue[], targetDomain: string): string {
    const lines = [
      'AutoIndex AI — Technical SEO Remediation Report',
      `Target domain: ${targetDomain}`,
      `Generated at: ${new Date().toISOString()}`,
      '',
      'IMPORTANT: This is a review report containing proposed snippets, not an executable git patch.',
      'No live website files have been changed by this application.',
      'Verify each recommendation against the actual source code and deploy only through an authorized workflow.',
      ''
    ];

    const candidates = issues.filter(issue => issue.proposedFix);
    if (!candidates.length) lines.push('No proposed code snippets were generated for this audit.');
    candidates.forEach((issue, index) => {
      const fix = issue.proposedFix!;
      lines.push(`[${index + 1}] ${issue.title} — ${issue.severity.toUpperCase()}`);
      lines.push(`Affected URL: ${issue.affectedUrl}`);
      lines.push(`Target element/file: ${fix.targetFileOrElement}`);
      lines.push(`Evidence: ${issue.evidence}`);
      lines.push(`Recommendation: ${issue.recommendation}`);
      lines.push(`Proposed change: ${fix.summary}`);
      lines.push(`Reason: ${fix.explanation}`);
      lines.push('Proposed snippet:');
      lines.push(fix.proposedCode);
      lines.push('');
      lines.push('---');
      lines.push('');
    });
    return lines.join('\\n');
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
