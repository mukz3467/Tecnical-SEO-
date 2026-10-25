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
import { Activity, AlertCircle, ArrowRight, ArrowUpRight, BarChart3, CheckCircle2, CircleHelp, Clock3, FileSearch, Gauge, Globe, LayoutDashboard, Link2, ListChecks, LoaderCircle, Search, Settings, ShieldCheck, Sparkles, Zap, Bug, Code2, ChartNoAxesCombined } from 'lucide-react';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, target: 'dashboard' },
  { label: 'Site Audit', icon: Search, target: 'audit-launcher' },
  { label: 'Indexing', icon: FileSearch, target: 'audit-results' },
  { label: 'Crawling', icon: Globe, target: 'audit-results' },
  { label: 'Keyword Suggestions', icon: Sparkles, target: 'suggestions' },
  { label: 'Content Optimization', icon: Code2, target: 'suggestions' },
  { label: 'Backlinks', icon: Link2, target: 'suggestions' },
  { label: 'Auto SEO', icon: Zap, target: 'auto-seo' },
  { label: 'Reports', icon: BarChart3, target: 'audit-results' },
];

export default function App() {
  const [jobs, setJobs] = useState<AuditJob[]>([]);
  const [activeJob, setActiveJob] = useState<AuditJob | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'issues' | 'pages' | 'performance' | 'gsc'>('gsc');
  const [activeNav, setActiveNav] = useState('Dashboard');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [targetUrl, setTargetUrl] = useState('https://universal-respiratory.vercel.app');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollFailuresRef = useRef(0);

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const data: AuditJob[] = await res.json();
        setJobs(data);
        setActiveJob(current => current || data[0] || null);
        if (data[0]?.targetUrl) setTargetUrl(data[0].targetUrl);
      }
    } catch { /* API may be unavailable before the first audit. */ }
  };

  useEffect(() => { fetchJobs(); }, []);

  useEffect(() => {
    if (!activeJob) return;
    const running = !['completed', 'failed', 'cancelled'].includes(activeJob.status);
    if (running) {
      pollingRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/jobs/${activeJob.id}`);
          if (!res.ok) {
            pollFailuresRef.current += 1;
            if (res.status === 404) {
              const msg = 'Audit progress could not be retrieved from the server. This deployment may need shared persistent job storage.';
              setErrorBanner(msg);
              setActiveJob(prev => prev && prev.id === activeJob.id ? { ...prev, status: 'failed', error: msg } : prev);
              return;
            }
            if (pollFailuresRef.current >= 3) setErrorBanner(`Unable to read audit progress (HTTP ${res.status}).`);
            return;
          }
          pollFailuresRef.current = 0;
          const updated: AuditJob = await res.json();
          setActiveJob(updated);
          setJobs(prev => prev.map(j => j.id === updated.id ? updated : j));
        } catch {
          pollFailuresRef.current += 1;
          if (pollFailuresRef.current >= 3) setErrorBanner('Network error while checking audit progress. Check your connection.');
        }
      }, 1200);
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
    };
  }, [activeJob?.id, activeJob?.status]);

  const handleStartAudit = async (params: {
    targetUrl: string; sitemapUrl?: string; customUrls?: string[];
    autoFixEnabled: boolean; connectedSourceMode: AuditJob['connectedSourceMode'];
  }) => {
    setIsStarting(true); setErrorBanner(null); setTargetUrl(params.targetUrl);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params)
      });
      const body = await res.text();
      let data: any = null;
      try { data = body ? JSON.parse(body) : null; } catch { /* handled below */ }
      if (!res.ok) throw new Error(`Could not start audit (HTTP ${res.status}): ${data?.error || body.slice(0, 250) || 'Unknown server error'}`);
      if (!data?.id) throw new Error('Audit API returned an invalid response.');
      setActiveJob(data as AuditJob);
      setJobs(prev => [data as AuditJob, ...prev]);
      setActiveTab('gsc');
      document.getElementById('audit-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally { setIsStarting(false); }
  };

  const running = activeJob ? !['completed', 'failed', 'cancelled'].includes(activeJob.status) : false;
  const crawled = activeJob?.summary.totalCrawled ?? null;
  const discovered = activeJob?.summary.totalDiscovered ?? null;
  const issueCount = activeJob?.issues.length ?? null;
  const criticalCount = activeJob?.summary.criticalCount ?? null;
  const inspected = activeJob?.searchConsoleStatus.inspectionSummary.totalInspected ?? null;
  const health = typeof activeJob?.performanceMetrics?.score === 'number' ? activeJob.performanceMetrics.score : null;
  const pages = activeJob?.crawledPages ?? [];
  const suggestions = activeJob?.issues.slice(0, 5) ?? [];
  const scrollTo = (id: string, label?: string) => {
    if (label) setActiveNav(label);
    if (id === 'audit-results') setActiveTab(label === 'Indexing' ? 'gsc' : label === 'Crawling' ? 'pages' : label === 'Reports' ? 'issues' : activeTab);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div id="dashboard" className="seo-app min-h-screen flex font-sans">
      <aside className="seo-sidebar">
        <a href="#dashboard" className="seo-brand">
          <span className="brand-rocket">↗</span>
          <span><strong>Universal Respiratory</strong><small>Make Your Website Reach Everyone</small></span>
        </a>
        <nav className="seo-nav" aria-label="Main navigation">
          {navItems.map(item => {
            const Icon = item.icon;
            return <button key={item.label} className={`seo-nav-item ${activeNav === item.label ? 'active' : ''}`} onClick={() => scrollTo(item.target, item.label)}>
              <Icon size={17} /><span>{item.label}</span>
            </button>;
          })}
          <button className="seo-nav-item" onClick={() => setIsSettingsOpen(true)}><Settings size={17}/><span>Settings</span></button>
        </nav>
        <div className="seo-sidebar-promo">
          <div className="promo-art"><Zap size={42}/><span>↑</span></div>
          <strong>Rank Higher<br/>Get More Traffic<br/>Grow Your Business</strong>
          <button onClick={() => scrollTo('auto-seo')}>✦ Explore Auto SEO</button>
        </div>
        <div className="sidebar-foot"><span className="live-dot"/> SEO tools workspace</div>
      </aside>

      <div className="seo-main-column">
        <Header onOpenSettings={() => setIsSettingsOpen(true)} activeJobId={activeJob?.id} isProcessing={running}/>
        <main className="seo-main">
          {errorBanner && <div className="error-banner"><AlertCircle size={17}/><span>{errorBanner}</span><button onClick={() => setErrorBanner(null)}>Dismiss</button></div>}

          <section className="welcome-panel">
            <div className="welcome-copy">
              <div className="eyebrow"><span className="live-dot"/> TECHNICAL SEO CONTROL CENTER</div>
              <h1>Welcome Back! <span className="wave">👋</span></h1>
              <p>Your website performance at a glance. Keep optimizing for even better results.</p>
              <form className="url-analyze" onSubmit={e => { e.preventDefault(); scrollTo('audit-launcher', 'Site Audit'); }}>
                <Search size={17}/><input aria-label="Website URL" value={targetUrl} onChange={e => setTargetUrl(e.target.value)} placeholder="Enter your website URL"/>
                <button type="submit" disabled={isStarting || running}>{isStarting || running ? <LoaderCircle className="spin" size={16}/> : <ChartNoAxesCombined size={16}/>} Analyze Site</button>
              </form>
              <div className="welcome-meta">
                <span><Clock3 size={13}/> {activeJob ? `Last audit: ${new Date(activeJob.startedAt).toLocaleString()}` : 'No audit run yet'}</span>
                <span className={activeJob?.status === 'completed' ? 'good-text' : ''}><span className={`status-dot ${activeJob?.status === 'completed' ? 'good' : ''}`}/>{activeJob?.status === 'completed' ? 'Latest audit completed' : running ? 'Audit in progress' : activeJob ? activeJob.status : 'Awaiting first audit'}</span>
              </div>
            </div>
            <div className="welcome-visual" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="rocket-window"><ChartNoAxesCombined size={72}/><span className="rocket">🚀</span></div><div className="visual-caption"><strong>Better SEO</strong><strong>Bigger Opportunities <span>↗</span></strong></div></div>
          </section>

          <div id="audit-launcher" className="audit-launcher-wrap"><AuditLauncher onStartAudit={handleStartAudit} isLoading={isStarting || running}/></div>

          <section className="metric-grid" aria-label="SEO overview metrics">
            <article className="metric-card metric-green"><div className="metric-top"><span className="metric-icon">G</span><strong>Indexing</strong><span className="metric-symbol">↗</span></div><div className="metric-value">{inspected === null ? '—' : inspected}<small>{inspected === null ? 'Not checked' : 'URLs inspected'}</small></div><div className="metric-bottom"><span>{activeJob ? 'Google API inspection count' : 'Run an audit to populate'}</span><button onClick={() => scrollTo('audit-results','Indexing')}>View Details <ArrowRight size={14}/></button></div></article>
            <article className="metric-card metric-blue"><div className="metric-top"><span className="metric-icon"><Bug size={21}/></span><strong>Crawling</strong><span className="metric-symbol">↗</span></div><div className="metric-value">{crawled === null ? '—' : crawled}<small>{discovered === null ? 'Pages crawled' : `of ${discovered} discovered`}</small></div><div className="metric-bottom"><span>{activeJob ? 'Latest crawl results' : 'No crawl data yet'}</span><button onClick={() => scrollTo('audit-results','Crawling')}>View Details <ArrowRight size={14}/></button></div></article>
            <article className="metric-card metric-purple"><div className="metric-top"><span className="metric-icon"><ShieldCheck size={21}/></span><strong>Health Score</strong><span className="metric-symbol">◈</span></div><div className="score-wrap"><div className="score-ring" style={{'--score': `${health ?? 0}%`} as React.CSSProperties}><span>{health === null ? '—' : `${health}%`}</span></div><div><strong>{health === null ? 'Not measured' : health >= 90 ? 'Excellent' : health >= 70 ? 'Good' : 'Needs work'}</strong><small>{health === null ? 'Run performance audit' : 'Measured score'}</small></div></div><div className="metric-bottom"><span>{health === null ? 'No fabricated score' : 'Latest available measurement'}</span><button onClick={() => scrollTo('audit-results','Reports')}>View Report <ArrowRight size={14}/></button></div></article>
            <article className="metric-card metric-amber"><div className="metric-top"><span className="metric-icon"><AlertCircle size={21}/></span><strong>Issues Found</strong><span className="metric-symbol">!</span></div><div className="metric-value">{issueCount === null ? '—' : issueCount}<small>{criticalCount === null ? 'Suggestions to fix' : `${criticalCount} critical issues`}</small></div><div className="metric-bottom"><span>{activeJob ? 'Prioritized audit findings' : 'Waiting for site audit'}</span><button onClick={() => scrollTo('audit-results','Reports')}>View Issues <ArrowRight size={14}/></button></div></article>
            <article className="metric-card metric-teal"><div className="metric-top"><span className="metric-icon"><Zap size={21}/></span><strong>Auto SEO</strong><span className="metric-symbol">✦</span></div><div className="auto-status"><span className="status-dot"/><strong>Ready to configure</strong></div><p className="auto-description">Review suggested improvements before applying changes.</p><div className="metric-bottom"><span>Manual review recommended</span><button onClick={() => scrollTo('auto-seo')}>Manage <ArrowRight size={14}/></button></div></article>
          </section>

          <section className="dashboard-columns">
            <div className="dashboard-left">
              <article className="panel performance-panel">
                <div className="panel-heading"><div><h2>Performance Overview</h2><p>Latest crawl data and progress</p></div><div className="chart-legend"><span><i className="legend-green"/> Indexed / verified</span><span><i className="legend-blue"/> Crawled</span></div></div>
                {activeJob && pages.length ? <div className="chart-summary"><div><small>Discovered URLs</small><strong>{discovered ?? '—'}</strong></div><div><small>Crawled URLs</small><strong>{crawled ?? '—'}</strong></div><div><small>Audit issues</small><strong>{issueCount ?? '—'}</strong></div><div><small>Critical</small><strong>{criticalCount ?? '—'}</strong></div></div> : <div className="empty-chart"><div className="chart-grid"><span/><span/><span/><span/><span/></div><ChartNoAxesCombined size={34}/><strong>Performance history will appear here</strong><p>Run a site audit to view actual crawl and performance measurements.</p><button onClick={() => scrollTo('audit-launcher','Site Audit')}>Start Site Audit <ArrowRight size={14}/></button></div>}
              </article>
              <article className="panel page-status-panel">
                <div className="panel-heading"><div><h2>Page Status</h2><p>URLs found in the latest crawl</p></div><button className="text-action" onClick={() => scrollTo('audit-results','Crawling')}>View All <ArrowUpRight size={14}/></button></div>
                {pages.length ? <div className="page-status-list">{pages.slice(0,5).map((page:any, i:number) => <div className="page-status-row" key={page.url || i}><CheckCircle2 size={17}/><div><strong>{page.url || page.path || `Page ${i+1}`}</strong><small>{page.title || page.statusCode || 'Crawled URL'}</small></div><span className="status-pill">{page.statusCode || page.status || 'Crawled'}</span></div>)}</div> : <div className="empty-state"><Globe size={22}/><span>Page statuses appear after a crawl completes.</span></div>}
              </article>
            </div>

            <div className="dashboard-middle">
              <article className="panel quick-actions-panel"><div className="panel-heading"><div><h2>Quick Actions</h2><p>Jump straight into a task</p></div></div>
                <button className="quick-action action-blue" onClick={() => scrollTo('audit-results','Indexing')}><span><span className="action-icon">G</span><span><strong>Request / Check Indexing</strong><small>Review available Google indexing data</small></span></span><ArrowRight size={17}/></button>
                <button className="quick-action action-cyan" onClick={() => scrollTo('audit-launcher','Site Audit')}><span><span className="action-icon"><Search size={18}/></span><span><strong>Run Site Audit</strong><small>Check technical SEO issues and health</small></span></span><ArrowRight size={17}/></button>
                <button className="quick-action action-amber" onClick={() => scrollTo('suggestions')}><span><span className="action-icon"><Sparkles size={18}/></span><span><strong>Get Suggestions</strong><small>Prioritize evidence-based improvements</small></span></span><ArrowRight size={17}/></button>
                <button className="quick-action action-teal" onClick={() => scrollTo('suggestions')}><span><span className="action-icon"><Code2 size={18}/></span><span><strong>Optimize Content</strong><small>Review page titles and metadata</small></span></span><ArrowRight size={17}/></button>
                <button className="quick-action action-green" onClick={() => scrollTo('auto-seo')}><span><span className="action-icon"><Zap size={18}/></span><span><strong>Auto SEO</strong><small>Review automated workflow options</small></span></span><ArrowRight size={17}/></button>
              </article>
              <article id="suggestions" className="panel suggestions-panel"><div className="panel-heading"><div><h2>Top SEO Suggestions</h2><p>Issues from the latest audit</p></div><Sparkles size={18}/></div>
                {suggestions.length ? suggestions.map((issue:any, i:number) => <div className="suggestion-row" key={issue.id || issue.title || i}><span className={`suggestion-number sev-${String(issue.severity || 'medium').toLowerCase()}`}>{i+1}</span><div><strong>{issue.title || issue.type || 'Technical SEO issue'}</strong><small>{issue.description || issue.recommendation || 'Review the finding in the audit report.'}</small></div><span className="priority-pill">{issue.severity || 'Review'}</span></div>) : <div className="empty-state"><CircleHelp size={22}/><span>Run an audit to get prioritized recommendations based on real findings.</span></div>}
              </article>
            </div>

            <div className="dashboard-right">
              <article className="panel gsc-panel"><div className="gsc-title"><span className="google-g">G</span><div><h2>Google Search Console</h2><span className={activeJob?.searchConsoleStatus ? 'connected-label' : 'neutral-label'}><span className="status-dot"/>{activeJob?.searchConsoleStatus ? 'Status returned by audit' : 'Connection not verified'}</span></div></div>
                <div className="detail-line"><Globe size={14}/><div><small>Property / target</small><span>{activeJob?.targetUrl || targetUrl || 'Not configured'}</span></div></div>
                <div className="detail-line"><ShieldCheck size={14}/><div><small>Indexing checks</small><span>{inspected === null ? 'Not available yet' : `${inspected} URL(s) inspected`}</span></div></div>
                <div className="detail-line"><Clock3 size={14}/><div><small>Latest audit</small><span>{activeJob ? new Date(activeJob.startedAt).toLocaleString() : 'No audit yet'}</span></div></div>
                <button className="gsc-button" onClick={() => scrollTo('audit-results','Indexing')}>View Indexing Report <ArrowUpRight size={14}/></button>
              </article>
              <article className="panel recent-panel"><div className="panel-heading"><div><h2>Recent Audit Runs</h2><p>Latest saved jobs</p></div></div>
                {jobs.length ? jobs.slice(0,5).map(job => <button className="recent-row" key={job.id} onClick={() => {setActiveJob(job); scrollTo('audit-results','Reports');}}><span className={`recent-check ${job.status === 'completed' ? 'complete' : ''}`}>{job.status === 'completed' ? <CheckCircle2 size={15}/> : <Activity size={15}/>}</span><span><strong>{job.targetDomain || job.targetUrl}</strong><small>{job.status} · {new Date(job.startedAt).toLocaleDateString()}</small></span><ArrowUpRight size={14}/></button>) : <div className="empty-state compact"><Clock3 size={20}/><span>No saved audit requests yet.</span></div>}
              </article>
            </div>
          </section>

          <section id="auto-seo" className="auto-seo-banner"><div className="auto-banner-icon"><Zap size={30}/></div><div className="auto-banner-copy"><strong>Technical SEO, organized for you</strong><p>Run evidence-based audits, monitor crawl findings, and review recommendations. Changes are not applied automatically unless a supported integration explicitly performs them.</p><button onClick={() => scrollTo('audit-launcher','Site Audit')}>Run a fresh SEO audit <ArrowRight size={15}/></button></div><div className="auto-feature"><ShieldCheck size={20}/><strong>Verified findings</strong><small>Audit-derived data</small></div><div className="auto-feature"><Sparkles size={20}/><strong>Smart suggestions</strong><small>Prioritized issues</small></div><div className="auto-feature"><Activity size={20}/><strong>Monitoring</strong><small>Latest saved runs</small></div></section>

          {activeJob && <div id="audit-results" className="audit-details-section">
            <div className="detail-section-heading"><div><span className="eyebrow">AUDIT DETAILS</span><h2>Latest Technical SEO Report</h2></div><span className="report-status"><span className="status-dot"/>{activeJob.status}</span></div>
            <LiveProgressCard job={activeJob}/>
            <SummaryCards job={activeJob}/>
            <div className="report-tabs">
              {([{id:'issues',label:`Issues & Remediation (${activeJob.issues.length})`},{id:'pages',label:`Crawled URLs (${activeJob.crawledPages.length})`},{id:'performance',label:'Core Web Vitals & Speed'},{id:'gsc',label:'Search Console & Indexing'}] as const).map(tab => <button key={tab.id} className={activeTab===tab.id?'selected':''} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
            </div>
            {activeTab==='issues' && <IssuesTable issues={activeJob.issues}/>}
            {activeTab==='pages' && <CrawledPagesTable pages={activeJob.crawledPages}/>}
            {activeTab==='performance' && <PerformanceCard metrics={activeJob.performanceMetrics}/>}
            {activeTab==='gsc' && <IndexingReadinessPanel job={activeJob}/>}
            <ArtifactsDownloader job={activeJob}/>
          </div>}
          <footer className="seo-footer"><span>✦ Universal Respiratory <small>SEO tools for a better tomorrow</small></span><span><i className="live-dot"/> Dashboard ready · Made for your success</span></footer>
        </main>
      </div>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)}/>
    </div>
  );
}
