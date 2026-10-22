import React, { useState } from 'react';
import { RefreshCw, Terminal, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { AuditJob } from '../types.ts';

interface LiveProgressCardProps {
  job: AuditJob;
}

export const LiveProgressCard: React.FC<LiveProgressCardProps> = ({ job }) => {
  const [showLogs, setShowLogs] = useState(true);

  const getStageColor = (status: AuditJob['status']) => {
    switch (status) {
      case 'completed': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'failed': return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
      default: return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          {job.status === 'completed' ? (
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          ) : job.status === 'failed' ? (
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <RefreshCw className="w-4 h-4 animate-spin" />
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white capitalize">{job.status}</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${getStageColor(job.status)}`}>
                {job.progress}%
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {job.currentStage}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowLogs(!showLogs)}
          className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
        >
          <Terminal className="w-3.5 h-3.5 text-slate-400" />
          <span>Execution Log ({job.logs.length})</span>
          {showLogs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
        <div
          className={`h-full transition-all duration-300 ease-out ${
            job.status === 'completed'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
              : job.status === 'failed'
              ? 'bg-rose-500'
              : 'bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 animate-pulse'
          }`}
          style={{ width: `${Math.max(4, job.progress)}%` }}
        />
      </div>

      {/* Live Logs Drawer */}
      {showLogs && (
        <div className="mt-4 bg-slate-950 rounded-xl p-3 border border-slate-800/80 font-mono text-[11px] max-h-48 overflow-y-auto space-y-1">
          {job.logs.map((log, index) => {
            let color = 'text-slate-400';
            if (log.level === 'success') color = 'text-emerald-400 font-medium';
            if (log.level === 'warn') color = 'text-amber-400';
            if (log.level === 'error') color = 'text-rose-400 font-semibold';

            return (
              <div key={index} className="flex items-start gap-2">
                <span className="text-slate-600 select-none shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={color}>{log.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
