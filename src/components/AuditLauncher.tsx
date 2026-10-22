import React, { useState } from 'react';
import { Play, Sparkles, Globe, Sliders, CheckCircle2, ShieldAlert, FileCode2, ArrowRight } from 'lucide-react';
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
  const [targetUrl, setTargetUrl] = useState('https://sandbox.local');
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [customUrlsRaw, setCustomUrlsRaw] = useState('');
  const [autoFixEnabled, setAutoFixEnabled] = useState(true);
  const [connectedSourceMode, setConnectedSourceMode] = useState<AuditJob['connectedSourceMode']>('sandbox_workspace');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUrl.trim()) return;

    const customUrls = customUrlsRaw
      .split('\n')
      .map(u => u.trim())
      .filter(u => u.length > 0);

    onStartAudit({
      targetUrl: targetUrl.trim(),
      sitemapUrl: sitemapUrl.trim() || undefined,
      customUrls: customUrls.length > 0 ? customUrls : undefined,
      autoFixEnabled,
      connectedSourceMode
    });
  };

  const handleUseDemoSite = () => {
    setTargetUrl('https://sandbox.local');
    setSitemapUrl('https://sandbox.local/sitemap.xml');
    setAutoFixEnabled(true);
    setConnectedSourceMode('sandbox_workspace');
    onStartAudit({
      targetUrl: 'https://sandbox.local',
      sitemapUrl: 'https://sandbox.local/sitemap.xml',
      autoFixEnabled: true,
      connectedSourceMode: 'sandbox_workspace'
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl relative overflow-hidden">
      {/* Decorative gradient glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 relative z-10">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Autonomous Technical SEO & Remediation
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Crawl website, audit 6 core SEO dimensions, auto-remediate safe issues, validate fixes, and trigger Google sitemap submission.
          </p>
        </div>

        <button
          type="button"
          onClick={handleUseDemoSite}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-teal-500/20 to-emerald-500/20 hover:from-teal-500/30 hover:to-emerald-500/30 text-teal-300 border border-teal-500/30 transition shadow-sm hover:border-teal-500/50"
        >
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>Launch Demo Site (14 Built-in Flaws)</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
        {/* Main Input Row */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
            Target Website URL / Domain
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Globe className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                placeholder="https://example.com or sandbox.local"
                value={targetUrl}
                onChange={e => {
                  const val = e.target.value;
                  setTargetUrl(val);
                  if (val.includes('sandbox.local')) {
                    setConnectedSourceMode('sandbox_workspace');
                  } else if (connectedSourceMode === 'sandbox_workspace') {
                    setConnectedSourceMode('download_patch_only');
                  }
                }}
                className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed shrink-0"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Executing Pipeline...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Run Complete Technical SEO</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Authorization Mode & Safe Auto-Fix Selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          {/* Authorization Selector */}
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <FileCode2 className="w-3.5 h-3.5 text-cyan-400" />
                Remediation Mode (Authorized Source Access)
              </span>
            </div>
            <select
              value={connectedSourceMode}
              onChange={e => setConnectedSourceMode(e.target.value as AuditJob['connectedSourceMode'])}
              className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="sandbox_workspace">Authorized Sandbox Workspace (Direct In-Memory Auto-Fix & Rollback)</option>
              <option value="download_patch_only">External Website (Downloadable .patch bundle + GSC Sitemap)</option>
              <option value="github_pr">GitHub Source Control (Create Automated Pull Request)</option>
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              {connectedSourceMode === 'sandbox_workspace' 
                ? 'Directly updates files, reruns checks, and saves snapshots for 1-click rollback.'
                : 'Generates validated unified git patches and clean sitemaps without modifying unauthorized servers.'}
            </p>
          </div>

          {/* Auto-Fix Permitted Toggle */}
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Auto-Apply Permitted Low-Risk Fixes</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Automatically fix missing canonicals, viewport tags, image dimensions, and sitemaps during run.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3">
              <input
                type="checkbox"
                checked={autoFixEnabled}
                onChange={e => setAutoFixEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>
        </div>

        {/* Toggle Advanced Inputs */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-slate-400 hover:text-slate-200 font-medium flex items-center gap-1 transition"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{showAdvanced ? 'Hide Advanced Options' : 'Configure Optional Sitemap & Custom Seed URLs'}</span>
          </button>

          {showAdvanced && (
            <div className="mt-3 p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Optional Explicit Sitemap URL (default discovers from robots.txt or /sitemap.xml)
                </label>
                <input
                  type="text"
                  placeholder="https://example.com/sitemap.xml"
                  value={sitemapUrl}
                  onChange={e => setSitemapUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Optional List of Specific URLs (one URL per line)
                </label>
                <textarea
                  rows={2}
                  placeholder="https://example.com/priority-page-1&#10;https://example.com/priority-page-2"
                  value={customUrlsRaw}
                  onChange={e => setCustomUrlsRaw(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
          )}
        </div>
      </form>
    </div>
  );
};
