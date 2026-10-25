import React from 'react';
import { Settings, RefreshCw, ArrowUpRight, Cpu } from 'lucide-react';

interface HeaderProps {
  onOpenSettings: () => void;
  activeJobId?: string;
  isProcessing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onOpenSettings, activeJobId, isProcessing }) => (
  <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
    <div className="mx-auto flex h-[62px] max-w-none items-center justify-between gap-4 px-6">
      <div className="flex items-center gap-3 md:hidden">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500 text-slate-950"><Cpu size={17}/></span>
        <span className="text-sm font-bold text-white">Universal Respiratory</span>
      </div>
      <div className="hidden md:flex items-center gap-2 text-xs text-slate-400"><span className="h-2 w-2 rounded-full bg-emerald-400"/><span>SEO Tools Online</span></div>
      <div className="ml-auto flex items-center gap-3">
        {isProcessing && <span className="hidden sm:flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-emerald-300"><RefreshCw className="h-3.5 w-3.5 animate-spin"/> Audit running</span>}
        {activeJobId && <a href="#audit-results" className="hidden sm:flex items-center gap-1 text-xs text-slate-300 hover:text-white">Latest report <ArrowUpRight size={13}/></a>}
        <button onClick={onOpenSettings} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800" title="Integrations and API settings"><Settings size={15}/><span className="hidden sm:inline">Settings</span></button>
        <div className="hidden sm:flex items-center gap-2 border-l border-slate-800 pl-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-blue-600 font-bold text-white">B</span><span><strong className="block text-xs text-white">Bilal</strong><small className="block text-[10px] text-slate-400">SEO Workspace</small></span></div>
      </div>
    </div>
  </header>
);
