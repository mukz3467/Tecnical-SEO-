-- Compatibility and durable page checkpoints for the user's existing SEO Crawler schema.
-- The server uses SUPABASE_SERVICE_ROLE_KEY only; never expose it to browser code.
ALTER TABLE public.seo_audit_jobs
  ADD COLUMN IF NOT EXISTS job JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.seo_audit_jobs
  ADD COLUMN IF NOT EXISTS checkpoint JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.crawled_pages
  ADD COLUMN IF NOT EXISTS page JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS crawled_pages_job_id_url_uidx
  ON public.crawled_pages (job_id, url);

CREATE INDEX IF NOT EXISTS seo_audit_jobs_updated_at_idx
  ON public.seo_audit_jobs (updated_at DESC);

ALTER TABLE public.seo_audit_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crawled_pages ENABLE ROW LEVEL SECURITY;

-- Remove the broad anonymous grants from the initial SQL. The server's service-role
-- key bypasses RLS; public browser clients must not read or mutate crawl records.
REVOKE ALL PRIVILEGES ON TABLE public.seo_audit_jobs FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.crawled_pages FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.seo_audit_jobs TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.crawled_pages TO service_role;
