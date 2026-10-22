import React from 'react';
import { Settings, RefreshCw, Cpu } from 'lucide-react';

interface HeaderProps {
  onOpenSettings: () => void;
  activeJobId?: string;
  isProcessing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  activeJobId,
  isProcessing
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white font-bold text-xl tracking-tight">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-white tracking-tight">AutoIndex AI</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Autonomous Technical SEO
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Crawling, Automated Authorized Remediation & Google Indexing Engine
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {isProcessing && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Pipeline Active</span>
            </div>
          )}

          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            title="Integrations & API Settings"
          >
            <Settings className="w-4 h-4 text-slate-400" />
            <span className="hidden md:inline">Integrations & Credentials</span>
          </button>
        </div>
      </div>
    </header>
  );
};
