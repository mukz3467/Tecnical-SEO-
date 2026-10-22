export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type IssueCategory = 
  | 'crawlability'
  | 'indexing'
  | 'onpage'
  | 'performance'
  | 'structured_data'
  | 'security';

export type FixStatus = 
  | 'not_applicable'
  | 'available'
  | 'applied'
  | 'validated'
  | 'failed_validation'
  | 'rolled_back'
  | 'manual_only';

export interface SeoIssue {
  id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  evidence: string;
  affectedUrl: string;
  recommendation: string;
  fixStatus: FixStatus;
  fixType?: 'sitemap' | 'robots' | 'html_meta' | 'html_canonical' | 'html_image' | 'jsonld' | 'headers' | 'onpage' | 'manual';
  proposedFix?: {
    summary: string;
    targetFileOrElement: string;
    originalCode?: string;
    proposedCode: string;
    explanation: string;
    isSafeToAutoApply: boolean;
  };
  appliedAt?: string;
  validationResult?: {
    passed: boolean;
    details: string;
    timestamp: string;
  };
  rollbackData?: {
    snapshot: string;
    timestamp: string;
  };
}

export interface CrawledPage {
  url: string;
  status: number;
  statusText: string;
  responseTimeMs: number;
  contentType: string;
  contentLength: number;
  redirectChain: string[];
  canonicalUrl?: string;
  title?: string;
  metaDescription?: string;
  h1s: string[];
  h2Count: number;
  h3Count: number;
  imagesTotal: number;
  imagesMissingAlt: number;
  imagesMissingDimensions: number;
  internalLinksCount: number;
  externalLinksCount: number;
  hasViewport: boolean;
  htmlLang?: string;
  isNoindex: boolean;
  isNofollow: boolean;
  xRobotsTag?: string;
  wordCount: number;
  isThinContentCandidate: boolean;
  hasStructuredData: boolean;
  structuredDataTypes: string[];
  schemaErrors: string[];
  mobileFriendlySignals: {
    hasViewport: boolean;
    isResponsive: boolean;
    missingTextCompression: boolean;
  };
  security: {
    isHttps: boolean;
    mixedContentFound: boolean;
    hasHsts: boolean;
    hasCsp: boolean;
    hasXContentTypeOptions: boolean;
  };
}

export interface SitemapInfo {
  url: string;
  exists: boolean;
  type: 'urlset' | 'sitemapindex' | 'not_found' | 'error';
  urlCount: number;
  errors: string[];
  warnings: string[];
  discoveredUrls: string[];
}

export interface RobotsTxtInfo {
  url: string;
  exists: boolean;
  content: string;
  rules: {
    userAgent: string;
    disallow: string[];
    allow: string[];
  }[];
  sitemaps: string[];
  errors: string[];
  warnings: string[];
}

export interface GoogleSearchConsoleStatus {
  connected: boolean;
  authMethod: 'service_account' | 'oauth' | 'unconfigured';
  propertyUrl?: string;
  isVerified: boolean;
  sitemapSubmitted: boolean;
  sitemapSubmissionTime?: string;
  sitemapSubmissionResult?: string;
  inspectionSummary: {
    totalInspected: number;
    indexedCount: number;
    notIndexedCount: number;
    verdict: string;
    coverageIssues: string[];
    note: string;
  };
  indexingApiStatus: {
    supported: boolean;
    notice: string;
    eligiblePages: string[];
  };
}

export interface PerformanceMetrics {
  source: 'google_pagespeed_api' | 'local_diagnostics';
  isFieldData: boolean;
  fieldDataNotice: string;
  score?: number; // Only present when returned by the real PageSpeed API
  metrics: {
    ttfbMs?: number;
    lcpMs?: number;
    cls?: number;
    inpMs?: number;
    fcpMs?: number;
  };
  diagnostics: {
    oversizedImages?: number;
    missingDimensionsCount?: number;
    renderBlockingResources?: number;
    uncompressedResponses?: number;
    cachingOpportunities?: number;
  };
}

export interface AuditJob {
  id: string;
  targetDomain: string;
  targetUrl: string;
  sitemapUrl?: string;
  customUrls?: string[];
  autoFixEnabled: boolean;
  connectedSourceMode: 'none' | 'download_patch_only';
  status: 'queued' | 'crawling' | 'auditing' | 'remediating' | 'validating' | 'submitting_sitemap' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0 - 100
  currentStage: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
  
  // Results
  crawledPages: CrawledPage[];
  sitemapInfo?: SitemapInfo;
  robotsTxtInfo?: RobotsTxtInfo;
  issues: SeoIssue[];
  searchConsoleStatus: GoogleSearchConsoleStatus;
  performanceMetrics?: PerformanceMetrics;
  
  // Stats
  summary: {
    totalDiscovered: number;
    totalCrawled: number;
    totalErrors: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    fixesAppliedCount: number;
    fixesValidatedCount: number;
    fixesRollbackableCount: number;
  };
  
  // Logs
  logs: Array<{
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'success';
    message: string;
  }>;
  
  // Generated Artifacts
  generatedSitemapXml?: string;
  generatedRobotsTxt?: string;
  generatedRemediationReport?: string;
}
