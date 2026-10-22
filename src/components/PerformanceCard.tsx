import React from 'react';
import { Zap, Gauge, Clock, Layers, Sparkles, AlertCircle, Info } from 'lucide-react';
import { PerformanceMetrics } from '../types.ts';

interface PerformanceCardProps {
  metrics?: PerformanceMetrics;
}

export const PerformanceCard: React.FC<PerformanceCardProps> = ({ metrics }) => {
  if (!metrics) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-center text-slate-500 text-xs">
        Performance diagnostics pending crawl completion.
      </div>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    if (score >= 50) return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Gauge className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Core Web Vitals & Loading Diagnostics</span>
            </h3>
            <p className="text-xs text-slate-400">
              Real PageSpeed results when available; no fabricated metrics
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getScoreColor(metrics.score ?? 0)}`}>
            {metrics.score !== undefined ? `${metrics.score} / 100` : 'Unavailable'}
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
          <span className="text-[11px] font-medium text-slate-400 block mb-0.5">LCP (Largest Contentful)</span>
          <div className="text-base font-bold text-white">
            {metrics.metrics.lcpMs ? `${(metrics.metrics.lcpMs / 1000).toFixed(2)}s` : '--'}
          </div>
          <span className="text-[10px] text-emerald-400">Target: &lt; 2.5s</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
          <span className="text-[11px] font-medium text-slate-400 block mb-0.5">CLS (Layout Shift)</span>
          <div className="text-base font-bold text-white">
            {metrics.metrics.cls !== undefined ? metrics.metrics.cls : '--'}
          </div>
          <span className="text-[10px] text-emerald-400">Target: &lt; 0.1</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
          <span className="text-[11px] font-medium text-slate-400 block mb-0.5">TTFB (Server Latency)</span>
          <div className="text-base font-bold text-white">
            {metrics.metrics.ttfbMs !== undefined ? `${metrics.metrics.ttfbMs}ms` : '--'}
          </div>
          <span className="text-[10px] text-emerald-400">Target: &lt; 800ms</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
          <span className="text-[11px] font-medium text-slate-400 block mb-0.5">INP / Interactive</span>
          <div className="text-base font-bold text-white">
            {metrics.metrics.inpMs ? `${metrics.metrics.inpMs}ms` : '--'}
          </div>
          <span className="text-[10px] text-emerald-400">Target: &lt; 200ms</span>
        </div>
      </div>

      {/* Diagnostics Row */}
      <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800 space-y-2">
        <span className="text-xs font-semibold text-slate-300 block">Identified Resource Bottlenecks</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
          <div className="text-slate-400">
            Missing Image Dimensions: <span className="font-semibold text-amber-400">{metrics.diagnostics.missingDimensionsCount ?? '--'}</span>
          </div>
          <div className="text-slate-400">
            Uncompressed Responses: <span className="font-semibold text-amber-400">{metrics.diagnostics.uncompressedResponses ?? '--'}</span>
          </div>
          <div className="text-slate-400">
            Render-blocking Assets: <span className="font-semibold text-slate-200">{metrics.diagnostics.renderBlockingResources ?? '--'}</span>
          </div>
        </div>
      </div>

      {/* Lab vs Field Transparency Notice */}
      <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 flex items-start gap-2.5 text-[11px] text-slate-400">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-slate-300">
            {metrics.isFieldData ? 'Field CrUX Data: ' : metrics.source === 'google_pagespeed_api' ? 'Lighthouse Lab Data: ' : 'Local Crawl Only: '}
          </span>
          <span>{metrics.fieldDataNotice}</span>
        </div>
      </div>
    </div>
  );
};
