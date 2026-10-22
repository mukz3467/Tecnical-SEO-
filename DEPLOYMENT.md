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


## Shared audit-job storage (Vercel serverless)

Vercel function instances do not share memory or `/tmp`. To keep audit progress available between requests, configure a Redis-compatible REST store. The app supports Upstash Redis REST without an extra npm dependency.

1. Create an Upstash account and create a Redis database on its free plan: https://console.upstash.com/
2. Open the database's **REST API** section and copy the REST URL and REST token.
3. In Vercel, open the `tecnical-seo` project → **Settings → Environment Variables**.
4. Add these variables for **Production** (and Preview if you test previews):
   - `UPSTASH_REDIS_REST_URL` = the Upstash REST URL
   - `UPSTASH_REDIS_REST_TOKEN` = the Upstash REST token (keep it secret; never put it in frontend code or commit it)
5. Redeploy the latest production deployment, then run a new audit.

The integration stores job snapshots under `autoindex:job:<id>` and maintains a capped 50-job history index. Without both environment variables, local development continues to use local storage and Vercel cannot guarantee shared job retrieval. Upstash's free plan has usage limits; this is intended to work without a paid plan while usage remains within those limits. Sitemap submission and crawl completion still depend on target-site access, serverless runtime limits, and Google API configuration.
