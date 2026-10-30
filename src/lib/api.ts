import type { AuditJob } from '../types.ts';

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const text = await response.text();

  let payload: T | { error?: string } | string | null = null;
  if (text) {
    try {
      payload = JSON.parse(text) as T;
    } catch {
      payload = text as string;
    }
  }

  if (!response.ok) {
    const errorMessage = typeof payload === 'object' && payload !== null && 'error' in payload && payload.error
      ? payload.error
      : text || response.statusText || 'Request failed';

    throw new Error(errorMessage);
  }

  return payload as T;
}

export const api = {
  fetchJobs: async (): Promise<AuditJob[]> => request<AuditJob[]>('/api/jobs'),
  fetchJob: async (jobId: string): Promise<AuditJob> => request<AuditJob>(`/api/jobs/${jobId}`),
  createJob: async (params: {
    targetUrl: string;
    sitemapUrl?: string;
    customUrls?: string[];
    autoFixEnabled: boolean;
    connectedSourceMode: AuditJob['connectedSourceMode'];
  }): Promise<AuditJob> => request<AuditJob>('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }),
};
