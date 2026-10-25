import React from 'react';
import { Settings, RefreshCw, Cpu, ArrowUpRight } from 'lucide-react';

interface HeaderProps {
  onOpenSettings: () => void;
  activeJobId?: string;
  isProcessing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onOpenSettings, activeJobId, isProcessing }) => {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <a href="#top" className="flex min-w-0 items-center gap-3 no-underline">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black text-white">
            <Cpu className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-bold tracking-tight text-black sm:text-lg">AutoIndex AI</span>
              <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">TECHNICAL SEO</span>
            </div>
            <p className="hidden text-[11px] text-neutral-500 sm:block">Crawl, diagnose, and improve your website</p>
          </div>
        </a>
        <nav className="flex shrink-0 items-center gap-2 sm:gap-3" aria-label="Main navigation">
          {isProcessing && (
            <div className="hidden items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-medium text-black sm:flex">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>Audit running</span>
            </div>
          )}
          {activeJobId && <a href="#audit-results" className="hidden items-center gap-1 text-xs font-semibold text-neutral-700 hover:text-black md:inline-flex">Latest report <ArrowUpRight className="h-3.5 w-3.5" /></a>}
          <button onClick={onOpenSettings} className="inline-flex items-center gap-2 rounded-lg border border-black bg-black px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-neutral-800" title="Integrations & API Settings">
            <Settings className="h-4 w-4" /><span className="hidden sm:inline">Settings</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
