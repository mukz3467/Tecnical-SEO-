import React from 'react';
import { CheckCircle2, AlertTriangle, ExternalLink, Info, Send, ShieldCheck, XCircle } from 'lucide-react';
import { GoogleSearchConsoleStatus, CrawledPage } from '../types.ts';

interface GoogleSearchConsoleCardProps {
  status: GoogleSearchConsoleStatus;
  targetDomain: string;
  pages: CrawledPage[];
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/$/, '');
    return url.toString().replace(/\/$/, url.pathname === '/' ? '/' : '');
  } catch {
    return value;
  }
}

function inspectUrl(propertyUrl: string, pageUrl: string): string {
  const params = new URLSearchParams({ resource_id: propertyUrl, id: pageUrl });
  return `https://search.google.com/search-console/inspect?${params.toString()}`;
}

function getEligibility(page: CrawledPage): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (page.status !== 200) reasons.push(`HTTP status is ${page.status}, not 200`);
  if (page.isNoindex || /noindex/i.test(page.xRobotsTag || '')) reasons.push('A noindex directive was detected');
  if (page.contentType && !page.contentType.toLowerCase().includes('text/html')) reasons.push('Response is not HTML');
  if (page.canonicalUrl && normalizeUrl(page.canonicalUrl) !== normalizeUrl(page.url)) {
    reasons.push('Canonical points to a different URL');
  }
  return { eligible: reasons.length === 0, reasons };
}

export const GoogleSearchConsoleCard: React.FC<GoogleSearchConsoleCardProps> = ({ status, targetDomain, pages }) => {
  const fallbackProperty = `https://${targetDomain}/`;
  const propertyUrl = status.propertyUrl || fallbackProperty;
  const inspectedPages = pages.filter(page => /^https?:\/\//i.test(page.url));
  const eligibleCount = inspectedPages.filter(page => getEligibility(page).eligible).length;
  const blockedCount = inspectedPages.length - eligibleCount;

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-300 flex items-center justify-center shrink-0"><Send className="w-5 h-5" /></div>
            <div>
              <h3 className="text-base font-bold text-white">Google indexing diagnosis</h3>
              <p className="mt-1 text-xs text-slate-400">Separates technical eligibility, real Google inspection results, and sitemap submission status.</p>
            </div>
          </div>
          <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${status.connected && status.isVerified ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
            {status.connected && status.isVerified ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {status.connected && status.isVerified ? 'Search Console connected' : 'Google connection needs attention'}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs text-slate-400">Likely eligible (local checks)</p>
            <div className="mt-2 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-400" /><span className="text-2xl font-bold text-white">{eligibleCount}</span><span className="text-xs text-slate-500">/ {inspectedPages.length} pages</span></div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs text-slate-400">Google URL Inspection</p>
            <div className="mt-2 text-2xl font-bold text-white">{status.inspectionSummary.indexedCount}<span className="ml-1 text-xs font-normal text-slate-400">indexed</span></div>
            <p className="mt-1 text-[11px] text-slate-500">{status.inspectionSummary.totalInspected} URLs with Google results</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs text-slate-400">Needs review</p>
            <div className="mt-2 text-2xl font-bold text-white">{blockedCount}</div>
            <p className="mt-1 text-[11px] text-slate-500">local technical blockers or canonical conflicts</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-200">Search Console property</p>
              <p className="mt-1 break-all text-xs text-slate-400">{propertyUrl}</p>
              <p className="mt-2 text-xs text-slate-300">{status.sitemapSubmissionResult || 'Sitemap has not been confirmed as submitted.'}</p>
            </div>
          </div>
        </div>

        {status.inspectionSummary.coverageIssues.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-300"><AlertTriangle className="h-4 w-4" /> Google/API findings and blockers</p>
            <ul className="space-y-2 text-xs text-slate-300">
              {status.inspectionSummary.coverageIssues.slice(0, 12).map((issue, index) => <li key={index} className="break-words">• {issue}</li>)}
            </ul>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-xs text-slate-300">
          <p className="flex items-start gap-2 font-semibold text-cyan-200"><Info className="mt-0.5 h-4 w-4 shrink-0" /> What “green tick” means</p>
          <p className="mt-2 leading-relaxed">A green tick here means the page passed these preliminary technical checks only: HTTP 200, HTML response, no detected noindex, and no conflicting canonical. It does not mean Google has indexed it. Robots rules, rendering, content quality, duplicate content, and Google’s own systems can still affect indexing.</p>
          <p className="mt-2 leading-relaxed">{status.inspectionSummary.note || 'Google-reported status appears only after a successful URL Inspection API response.'}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h4 className="text-sm font-bold text-white">Page-by-page index readiness</h4>
            <p className="mt-1 text-xs text-slate-400">Use the official Google inspection screen to review a page and, where Google offers it, manually request indexing.</p>
          </div>
          <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 hover:text-cyan-200">Open Search Console <ExternalLink className="h-3.5 w-3.5" /></a>
        </div>

        {inspectedPages.length === 0 ? (
          <p className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-400">Run an audit first to see page-level readiness checks.</p>
        ) : (
          <div className="space-y-2">
            {inspectedPages.slice(0, 50).map(page => {
              const result = getEligibility(page);
              return (
                <div key={page.url} className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-start gap-2">
                      {result.eligible ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />}
                      <p className="break-all text-xs font-medium text-slate-200">{page.url}</p>
                    </div>
                    <p className={`ml-6 mt-1 text-[11px] ${result.eligible ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {result.eligible ? 'Passed preliminary technical checks — not an indexing guarantee' : result.reasons.join(' · ')}
                    </p>
                  </div>
                  <a href={inspectUrl(propertyUrl, page.url)} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-400 hover:text-cyan-200">
                    Inspect in Google <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-relaxed text-slate-300">
        <p className="font-semibold text-amber-200">Important: indexing cannot be guaranteed within 24 hours.</p>
        <p className="mt-1">Google does not provide a public API for triggering the Search Console “Request indexing” action for ordinary pages. This tool can submit the sitemap through the supported Search Console API and show real URL Inspection results; the official inspection link lets you request indexing manually when Google makes that option available. Google may take longer than 24 hours, and a request never guarantees inclusion.</p>
        <p className="mt-2 text-slate-400">Indexing API policy: {status.indexingApiStatus.notice}</p>
      </div>
    </section>
  );
};
