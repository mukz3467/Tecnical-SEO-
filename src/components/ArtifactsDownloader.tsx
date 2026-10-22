import React from 'react';
import { Download, FileText, Code2, Database, FileSpreadsheet } from 'lucide-react';
import { AuditJob } from '../types.ts';

interface ArtifactsDownloaderProps {
  job: AuditJob;
}

export const ArtifactsDownloader: React.FC<ArtifactsDownloaderProps> = ({ job }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Downloadable Reports & Remediation Artifacts</span>
          </h3>
          <p className="text-xs text-slate-400">
            Export generated technical assets, a remediation review report, and audit datasets
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
        {/* Sitemap XML */}
        <a
          href={`/api/jobs/${job.id}/download/sitemap`}
          download={`sitemap-${job.targetDomain}.xml`}
          className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-slate-200 transition text-center group"
        >
          <Code2 className="w-5 h-5 text-cyan-400 mb-1.5 group-hover:scale-110 transition" />
          <span className="text-xs font-semibold">Clean sitemap.xml</span>
          <span className="text-[10px] text-slate-500">Validated 200 OK</span>
        </a>

        {/* robots.txt */}
        <a
          href={`/api/jobs/${job.id}/download/robots`}
          download={`robots-${job.targetDomain}.txt`}
          className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-slate-200 transition text-center group"
        >
          <FileText className="w-5 h-5 text-emerald-400 mb-1.5 group-hover:scale-110 transition" />
          <span className="text-xs font-semibold">robots.txt</span>
          <span className="text-[10px] text-slate-500">Optimized directives</span>
        </a>

        {/* Unified Patch */}
        <a
          href={`/api/jobs/${job.id}/download/remediation-report`}
          download={`remediation-report-${job.targetDomain}.txt`}
          className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-slate-200 transition text-center group"
        >
          <Code2 className="w-5 h-5 text-amber-400 mb-1.5 group-hover:scale-110 transition" />
          <span className="text-xs font-semibold">Remediation Report</span>
          <span className="text-[10px] text-slate-500">Review before applying</span>
        </a>

        {/* CSV Issues */}
        <a
          href={`/api/jobs/${job.id}/export/csv`}
          download={`autoindex-issues-${job.targetDomain}.csv`}
          className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-slate-200 transition text-center group"
        >
          <FileSpreadsheet className="w-5 h-5 text-teal-400 mb-1.5 group-hover:scale-110 transition" />
          <span className="text-xs font-semibold">CSV Spreadsheet</span>
          <span className="text-[10px] text-slate-500">All prioritized issues</span>
        </a>

        {/* Full JSON Audit Report */}
        <a
          href={`/api/jobs/${job.id}/export/json`}
          download={`autoindex-audit-${job.targetDomain}.json`}
          className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-slate-200 transition text-center group col-span-2 sm:col-span-1"
        >
          <Database className="w-5 h-5 text-indigo-400 mb-1.5 group-hover:scale-110 transition" />
          <span className="text-xs font-semibold">Complete JSON</span>
          <span className="text-[10px] text-slate-500">Full crawl & metrics</span>
        </a>
      </div>
    </div>
  );
};
