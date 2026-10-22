import React from 'react';
import { X, Key, Shield, HelpCircle, ExternalLink, CheckCircle2, AlertTriangle } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900 z-10">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">Integrations, Credentials & Automation Policies</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 text-xs text-slate-300">
          {/* Section 1: Official API Capabilities & Boundaries */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-cyan-400" />
              API Compliance & Truth in Automation
            </h3>
            <p className="text-slate-400 leading-relaxed">
              AutoIndex AI is architected strictly around official Google and Web standards:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-300">
              <li>
                <strong className="text-slate-200">Google Search Console API: </strong> 
                Used for automated verified property sitemap submissions and URL Inspection diagnostics.
              </li>
              <li>
                <strong className="text-slate-200">URL Inspection API Limitation: </strong> 
                The URL Inspection API provides read-only diagnostics; it cannot programmatically request immediate manual indexing.
              </li>
              <li>
                <strong className="text-slate-200">Google Indexing API Strict Policy: </strong> 
                Google officially restricts this API to <code>JobPosting</code> and <code>BroadcastEvent</code> structured data. We do not falsify submissions for standard web content.
              </li>
              <li>
                <strong className="text-slate-200">Authorized Source Remediation: </strong> 
                Direct file modifications require authorized workspace access or GitHub tokens. For 3rd-party sites, validated <code>.patch</code> bundles are generated.
              </li>
            </ul>
          </div>

          {/* Section 2: Environment Variable Template */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-white">Environment Configuration (.env)</h3>
            <p className="text-slate-400">
              Configure these secure server-side variables in your deployment environment or Secrets panel:
            </p>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-[11px] text-emerald-300 space-y-1">
              <div># Google Search Console Service Account Credentials</div>
              <div>GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL="service-account@your-project.iam.gserviceaccount.com"</div>
              <div>GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."</div>
              <div className="pt-1"># Google PageSpeed Insights API Key (Lighthouse Lab & CrUX Real-User Field Data)</div>
              <div>PAGESPEED_API_KEY="AIzaSy..."</div>
              <div className="pt-1"># GitHub Token for Direct Pull Requests / File Patches</div>
              <div>GITHUB_TOKEN="ghp_..."</div>
            </div>
          </div>

          {/* Section 3: SSRF & Crawl Policy */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-white">Security & SSRF Hardening</h3>
            <p className="text-slate-400 leading-relaxed">
              Our backend employs recursive DNS resolution checks to prevent Server-Side Request Forgery (SSRF). Requests to <code>localhost</code>, private RFC 1918 IPv4 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), IPv6 loopback, and cloud metadata (169.254.169.254) are rejected at the socket layer.
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 flex justify-end bg-slate-950/50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition"
          >
            Close Settings
          </button>
        </div>
      </div>
    </div>
  );
};
