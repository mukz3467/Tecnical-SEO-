import React, { useState, useEffect } from 'react';
import { X, RefreshCcw, FileText, Code2, Globe, ShieldCheck } from 'lucide-react';

interface SandboxSitePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResetComplete?: () => void;
}

export const SandboxSitePreviewModal: React.FC<SandboxSitePreviewModalProps> = ({
  isOpen,
  onClose,
  onResetComplete
}) => {
  const [data, setData] = useState<{
    robotsTxt: string;
    sitemapXml: string;
    pages: Array<{ path: string; fixesApplied: string[] }>;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<'pages' | 'sitemap' | 'robots'>('pages');
  const [isResetting, setIsResetting] = useState(false);

  const fetchPreview = async () => {
    try {
      const res = await fetch('/api/sandbox-site/preview');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPreview();
    }
  }, [isOpen]);

  const handleReset = async () => {
    setIsResetting(true);
    try {
      const res = await fetch('/api/sandbox-site/reset', { method: 'POST' });
      if (res.ok) {
        await fetchPreview();
        onResetComplete?.();
      }
    } finally {
      setIsResetting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900 shrink-0">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-base font-bold text-white">Interactive Sandbox Test Website</h2>
              <p className="text-xs text-slate-400">Target: https://sandbox.local (Built-in live test environment)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action bar & tabs */}
        <div className="px-5 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setActiveTab('pages')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                activeTab === 'pages' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Pages & Remediation Status
            </button>
            <button
              onClick={() => setActiveTab('sitemap')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                activeTab === 'sitemap' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Live sitemap.xml
            </button>
            <button
              onClick={() => setActiveTab('robots')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                activeTab === 'robots' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Live robots.txt
            </button>
          </div>

          <button
            onClick={handleReset}
            disabled={isResetting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition disabled:opacity-50"
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
            <span>Reset Demo to Flawed State</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 text-xs">
          {activeTab === 'pages' && data && (
            <div className="space-y-3">
              <p className="text-slate-400">
                The sandbox site contains deliberate real-world issues: missing canonicals, duplicate titles, missing image dimensions (CLS risk), missing viewport, and broken JSON-LD syntax. As fixes are applied, the state updates live:
              </p>
              <div className="space-y-2">
                {data.pages.map((p, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="font-mono text-cyan-400 font-semibold">{p.path}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {p.fixesApplied.length > 0 ? (
                          <span className="text-emerald-400">Remediations: {p.fixesApplied.join(', ')}</span>
                        ) : (
                          <span className="text-amber-400">Initial flawed state (Pending remediation)</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'sitemap' && data && (
            <div className="bg-slate-950 p-3 rounded-xl font-mono text-[11px] text-emerald-300 border border-slate-800 overflow-x-auto whitespace-pre">
              {data.sitemapXml}
            </div>
          )}

          {activeTab === 'robots' && data && (
            <div className="bg-slate-950 p-3 rounded-xl font-mono text-[11px] text-cyan-300 border border-slate-800 overflow-x-auto whitespace-pre">
              {data.robotsTxt}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-800 flex justify-end bg-slate-950 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
