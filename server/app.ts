import express from 'express';
import { JobManager } from './jobs.ts';
import { validateTargetUrl } from './security.ts';
import { RemediationEngine } from './remediation.ts';

const app = express();

app.use(express.json());

const jobManager = JobManager.getInstance();

// -------------------------------------------------------------
// 1. HEALTH & INTEGRATION STATUS
// -------------------------------------------------------------
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    jobStorage: jobManager.getStorageStatus(),
    integrations: {
      pagespeedApi: {
        configured: !!process.env.PAGESPEED_API_KEY,
        type: process.env.PAGESPEED_API_KEY ? 'live_google_api' : 'local_diagnostics_engine',
        description: 'Google PageSpeed Insights API for Lighthouse lab diagnostics and field data when available'
      },
      searchConsoleApi: {
        configured: !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || (process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL && process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY)),
        type: (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || (process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL && process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY)) ? 'live_service_account' : 'not_configured',
        description: 'Official Google Search Console API for sitemap submission and URL Inspection data'
      },
    }
  });
});

// -------------------------------------------------------------
// 2. URL VALIDATION (SSRF PRE-CHECK)
// -------------------------------------------------------------
app.post('/api/validate-target', async (req, res) => {
  const { url } = req.body;
  const result = await validateTargetUrl(url, false);
  res.json(result);
});

// -------------------------------------------------------------
// 3. JOB CREATION & RETRIEVAL
// -------------------------------------------------------------
app.post('/api/jobs', async (req, res) => {
  try {
    const { targetUrl, sitemapUrl, customUrls, autoFixEnabled } = req.body || {};
    if (!targetUrl) {
      return res.status(400).json({ error: 'targetUrl is required' });
    }

    const validation = await validateTargetUrl(targetUrl, false);
    if (!validation.isSafe || !validation.normalizedUrl) {
      return res.status(400).json({ error: validation.reason || 'Target URL failed security validation.' });
    }

    const targetHost = new URL(validation.normalizedUrl).hostname.toLowerCase();
    let normalizedSitemapUrl: string | undefined;
    if (sitemapUrl) {
      if (typeof sitemapUrl !== 'string') {
        return res.status(400).json({ error: 'sitemapUrl must be a URL string.' });
      }
      const sitemapCheck = await validateTargetUrl(sitemapUrl, false);
      if (!sitemapCheck.isSafe || !sitemapCheck.normalizedUrl) {
        return res.status(400).json({ error: sitemapCheck.reason || 'Sitemap URL failed security validation.' });
      }
      if (new URL(sitemapCheck.normalizedUrl).hostname.toLowerCase() !== targetHost) {
        return res.status(400).json({ error: 'Sitemap URL must use the same hostname as the target website.' });
      }
      normalizedSitemapUrl = sitemapCheck.normalizedUrl;
    }

    let normalizedCustomUrls: string[] | undefined;
    if (customUrls !== undefined) {
      if (!Array.isArray(customUrls) || customUrls.length > 100 || customUrls.some((url: unknown) => typeof url !== 'string')) {
        return res.status(400).json({ error: 'customUrls must be an array of at most 100 URL strings.' });
      }
      normalizedCustomUrls = [];
      for (const rawUrl of customUrls as string[]) {
        const urlCheck = await validateTargetUrl(rawUrl, false);
        if (!urlCheck.isSafe || !urlCheck.normalizedUrl) {
          return res.status(400).json({ error: urlCheck.reason || 'A custom URL failed security validation.' });
        }
        if (new URL(urlCheck.normalizedUrl).hostname.toLowerCase() !== targetHost) {
          return res.status(400).json({ error: 'Every custom URL must use the same hostname as the target website.' });
        }
        normalizedCustomUrls.push(urlCheck.normalizedUrl);
      }
    }

    const job = await jobManager.createJob({
      targetUrl: validation.normalizedUrl,
      sitemapUrl: normalizedSitemapUrl,
      customUrls: normalizedCustomUrls,
      autoFixEnabled: autoFixEnabled !== false,
      connectedSourceMode: 'download_patch_only'
    });

    res.status(201).json(job);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: errorMsg });
  }
});

app.get('/api/jobs', async (req, res) => {
  res.json(await jobManager.getAllJobs());
});

app.get('/api/jobs/:id', async (req, res) => {
  const job = await jobManager.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

// -------------------------------------------------------------
// 5. DOWNLOADS & EXPORTS
// -------------------------------------------------------------
app.get('/api/jobs/:id/export/json', async (req, res) => {
  const job = await jobManager.getJob(req.params.id);
  if (!job) return res.status(404).send('Job not found');

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="autoindex-audit-${job.targetDomain}.json"`);
  res.send(JSON.stringify(job, null, 2));
});

app.get('/api/jobs/:id/export/csv', async (req, res) => {
  const job = await jobManager.getJob(req.params.id);
  if (!job) return res.status(404).send('Job not found');

  const headers = ['ID', 'Category', 'Severity', 'Title', 'Affected URL', 'Fix Status', 'Evidence', 'Recommendation'];
  const rows = job.issues.map(i => [
    i.id,
    i.category,
    i.severity,
    `"${i.title.replace(/"/g, '""')}"`,
    `"${i.affectedUrl}"`,
    i.fixStatus,
    `"${i.evidence.replace(/"/g, '""')}"`,
    `"${i.recommendation.replace(/"/g, '""')}"`
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="autoindex-issues-${job.targetDomain}.csv"`);
  res.send(csv);
});

app.get('/api/jobs/:id/download/sitemap', async (req, res) => {
  const job = await jobManager.getJob(req.params.id);
  if (!job) return res.status(404).send('Job not found');

  const sitemapXml = job.generatedSitemapXml || RemediationEngine.generateCleanSitemap(job.crawledPages, job.targetDomain);
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', `attachment; filename="sitemap.xml"`);
  res.send(sitemapXml);
});

app.get('/api/jobs/:id/download/robots', async (req, res) => {
  const job = await jobManager.getJob(req.params.id);
  if (!job) return res.status(404).send('Job not found');

  const robots = job.generatedRobotsTxt || RemediationEngine.generateOptimizedRobotsTxt(job.targetDomain, job.sitemapUrl);
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="robots.txt"`);
  res.send(robots);
});

app.get('/api/jobs/:id/download/remediation-report', async (req, res) => {
  const job = await jobManager.getJob(req.params.id);
  if (!job) return res.status(404).send('Job not found');

  const report = job.generatedRemediationReport || RemediationEngine.generateRemediationReport(job.issues, job.targetDomain);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="remediation-report-${job.targetDomain}.txt"`);
  res.send(report);
});


export default app;
