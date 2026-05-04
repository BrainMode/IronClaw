/**
 * Web URL Fetcher.
 *
 * Strategie (Reihenfolge wichtig, jeder Schritt ist günstiger als der nächste):
 *
 *   1. HTTP-Fetch + JSON-LD Parser  → 80% der Recipe-Blogs (schema.org Recipe)
 *      Cost: <€0.001, kein LLM nötig
 *
 *   2. HTTP-Fetch + Microdata Parser  → ältere Sites mit itemprop
 *      Cost: <€0.001
 *
 *   3. Firecrawl scrape (markdown) + LLM-Extract  → für Sites ohne strukturierte Daten
 *      Cost: ~€0.005-0.01
 *
 *   4. Firecrawl mit JS-Rendering + LLM-Extract  → für SPAs / heavy-JS Sites
 *      Cost: ~€0.01-0.02
 *
 *   5. Vision-LLM auf Page-Screenshot (Notlösung)  → wenn alles failed
 *      Cost: ~€0.02-0.05
 *
 * Edge cases die behandelt werden:
 * - Multiple Recipes (z.B. "10 Pasta Recipes") → MultipleRecipesResult
 * - Paywall (NYT Cooking) → JSON-LD oft trotzdem vorhanden, return mit Warning
 * - Cloudflare-Block → Firecrawl handhabt das, sonst error
 * - Cookie/GDPR Banner → Firecrawl umgeht, einfaches fetch nicht
 * - JS-rendered SPA → Firecrawl mit waitFor option
 * - Notion / Google Docs Public Share → Firecrawl funktioniert
 *
 * Siehe docs/RECIPE_IMPORT.md "Web URL — JSON-LD First, Always".
 */

import type { RawSourceContent } from "../extraction-strategy";
import type { mapJsonLdToRecipe } from "../jsonld";

export interface WebFetchOptions {
  url: string;
  /** Wenn true: skip JSON-LD pass und gehe direkt zu Firecrawl (für Tests / fallback) */
  forceFirecrawl?: boolean;
  onProgress?: (event: WebFetchEvent) => void;
}

export type WebFetchEvent =
  | { step: "http_fetch"; status: "running" | "done" | "failed" }
  | { step: "jsonld_parse"; status: "running" | "done"; recipes_found: number }
  | { step: "firecrawl"; status: "running" | "done" | "failed" }
  | { step: "vision_fallback"; status: "running" | "done" | "failed" };

export interface WebFetchResult {
  /** Eine oder mehrere RawSourceContent zur Synthesizer-Pipeline */
  sources: RawSourceContent[];
  /** Falls JSON-LD-Pass schon ein vollständiges Rezept geliefert hat:
   *  Synthesizer kann das direkt übernehmen ohne Fall through */
  jsonld_recipes?: ReturnType<typeof mapJsonLdToRecipe>[];
  /** Falls Site eine Paywall hatte */
  partial?: boolean;
  fatal_error?: { reason: string; user_suggestion: string };
}

/**
 * Implementation-Plan:
 *
 * ```
 * 1. const html = await fetch(url, { signal: AbortSignal.timeout(10000) }).then(r => r.text())
 *    - on error → fall through to Firecrawl
 *    - on 403/429/Cloudflare-page → fall through to Firecrawl
 *    - on paywall (typische signs: <meta name="paywall"... etc.) → mark partial=true und JSON-LD weiter probieren
 *
 * 2. const recipes = extractRecipesFromHtml(html)  // siehe jsonld.ts
 *    - if (recipes.length > 0) {
 *        const mapped = recipes.map(mapJsonLdToRecipe)
 *        return {
 *          sources: [{ type: 'jsonld', content: html, metadata: {...} }],
 *          jsonld_recipes: mapped,
 *        }
 *      }
 *
 * 3. Try microdata (Phase 2 — optional, viele alte Sites). Same idea, parse <div itemtype="...">
 *
 * 4. Firecrawl:
 *    const fc = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY! })
 *    const scraped = await fc.scrapeUrl(url, { formats: ['markdown', 'html'], onlyMainContent: true })
 *    - return { sources: [{ type: 'firecrawl_markdown', content: scraped.markdown, ... }] }
 *    - Synthesizer wird LLM-Extract drauf machen
 *
 * 5. Vision-Fallback nur wenn Firecrawl auch failed (selten):
 *    - Firecrawl mit screenshot=true → liefert PNG
 *    - Vision-LLM (Opus 4.7) auf Screenshot
 *
 * Important: für Schritt 4+ kein LLM-Call hier — wir liefern nur die Sources zurück.
 * Der zentrale Synthesizer macht den LLM-Call mit allen Sources auf einmal.
 * Aber: Schritt 1+2 schliessen die Pipeline EARLY ab wenn JSON-LD Treffer.
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function fetchWebUrl(_opts: WebFetchOptions): Promise<WebFetchResult> {
  throw new Error("Not implemented — Claude Code: see docstring");
}

// =============================================================================
// UTILS für Implementierung
// =============================================================================

const PAYWALL_INDICATORS = [
  "paywall",
  "subscribe to read",
  "Abonnement erforderlich",
  "subscriber-only",
  "premium content",
];

export function detectPaywall(html: string): boolean {
  const lower = html.toLowerCase();
  return PAYWALL_INDICATORS.some((s) => lower.includes(s.toLowerCase()));
}

const CLOUDFLARE_INDICATORS = [
  "Just a moment...",
  "Checking your browser",
  "cf-mitigated",
  "ddos protection by cloudflare",
];

export function isCloudflareBlock(html: string): boolean {
  return CLOUDFLARE_INDICATORS.some((s) => html.includes(s));
}
