# Technical SEO Intelligence

A React + Express application for running technical SEO audits, checking indexing health, analyzing crawled pages, and preparing remediation recommendations for a website.

## Stack

- React 19
- Vite
- TypeScript
- Express
- Google GenAI
- Cheerio
- Supabase / Vercel blob integration

## Local development

1. Install dependencies:
   npm install
2. Copy environment values from `.env.example` if available and fill in the required keys.
3. Start the app:
   npm run dev
4. Open the local URL shown in the terminal.

## Production build

npm run build

## Scripts

- `npm run dev` — starts the Express + Vite dev server
- `npm run build` — builds the frontend bundle
- `npm run preview` — previews the built app
- `npm run lint` — runs TypeScript checking

## Notes

This project is a dashboard-first SEO tool, so the architecture is intentionally organized around audit jobs, data exports, and remediation reporting.
