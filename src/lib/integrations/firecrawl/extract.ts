/**
 * Firecrawl wrapper. Uses @mendable/firecrawl-js v1 API.
 *
 * Strategy:
 * - scrapeUrl with formats=['markdown', 'html'] for the synthesis pipeline
 * - Markdown-only is enough for most LLM-extraction
 * - JS-rendering happens automatically by Firecrawl
 *
 * env: FIRECRAWL_API_KEY
 */

import FirecrawlApp from "@mendable/firecrawl-js";

let client: FirecrawlApp | null = null;
function getClient(): FirecrawlApp {
  if (!client) {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) throw new Error("FIRECRAWL_API_KEY missing");
    client = new FirecrawlApp({ apiKey });
  }
  return client;
}

export interface ScrapeResult {
  ok: boolean;
  markdown?: string;
  html?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  try {
    const c = getClient();
    const res = await c.scrapeUrl(url, {
      formats: ["markdown", "html"],
      onlyMainContent: true,
      timeout: 30000,
    });
    if (!res.success) {
      return { ok: false, error: res.error ?? "Firecrawl scrape failed" };
    }
    return {
      ok: true,
      markdown: res.markdown,
      html: res.html,
      metadata: res.metadata as Record<string, unknown> | undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
