import { randomUUID } from 'crypto';
import { waitUntil } from '@vercel/functions';
import { get, list, put } from '@vercel/blob';
import fs from 'fs';
import path from 'path';
import { AuditJob } from './types.ts';
import { TechnicalSeoCrawler } from './crawler.ts';
import { TechnicalSeoAuditor } from './audit.ts';
import { analyzePerformance } from './pagespeed.ts';
import { GoogleSearchConsoleIntegration } from './gsc.ts';
import { RemediationEngine } from './remediation.ts';

const JOBS_DIR = process.env.VERCEL ? path.join('/tmp', 'autoindex-jobs') : path.resolve(process.cwd(), '.data');
const JOBS_FILE = path.join(JOBS_DIR, 'jobs.json');

export class JobManager {
  private static instance: JobManager;
  private jobs = new Map<string, AuditJob>();
  private lastBlobPersistAt = new Map<string, number>();
  private blobPersistQueue = new Map<string, Promise<void>>();

  private hasSharedStorage(): boolean {
    return Boolean(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN) || Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  }

  private async readBlobJob(id: string): Promise<AuditJob | undefined> {
    const blob = await get(`autoindex/jobs/${id}.json`, { access: 'private', useCache: false });
    if (!blob || blob.statusCode !== 200 || !blob.stream) return undefined;
    const raw = await new Response(blob.stream).text();
    return JSON.parse(raw) as AuditJob;
  }

  private constructor() {
    this.loadJobsFromDisk();
  }

  public static getInstance(): JobManager {
    if (!JobManager.instance) {
      JobManager.instance = new JobManager();
    }
    return JobManager.instance;
  }

  private loadJobsFromDisk() {
    try {
      if (fs.existsSync(JOBS_FILE)) {
        const raw = fs.readFileSync(JOBS_FILE, 'utf-8');
        const list: AuditJob[] = JSON.parse(raw);
        for (const j of list) {
          this.jobs.set(j.id, j);
        }
      }
    } catch (e) {
      console.warn('Could not load jobs from disk, starting fresh:', e);
    }
  }

