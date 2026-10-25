-- Durable storage for SEO audit jobs.
-- The API uses the Supabase service-role key server-side; never expose it to the browser.
create table if not exists public.audit_jobs (
  id text primary key,
  job jsonb not null,
  status text not null,
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  updated_at timestamptz not null default now()
);

create index if not exists audit_jobs_updated_at_idx
  on public.audit_jobs (updated_at desc);

alter table public.audit_jobs enable row level security;

-- Intentionally add no anon/authenticated policies. The server-side service-role
-- key bypasses RLS; browser clients must not be given this key.
