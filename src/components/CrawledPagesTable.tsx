import React, { useState } from 'react';
import { Globe, CheckCircle2, AlertTriangle, ExternalLink, ArrowRight, Smartphone } from 'lucide-react';
import { CrawledPage } from '../types.ts';

interface CrawledPagesTableProps {
  pages: CrawledPage[];
}

export const CrawledPagesTable: React.FC<CrawledPagesTableProps> = ({ pages }) => {
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filteredPages = pages.filter(p => {
    if (filterStatus === 'errors') return p.status >= 400;
    if (filterStatus === 'redirects') return p.redirectChain.length > 1;
    if (filterStatus === 'noindex') return p.isNoindex;
    return true;
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-400" />
            <span>Crawled URL Index & Health Directory</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-800 text-slate-300 font-normal">
              {filteredPages.length} pages
            </span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            HTTP response codes, canonical directives, mobile accessibility signals, and latency
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="text-xs bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none"
          >
            <option value="all">All Pages ({pages.length})</option>
            <option value="errors">Errors / 4xx / 5xx</option>
            <option value="redirects">Redirected</option>
            <option value="noindex">Noindex Directives</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase font-mono tracking-wider">
            <tr>
              <th className="py-2.5 px-4">Status</th>
              <th className="py-2.5 px-4">URL</th>
              <th className="py-2.5 px-4">Title / Canonical</th>
              <th className="py-2.5 px-4">Latency</th>
              <th className="py-2.5 px-4">Mobile & Meta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredPages.map((page, idx) => {
              const is200 = page.status === 200;
              const is3xx = page.status >= 300 && page.status < 400;
              const isError = page.status >= 400;

              return (
                <tr key={idx} className="hover:bg-slate-800/20 transition font-mono">
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                      is200 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      is3xx ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' :
                      'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                      {page.status} {page.statusText}
                    </span>
                  </td>

                  <td className="py-3 px-4 max-w-xs sm:max-w-md truncate">
                    <div className="font-semibold text-slate-200 truncate">{page.url}</div>
                    {page.redirectChain.length > 1 && (
                      <div className="text-[10px] text-cyan-400 mt-0.5 truncate flex items-center gap-1">
                        <ArrowRight className="w-2.5 h-2.5 shrink-0" />
                        <span>Redirects to: {page.redirectChain[page.redirectChain.length - 1]}</span>
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-4 max-w-xs truncate font-sans">
                    <div className="text-white truncate font-medium">{page.title || <span className="text-rose-400 italic">Missing &lt;title&gt;</span>}</div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5 font-mono">
                      {page.canonicalUrl ? (
                        <span className="text-slate-400">Canonical: {page.canonicalUrl}</span>
                      ) : (
                        <span className="text-amber-400">No canonical declared</span>
                      )}
                    </div>
                  </td>

                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className={page.responseTimeMs > 800 ? 'text-amber-400' : 'text-slate-300'}>
                      {page.responseTimeMs}ms
                    </span>
                  </td>

                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-2 font-sans">
                      {page.hasViewport ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                          <Smartphone className="w-3 h-3" /> Viewport OK
                        </span>
                      ) : (
                        <span className="text-[11px] text-rose-400">No Viewport</span>
                      )}

                      {page.isNoindex && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-400 font-bold">
                          NOINDEX
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
