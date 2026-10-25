import { randomUUID } from 'crypto';
import { waitUntil } from '@vercel/functions';
import { get, list, put } from '@vercel/blob';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { AuditJob } from './types.ts';
import { TechnicalSeoCrawler, type CrawlCheckpoint } from './crawler.ts';
import { TechnicalSeoAuditor } from './audit.ts';
import { analyzePerformance } from './pagespeed.ts';
import { GoogleSearchConsoleIntegration } from './gsc.ts';
import { RemediationEngine } from './remediation.ts';
import { createSafeAutoFixPullRequest } from './github-autofix.ts';

const JOBS_DIR = process.env.VERCEL ? path.join('/tmp', 'autoindex-jobs') : path.resolve(process.cwd(), '.data');
const JOBS_FILE = path.join(JOBS_DIR, 'jobs.json');

export class JobManager {
  private static instance: JobManager;
  private jobs = new Map<string, AuditJob>();
  private lastBlobPersistAt = new Map<string, number>();
  private blobPersistQueue = new Map<string, Promise<void>>();
  private supabaseClient?: SupabaseClient;
  private activePipelines = new Set<string>();

  private hasSupabaseStorage(): boolean {
    return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  }

  public getStorageStatus(): { configured: boolean; provider: 'supabase' | 'vercel_blob' | 'missing' } {
    if (this.hasSupabaseStorage()) return { configured: true, provider: 'supabase' };
    if (Boolean(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN) || Boolean(process.env.BLOB_READ_WRITE_TOKEN)) {
      return { configured: true, provider: 'vercel_blob' };
    }
    return { configured: false, provider: 'missing' };
  }

  private getSupabaseClient(): SupabaseClient | undefined {
    if (!this.hasSupabaseStorage()) return undefined;
    if (!this.supabaseClient) {
      this.supabaseClient = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
    }
    return this.supabaseClient;
  }

  private hasSharedStorage(): boolean {
    return this.hasSupabaseStorage() ||
      (Boolean(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN) || Boolean(process.env.BLOB_READ_WRITE_TOKEN));
  }

