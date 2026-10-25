import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header.tsx';
import { AuditLauncher } from './components/AuditLauncher.tsx';
import { LiveProgressCard } from './components/LiveProgressCard.tsx';
import { SummaryCards } from './components/SummaryCards.tsx';
import { IssuesTable } from './components/IssuesTable.tsx';
import { PerformanceCard } from './components/PerformanceCard.tsx';
import { IndexingReadinessPanel } from './components/IndexingReadinessPanel.tsx';
import { CrawledPagesTable } from './components/CrawledPagesTable.tsx';
import { ArtifactsDownloader } from './components/ArtifactsDownloader.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { AuditJob } from './types.ts';
import { History, AlertCircle, Search, Globe, ListChecks, Gauge, FileSearch, ArrowUpRight } from 'lucide-react';

export default function App() {
  const [jobs, setJobs] = useState<AuditJob[]>([]);
  const [activeJob, setActiveJob] = useState<AuditJob | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'issues' | 'pages' | 'performance' | 'gsc'>('gsc');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const pollFailuresRef = useRef(0);

  // Initial load of jobs list
  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const data: AuditJob[] = await res.json();
        setJobs(data);
        if (!activeJob && data.length > 0) {
          setActiveJob(data[0]);
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  // Poll active job while running
  useEffect(() => {
    if (!activeJob) return;

    const isRunning = !['completed', 'failed', 'cancelled'].includes(activeJob.status);

    if (isRunning) {
      pollingRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/jobs/${activeJob.id}`);
          if (!res.ok) {
            pollFailuresRef.current += 1;
            if (res.status === 404) {
              const lostMessage = 'Audit progress was lost between server requests. This deployment needs shared persistent job storage; this run cannot safely continue.';
              setErrorBanner(lostMessage);
              setActiveJob(prev => prev && prev.id === activeJob.id
                ? { ...prev, status: 'failed', error: lostMessage, currentStage: 'Stopped: server could not retrieve this audit job.' }
                : prev);
              setJobs(prev => prev.map(j => j.id === activeJob.id
                ? { ...j, status: 'failed', error: lostMessage, currentStage: 'Stopped: server could not retrieve this audit job.' }
                : j));
              return;
            }
            if (pollFailuresRef.current >= 3) {
              setErrorBanner(`Unable to read audit progress (HTTP ${res.status}). The crawl may still be running, but the dashboard cannot confirm its status.`);
            }
            return;
          }

          pollFailuresRef.current = 0;
          const updated: AuditJob = await res.json();
          setActiveJob(updated);
          // also update jobs list
          setJobs(prev => prev.map(j => (j.id === updated.id ? updated : j)));
        } catch {
          pollFailuresRef.current += 1;
          if (pollFailuresRef.current >= 3) {
            setErrorBanner('Network error while checking audit progress. Check your connection and reload the page.');
          }
        }
      }, 1200);
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [activeJob?.id, activeJob?.status]);

  const handleStartAudit = async (params: {
    targetUrl: string;
    sitemapUrl?: string;
    customUrls?: string[];
    autoFixEnabled: boolean;
    connectedSourceMode: AuditJob['connectedSourceMode'];
  }) => {
    setIsStarting(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });

      const responseText = await res.text();
      let responseData: any = null;
      try {
        responseData = responseText ? JSON.parse(responseText) : null;
      } catch {
        // Serverless platforms can return plain-text/HTML errors instead of JSON.
      }

      if (!res.ok) {
        const serverMessage =
          (responseData && typeof responseData.error === 'string' && responseData.error) ||
          (responseText && responseText.slice(0, 300)) ||
          'No error details were returned by the server.';
        throw new Error(`Could not start audit (HTTP ${res.status}): ${serverMessage}`);
      }

      if (!responseData || typeof responseData !== 'object' || !responseData.id) {
        throw new Error(
          `Audit API returned an invalid response (HTTP ${res.status}). ${responseText.slice(0, 300) || 'The response was empty.'}`
        );
      }

      const newJob: AuditJob = responseData as AuditJob;
      setActiveJob(newJob);
      setJobs(prev => [newJob, ...prev]);
      setActiveTab('gsc');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setErrorBanner(errorMsg);
    } finally {
      setIsStarting(false);
    }
  };

  const isPipelineActive = activeJob ? !['completed', 'failed', 'cancelled'].includes(activeJob.status) : false;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      <Header
        onOpenSettings={() => setIsSettingsOpen(true)}
        activeJobId={activeJob?.id}
        isProcessing={isPipelineActive}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Reference layout: hero, URL audit launcher, quick stats, then tool cards. */}
        <section className="pt-3 sm:pt-8 pb-1 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-700">
            <span className="inline-block h-2 w-2 rounded-full bg-black" />
            Technical SEO Workspace
          </div>
          <h1 className="mt-5 text-3xl sm:text-5xl font-bold tracking-tight text-black leading-tight">
            Find SEO issues. <span className="text-neutral-500">Fix what matters.</span>
          </h1>
          <p className="mt-4 text-sm sm:text-base leading-7 text-neutral-600 max-w-2xl mx-auto">
            Crawl your website, review technical problems, inspect indexing readiness, and understand performance from one workspace.
          </p>
        </section>
        {/* Error notification banner */}
        {errorBanner && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorBanner}</span>
            </div>
            <button
              onClick={() => setErrorBanner(null)}
              className="text-rose-400 hover:text-white font-bold ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 1. Main Launcher Input */}
        <div id="audit-launcher" className="scroll-mt-24">
          <AuditLauncher
            onStartAudit={handleStartAudit}
            isLoading={isStarting || isPipelineActive}
          />
        </div>

        {/* Quick stats */}
        <section aria-label="Quick audit statistics" className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Overview</p>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-black">Quick stats</h2>
            </div>
            <span className="text-xs text-neutral-500">{activeJob ? 'Latest audit results' : 'Your stats appear after the first audit'}</span>
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2 text-xs text-neutral-500"><span>Pages crawled</span><Globe className="h-4 w-4 text-black" /></div>
              <p className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-black">{activeJob ? activeJob.summary.totalCrawled : '—'}</p>
              <p className="mt-1 text-[11px] text-neutral-500">{activeJob ? `of ${activeJob.summary.totalDiscovered} discovered` : 'Waiting for a crawl'}</p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2 text-xs text-neutral-500"><span>Issues found</span><ListChecks className="h-4 w-4 text-black" /></div>
              <p className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-black">{activeJob ? activeJob.issues.length : '—'}</p>
              <p className="mt-1 text-[11px] text-neutral-500">{activeJob ? `${activeJob.summary.criticalCount} critical issues` : 'Evidence-based findings'}</p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2 text-xs text-neutral-500"><span>Indexing checks</span><FileSearch className="h-4 w-4 text-black" /></div>
              <p className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-black">{activeJob ? activeJob.searchConsoleStatus.inspectionSummary.totalInspected : '—'}</p>
              <p className="mt-1 text-[11px] text-neutral-500">{activeJob ? 'URLs inspected by Google API' : 'Search Console status'}</p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2 text-xs text-neutral-500"><span>Performance score</span><Gauge className="h-4 w-4 text-black" /></div>
              <p className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-black">{typeof activeJob?.performanceMetrics?.score === 'number' ? `${activeJob.performanceMetrics.score}/100` : '—'}</p>
              <p className="mt-1 text-[11px] text-neutral-500">{activeJob ? 'Latest measured score' : 'Measured during audit'}</p>
            </div>
          </div>
        </section>

        {/* Four tool cards from the generated reference layout. */}
        <section className="space-y-3" aria-label="Technical SEO tools">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Workspace</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-black">Explore your SEO tools</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { key: 'issues' as const, number: '01', title: 'Technical SEO Audit', description: 'Review crawl errors, metadata, canonical tags, and prioritized fixes.', icon: Search },
              { key: 'pages' as const, number: '02', title: 'Crawl & URL Analysis', description: 'Explore discovered URLs, response codes, and page-level crawl data.', icon: Globe },
              { key: 'gsc' as const, number: '03', title: 'Google Indexing', description: 'Check sitemap, robots.txt, Search Console access, and indexing readiness.', icon: FileSearch },
              { key: 'performance' as const, number: '04', title: 'Performance & CWV', description: 'Review available speed measurements and Core Web Vitals data.', icon: Gauge }
            ].map(tool => {
              const ToolIcon = tool.icon;
              return (
                <article key={tool.key} className="group flex min-h-[220px] flex-col rounded-2xl border border-neutral-200 bg-white p-5 transition duration-200 hover:-translate-y-0.5 hover:border-neutral-400 hover:shadow-lg hover:shadow-black/[0.04]">
                  <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-black"><ToolIcon className="h-5 w-5" /></div>
                    <span className="text-xs font-mono text-neutral-400">{tool.number}</span>
                  </div>
                  <h3 className="mt-5 text-base font-bold tracking-tight text-black">{tool.title}</h3>
                  <p className="mt-2 flex-1 text-xs leading-6 text-neutral-600">{tool.description}</p>
                  <button type="button" onClick={() => { setActiveTab(tool.key); if (!activeJob) document.getElementById('audit-launcher')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); else document.getElementById('audit-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="mt-4 inline-flex w-fit items-center gap-2 rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white transition hover:bg-neutral-800">
                    {activeJob ? 'Open tool' : 'Start with a URL'} <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        {/* Job History Selector if multiple jobs */}
        {jobs.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <span className="text-slate-400 flex items-center gap-1 shrink-0 font-medium">
              <History className="w-3.5 h-3.5" />
              Audit Runs:
            </span>
            {jobs.map(j => (
              <button
                key={j.id}
                onClick={() => setActiveJob(j)}
                className={`px-3 py-1.5 rounded-lg font-mono shrink-0 transition flex items-center gap-1.5 border ${
                  activeJob?.id === j.id
                    ? 'bg-slate-800 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="truncate max-w-[140px]">{j.targetDomain}</span>
                <span className="text-[10px] text-slate-500">
                  {new Date(j.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* 2. Active Job Details */}
        {activeJob && (
          <div id="audit-results" className="scroll-mt-24 space-y-6">
            {/* Live Progress & Status */}
            <LiveProgressCard job={activeJob} />

            {/* High-level KPIs */}
            <SummaryCards job={activeJob} />

            {/* Tab Navigation */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-xs font-medium">
              <button
                onClick={() => setActiveTab('issues')}
                className={`px-3.5 py-2 rounded-xl transition ${
                  activeTab === 'issues'
                    ? 'bg-slate-800 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Issues & Remediation ({activeJob.issues.length})
              </button>

              <button
                onClick={() => setActiveTab('pages')}
                className={`px-3.5 py-2 rounded-xl transition ${
                  activeTab === 'pages'
                    ? 'bg-slate-800 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Crawled URLs ({activeJob.crawledPages.length})
              </button>

              <button
                onClick={() => setActiveTab('performance')}
                className={`px-3.5 py-2 rounded-xl transition ${
                  activeTab === 'performance'
                    ? 'bg-slate-800 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Core Web Vitals & Speed
              </button>

              <button
                onClick={() => setActiveTab('gsc')}
                className={`px-3.5 py-2 rounded-xl transition ${
                  activeTab === 'gsc'
                    ? 'bg-slate-800 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Google Search Console & Indexing
              </button>
            </div>

            {/* Tab Contents */}
            {activeTab === 'issues' && (
              <IssuesTable
                issues={activeJob.issues}
              />
            )}

            {activeTab === 'pages' && (
              <CrawledPagesTable pages={activeJob.crawledPages} />
            )}

            {activeTab === 'performance' && (
              <PerformanceCard metrics={activeJob.performanceMetrics} />
            )}

            {activeTab === 'gsc' && (
              <IndexingReadinessPanel job={activeJob} />
            )}

            {/* Downloadable Artifacts & Reports */}
            <ArtifactsDownloader job={activeJob} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-200 bg-white py-8 mt-12 text-center text-xs text-neutral-500">
        <p className="font-semibold text-black">AutoIndex AI — Technical SEO Workspace</p>
        <p className="mt-1 text-[11px] text-slate-400">
          Built strictly in accordance with Google Search Central guidelines, W3C standards, and Chrome UX Report metrics.
        </p>
      </footer>

      {/* Modals */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

    </div>
  );
}
