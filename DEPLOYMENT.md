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

## Deploy as a full Node.js web service

This application is an Express + Vite app. Deploy it to a Node.js host that supports a long-running server process (for example, a Render Web Service). A static-only host or GitHub Pages will not run the API routes.

Suggested commands:
- Build: `npm install && npm run build`
- Start: `npm start`
- Node version: 22+

Set `NODE_ENV=production`. The app serves the built frontend from `dist` and the API from the same Node process.

## Google Search Console integration

1. Enable the Google Search Console API in a Google Cloud project.
2. Create a service account and keep its private key secret.
3. Add the service account email as a user of the exact verified Search Console property.
4. In the hosting provider's server-side environment settings, configure either:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` with the complete service-account JSON, or
   - `GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL` and `GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY`.
5. Restart/redeploy the service and inspect `/api/status`.

Never paste service-account JSON/private keys into public GitHub files, client-side code, or chat. Do not commit `.env` files.

The application submits sitemaps using the Search Console API and obtains indexing diagnostics through URL Inspection where permitted. It cannot press Google's manual “Request indexing” button through a public API. Sitemap submission is not an indexing guarantee. The Google Indexing API is restricted to eligible JobPosting and livestream BroadcastEvent pages.

## PageSpeed Insights

Set the server-side `PAGESPEED_API_KEY` to enable the Google PageSpeed Insights API. Without it, the app reports local crawl observations only; it does not fabricate a Lighthouse score or Core Web Vitals.

## Runtime storage limitation

Audit history currently uses `.data/jobs.json` on the server filesystem. This works for local development and persistent-disk hosts, but is not durable on ephemeral/serverless instances and is not shared across multiple replicas. For production on such platforms, add a durable database before relying on saved job history. The generated runtime data directory is ignored by Git.

## What “automatic fixes” mean

The app can produce validated sitemap/robots artifacts and downloadable patch bundles. It does not modify a third-party website's live files unless an explicit, authenticated write integration is implemented and authorized. Review content-specific SEO changes before applying them.