  private async persistJobToSharedStorage(job: AuditJob, _addToIndex = false): Promise<void> {
    if (!this.hasSharedStorage()) return;
    const snapshot = JSON.stringify(job);
    const previous = this.blobPersistQueue.get(job.id) || Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      await put(`autoindex/jobs/${job.id}.json`, snapshot, {
        access: 'private',
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 60
      });
    });
    this.blobPersistQueue.set(job.id, next);
    await next;
  }

  private queueSharedPersist(job: AuditJob): void {
    if (!this.hasSharedStorage()) return;
    const now = Date.now();
    const last = this.lastBlobPersistAt.get(job.id) || 0;
    // Keep Blob writes inside the Hobby free allowance during a normal crawl.
    if (now - last < 8000) return;
    this.lastBlobPersistAt.set(job.id, now);
    const previous = this.blobPersistQueue.get(job.id) || Promise.resolve();
    const snapshot = JSON.stringify(job);
    const next = previous.catch(() => undefined).then(async () => {
      await put(`autoindex/jobs/${job.id}.json`, snapshot, {
        access: 'private',
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 60
      });
    });
    this.blobPersistQueue.set(job.id, next);
    void next.catch(e => console.error('Could not persist audit job to Vercel Blob:', e));
  }

  private saveJobsToDisk(jobToPersist?: AuditJob): void {
    try {
      if (!fs.existsSync(JOBS_DIR)) fs.mkdirSync(JOBS_DIR, { recursive: true });
      const listOnDisk = Array.from(this.jobs.values()).slice(-50);
      fs.writeFileSync(JOBS_FILE, JSON.stringify(listOnDisk, null, 2), 'utf-8');
    } catch (e) {
      console.warn('Could not save jobs to disk:', e);
    }
    if (jobToPersist) this.queueSharedPersist(jobToPersist);
  }

  public async getJob(id: string): Promise<AuditJob | undefined> {
    if (this.hasSharedStorage()) {
      try {
        const job = await this.readBlobJob(id);
        if (job) {
          this.jobs.set(id, job);
          return job;
        }
        return undefined;
      } catch (e) {
        console.error('Shared Vercel Blob job read failed:', e);
        // Do not silently use an instance-local copy when shared storage is configured.
        return undefined;
      }
    }
    return this.jobs.get(id);
  }

  public async getAllJobs(): Promise<AuditJob[]> {
    if (this.hasSharedStorage()) {
      try {
        const result = await list({ prefix: 'autoindex/jobs/', limit: 50 });
        const jobs = await Promise.all(result.blobs.map(async blob => {
          const id = blob.pathname.split('/').pop()?.replace(/\.json$/, '');
          return id ? this.readBlobJob(id).catch(() => undefined) : undefined;
        }));
        return jobs.filter((job): job is AuditJob => Boolean(job))
          .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      } catch (e) {
        console.error('Shared Vercel Blob job history read failed:', e);
        return [];
      }
    }
    return Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  public async createJob(params: {
    targetUrl: string;
    sitemapUrl?: string;
    customUrls?: string[];
    autoFixEnabled?: boolean;
    connectedSourceMode?: AuditJob['connectedSourceMode'];
  }): AuditJob {
    const id = randomUUID();
    let urlObj: URL;
    try {
      let raw = params.targetUrl.trim();
      if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
        raw = 'https://' + raw;
      }
      urlObj = new URL(raw);
    } catch {
      throw new Error('Invalid Target Website URL format.');
    }

    const domain = urlObj.hostname;

    const job: AuditJob = {
      id,
      targetDomain: domain,
      targetUrl: urlObj.origin + (urlObj.pathname || '/'),
      sitemapUrl: params.sitemapUrl,
      customUrls: params.customUrls,
      autoFixEnabled: params.autoFixEnabled ?? true,
      connectedSourceMode: 'download_patch_only',
      status: 'queued',
      progress: 0,
      currentStage: 'Initializing crawler pipeline and checking robots.txt rules...',
      startedAt: new Date().toISOString(),
      crawledPages: [],
      issues: [],
      searchConsoleStatus: {
        connected: false,
        authMethod: 'unconfigured',
        isVerified: false,
        sitemapSubmitted: false,
        inspectionSummary: {
          totalInspected: 0,
          indexedCount: 0,
          notIndexedCount: 0,
          verdict: 'Pending crawl completion',
          coverageIssues: [],
          note: ''
        },
        indexingApiStatus: {
          supported: false,
          notice: '',
          eligiblePages: []
        }
      },
      summary: {
        totalDiscovered: 0,
        totalCrawled: 0,
        totalErrors: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        fixesAppliedCount: 0,
        fixesValidatedCount: 0,
        fixesRollbackableCount: 0
      },
      logs: [
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Job initialized for target: ${urlObj.origin} (Live Web Audit)`
        }
      ]
    };

    this.jobs.set(id, job);
    this.saveJobsToDisk(job);
    const sharedConfigured = this.hasSharedStorage();
    if (sharedConfigured) {
      try {
        await this.persistJobToSharedStorage(job, true);
      } catch (e) {
        console.error('Could not initialize shared job storage:', e);
        throw new Error('Shared job storage is configured but unavailable. Check the Vercel Blob store connection in Project Storage.');
      }
    }

    // Keep background work alive after the response in Vercel's function runtime.
    const pipeline = this.runJobPipeline(job).catch(err => {
      job.status = 'failed';
      job.error = err instanceof Error ? err.message : String(err);
      job.logs.push({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `Pipeline halted with error: ${job.error}`
      });
      this.saveJobsToDisk(job);
      await this.persistJobToSharedStorage(job).catch(e => console.error('Could not persist failed audit job:', e));
    });

    if (process.env.VERCEL === '1') {
      waitUntil(pipeline);
    } else {
      void pipeline;
    }

    return job;
  }

  private async runJobPipeline(job: AuditJob) {
    const addLog = (level: 'info' | 'warn' | 'error' | 'success', message: string) => {
      job.logs.push({ timestamp: new Date().toISOString(), level, message });
    };

    try {
      // Stage 1: Crawl Website
      job.status = 'crawling';
      job.progress = 5;
      job.currentStage = 'Crawling website & discovering link graph...';
      addLog('info', 'Crawling initiated with robots.txt check and sitemap extraction...');

      const crawler = new TechnicalSeoCrawler({
        targetDomain: job.targetDomain,
        seedUrl: job.targetUrl,
        sitemapUrl: job.sitemapUrl,
        customUrls: job.customUrls,
        maxPages: 30,
        delayMs: 250
      });

      const crawlResult = await crawler.runCrawl((progress, stage, message) => {
        job.progress = progress;
        job.status = stage === 'crawling' ? 'crawling' : job.status;
        job.currentStage = message;
        // Persist each reported stage, not just the final result. This helps recover
        // the latest known progress after a warm-instance restart (shared storage is
        // still required for consistent state across independent serverless instances).
        this.saveJobsToDisk(job);
        if (progress % 10 === 0) {
          addLog('info', message);
          this.saveJobsToDisk(job);
        }
      });

      job.crawledPages = crawlResult.crawledPages;
      job.sitemapInfo = crawlResult.sitemapInfo;
      job.robotsTxtInfo = crawlResult.robotsTxtInfo;

      addLog('success', `Crawl complete. Discovered ${crawlResult.sitemapInfo.discoveredUrls.length} sitemap URLs and crawled ${crawlResult.crawledPages.length} pages.`);

      // Stage 2: Audit Technical SEO
      job.status = 'auditing';
      job.progress = 55;
      job.currentStage = 'Auditing technical SEO issues across 6 core categories...';
      addLog('info', 'Executing audit engine: crawlability, on-page, CWV, security, schema...');

      job.issues = TechnicalSeoAuditor.runAudit(
        crawlResult.crawledPages,
        crawlResult.sitemapInfo,
        crawlResult.robotsTxtInfo,
        crawlResult.orphanPages,
        job.targetDomain
      );

      // Core Web Vitals & Performance
      job.progress = 65;
      job.currentStage = 'Analyzing Core Web Vitals (LCP, INP, CLS) and loading bottlenecks...';
      job.performanceMetrics = await analyzePerformance(job.targetUrl, job.crawledPages);
      addLog('info', job.performanceMetrics.score !== undefined
        ? `Real PageSpeed performance score: ${job.performanceMetrics.score}/100 (source: ${job.performanceMetrics.source}).`
        : `No PageSpeed score available. ${job.performanceMetrics.fieldDataNotice}`);

      // Stage 3: Remediation planning only. This deployment has no authorized live-site write connector.
      if (job.autoFixEnabled) {
        job.status = 'remediating';
        job.progress = 75;
        job.currentStage = 'Preparing candidate remediation snippets for review...';
        const candidates = job.issues.filter(issue => issue.proposedFix && issue.fixStatus === 'available').length;
        addLog('info', `Prepared ${candidates} candidate remediation suggestions. No live website files were changed.`);
      }

      // Stage 4: Validation
      job.status = 'validating';
      job.progress = 85;
      job.currentStage = 'Validating generated sitemap and preparing the evidence-led remediation report...';
      addLog('info', 'Checking generated sitemap structure and preparing robots.txt/report artifacts. No live website files are modified.');

      // Generate Clean Artifacts
      job.generatedSitemapXml = RemediationEngine.generateCleanSitemap(job.crawledPages, job.targetDomain);
      job.generatedRobotsTxt = RemediationEngine.generateOptimizedRobotsTxt(job.targetDomain, job.sitemapUrl || `${new URL(job.targetUrl).origin}/sitemap.xml`);
      job.generatedRemediationReport = RemediationEngine.generateRemediationReport(job.issues, job.targetDomain);

      // Stage 5: Google Search Console Submission
      job.status = 'submitting_sitemap';
      job.progress = 92;
      job.currentStage = 'Submitting updated sitemap to Google Search Console API...';
      addLog('info', 'Communicating with Google Search Console API / URL Inspection...');

      job.searchConsoleStatus = await GoogleSearchConsoleIntegration.executeWorkflow(
        job.targetDomain,
        job.sitemapUrl || `${new URL(job.targetUrl).origin}/sitemap.xml`,
        job.crawledPages,
        job.sitemapInfo
      );
      if (job.searchConsoleStatus.sitemapSubmitted) {
        addLog('success', job.searchConsoleStatus.sitemapSubmissionResult || 'Google Search Console confirmed sitemap submission.');
      } else {
        addLog('warn', job.searchConsoleStatus.sitemapSubmissionResult || 'Sitemap was not submitted to Google Search Console.');
      }

      // Stage 6: Completion & Stats
      job.status = 'completed';
      job.progress = 100;
      job.currentStage = 'Technical SEO audit complete; proposed changes are ready for review.';
      job.completedAt = new Date().toISOString();

      // Compute statistics
      this.refreshSummary(job);

      const proposedCount = job.issues.filter(issue => issue.proposedFix).length;
      addLog('success', `Audit finalized: ${job.summary.criticalCount} Critical, ${job.summary.highCount} High, ${job.summary.mediumCount} Medium issues. ${proposedCount} proposed remediation snippets prepared; no live-site files were changed.`);
      this.saveJobsToDisk(job);
      await this.persistJobToSharedStorage(job).catch(e => console.error('Could not persist completed audit job:', e));
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      job.status = 'failed';
      job.error = errorMsg;
      job.currentStage = `Failed: ${errorMsg}`;
      addLog('error', `Job aborted due to error: ${errorMsg}`);
      this.saveJobsToDisk(job);
      await this.persistJobToSharedStorage(job).catch(e => console.error('Could not persist failed audit job:', e));
    }
  }

  public refreshSummary(job: AuditJob) {
    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;
    let applied = 0;
    let validated = 0;
    let rollbackable = 0;

    for (const issue of job.issues) {
      if (issue.severity === 'critical') critical++;
      if (issue.severity === 'high') high++;
      if (issue.severity === 'medium') medium++;
      if (issue.severity === 'low') low++;

      if (issue.fixStatus === 'applied' || issue.fixStatus === 'validated') applied++;
      if (issue.fixStatus === 'validated') validated++;
      if (issue.rollbackData) rollbackable++;
    }

    job.summary = {
      totalDiscovered: (job.sitemapInfo?.discoveredUrls.length || 0) + job.crawledPages.length,
      totalCrawled: job.crawledPages.length,
      totalErrors: job.crawledPages.filter(p => p.status >= 400).length,
      criticalCount: critical,
      highCount: high,
      mediumCount: medium,
      lowCount: low,
      fixesAppliedCount: applied,
      fixesValidatedCount: validated,
      fixesRollbackableCount: rollbackable
    };
  }


}
