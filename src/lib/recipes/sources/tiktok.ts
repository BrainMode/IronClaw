/**
 * TikTok Source Fetcher.
 *
 * TikTok-Pattern:
 * - Caption ist kurz aber oft Zutaten-Liste komplett drin
 * - Steps fast immer im Audio (Voice-Over)
 * - Pinned Comment vom Creator manchmal mit voller Anleitung
 * - Cooking-TikToks meist 30-90s — billig zu transkribieren
 *
 * Tool: yt-dlp (TikTok-Support stabil), ElevenLabs Scribe.
 *
 * TikTok-Watermark im Audio: ElevenLabs filtert das.
 *
 * Edge cases:
 * - vt.tiktok.com / vm.tiktok.com Shortlinks → schon vom Detector resolved
 * - Region-locked Content → yt-dlp meist OK ohne Cookies
 * - Privates Konto → fail
 */

import type { RawSourceContent } from "../extraction-strategy";

export interface TiktokFetchOptions {
  url: string;
  onProgress?: (event: TiktokFetchEvent) => void;
}

export type TiktokFetchEvent =
  | { step: "metadata"; status: "running" | "done" | "failed" }
  | { step: "comments"; status: "running" | "done" | "failed" }
  | { step: "audio_transcribe"; status: "running" | "done" | "skipped" };

export interface TiktokFetchResult {
  sources: RawSourceContent[];
  fatal_error?: { reason: string; user_suggestion: string };
}

/**
 * Implementation-Plan:
 *
 * 1. yt-dlp(url, { skipDownload: true, writeInfoJson: true, writeComments: true })
 *    → caption (description), comments, duration
 *
 * 2. Caption → RawSourceContent type='caption'
 *
 * 3. Comments → pickPinnedComment-Heuristik (siehe youtube.ts) wiederverwenden
 *
 * 4. Audio: bei TikTok fast immer transkribieren (kurzer Clip, billig)
 *    Skip nur wenn Caption + Pinned Comment zusammen schon mehrere klare
 *    Mengen-Patterns enthalten (Heuristik: ≥ 8 ingredient-like lines)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function fetchTiktok(_opts: TiktokFetchOptions): Promise<TiktokFetchResult> {
  throw new Error("Not implemented — Claude Code: see docstring");
}
