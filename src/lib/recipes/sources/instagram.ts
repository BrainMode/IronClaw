/**
 * Instagram Source Fetcher.
 *
 * Quellen-Map:
 *   - Caption / Description           → primär
 *   - Carousel-Slides 2..N (Bilder)   → Vision-LLM-OCR wenn Caption "swipe für Rezept"
 *   - Bio-Link (Profil)               → Folge wenn Caption "Link in Bio" sagt
 *   - Reel-Audio                      → Transkript wenn Caption nicht reicht
 *   - Comments                        → fragil bei Instagram, low priority
 *
 * Tool: yt-dlp (funktioniert für Public Posts), Firecrawl für Profil/Bio-Page.
 *
 * Edge cases:
 * - Private Account → fail mit user_suggestion
 * - Story → meistens nicht erreichbar (ephemeral)
 * - Reel ohne Caption → Audio-Pipeline ist Pflicht
 * - Linktree als Bio-Link → multiple Sub-Links, müssen Match auf Post finden
 *
 * Siehe docs/RECIPE_IMPORT.md "Instagram — Caption + Bio + Carousel".
 */

import type { RawSourceContent } from "../extraction-strategy";

export interface InstagramFetchOptions {
  url: string;
  type: "instagram_post" | "instagram_reel" | "instagram_carousel" | "instagram_story";
  onProgress?: (event: InstagramFetchEvent) => void;
}

export type InstagramFetchEvent =
  | { step: "metadata"; status: "running" | "done" | "failed" }
  | { step: "carousel_ocr"; status: "running" | "done" | "skipped"; slides_processed?: number }
  | { step: "bio_link"; status: "running" | "done" | "failed" | "skipped"; resolved_url?: string }
  | { step: "audio_transcribe"; status: "running" | "done" | "skipped" };

export interface InstagramFetchResult {
  sources: RawSourceContent[];
  fatal_error?: { reason: string; user_suggestion: string };
}

/**
 * Implementation-Plan:
 *
 * ```
 * 1. yt-dlp(url, { skipDownload: true, writeInfoJson: true })
 *    → liefert: title, description (=caption), uploader, uploader_url,
 *      thumbnails[], (für Carousel: media[] mit allen Slides)
 *
 * 2. Caption → RawSourceContent type='caption'
 *
 * 3. If Carousel mit > 1 slide:
 *    For each slide image:
 *      Vision-LLM (Opus 4.7) prompt: "ist hier Rezept-Text drauf? wenn ja, transkribiere"
 *      → ggf. RawSourceContent type='image_ocr'
 *
 * 4. If Caption hat Pattern "Link in Bio" / "Rezept im Profil":
 *    Fetch uploader_url (Profil-Page) via Firecrawl
 *    Extract Bio-Link
 *    If Linktree/lnk.bio detected:
 *      Fetch Linktree, parse alle Sub-Links
 *      LLM-Match: welcher Link passt zu Caption?
 *      Fetch matched link → web.ts wrapper
 *    Else:
 *      Fetch Bio-Link direkt → web.ts wrapper (JSON-LD-First!)
 *    → RawSourceContent type='linked_page'
 *
 * 5. If Reel und Caption < 100 chars:
 *    yt-dlp -x audio
 *    ElevenLabs Scribe
 *    → RawSourceContent type='transcript'
 *
 * 6. Return all sources
 * ```
 *
 * Edge cases:
 * - Login-required (private account / age-restricted): yt-dlp wirft → fatal_error
 * - Story 24h-fenster überschritten: fatal_error mit user_suggestion "Bitte Screenshot teilen"
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function fetchInstagram(_opts: InstagramFetchOptions): Promise<InstagramFetchResult> {
  throw new Error("Not implemented — Claude Code: see docstring");
}

// =============================================================================
// UTILS
// =============================================================================

const BIO_LINK_HINTS = [
  /link\s*in\s*bio/i,
  /rezept\s*im\s*profil/i,
  /recipe\s*in\s*bio/i,
  /full\s*recipe.*bio/i,
  /click\s*the\s*link/i,
  /swipe\s*up.*recipe/i,
];

export function captionMentionsBioLink(caption: string): boolean {
  return BIO_LINK_HINTS.some((p) => p.test(caption));
}

const SWIPE_HINTS = [
  /swipe\s*(für|for)\s*(rezept|recipe)/i,
  /swipe\s*links/i,
  /scroll.*ingredients/i,
  /weiter.*zutaten/i,
];

export function captionMentionsCarouselText(caption: string): boolean {
  return SWIPE_HINTS.some((p) => p.test(caption));
}

const LINKTREE_HOSTS = [
  "linktr.ee",
  "lnk.bio",
  "beacons.ai",
  "bio.link",
  "campsite.bio",
  "many.link",
  "carrd.co",
];

export function isLinktreeUrl(url: string): boolean {
  return LINKTREE_HOSTS.some((h) => url.toLowerCase().includes(h));
}
