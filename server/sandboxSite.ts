/**
 * Sandbox Site for AutoIndex AI
 * Serves an interactive realistic website with deliberate, real-world technical SEO issues
 * so users can test end-to-end crawling, auditing, automated remediation, validation, and rollback.
 */

export interface SandboxPageState {
  html: string;
  appliedFixes: string[];
}

export class SandboxSiteManager {
  private static instance: SandboxSiteManager;
  private pages: Map<string, SandboxPageState> = new Map();
  private robotsTxt: string = '';
  private sitemapXml: string = '';
  private originalState: {
    pages: Map<string, SandboxPageState>;
    robotsTxt: string;
    sitemapXml: string;
  };

  private constructor() {
    this.resetToFlawedDefaults();
    this.originalState = {
      pages: new Map(this.pages),
      robotsTxt: this.robotsTxt,
      sitemapXml: this.sitemapXml
    };
  }

  public static getInstance(): SandboxSiteManager {
    if (!SandboxSiteManager.instance) {
      SandboxSiteManager.instance = new SandboxSiteManager();
    }
    return SandboxSiteManager.instance;
  }

  public resetToFlawedDefaults() {
    this.robotsTxt = `User-agent: *
Disallow: /admin/
Disallow: /private/
Crawl-delay: 1

# Note: Missing sitemap directive intentionally for audit detection
`;

    this.sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://sandbox.local/</loc>
    <lastmod>2026-10-15</lastmod>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://sandbox.local/features</loc>
    <lastmod>2026-10-10</lastmod>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://sandbox.local/pricing</loc>
    <lastmod>2026-10-12</lastmod>
    <priority>0.8</priority>
  </url>
  <!-- Flawed: Staging URL exposed in production sitemap -->
  <url>
    <loc>https://staging.internal.corp/testing-preview</loc>
    <lastmod>2026-10-01</lastmod>
    <priority>0.3</priority>
  </url>
  <!-- Flawed: 404 URL in sitemap -->
  <url>
    <loc>https://sandbox.local/old-deleted-page</loc>
    <lastmod>2025-01-01</lastmod>
    <priority>0.5</priority>
  </url>
</urlset>`;

    this.pages = new Map();

    // 1. Homepage: Missing canonical, missing viewport, missing lang, missing image dimensions & alt, fake javascript: link
    this.pages.set('/', {
      html: `<!DOCTYPE html>
<html>
<head>
  <title>ApexCloud - Enterprise Cloud Platform for DevOps</title>
  <!-- Missing meta description -->
  <!-- Missing canonical tag -->
  <!-- Missing viewport meta tag -->
</head>
<body style="font-family: sans-serif; padding: 24px;">
  <header>
    <h2>ApexCloud Infrastructure</h2>
    <!-- Skipped heading hierarchy: H2 before H1! -->
    <h1>Next-Generation Scalable Cloud Deployments</h1>
    <nav>
      <a href="/features">Features</a> | 
      <a href="/pricing">Pricing</a> | 
      <a href="/blog">Blog</a> |
      <a href="/redirect-page">Redirect Test</a> |
      <a href="/broken-404-link">Broken Link Test</a> |
      <a href="javascript:void(0)" onclick="alert('JS link')">Render-dependent JS link</a>
    </nav>
  </header>
  <main>
    <p>Empower your engineering teams with continuous cloud intelligence and automated Kubernetes orchestration.</p>
    <!-- Missing image alt, missing width and height attributes (CLS risk) -->
    <img src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800" />
    <p>Read our documentation to get started right away with zero downtime deployments.</p>
  </main>
  <footer>
    <p>&copy; 2026 ApexCloud Technologies, Inc.</p>
  </footer>
</body>
</html>`,
      appliedFixes: []
    });

    // 2. Features page: Duplicate title with Homepage, thin content, missing H1
    this.pages.set('/features', {
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <!-- Duplicate title with Homepage -->
  <title>ApexCloud - Enterprise Cloud Platform for DevOps</title>
  <meta name="description" content="Explore ApexCloud features." />
  <link rel="canonical" href="http://sandbox.local/features" />
</head>
<body style="font-family: sans-serif; padding: 24px;">
  <!-- Missing H1 tag entirely -->
  <h2>Features Overview</h2>
  <p>Coming soon. Here are quick notes.</p>
  <a href="/">Back to Home</a>
</body>
</html>`,
      appliedFixes: []
    });

    // 3. Pricing page: Has broken JSON-LD syntax and missing offers
    this.pages.set('/pricing', {
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ApexCloud Pricing Plans & Enterprise Tier</title>
  <meta name="description" content="Flexible pricing plans designed for fast growing development teams. Free 14-day trial with no credit card required." />
  <link rel="canonical" href="https://sandbox.local/pricing" />
  <!-- Malformed JSON-LD syntax missing closing bracket -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "ApexCloud Enterprise Tier"
    // Missing offers, missing closing brace
  </script>
</head>
<body style="font-family: sans-serif; padding: 24px;">
  <h1>Transparent Pricing for Modern Cloud Teams</h1>
  <p>Select the subscription tier that best matches your organization's compute and telemetry requirements.</p>
  <ul>
    <li>Starter: $49/mo</li>
    <li>Pro: $199/mo</li>
    <li>Enterprise: Custom SLA</li>
  </ul>
  <a href="/">Back to Home</a>
</body>
</html>`,
      appliedFixes: []
    });

    // 4. Blog page: Valid structured data example
    this.pages.set('/blog', {
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ApexCloud Engineering Blog - DevOps & SRE Insights</title>
  <meta name="description" content="Technical tutorials, postmortems, and performance benchmarks from our systems engineering team." />
  <link rel="canonical" href="https://sandbox.local/blog" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Blog",
    "name": "ApexCloud Tech Blog",
    "url": "https://sandbox.local/blog"
  }
  </script>
</head>
<body style="font-family: sans-serif; padding: 24px;">
  <h1>Engineering & Reliability Insights</h1>
  <p>Learn how top engineering teams streamline delivery and optimize cloud spend.</p>
  <a href="/">Back to Home</a>
</body>
</html>`,
      appliedFixes: []
    });
  }

  public getPage(pathname: string): { status: number; html: string; headers: Record<string, string> } {
    const cleanPath = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;

    // Handle test redirects
    if (cleanPath === '/redirect-page') {
      return {
        status: 301,
        html: 'Redirecting...',
        headers: {
          'location': '/features',
          'content-type': 'text/plain'
        }
      };
    }

    if (cleanPath === '/broken-404-link' || cleanPath === '/old-deleted-page') {
      return {
        status: 404,
        html: `<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><h1>404 - Not Found</h1><p>The requested URL was not found on this server.</p></body></html>`,
        headers: {
          'content-type': 'text/html; charset=utf-8'
        }
      };
    }

    const page = this.pages.get(cleanPath);
    if (!page) {
      return {
        status: 404,
        html: `<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><h1>404 - Not Found</h1></body></html>`,
        headers: {
          'content-type': 'text/html; charset=utf-8'
        }
      };
    }

    return {
      status: 200,
      html: page.html,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'x-content-type-options': 'nosniff',
        // Deliberately missing HSTS and CSP to detect security headers
      }
    };
  }

  public getRobotsTxt(): string {
    return this.robotsTxt;
  }

  public setRobotsTxt(content: string) {
    this.robotsTxt = content;
  }

  public getSitemapXml(): string {
    return this.sitemapXml;
  }

  public setSitemapXml(content: string) {
    this.sitemapXml = content;
  }

  public updatePageHtml(pathname: string, newHtml: string, fixLabel: string) {
    const cleanPath = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
    const existing = this.pages.get(cleanPath);
    if (existing) {
      existing.html = newHtml;
      existing.appliedFixes.push(fixLabel);
      this.pages.set(cleanPath, existing);
    }
  }

  public getAllPages(): Array<{ path: string; html: string; appliedFixes: string[] }> {
    const list: Array<{ path: string; html: string; appliedFixes: string[] }> = [];
    this.pages.forEach((value, key) => {
      list.push({ path: key, html: value.html, appliedFixes: value.appliedFixes });
    });
    return list;
  }
}
