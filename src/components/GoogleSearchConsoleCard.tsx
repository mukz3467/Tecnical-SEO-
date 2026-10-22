import React from 'react';
import { ShieldCheck, Send, CheckCircle2, AlertTriangle, Info, ExternalLink } from 'lucide-react';
import { GoogleSearchConsoleStatus } from '../types.ts';

interface GoogleSearchConsoleCardProps {
  status: GoogleSearchConsoleStatus;
  targetDomain: string;
}

export const GoogleSearchConsoleCard: React.FC<GoogleSearchConsoleCardProps> = ({ status, targetDomain }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
            <Send className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Google Search Console & Indexing Workflows</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Official API Compliant
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Verified property sitemap submission & URL Inspection API coverage diagnostics
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
            status.isVerified ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
          }`}>
            <CheckCircle2 className="w-3.5 h-3.5" />
            {status.authMethod === 'service_account' ? 'Live GSC Connected' : 'Sandbox Ready'}
          </span>
        </div>
      </div>

      {/* Sitemap Submission Banner */}
      <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-200">
            Sitemap Submission Pipeline
          </span>
          <span className="text-[11px] text-emerald-400 font-mono font-medium">
            {status.sitemapSubmissionTime ? new Date(status.sitemapSubmissionTime).toLocaleTimeString() : 'Ready'}
          </span>
        </div>
        <p className="text-xs text-slate-300">
          {status.sitemapSubmissionResult || 'Sitemap generated and scheduled for Google Search Console API submission.'}
        </p>
      </div>

      {/* URL Inspection API Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
          <span className="text-[11px] font-medium text-slate-400 block mb-1">URL Inspection Diagnostics</span>
          <div className="text-sm font-semibold text-white">
            {status.inspectionSummary.indexedCount} eligible / {status.inspectionSummary.totalInspected} checked
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {status.inspectionSummary.verdict}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
          <span className="text-[11px] font-medium text-slate-400 block mb-1">Google Indexing API Policy</span>
          <div className="text-xs font-semibold text-slate-300">
            {status.indexingApiStatus.supported ? 'Eligible Schemas Present' : 'Standard Web Discovery'}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {status.indexingApiStatus.notice}
          </p>
        </div>
      </div>

      {/* Compliance Notice */}
      <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 flex items-start gap-2.5 text-[11px] text-slate-400">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-slate-300">Compliance & Authority Guarantee: </span>
          <span>{status.inspectionSummary.note}</span>
        </div>
      </div>
    </div>
  );
};
