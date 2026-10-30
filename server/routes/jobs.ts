import { Router } from 'express';
import { JobManager } from '../jobs.ts';
import { validateTargetUrl } from '../security.ts';
import { RemediationEngine } from '../remediation.ts';

const router = Router();
const jobManager = JobManager.getInstance();

router.post('/api/jobs', async (req, res) => {
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
      connectedSourceMode: 'download_patch_only',
    });

    return res.status(201).json(job);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ error: errorMsg });
  }
});

router.get('/api/jobs', async (_req, res) => {
  res.json(await jobManager.getAllJobs());
});

router.get('/api/jobs/:id', async (req, res) => {
  const job = await jobManager.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  return res.json(job);
});

router.get('/api/jobs/:id/export/json', async (req, res) => {
  const job = await jobManager.getJob(req.params.id);
  if (!job) return res.status(404).send('Job not found');

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="autoindex-audit-${job.targetDomain}.json"`);
  res.send(JSON.stringify(job, null, 2));
});

router.get('/api/jobs/:id/export/csv', async (req, res) => {
  const job = await jobManager.getJob(req.params.id);
  if (!job) return res.status(404).send('Job not found');

  const headers = ['ID', 'Category', 'Severity', 'Title', 'Affected URL', 'Fix Status', 'Evidence', 'Recommendation'];
  const rows = job.issues.map((issue) => [
    issue.id,
    issue.category,
    issue.severity,
    `"${issue.title.replace(/"/g, '""')}"`,
    `"${issue.affectedUrl}"`,
    issue.fixStatus,
    `"${issue.evidence.replace(/"/g, '""')}"`,
    `"${issue.recommendation.replace(/"/g, '""')}"`,
  ]);

  const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="autoindex-issues-${job.targetDomain}.csv"`);
  res.send(csv);
});

router.get('/api/jobs/:id/download/sitemap', async (req, res) => {
  const job = await jobManager.getJob(req.params.id);
  if (!job) return res.status(404).send('Job not found');

  const sitemapXml = job.generatedSitemapXml || RemediationEngine.generateCleanSitemap(job.crawledPages, job.targetDomain);
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', 'attachment; filename="sitemap.xml"');
  res.send(sitemapXml);
});

router.get('/api/jobs/:id/download/robots', async (req, res) => {
  const job = await jobManager.getJob(req.params.id);
  if (!job) return res.status(404).send('Job not found');

  const robots = job.generatedRobotsTxt || RemediationEngine.generateOptimizedRobotsTxt(job.targetDomain, job.sitemapUrl);
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="robots.txt"');
  res.send(robots);
});

router.get('/api/jobs/:id/download/remediation-report', async (req, res) => {
  const job = await jobManager.getJob(req.params.id);
  if (!job) return res.status(404).send('Job not found');

  const report = job.generatedRemediationReport || RemediationEngine.generateRemediationReport(job.issues, job.targetDomain);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="remediation-report-${job.targetDomain}.txt"`);
  res.send(report);
});

export default router;