  private async readSharedJob(id: string): Promise<AuditJob | undefined> {
    const supabase = this.getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('seo_audit_jobs')
        .select('job,checkpoint,updated_at')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(`Supabase job read failed: ${error.message}`);
      if (!data?.job || Object.keys(data.job).length === 0) return undefined;
      const job = data.job as AuditJob;
      if (data.checkpoint && Object.keys(data.checkpoint).length > 0) job.crawlCheckpoint = data.checkpoint as CrawlCheckpoint;
      return job;
    }
    // Blob SDK get() requires the blob URL, not its pathname.
    // Resolve the private blob URL from the store listing first.
    const pathname = `autoindex/jobs/${id}.json`;
    // A newly written Blob can briefly be absent from a listing immediately after
    // the POST /api/jobs response. Retry listing before returning a false 404.
    for (let attempt = 0; attempt < 4; attempt++) {
      const listing = await list({ prefix: pathname, limit: 10 });
      const blobRef = listing.blobs.find(item => item.pathname === pathname);
      if (blobRef?.url) {
        const blob = await get(blobRef.url, { access: 'private', useCache: false });
        if (blob && blob.statusCode === 200 && blob.stream) {
          const raw = await new Response(blob.stream).text();
          return JSON.parse(raw) as AuditJob;
        }
      }
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    // If this instance happens to hold the job locally, use that copy rather than
    // making the dashboard incorrectly mark a live audit as lost.
    return this.jobs.get(id);
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

  private async writeSupabaseSnapshot(job: AuditJob): Promise<void> {
    const supabase = this.getSupabaseClient();
    if (!supabase) throw new Error('Supabase storage is not configured.');
    const { error } = await supabase.from('seo_audit_jobs').upsert({
      id: job.id,
      target_url: job.targetUrl,
      job,
      checkpoint: job.crawlCheckpoint || {},
      status: job.status,
      progress: job.progress,
      crawled_pages: job.crawledPages?.length || 0,
      issues_discovered: {
        critical: job.issues.filter(i => i.severity === 'critical').length,
        high: job.issues.filter(i => i.severity === 'high').length,
        medium: job.issues.filter(i => i.severity === 'medium').length,
        low: job.issues.filter(i => i.severity === 'low').length
      },
      error_message: job.error || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
    if (error) throw new Error(`Supabase job write failed: ${error.message}`);
    await this.persistCrawledPages(job);
  }

  private async persistJobToSharedStorage(job: AuditJob, _addToIndex = false): Promise<void> {
    if (!this.hasSharedStorage()) return;
    const supabase = this.getSupabaseClient();
    if (supabase) {
      const snapshot = JSON.parse(JSON.stringify(job)) as AuditJob;
      const previous = this.blobPersistQueue.get(job.id) || Promise.resolve();
      const next = previous.catch(() => undefined).then(() => this.writeSupabaseSnapshot(snapshot));
      this.blobPersistQueue.set(job.id, next);
      await next;
      return;
    }
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

  private async persistCrawledPages(job: AuditJob): Promise<void> {
    const supabase = this.getSupabaseClient();
    if (!supabase || !job.crawledPages?.length) return;
    const rows = job.crawledPages.map(page => ({
      job_id: job.id,
      url: page.url,
      status_code: page.status,
      issues: [],
      page
    }));
    // Upsert requires the migration's unique (job_id, url) constraint.
    for (let offset = 0; offset < rows.length; offset += 50) {
      const { error } = await supabase
        .from('crawled_pages')
        .upsert(rows.slice(offset, offset + 50), { onConflict: 'job_id,url' });
      if (error) throw new Error(`Supabase crawled-page checkpoint failed: ${error.message}`);
    }
  }

  private queueSharedPersist(job: AuditJob): void {
    if (!this.hasSharedStorage()) return;
    const now = Date.now();
    const last = this.lastBlobPersistAt.get(job.id) || 0;
    // Throttle progress snapshots while keeping durable state reasonably fresh.
    if (now - last < 5000) return;
    this.lastBlobPersistAt.set(job.id, now);

    const supabase = this.getSupabaseClient();
    const previous = this.blobPersistQueue.get(job.id) || Promise.resolve();
    const snapshot = JSON.stringify(job);
    const next = previous.catch(() => undefined).then(async () => {
      if (supabase) {
        await this.writeSupabaseSnapshot(JSON.parse(snapshot) as AuditJob);
      } else {
        await put(`autoindex/jobs/${job.id}.json`, snapshot, {
          access: 'private',
          allowOverwrite: true,
          contentType: 'application/json',
          cacheControlMaxAge: 60
        });
      }
    });
    this.blobPersistQueue.set(job.id, next);
    void next.catch(e => console.error('Could not persist audit job checkpoint:', e));
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

  private async resumeIfStale(id: string): Promise<void> {
    if (this.activePipelines.has(id)) return;

    const supabase = this.getSupabaseClient();
    let job: AuditJob | undefined;
    let checkpoint: unknown;
    let updatedAt: string | undefined;

    if (supabase) {
      const { data, error } = await supabase
        .from('seo_audit_jobs')
        .select('job,checkpoint,updated_at,status')
        .eq('id', id)
        .maybeSingle();
      if (error || !data?.job || !data.updated_at) return;
      const resumable = ['queued', 'crawling', 'auditing', 'remediating', 'validating', 'submitting_sitemap'].includes(data.status);
      updatedAt = data.updated_at;
      if (!resumable) return;
      const staleForMs = Date.now() - new Date(updatedAt).getTime();
      if (staleForMs < 20000) return;

      // Compare-and-set the timestamp so only one Supabase-backed instance claims recovery.
      const claimedAt = new Date().toISOString();
      const claim = await supabase
        .from('seo_audit_jobs')
        .update({ updated_at: claimedAt })
        .eq('id', id)
        .eq('updated_at', updatedAt)
        .select('id')
        .maybeSingle();
      if (claim.error || !claim.data || this.activePipelines.has(id)) return;
      job = data.job as AuditJob;
      checkpoint = data.checkpoint;
    } else if (this.getStorageStatus().provider === 'vercel_blob') {
      // Blob has no row-level updated_at field; use the Blob's uploadedAt metadata
      // to detect a stale job. Previously this path returned early, so Blob-backed
      // jobs could never recover after a serverless request ended.
      const pathname = `autoindex/jobs/${id}.json`;
      const listing = await list({ prefix: pathname, limit: 10 });
      const blobRef = listing.blobs.find(item => item.pathname === pathname);
      if (!blobRef?.uploadedAt) return;
      const storedJob = await this.readSharedJob(id);
      if (!storedJob) return;
      const resumable = ['queued', 'crawling', 'auditing', 'remediating', 'validating', 'submitting_sitemap'].includes(storedJob.status);
      if (!resumable || Date.now() - new Date(blobRef.uploadedAt).getTime() < 20000) return;
      // Refresh the persisted snapshot immediately below to reduce duplicate recovery
      // attempts from subsequent requests while the resumed pipeline starts.
      job = storedJob;
    } else {
      return;
    }

    if (!job) return;
    if (checkpoint && typeof checkpoint === 'object' && Object.keys(checkpoint).length > 0) {
      job.crawlCheckpoint = checkpoint as CrawlCheckpoint;
    }
    job.logs = Array.isArray(job.logs) ? job.logs : [];
    const claimedAt = new Date().toISOString();
    job.logs.push({
      timestamp: claimedAt,
      level: 'warn',
      message: 'Recovered stale serverless job from its last persisted crawler checkpoint.'
    });
    this.jobs.set(id, job);
    this.activePipelines.add(id);

    // For Blob storage, persist the recovery marker before restarting the pipeline.
    if (!supabase) {
      await this.persistJobToSharedStorage(job).catch(e => console.error('Could not persist Blob recovery marker:', e));
    }

    const recoveryPipeline = this.runJobPipeline(job)
      .catch(async err => {
        job!.status = 'failed';
        job!.error = err instanceof Error ? err.message : String(err);
        await this.persistJobToSharedStorage(job!).catch(e => console.error('Could not persist recovered job failure:', e));
      })
      .finally(() => this.activePipelines.delete(id));
    if (process.env.VERCEL === '1') {
      waitUntil(recoveryPipeline);
    } else {
      void recoveryPipeline;
    }
  }

  public async getJob(id: string): Promise<AuditJob | undefined> {
    if (this.hasSharedStorage()) {
      try {
        const job = await this.readSharedJob(id);
        if (job) {
          this.jobs.set(id, job);
          await this.resumeIfStale(id).catch(e => console.error('Stale job recovery check failed:', e));
          return job;
        }
        return undefined;
      } catch (e) {
        console.error('Shared audit job read failed:', e);
        // Do not silently use an instance-local copy when shared storage is configured.
        return undefined;
      }
    }
    return this.jobs.get(id);
  }

  public async getAllJobs(): Promise<AuditJob[]> {
    if (this.hasSharedStorage()) {
      try {
        const supabase = this.getSupabaseClient();
        if (supabase) {
          const { data, error } = await supabase
            .from('seo_audit_jobs')
            .select('job')
            .order('updated_at', { ascending: false })
            .limit(50);
          if (error) throw new Error(`Supabase job history read failed: ${error.message}`);
          return (data || []).map(row => row.job as AuditJob).filter(job => job && typeof job.id === 'string');
        }
        const result = await list({ prefix: 'autoindex/jobs/', limit: 50 });
        const jobs = await Promise.all(result.blobs.map(async blob => {
          const id = blob.pathname.split('/').pop()?.replace(/\.json$/, '');
          return id ? this.readSharedJob(id).catch(() => undefined) : undefined;
        }));
        return jobs.filter((job): job is AuditJob => Boolean(job))
          .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      } catch (e) {
        console.error('Shared audit job history read failed:', e);
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
    if (process.env.VERCEL === '1' && !this.hasSharedStorage()) {
      throw new Error('Shared audit storage is not configured on Vercel. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel Environment Variables, run the Supabase audit_jobs migration, then redeploy.');
    }

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
        throw new Error('Shared job storage is configured but unavailable. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or verify the connected private Vercel Blob store.');
      }
    }

    // Keep background work alive after the response in Vercel's function runtime.
    this.activePipelines.add(job.id);
    const pipeline = this.runJobPipeline(job).catch(async err => {
      job.status = 'failed';
      job.error = err instanceof Error ? err.message : String(err);
      job.logs.push({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `Pipeline halted with error: ${job.error}`
      });
      this.saveJobsToDisk(job);
      await this.persistJobToSharedStorage(job).catch(e => console.error('Could not persist failed audit job:', e));
    }).finally(() => this.activePipelines.delete(job.id));

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

      const crawlResult = await crawler.runCrawl(
        (progress, stage, message) => {
          job.progress = progress;
          job.status = stage === 'crawling' ? 'crawling' : job.status;
          job.currentStage = message;
          this.saveJobsToDisk(job);
          if (progress % 10 === 0) {
            addLog('info', message);
            this.saveJobsToDisk(job);
          }
        },
        async (checkpoint: CrawlCheckpoint) => {
          // Await every page checkpoint: a forced Vercel termination should only lose
          // the currently in-flight page, not the queue and all completed pages.
          job.crawlCheckpoint = checkpoint;
          job.crawledPages = checkpoint.crawledPages;
          job.sitemapInfo = checkpoint.sitemapInfo;
          job.robotsTxtInfo = checkpoint.robotsTxtInfo;
          await this.persistJobToSharedStorage(job);
        },
        job.crawlCheckpoint
      );

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

      // Stage 3: Prepare conservative remediation artifacts. GitHub changes are proposed in a PR, never pushed to production directly.
      if (job.autoFixEnabled) {
        job.status = 'remediating';
        job.progress = 75;
        job.currentStage = 'Preparing safe SEO fixes and reviewable source changes...';
        const candidates = job.issues.filter(issue => issue.proposedFix && issue.fixStatus === 'available').length;
        addLog('info', `Prepared ${candidates} candidate remediation suggestions. Safe file changes will be proposed through a GitHub pull request when the repository connector is configured.`);
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

      // Only robots.txt and sitemap.xml are eligible for this conservative connector.
      // The connector is pinned to a configured repository and hostname allowlist and
      // creates a pull request; it never writes to the production branch directly.
      if (job.autoFixEnabled) {
        try {
          const autoFix = await createSafeAutoFixPullRequest({
            targetDomain: job.targetDomain,
            sitemapXml: job.generatedSitemapXml,
            robotsTxt: job.generatedRobotsTxt
          });
          if (autoFix.status === 'created' && autoFix.url) {
            job.githubPullRequestUrl = autoFix.url;
            addLog('success', `Created a reviewable GitHub auto-fix pull request: ${autoFix.url}`);
          } else {
            addLog('info', autoFix.reason || 'GitHub auto-fix connector skipped; downloadable suggestions are still available.');
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          addLog('warn', `GitHub auto-fix could not create a pull request: ${message}`);
        }
      }

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
      job.currentStage = job.githubPullRequestUrl ? 'Audit complete; safe SEO fixes are ready in a GitHub pull request.' : 'Technical SEO audit complete; proposed changes are ready for review.';
      job.completedAt = new Date().toISOString();

      // Compute statistics
      this.refreshSummary(job);

      const proposedCount = job.issues.filter(issue => issue.proposedFix).length;
      addLog('success', `Audit finalized: ${job.summary.criticalCount} Critical, ${job.summary.highCount} High, ${job.summary.mediumCount} Medium issues. ${proposedCount} proposed remediation snippets prepared.${job.githubPullRequestUrl ? ' Safe robots.txt and sitemap.xml changes were submitted in a GitHub PR for review.' : ' No live-site files were changed; configure the GitHub connector to generate a reviewable PR for allowlisted sites.'}`);
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
