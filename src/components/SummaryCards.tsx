import React from 'react';
import { Globe, AlertOctagon, CheckCircle2, Zap, Send, ShieldCheck, Undo2 } from 'lucide-react';
import { AuditJob } from '../types.ts';

interface SummaryCardsProps {
  job: AuditJob;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ job }) => {
  const { summary, performanceMetrics, searchConsoleStatus } = job;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
      {/* 1. Crawled URLs */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
          <span>Crawled Pages</span>
          <Globe className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-white tracking-tight">{summary.totalCrawled}</span>
          <span className="text-xs text-slate-400">of {summary.totalDiscovered} discovered</span>
        </div>
        <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
          {summary.totalErrors > 0 ? (
            <span className="text-rose-400 font-semibold">{summary.totalErrors} broken/4xx/5xx</span>
          ) : (
            <span className="text-emerald-400 font-medium">All 200 OK canonical</span>
          )}
        </div>
      </div>

      {/* 2. Discovered Issues */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
          <span>Issues Discovered</span>
          <AlertOctagon className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-white tracking-tight">
            {summary.criticalCount + summary.highCount + summary.mediumCount + summary.lowCount}
          </span>
          <span className="text-xs text-rose-400 font-medium">
            {summary.criticalCount} Critical
          </span>
        </div>
        <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-2">
          <span className="text-orange-400">{summary.highCount} High</span>
          <span className="text-amber-400">{summary.mediumCount} Med</span>
          <span className="text-slate-400">{summary.lowCount} Low</span>
        </div>
      </div>

      {/* 3. Automatic Fixes Applied */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
          <span>Fixes Remediated</span>
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-emerald-400 tracking-tight">
            {summary.fixesAppliedCount}
          </span>
          <span className="text-xs text-slate-400 font-medium">
            {summary.fixesValidatedCount} validated
          </span>
        </div>
        <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
          <Undo2 className="w-3 h-3 text-cyan-400" />
          <span>{summary.fixesRollbackableCount} with 1-click rollback snapshot</span>
        </div>
      </div>

      {/* 4. Google Indexing & CWV */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
          <span>Google Indexing & CWV</span>
          <Zap className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-white tracking-tight">
            {performanceMetrics ? `${performanceMetrics.score}/100` : '--'}
          </span>
          <span className="text-xs text-slate-400">
            TTFB: {performanceMetrics?.metrics.ttfbMs ?? '--'}ms
          </span>
        </div>
        <div className="mt-2 text-[11px] text-emerald-400 font-medium flex items-center gap-1">
          <Send className="w-3 h-3 text-emerald-400" />
          <span>
            {searchConsoleStatus.sitemapSubmitted ? 'Sitemap Submitted' : 'Pending Submission'}
          </span>
        </div>
      </div>
    </div>
  );
};
