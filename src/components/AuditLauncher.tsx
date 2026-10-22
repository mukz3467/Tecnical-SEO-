import React, { useState } from 'react';
import { Play, Globe, Sliders, ShieldCheck, FileCode2, Info } from 'lucide-react';
import { AuditJob } from '../types.ts';

interface AuditLauncherProps {
  onStartAudit: (params: {
    targetUrl: string;
    sitemapUrl?: string;
    customUrls?: string[];
    autoFixEnabled: boolean;
    connectedSourceMode: AuditJob['connectedSourceMode'];
  }) => void;
  isLoading: boolean;
}

export const AuditLauncher: React.FC<AuditLauncherProps> = ({ onStartAudit, isLoading }) => {
  const [targetUrl, setTargetUrl] = useState('');
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [customUrlsRaw, setCustomUrlsRaw] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [validationError, setValidationError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = targetUrl.trim();
    if (!raw) return;
    let parsed: URL;
    try {
      parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) {
        throw new Error('Enter a public website domain or full http(s) URL.');
      }
    } catch {
      setValidationError('Enter a valid public website domain, for example https://example.com.');
      return;
    }
    setValidationError('');
    const customUrls = customUrlsRaw.split('\n').map(u => u.trim()).filter(Boolean);
    onStartAudit({
      targetUrl: parsed.toString(),
      sitemapUrl: sitemapUrl.trim() || undefined,
      customUrls: customUrls.length ? customUrls : undefined,
      autoFixEnabled: true,
      connectedSourceMode: 'download_patch_only'
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="mb-6 relative z-10">
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Technical SEO Audit & Remediation Planner</h1>
        <p className="text-sm text-slate-400 mt-2">
          Crawl a real public website, inspect crawlability and on-page signals, check sitemap/robots, and report verified findings with evidence.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">Website URL / Domain</label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500"><Globe className="w-4 h-4" /></div>
              <input
                type="url"
                required
                placeholder="https://example.com"
                value={targetUrl}
                onChange={e => { setTargetUrl(e.target.value); setValidationError(''); }}
                className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />
            </div>
            <button type="submit" disabled={isLoading} className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition disabled:opacity-50 shrink-0">
              {isLoading ? <><div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" /><span>Running audit…</span></> : <><Play className="w-4 h-4 fill-current" /><span>Run Technical SEO Audit</span></>}
            </button>
          </div>
          {validationError && <p role="alert" className="text-xs text-rose-300 mt-2">{validationError}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300"><FileCode2 className="w-3.5 h-3.5 text-cyan-400" /> Remediation output</div>
            <p className="text-[11px] text-slate-400 mt-2">Creates a downloadable patch/artifact for review. This app does not write to a third-party website or deploy changes without a separately connected and authorized source integration.</p>
          </div>
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Remediation mode: review-only</div>
            <p className="text-[11px] text-slate-400 mt-2">The audit prepares candidate snippets and an evidence report. Live source edits, auto-deploy, and rollback are not enabled in this deployment.</p>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20 flex gap-2 text-[11px] text-slate-400">
          <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <p>Google Search Console sitemap submission and URL inspection run only when valid server-side credentials are configured and the service account has access to the exact property. Google does not provide a public API for the manual Request Indexing button on ordinary pages.</p>
        </div>

        <div>
          <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="text-xs text-slate-400 hover:text-slate-200 font-medium flex items-center gap-1 transition">
            <Sliders className="w-3.5 h-3.5" /><span>{showAdvanced ? 'Hide advanced options' : 'Advanced sitemap & seed URLs'}</span>
          </button>
          {showAdvanced && <div className="mt-3 p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Optional sitemap URL</label>
              <input type="url" placeholder="https://example.com/sitemap.xml" value={sitemapUrl} onChange={e => setSitemapUrl(e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Optional seed URLs (one URL per line)</label>
              <textarea rows={3} placeholder={'https://example.com/priority-page-1\nhttps://example.com/priority-page-2'} value={customUrlsRaw} onChange={e => setCustomUrlsRaw(e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
            </div>
          </div>}
        </div>
      </form>
    </div>
  );
};
