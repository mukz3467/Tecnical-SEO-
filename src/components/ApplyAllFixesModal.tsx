import React, { useState } from 'react';
import { X, Wrench, ShieldCheck, Undo2, CheckCircle2, AlertTriangle, Code2, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { SeoIssue } from '../types.ts';

interface ApplyAllFixesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  safeIssues: SeoIssue[];
  isApplying: boolean;
}

export const ApplyAllFixesModal: React.FC<ApplyAllFixesModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  safeIssues,
  isApplying
}) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Confirm Automated Technical Remediation</span>
                <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  {safeIssues.length} Safe Fixes
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Review the automated code changes and structural updates before applying
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isApplying}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Safety Guarantees Notice */}
        <div className="p-4 bg-slate-950/80 border-b border-slate-800 shrink-0 space-y-2">
          <div className="flex items-start gap-2.5 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-white">Automated Safety & Rollback Protection: </span>
              <span className="text-slate-400">
                Every modified file undergoes a syntactic DOM/XML validation pass before being committed. A point-in-time snapshot is recorded for each fix, allowing instant 1-click rollback anytime.
              </span>
            </div>
          </div>
        </div>

        {/* Fixes List Review */}
        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>Pending Automated Remediation Changes ({safeIssues.length} items):</span>
            <span className="text-[11px] text-slate-500">Click any row to inspect code diff</span>
          </div>

          <div className="space-y-2">
            {safeIssues.map(issue => {
              const isExpanded = expandedIds.has(issue.id);
              const fix = issue.proposedFix;

              return (
                <div
                  key={issue.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-950 transition overflow-hidden"
                >
                  <div
                    onClick={() => toggleExpand(issue.id)}
                    className="p-3 flex items-start gap-3 cursor-pointer select-none"
                  >
                    <button className="text-slate-500 hover:text-slate-300 mt-0.5 shrink-0">
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300 uppercase">
                          {issue.category}
                        </span>
                        <span className="text-xs font-semibold text-white truncate">
                          {issue.title}
                        </span>
                      </div>

                      <div className="text-xs text-slate-400">
                        {fix?.summary || issue.recommendation}
                      </div>

                      <div className="text-[11px] font-mono text-slate-500 truncate mt-1">
                        Target: <span className="text-cyan-400">{fix?.targetFileOrElement}</span> on <span className="text-slate-400">{issue.affectedUrl}</span>
                      </div>
                    </div>
                  </div>

                  {/* Expandable Code Preview */}
                  {isExpanded && fix && (
                    <div className="px-4 pb-3 pt-1 border-t border-slate-800/80 bg-slate-950 space-y-2 text-xs">
                      <p className="text-[11px] text-slate-400">
                        {fix.explanation}
                      </p>

                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px] text-emerald-300 overflow-x-auto">
                        <pre>{fix.proposedCode}</pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950 shrink-0">
          <div className="text-xs text-slate-400">
            <span className="text-emerald-400 font-semibold">{safeIssues.length} fixes</span> will be validated & applied.
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isApplying}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={isApplying}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 transition disabled:opacity-50 cursor-pointer"
            >
              {isApplying ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Applying & Validating...</span>
                </>
              ) : (
                <>
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Authorize & Apply {safeIssues.length} Fixes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
