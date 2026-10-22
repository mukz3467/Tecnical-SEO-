import React, { useState, useMemo } from 'react';
import { 
  AlertOctagon, AlertTriangle, Info, CheckCircle2, 
  ChevronDown, ChevronRight, Search, 
  Code2, ExternalLink, ShieldAlert, Sparkles, Filter 
} from 'lucide-react';
import { SeoIssue, IssueCategory, IssueSeverity, FixStatus } from '../types.ts';

interface IssuesTableProps {
  issues: SeoIssue[];
  onApplyFix: (issueId: string) => void;
  onRollbackFix: (issueId: string) => void;
  onApplyAllSafeFixes: () => void;
  isApplying?: boolean;
}

export const IssuesTable: React.FC<IssuesTableProps> = ({
  issues,
  onApplyFix,
  onRollbackFix,
  onApplyAllSafeFixes,
  isApplying
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIssueIds, setExpandedIssueIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIssueIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredIssues = useMemo(() => {
    return issues.filter(issue => {
      if (selectedCategory !== 'all' && issue.category !== selectedCategory) return false;
      if (selectedSeverity !== 'all' && issue.severity !== selectedSeverity) return false;
      if (selectedStatus !== 'all') {
        if (selectedStatus === 'validated' && issue.fixStatus !== 'validated') return false;
        if (selectedStatus === 'available' && issue.fixStatus !== 'available') return false;
        if (selectedStatus === 'manual' && issue.fixStatus !== 'manual_only') return false;
        if (selectedStatus === 'rolled_back' && issue.fixStatus !== 'rolled_back') return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          issue.title.toLowerCase().includes(q) ||
          issue.affectedUrl.toLowerCase().includes(q) ||
          issue.description.toLowerCase().includes(q) ||
          issue.recommendation.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [issues, selectedCategory, selectedSeverity, selectedStatus, searchQuery]);

  const getSeverityBadge = (sev: IssueSeverity) => {
    switch (sev) {
      case 'critical':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20"><AlertOctagon className="w-3 h-3" /> Critical</span>;
      case 'high':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20"><AlertTriangle className="w-3 h-3" /> High</span>;
      case 'medium':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"><AlertTriangle className="w-3 h-3" /> Medium</span>;
      case 'low':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20"><Info className="w-3 h-3" /> Low</span>;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: FixStatus) => {
    switch (status) {
      case 'validated':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> Fixed & Validated
          </span>
        );
      case 'available':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <Sparkles className="w-3 h-3" /> Fix Ready
          </span>
        );
      case 'rolled_back':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/30">
            <Undo2 className="w-3 h-3" /> Rolled Back
          </span>
        );
      case 'failed_validation':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            Validation Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
            Manual Action
          </span>
        );
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
      {/* Header & Controls */}
      <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>Technical SEO Issues & Remediation Workbench</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-800 text-slate-300 font-normal">
              {filteredIssues.length} of {issues.length}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Evidence-backed findings and proposed snippets for review. This deployment does not write to live websites.
          </p>
        </div>

      </div>

      {/* Filter Bar */}
      <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search issue title, URL, or code..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Category Filter */}
        <select
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          className="text-xs bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none"
        >
          <option value="all">All Categories</option>
          <option value="crawlability">Crawlability & Bots</option>
          <option value="indexing">Indexing & Canonicals</option>
          <option value="onpage">On-Page SEO</option>
          <option value="performance">Core Web Vitals & Speed</option>
          <option value="structured_data">Structured Data</option>
          <option value="security">Security & HTTPS</option>
        </select>

        {/* Severity Filter */}
        <select
          value={selectedSeverity}
          onChange={e => setSelectedSeverity(e.target.value)}
          className="text-xs bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* Fix Status Filter */}
        <select
          value={selectedStatus}
          onChange={e => setSelectedStatus(e.target.value)}
          className="text-xs bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none"
        >
          <option value="all">All Statuses</option>
          <option value="validated">Fixed & Validated</option>
          <option value="available">Fix Ready to Apply</option>
          <option value="rolled_back">Rolled Back</option>
          <option value="manual">Manual Action Only</option>
        </select>
      </div>

      {/* Issues List */}
      <div className="divide-y divide-slate-800">
        {filteredIssues.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No technical SEO issues match the selected criteria.
          </div>
        ) : (
          filteredIssues.map(issue => {
            const isExpanded = expandedIssueIds.has(issue.id);

            return (
              <div key={issue.id} className="transition hover:bg-slate-800/20">
                {/* Issue Summary Row */}
                <div
                  onClick={() => toggleExpand(issue.id)}
                  className="p-4 flex items-start gap-3 cursor-pointer select-none"
                >
                  <button className="text-slate-500 hover:text-slate-300 mt-0.5">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {getSeverityBadge(issue.severity)}
                      {getStatusBadge(issue.fixStatus)}
                      <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">
                        {issue.category.replace('_', ' ')}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-white truncate">
                      {issue.title}
                    </h3>

                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1 font-mono truncate">
                      <span className="text-slate-500">URL:</span>
                      <span className="text-slate-300 truncate">{issue.affectedUrl}</span>
                    </div>
                  </div>

                </div>

                {/* Expanded Details Drawer */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 bg-slate-950/40 border-t border-slate-800/60 ml-9 mr-4 rounded-b-xl mb-3 space-y-3">
                    <div className="text-xs text-slate-300">
                      <span className="font-semibold text-slate-200">Description: </span>
                      {issue.description}
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
                      <span className="text-amber-400 font-semibold block mb-1">Evidence Discovered:</span>
                      <div className="break-all whitespace-pre-wrap">{issue.evidence}</div>
                    </div>

                    <div className="text-xs text-slate-300">
                      <span className="font-semibold text-emerald-400">Recommendation: </span>
                      {issue.recommendation}
                    </div>

                    {/* Proposed Fix Code Inspection */}
                    {issue.proposedFix && (
                      <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-cyan-400 flex items-center gap-1.5">
                            <Code2 className="w-3.5 h-3.5" />
                            Proposed Code Fix ({issue.proposedFix.targetFileOrElement})
                          </span>
                          <span className="text-[11px] text-slate-400">
                            'Candidate fix — review required before deployment'
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-400">
                          {issue.proposedFix.explanation}
                        </p>

                        <div className="bg-slate-900 p-2.5 rounded-lg font-mono text-[11px] text-emerald-300 overflow-x-auto border border-slate-800">
                          <pre>{issue.proposedFix.proposedCode}</pre>
                        </div>

                        <p className="text-[11px] text-amber-300">Proposal only: no live change or deployment validation has occurred.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

    </div>
  );
};
