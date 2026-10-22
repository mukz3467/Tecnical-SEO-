import { PerformanceMetrics, CrawledPage } from './types.ts';

function numericValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export async function analyzePerformance(
  targetUrl: string,
  crawledPages: CrawledPage[],
  apiKey?: string
): Promise<PerformanceMetrics> {
  const resolvedKey = apiKey || process.env.PAGESPEED_API_KEY;
  let apiFailure = 'PAGESPEED_API_KEY is not configured; Google PageSpeed Insights was not called.';

  if (resolvedKey) {
    try {
      const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
      endpoint.searchParams.set('url', targetUrl);
      endpoint.searchParams.set('key', resolvedKey);
      endpoint.searchParams.set('strategy', 'mobile');
      endpoint.searchParams.append('category', 'performance');

      const response = await fetch(endpoint, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
        apiFailure = `Google PageSpeed Insights returned HTTP ${response.status}: ${body.error?.message || 'No error detail provided'}.`;
      } else {
        const data = await response.json();
        const lighthouse = data?.lighthouseResult;
        const audits = lighthouse?.audits || {};
        const categoryScore = numericValue(lighthouse?.categories?.performance?.score);
        if (!lighthouse || categoryScore === undefined) {
          apiFailure = 'Google PageSpeed Insights returned no valid Lighthouse performance score.';
        } else {
          const fieldMetrics = data?.loadingExperience?.metrics || {};
          const hasFieldData = Object.keys(fieldMetrics).length > 0;
          const lcpField = numericValue(fieldMetrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile);
          const clsField = numericValue(fieldMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile);
          const inpField = numericValue(fieldMetrics.INTERACTION_TO_NEXT_PAINT?.percentile);

          const lcpLab = numericValue(audits['largest-contentful-paint']?.numericValue);
          const clsLab = numericValue(audits['cumulative-layout-shift']?.numericValue);
          const fcpLab = numericValue(audits['first-contentful-paint']?.numericValue);
          const ttfbLab = numericValue(audits['server-response-time']?.numericValue);

          return {
            source: 'google_pagespeed_api',
            isFieldData: hasFieldData,
            fieldDataNotice: hasFieldData
              ? 'Google PageSpeed Insights returned Chrome UX Report field data for this URL. Individual metrics are shown only when present in the response; other values are Lighthouse lab measurements.'
              : 'Google PageSpeed Insights returned Lighthouse lab data, but no URL-level Chrome UX Report field data was available. Lab data is not real-user field data.',
            score: Math.round(categoryScore * 100),
            metrics: {
              ttfbMs: ttfbLab === undefined ? undefined : Math.round(ttfbLab),
              lcpMs: lcpField ?? lcpLab,
              cls: clsField ?? clsLab,
              fcpMs: fcpLab === undefined ? undefined : Math.round(fcpLab),
              inpMs: inpField === undefined ? undefined : Math.round(inpField)
            },
            diagnostics: {
              oversizedImages: audits['uses-responsive-images']?.details?.items?.length,
              missingDimensionsCount: audits['image-size-responsive']?.details?.items?.length,
              renderBlockingResources: audits['render-blocking-resources']?.details?.items?.length,
              uncompressedResponses: audits['uses-text-compression']?.details?.items?.length,
              cachingOpportunities: audits['uses-long-cache-ttl']?.details?.items?.length
            }
          };
        }
      }
    } catch (error) {
      apiFailure = `Google PageSpeed Insights request failed: ${error instanceof Error ? error.message : 'unknown error'}.`;
    }
  }

  // Local crawl findings are not a PageSpeed score and cannot measure Core Web Vitals.
  const missingDimensions = crawledPages.reduce((sum, page) => sum + page.imagesMissingDimensions, 0);
  const uncompressed = crawledPages.filter(page => page.mobileFriendlySignals.missingTextCompression).length;

  return {
    source: 'local_diagnostics',
    isFieldData: false,
    fieldDataNotice: `${apiFailure} No synthetic performance score, LCP, CLS, INP, or Lighthouse diagnostics have been invented. Values below are limited to findings directly observed by this application's HTML crawl.`,
    metrics: {},
    diagnostics: {
      missingDimensionsCount: missingDimensions,
      uncompressedResponses: uncompressed
    }
  };
}
