/**
 * Web URL Fetcher.
 *
 * Strategy (cost-ascending):
 *   1. plain fetch + JSON-LD parse  → 80% of recipe blogs, no LLM cost
 *   2. plain fetch + Firecrawl markdown if JSON-LD missing
 *   3. (later: Vision-LLM on screenshot — skipped in v1)
 *
 * Returns RawSourceContent[] for the synthesizer + jsonld_recipes for the
 * shortcut path that bypasses the LLM entirely.
 */

import { scrapeUrl } from "@/lib/integrations/firecrawl/extract";
import type { RawSourceContent } from "../extraction-strategy";
import { extractRecipesFromHtml, mapJsonLdToRecipe } from "../jsonld";

export interface WebFetchOptions {
  url: string;
  forceFirecrawl?: boolean;
  onProgress?: (event: WebFetchEvent) => void;
}

export type WebFetchEvent =
  | { step: "http_fetch"; status: "running" | "done" | "failed" }
  | { step: "jsonld_parse"; status: "running" | "done"; recipes_found: number }
  | { step: "firecrawl"; status: "running" | "done" | "failed" };

export interface WebFetchResult {
  sources: RawSourceContent[];
  /** Falls JSON-LD-Pass schon ein vollständiges Rezept geliefert hat — Synthesizer
   *  kann das direkt übernehmen ohne LLM-Call. */
  jsonld_recipes?: ReturnType<typeof mapJsonLdToRecipe>[];
  partial?: boolean;
  fatal_error?: { reason: string; user_suggestion: string };
}

const PAYWALL_INDICATORS = [
  "paywall",
  "subscribe to read",
  "abonnement erforderlich",
  "subscriber-only",
  "premium content",
];

export function detectPaywall(html: string): boolean {
  const lower = html.toLowerCase();
  return PAYWALL_INDICATORS.some((s) => lower.includes(s));
}

const CLOUDFLARE_INDICATORS = [
  "Just a moment...",
  "Checking your browser",
  "cf-mitigated",
  "DDoS protection by Cloudflare",
];

export function isCloudflareBlock(html: string): boolean {
  return CLOUDFLARE_INDICATORS.some((s) => html.includes(s));
}

export async function fetchWebUrl(opts: WebFetchOptions): Promise<WebFetchResult> {
  const { url, forceFirecrawl, onProgress } = opts;
  const sources: RawSourceContent[] = [];
  const fetchedAt = new Date().toISOString();

  // 1. Plain HTTP fetch (skip if forceFirecrawl)
  let html: string | null = null;
  if (!forceFirecrawl) {
    onProgress?.({ step: "http_fetch", status: "running" });
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; IronClaw/1.0; +https://github.com/BrainMode/IronClaw)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "de,en;q=0.9",
        },
      });
      if (res.ok) {
        html = await res.text();
        onProgress?.({ step: "http_fetch", status: "done" });
      } else {
        onProgress?.({ step: "http_fetch", status: "failed" });
      }
    } catch {
      onProgress?.({ step: "http_fetch", status: "failed" });
    }
  }

  const partial = html ? detectPaywall(html) : false;
  const blocked = html ? isCloudflareBlock(html) : false;
  if (blocked) html = null; // ignore CF challenge page

  // 2. JSON-LD Pass
  if (html) {
    onProgress?.({ step: "jsonld_parse", status: "running", recipes_found: 0 });
    const rawRecipes = extractRecipesFromHtml(html);
    if (rawRecipes.length > 0) {
      const mapped = rawRecipes.map((r) => mapJsonLdToRecipe(r));
      onProgress?.({
        step: "jsonld_parse",
        status: "done",
        recipes_found: mapped.length,
      });
      sources.push({
        type: "jsonld",
        content: rawRecipes[0] as Record<string, unknown>,
        metadata: {
          url,
          fetched_at: fetchedAt,
          char_count: html.length,
          notes:
            mapped.length > 1
              ? `Multiple recipes on page (${mapped.length}) — first selected`
              : undefined,
        },
      });
      return { sources, jsonld_recipes: mapped, partial };
    }
    onProgress?.({ step: "jsonld_parse", status: "done", recipes_found: 0 });
  }

  // 3. Firecrawl markdown fallback
  onProgress?.({ step: "firecrawl", status: "running" });
  const fc = await scrapeUrl(url);
  if (fc.ok && fc.markdown) {
    onProgress?.({ step: "firecrawl", status: "done" });
    sources.push({
      type: "firecrawl_markdown",
      content: fc.markdown,
      metadata: {
        url,
        fetched_at: fetchedAt,
        char_count: fc.markdown.length,
      },
    });

    // If Firecrawl-html is JSON-LD-bearing (some sites need JS-render to expose JSON-LD),
    // try parsing one more time
    if (fc.html) {
      const rawRecipes = extractRecipesFromHtml(fc.html);
      if (rawRecipes.length > 0) {
        const mapped = rawRecipes.map((r) => mapJsonLdToRecipe(r));
        sources.push({
          type: "jsonld",
          content: rawRecipes[0] as Record<string, unknown>,
          metadata: {
            url,
            fetched_at: fetchedAt,
            char_count: fc.html.length,
            notes: "JSON-LD only available after JS-render",
          },
        });
        return { sources, jsonld_recipes: mapped, partial };
      }
    }
    return { sources, partial };
  }

  onProgress?.({ step: "firecrawl", status: "failed" });
  return {
    sources,
    fatal_error: {
      reason: "Web-URL konnte weder direkt noch via Firecrawl geladen werden.",
      user_suggestion:
        "Bitte teile den Recipe-Text als Plain-Text oder lade einen Screenshot hoch.",
    },
  };
}
