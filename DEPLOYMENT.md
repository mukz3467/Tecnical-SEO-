# AutoIndex AI / Technical SEO

## Local development

Requirements: Node.js 22 or newer.

```bash
npm install
npm run lint
npm run build
npm start
```

The server listens on `PORT` when the hosting provider supplies it, otherwise port 3000.

## Vercel deployment

The React/Vite frontend builds to `dist`. The `api/[...path].ts` Express entry exposes the real API endpoints under `/api/*`; the shared API app is in `server/app.ts`. Git pushes to `main` trigger production deployments through the connected Vercel project.

Vercel background audit work uses `waitUntil` and temporary `/tmp` storage. That storage is **not durable or shared between function instances**. Job history can disappear after a cold start or when requests reach another instance. A shared database/queue is required before relying on persistent audit history or high-concurrency production use.

## Google Search Console integration

1. Enable the Google Search Console API in a Google Cloud project.
2. Create a service account and keep its private key secret.
3. Add the service account email as a user of the exact verified Search Console property.
4. In Vercel's **server-side** environment settings, configure either:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` with the complete service-account JSON, or
   - `GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL` and `GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY`.
5. If you use a URL-prefix property rather than a domain property, set `GOOGLE_SEARCH_CONSOLE_PROPERTY_URL` to the exact property string shown in Search Console (for example, `https://www.example.com/` or `sc-domain:example.com`).
6. Redeploy and inspect `/api/status`.

Never paste service-account JSON/private keys into public GitHub files, client-side code, or chat. Do not commit `.env` files.

The application submits sitemaps using the Search Console API and obtains indexing diagnostics through URL Inspection where permitted. It cannot press Google's manual “Request indexing” button through a public API. Sitemap submission is not an indexing guarantee. The Google Indexing API is restricted to eligible JobPosting and livestream BroadcastEvent pages.

## PageSpeed Insights

Set the server-side `PAGESPEED_API_KEY` to enable the Google PageSpeed Insights API. Without it, the app reports local crawl observations only; it does not fabricate a Lighthouse score or Core Web Vitals.

## Remediation limits

The app generates a structurally validated sitemap, a conservative robots.txt suggestion, and an evidence-led remediation **report** containing proposed snippets. It does not create an executable `.patch`, edit third-party live files, or claim that a fix was applied. A real write integration would need explicit authorization, source access, validation, and rollback support.


## Durable audit-job storage (Vercel serverless)

Vercel Functions do not share memory or `/tmp`. The API now supports **Supabase Postgres as the preferred shared job store**, with private Vercel Blob as a fallback. Job snapshots use your `seo_audit_jobs` table; individual page snapshots use `crawled_pages`. Each completed page saves the queue, visited URLs, discovered sitemap URLs, and page results to Supabase. A stale active job is claimed with a compare-and-set update when its job detail endpoint is polled, then resumed from the last checkpoint.

### Supabase setup (recommended)

1. Create a free Supabase project.
2. Since your project already has `seo_audit_jobs` and `crawled_pages`, run `supabase/migrations/202610250002_seo_crawler_tables.sql` to add the job/checkpoint JSON columns and the unique page key. Do not run the older `audit_jobs` migration for this schema.
3. In Supabase project settings, copy the Project URL and the **service_role** secret key.
4. In Vercel → `tecnical-seo` → Settings → Environment Variables, add:
   - `SUPABASE_URL` = your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = your server-side service-role secret
   Add them to Production (and Preview if you test preview deployments), then redeploy.
5. Start a **new** audit after the deployment is Ready. Existing job records in Blob are not automatically migrated to Supabase.

**Security:** Never use `SUPABASE_SERVICE_ROLE_KEY` in a `VITE_*` variable, frontend code, or a public repository. It must remain server-side. The migration enables row-level security and deliberately defines no public read/write policies.

### Existing Vercel Blob fallback

If the Supabase environment variables are not configured, the app continues using the connected private Blob store. Connect the `autoindex-jobs` Blob store to the Vercel project and redeploy. Blob stores snapshots, but it is not a queue/worker scheduler.

### Important runtime limitation

Persistent job records prevent independent Vercel instances from losing access to a job's saved state. However, persistence alone does **not** make a running in-memory crawler resumable after a function is forcibly terminated: the crawl queue/visited set and stage execution must be checkpointed and scheduled in bounded worker steps for full crash recovery. The crawler now restores its persisted queue when a stale job is resumed. Recovery is triggered when the client polls `/api/jobs/:id`; if the browser never polls again, no new invocation is automatically scheduled. As with any serverless system, the page currently in-flight at termination may need to be retried.
