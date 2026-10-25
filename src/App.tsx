import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header.tsx';
import { AuditLauncher } from './components/AuditLauncher.tsx';
import { LiveProgressCard } from './components/LiveProgressCard.tsx';
import { SummaryCards } from './components/SummaryCards.tsx';
import { IssuesTable } from './components/IssuesTable.tsx';
import { PerformanceCard } from './components/PerformanceCard.tsx';
import { GoogleSearchConsoleCard } from './components/GoogleSearchConsoleCard.tsx';
import { CrawledPagesTable } from './components/CrawledPagesTable.tsx';
import { ArtifactsDownloader } from './components/ArtifactsDownloader.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { AuditJob } from './types.ts';
import { History, AlertCircle } from 'lucide-react';

export default function App() {
  const [jobs, setJobs] = useState<AuditJob[]>([]);
  const [activeJob, setActiveJob] = useState<AuditJob | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'issues' | 'pages' | 'performance' | 'gsc'>('gsc');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const pollFailuresRef = useRef(0);

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const data: AuditJob[] = await res.json();
        setJobs(data);
        if (!activeJob && data.length > 0) setActiveJob(data[0]);
      }
    } catch {
      // Ignore transient startup/network failures; the launcher remains available.
    }
  };

  useEffect(() => { fetchJobs(); }, []);

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
              setActiveJob(prev => prev && prev.id === activeJob.id ? { ...prev, status: 'failed', error: lostMessage, currentStage: 'Stopped: server could not retrieve this audit job.' } : prev);
              setJobs(prev => prev.map(j => j.id === activeJob.id ? { ...j, status: 'failed', error: lostMessage, currentStage: 'Stopped: server could not retrieve this audit job.' } : j));
              return;
            }
            if (pollFailuresRef.current >= 3) setErrorBanner(`Unable to read audit progress (HTTP ${res.status}). The crawl may still be running, but the dashboard cannot confirm its status.`);
            return;
          }
          pollFailuresRef.current = 0;
          const updated: AuditJob = await res.json();
          setActiveJob(updated);
          setJobs(prev => prev.map(j => j.id === updated.id ? updated : j));
        } catch {
          pollFailuresRef.current += 1;
          if (pollFailuresRef.current >= 3) setErrorBanner('Network error while checking audit progress. Check your connection and reload the page.');
        }
      }, 1200);
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
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
      try { responseData = responseText ? JSON.parse(responseText) : null; } catch { /* Non-JSON server error */ }
      if (!res.ok) {
        const serverMessage = (responseData && typeof responseData.error === 'string' && responseData.error) || (responseText && responseText.slice(0, 300)) || 'No error details were returned by the server.';
        throw new Error(`Could not start audit (HTTP ${res.status}): ${serverMessage}`);
      }
      if (!responseData || typeof responseData !== 'object' || !responseData.id) {
        throw new Error(`Audit API returned an invalid response (HTTP ${res.status}). ${responseText.slice(0, 300) || 'The response was empty.'}`);
      }
      const newJob: AuditJob = responseData as AuditJob;
      setActiveJob(newJob);
      setJobs(prev => [newJob, ...prev]);
      setActiveTab('gsc');
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setIsStarting(false);
    }
  };

  const isPipelineActive = activeJob ? !['completed', 'failed', 'cancelled'].includes(activeJob.status) : false;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      <Header onOpenSettings={() => setIsSettingsOpen(true)} activeJobId={activeJob?.id} isProcessing={isPipelineActive} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {errorBanner && (
          <div role="alert" className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0 text-rose-400" /><span>{errorBanner}</span></div>
            <button onClick={() => setErrorBanner(null)} className="text-rose-400 hover:text-white font-bold ml-4">Dismiss</button>
          </div>
        )}
        <AuditLauncher onStartAudit={handleStartAudit} isLoading={isStarting || isPipelineActive} />

        {jobs.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <span className="text-slate-400 flex items-center gap-1 shrink-0 font-medium"><History className="w-3.5 h-3.5" /> Audit Runs:</span>
            {jobs.map(j => (
              <button key={j.id} onClick={() => setActiveJob(j)} className={`px-3 py-1.5 rounded-lg font-mono shrink-0 transition flex items-center gap-1.5 border ${activeJob?.id === j.id ? 'bg-slate-800 border-emerald-500/40 text-emerald-300' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'}`}>
                <span className={`w-2 h-2 rounded-full ${j.status === 'failed' ? 'bg-rose-400' : j.status === 'completed' ? 'bg-emerald-400' : 'bg-cyan-400'}`} />
                <span className="truncate max-w-[140px]">{j.targetDomain}</span>
                <span className="text-[10px] text-slate-500">{new Date(j.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </button>
            ))}
          </div>
        )}

        {activeJob && (
          <div className="space-y-6">
            <LiveProgressCard job={activeJob} />
            <SummaryCards job={activeJob} />
            <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-800 pb-2 text-xs font-medium">
              {([
                ['issues', `Issues & Remediation (${activeJob.issues.length})`],
                ['pages', `Crawled URLs (${activeJob.crawledPages.length})`],
                ['performance', 'Core Web Vitals & Speed'],
                ['gsc', 'Google Indexing Diagnosis']
              ] as const).map(([tab, label]) => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={`shrink-0 px-3.5 py-2 rounded-xl transition ${activeTab === tab ? 'bg-slate-800 text-white font-bold shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>{label}</button>
              ))}
            </div>
            {activeTab === 'issues' && <IssuesTable issues={activeJob.issues} />}
            {activeTab === 'pages' && <CrawledPagesTable pages={activeJob.crawledPages} />}
            {activeTab === 'performance' && <PerformanceCard metrics={activeJob.performanceMetrics} />}
            {activeTab === 'gsc' && <GoogleSearchConsoleCard status={activeJob.searchConsoleStatus} targetDomain={activeJob.targetDomain} pages={activeJob.crawledPages} />}
            <ArtifactsDownloader job={activeJob} />
          </div>
        )}
        {!activeJob && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300"><ShieldCheckFallback /></div>
            <h2 className="text-lg font-bold text-white">Find out why Google may not index your pages</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-400">Enter your website above to crawl it, identify technical blockers, review page readiness, and open Google’s official URL Inspection tool for manual indexing requests.</p>
          </div>
        )}
      </main>
      <footer className="border-t border-slate-900 bg-slate-950 py-6 mt-12 text-center text-xs text-slate-500">
        <p>AutoIndex AI — Technical SEO & Indexing Diagnosis</p>
        <p className="mt-1 text-[11px] text-slate-400">Google-reported status is shown only when confirmed by Search Console. Indexing time and inclusion are not guaranteed.</p>
      </footer>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}

function ShieldCheckFallback() {
  return <span className="text-xl" aria-hidden="true">✓</span>;
}
