/**
 * Pinterest Source — meistens nur Redirect-Schaufenster.
 *
 * Pattern: ein Pinterest-Pin enthält selten das Rezept selbst.
 * Stattdessen: Bild + kurze Description + Link zum Original (Recipe-Blog).
 *
 * Strategie:
 * 1. Pinterest-URL fetchen (HTML)
 * 2. Original-URL aus Page extrahieren (canonical link, oder data-attr)
 * 3. detectSource(originalUrl) → meistens 'web_url' → web.ts pipeline
 *
 * Wenn der Pin SELBST eine vollständige Recipe-Beschreibung hat (selten):
 * → RawSourceContent type='description' aus der Pin-Description.
 */

import type { RawSourceContent } from "../extraction-strategy";

export interface PinterestFetchOptions {
  url: string;
  onProgress?: (event: { step: "resolve"; status: "running" | "done" | "failed" }) => void;
}

export interface PinterestFetchResult {
  /** Wenn Re-Classification möglich war: nutze diese URL für nächste Pipeline-Iteration */
  resolved_url?: string;
  /** Sources wenn Pin selbst Inhalt hatte */
  sources: RawSourceContent[];
  fatal_error?: { reason: string; user_suggestion: string };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function fetchPinterest(_opts: PinterestFetchOptions): Promise<PinterestFetchResult> {
  throw new Error(
    "Not implemented — Claude Code: fetch HTML, extract canonical og:url oder pin's data-link-attribute → resolved_url",
  );
}
