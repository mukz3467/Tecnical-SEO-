import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { JobManager } from './server/jobs.ts';
import { SandboxSiteManager } from './server/sandboxSite.ts';
import { validateTargetUrl } from './server/security.ts';
import { RemediationEngine } from './server/remediation.ts';

const app = express();
const port = 3000;
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json());

const jobManager = JobManager.getInstance();
const sandboxManager = SandboxSiteManager.getInstance();

// -------------------------------------------------------------
// 1. HEALTH & INTEGRATION STATUS
// -------------------------------------------------------------
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    integrations: {
      pagespeedApi: {
        configured: !!process.env.PAGESPEED_API_KEY,
        type: process.env.PAGESPEED_API_KEY ? 'live_google_api' : 'local_diagnostics_engine',
        description: 'Google PageSpeed Insights API for Lighthouse lab diagnostics and field data when available'
      },
      searchConsoleApi: {
        configured: !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || (process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL && process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY)),
        type: (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL) ? 'live_service_account' : 'not_configured',
        description: 'Official Google Search Console API for sitemap submission and URL Inspection data'
      },
      githubIntegration: {
        configured: !!process.env.GITHUB_TOKEN,
        type: process.env.GITHUB_TOKEN ? 'live_github_api' : 'downloadable_patch_bundle',
        description: 'GitHub automated PR creation and repository code remediation'
      }
    }
  });
});

// -------------------------------------------------------------
// 2. URL VALIDATION (SSRF PRE-CHECK)
// -------------------------------------------------------------
app.post('/api/validate-target', async (req, res) => {
  const { url } = req.body;
  const result = await validateTargetUrl(url);
  res.json(result);
});

// -------------------------------------------------------------
// 3. JOB CREATION & RETRIEVAL
// -------------------------------------------------------------
app.post('/api/jobs', async (req, res) => {
  try {
    const { targetUrl, sitemapUrl, customUrls, autoFixEnabled, connectedSourceMode } = req.body;
    if (!targetUrl) {
      return res.status(400).json({ error: 'targetUrl is required' });
    }

    const job = jobManager.createJob({
      targetUrl,
      sitemapUrl,
      customUrls,
      autoFixEnabled,
      connectedSourceMode
    });

    res.status(201).json(job);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: errorMsg });
  }
});

app.get('/api/jobs', (req, res) => {
  res.json(jobManager.getAllJobs());
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobManager.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

// -------------------------------------------------------------
// 4. REMEDIATION & ROLLBACK ACTIONS
// -------------------------------------------------------------
app.post('/api/jobs/:id/apply-fix', async (req, res) => {
  const { issueId } = req.body;
  if (!issueId) {
    return res.status(400).json({ error: 'issueId is required' });
  }

  const result = await jobManager.applySpecificFix(req.params.id, issueId);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.post('/api/jobs/:id/rollback-fix', (req, res) => {
  const { issueId } = req.body;
  if (!issueId) {
    return res.status(400).json({ error: 'issueId is required' });
  }

  const result = jobManager.rollbackSpecificFix(req.params.id, issueId);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.post('/api/jobs/:id/apply-all-safe-fixes', async (req, res) => {
  const job = jobManager.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  let appliedCount = 0;
  for (const issue of job.issues) {
    if (issue.proposedFix?.isSafeToAutoApply && (issue.fixStatus === 'available' || issue.fixStatus === 'rolled_back')) {
      const r = await RemediationEngine.applyFix(issue, job, true);
      if (r.success) appliedCount++;
    }
  }

  jobManager.refreshSummary(job);
  res.json({ success: true, message: `Applied ${appliedCount} safe fixes and validated successfully.` });
});

// -------------------------------------------------------------
// 5. DOWNLOADS & EXPORTS
// -------------------------------------------------------------
app.get('/api/jobs/:id/export/json', (req, res) => {
  const job = jobManager.getJob(req.params.id);
  if (!job) return res.status(404).send('Job not found');

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="autoindex-audit-${job.targetDomain}.json"`);
  res.send(JSON.stringify(job, null, 2));
});

app.get('/api/jobs/:id/export/csv', (req, res) => {
  const job = jobManager.getJob(req.params.id);
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

app.get('/api/jobs/:id/download/sitemap', (req, res) => {
  const job = jobManager.getJob(req.params.id);
  if (!job) return res.status(404).send('Job not found');

  const sitemapXml = job.generatedSitemapXml || RemediationEngine.generateCleanSitemap(job.crawledPages, job.targetDomain);
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', `attachment; filename="sitemap.xml"`);
  res.send(sitemapXml);
});

app.get('/api/jobs/:id/download/robots', (req, res) => {
  const job = jobManager.getJob(req.params.id);
  if (!job) return res.status(404).send('Job not found');

  const robots = job.generatedRobotsTxt || RemediationEngine.generateOptimizedRobotsTxt(job.targetDomain, job.sitemapUrl);
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="robots.txt"`);
  res.send(robots);
});

app.get('/api/jobs/:id/download/patch', (req, res) => {
  const job = jobManager.getJob(req.params.id);
  if (!job) return res.status(404).send('Job not found');

  const patch = job.generatedPatchesBundle || RemediationEngine.generateUnifiedPatch(job.issues, job.targetDomain);
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="remediation-${job.targetDomain}.patch"`);
  res.send(patch);
});

// -------------------------------------------------------------
// 6. BUILT-IN SANDBOX TEST SITE ENDPOINTS
// -------------------------------------------------------------
app.get('/api/sandbox-site/robots.txt', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(sandboxManager.getRobotsTxt());
});

app.get('/api/sandbox-site/sitemap.xml', (req, res) => {
  res.setHeader('Content-Type', 'application/xml');
  res.send(sandboxManager.getSitemapXml());
});

app.post('/api/sandbox-site/reset', (req, res) => {
  sandboxManager.resetToFlawedDefaults();
  res.json({ success: true, message: 'Sandbox test website reset to initial flawed state with all SEO issues.' });
});

app.get('/api/sandbox-site/preview', (req, res) => {
  const pages = sandboxManager.getAllPages();
  res.json({
    robotsTxt: sandboxManager.getRobotsTxt(),
    sitemapXml: sandboxManager.getSitemapXml(),
    pages: pages.map(p => ({
      path: p.path,
      fixesApplied: p.appliedFixes
    }))
  });
});

app.use('/api/sandbox-site', (req, res) => {
  const targetPath = req.path || '/';
  const pageResult = sandboxManager.getPage(targetPath);
  for (const [k, v] of Object.entries(pageResult.headers)) {
    res.setHeader(k, v);
  }
  res.status(pageResult.status).send(pageResult.html);
});

// -------------------------------------------------------------
// 7. VITE DEV SERVER / STATIC SERVING
// -------------------------------------------------------------
async function startServer() {
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`AutoIndex AI server running at http://0.0.0.0:${port}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
