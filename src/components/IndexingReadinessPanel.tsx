import React from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, ExternalLink, FileSearch, Globe, ListChecks, XCircle } from 'lucide-react';
import { AuditJob } from '../types.ts';
import { GoogleSearchConsoleCard } from './GoogleSearchConsoleCard.tsx';

interface Props { job: AuditJob }

type Check = { label: string; ok: boolean | null; detail: string };

function getChecks(job: AuditJob): Check[] {
  const pages = job.crawledPages || [];
  const successful = pages.filter(page => page.status >= 200 && page.status < 300);
  const noindex = pages.filter(page => page.isNoindex);
  const canonicalMissing = pages.filter(page => !page.canonicalUrl);
  const sitemap = job.sitemapInfo;
  const robots = job.robotsTxtInfo;
  const gsc = job.searchConsoleStatus;

  return [
    {
      label: 'Google Search Console access',
      ok: gsc.connected && gsc.isVerified,
      detail: gsc.connected && gsc.isVerified
        ? `Google API accessed property ${gsc.propertyUrl || 'for this site'}.`
        : 'Google API has not confirmed access to the matching Search Console property. Check server credentials and property permissions.'
    },
    {
      label: 'Sitemap reachable and valid',
      ok: sitemap ? sitemap.exists && sitemap.errors.length === 0 && sitemap.urlCount > 0 : null,
      detail: !sitemap ? 'No sitemap result is available from this audit yet.' :
        sitemap.exists && sitemap.errors.length === 0 && sitemap.urlCount > 0
          ? `${sitemap.urlCount} URL(s) found in the sitemap.`
          : `Sitemap issue: ${[...sitemap.errors, ...sitemap.warnings].slice(0, 2).join(' ') || 'No URLs were found.'}`
    },
    {
      label: 'Pages return successful HTTP status',
      ok: pages.length ? successful.length === pages.length : null,
      detail: pages.length ? `${successful.length} of ${pages.length} crawled pages returned a 2xx response.` : 'No crawled pages are available yet.'
    },
    {
      label: 'No accidental noindex directives',
      ok: pages.length ? noindex.length === 0 : null,
      detail: pages.length ? noindex.length === 0
        ? 'No noindex directive was detected on the crawled pages.'
        : `Found noindex on ${noindex.length} page(s): ${noindex.slice(0, 3).map(p => p.url).join(', ')}`
        : 'Run a crawl to check robots meta and X-Robots-Tag directives.'
    },
    {
      label: 'Canonical URLs present',
      ok: pages.length ? canonicalMissing.length === 0 : null,
      detail: pages.length ? canonicalMissing.length === 0
        ? 'All crawled pages expose a canonical URL.'
        : `${canonicalMissing.length} page(s) have no detected canonical URL. Review these before requesting indexing.`
        : 'Run a crawl to check canonical tags.'
    },
    {
      label: 'robots.txt reviewed',
      ok: robots ? robots.exists && robots.errors.length === 0 : null,
      detail: !robots ? 'No robots.txt result is available yet.' :
        robots.exists && robots.errors.length === 0
          ? 'robots.txt was fetched without parser errors. Confirm important paths are not disallowed.'
          : 'robots.txt is missing or could not be parsed. Check that it does not block important pages.'
    },
    {
      label: 'Google accepted sitemap submission',
      ok: gsc.sitemapSubmitted,
      detail: gsc.sitemapSubmissionResult || 'No successful sitemap submission has been confirmed by Google yet.'
    }
  ];
}

export const IndexingReadinessPanel: React.FC<Props> = ({ job }) => {
  const checks = getChecks(job);
  const blockers = checks.filter(check => check.ok === false);
  const unknown = checks.filter(check => check.ok === null);
  const passed = checks.filter(check => check.ok === true).length;
  const targetUrl = job.crawledPages.find(page => page.status === 200 && !page.isNoindex)?.url || job.targetUrl;
  const propertyUrl = job.searchConsoleStatus.propertyUrl;
  const inspectionLink = propertyUrl
    ? `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(propertyUrl)}&id=${encodeURIComponent(targetUrl)}`
    : 'https://search.google.com/search-console';

  const statusLabel = blockers.length === 0 && unknown.length === 0
    ? 'Technical checks passed'
    : blockers.length > 0
      ? 'Fix blockers before requesting indexing'
      : 'More checks needed';

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-300 flex items-center justify-center">
              <ListChecks className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Google Indexing Readiness</h2>
              <p className="text-xs text-slate-400 mt-1">Evidence-based checks for this audited website. A pass means technically ready to request, not a promise that Google will index it.</p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${blockers.length === 0 && unknown.length === 0 ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
            {blockers.length === 0 && unknown.length === 0 ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {statusLabel}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <p className="text-[11px] text-slate-400">Checks passed</p>
            <p className="text-2xl font-bold text-white mt-1">{passed}<span className="text-sm text-slate-500">/{checks.length}</span></p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <p className="text-[11px] text-slate-400">Potential blockers</p>
            <p className="text-2xl font-bold text-white mt-1">{blockers.length}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 col-span-2 sm:col-span-1">
            <p className="text-[11px] text-slate-400">Google URLs inspected</p>
            <p className="text-2xl font-bold text-white mt-1">{job.searchConsoleStatus.inspectionSummary.totalInspected}</p>
          </div>
        </div>

        <div className="space-y-2">
          {checks.map((check) => (
            <div key={check.label} className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <div className="mt-0.5 shrink-0">
                {check.ok === true ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
                  check.ok === false ? <XCircle className="w-4 h-4 text-rose-400" /> :
                    <CircleHelp className="w-4 h-4 text-slate-500" />}
              </div>
              <div className="min-w-0">
                <p className={`text-xs font-semibold ${check.ok === true ? 'text-emerald-300' : check.ok === false ? 'text-rose-300' : 'text-slate-300'}`}>{check.label}</p>
                <p className="text-[11px] leading-relaxed text-slate-400 mt-1 break-words">{check.detail}</p>
              </div>
            </div>
          ))}
        </div>

        {blockers.length > 0 && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
            <h3 className="text-xs font-bold text-rose-300 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Suggested next actions</h3>
            <ol className="mt-2 list-decimal pl-5 space-y-1.5 text-xs text-slate-300">
              {blockers.map(item => <li key={item.label}>{item.label}: {item.detail}</li>)}
            </ol>
          </div>
        )}

        {job.searchConsoleStatus.inspectionSummary.coverageIssues.length > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <h3 className="text-xs font-bold text-amber-300 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Google-reported indexing issues</h3>
            <ul className="mt-2 list-disc pl-5 space-y-1.5 text-xs text-slate-300 break-words">
              {job.searchConsoleStatus.inspectionSummary.coverageIssues.slice(0, 20).map((issue, index) => <li key={issue + index}>{issue}</li>)}
            </ul>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <a href={inspectionLink} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-xs font-bold text-slate-950 hover:bg-emerald-300 transition">
            <FileSearch className="w-4 h-4" /> Open Google URL Inspection <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <a href="https://search.google.com/search-console/sitemaps" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-xs font-semibold text-slate-200 hover:border-slate-500 transition">
            <Globe className="w-4 h-4" /> Open Sitemaps in Search Console <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-500">Google does not expose the ordinary-page “Request indexing” button as a public API. The first link opens URL Inspection for the selected page; if Google allows it, click Request indexing there. A request can take days or longer and is not guaranteed to be processed within 24 hours.</p>
      </section>

      <GoogleSearchConsoleCard status={job.searchConsoleStatus} targetDomain={job.targetDomain} />
    </div>
  );
};
