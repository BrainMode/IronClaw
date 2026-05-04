/**
 * YouTube Source Fetcher.
 *
 * YouTube hat 5 mögliche Recipe-Quellen — wir holen alle parallel,
 * Synthesizer entscheidet welche (oder Kombi) das echte Rezept liefert.
 *
 * Quellen-Priorität:
 *   1. Beschreibung (description) — am häufigsten, schreibt Creator selbst
 *   2. Pinned/Top-Comment des Creators — sehr oft bei Shorts und kurzen Videos
 *   3. Verlinkte Webseite in description — Recipe-Blog des Creators (JSON-LD-Goldgrube)
 *   4. Captions (manuell > auto-generated)
 *   5. Audio-Transcript via ElevenLabs Scribe (last resort, teuer)
 *
 * Tool: yt-dlp (npm-Wrapper: youtube-dl-exec)
 *
 * Performance-Optimierungen:
 * - Outbound-Links parallel fetchen wenn vorhanden
 * - Audio nur wenn Description+Comments+Captions nicht ausreichen
 * - Chapters nutzen für selektive Audio-Transkription
 *
 * Siehe docs/RECIPE_IMPORT.md "YouTube — der Multi-Pass-Champion".
 */

import type { RawSourceContent } from "../extraction-strategy";

// =============================================================================
// PUBLIC INTERFACE
// =============================================================================

export interface YoutubeFetchOptions {
  url: string;
  videoId: string;
  isShorts?: boolean;
  /** Max Audio-Dauer für Transkription in Sekunden (Cost-Schutz). Default: 600 (10min). */
  maxAudioSeconds?: number;
  /**
   * Wenn true: starte sofort Audio-Pipeline parallel zu Description-Fetch.
   * Wenn false (default): erst evaluiere Description/Comments, dann entscheide.
   */
  eagerAudio?: boolean;
  /** Progress-Callback für UI-Streaming */
  onProgress?: (event: YoutubeFetchEvent) => void;
}

export type YoutubeFetchEvent =
  | { step: "metadata"; status: "running" | "done" | "failed"; message?: string }
  | { step: "comments"; status: "running" | "done" | "failed"; pinned_found?: boolean }
  | { step: "linked_pages"; status: "running" | "done" | "failed"; count?: number }
  | { step: "captions"; status: "running" | "done" | "failed"; lang?: string }
  | {
      step: "audio_transcribe";
      status: "running" | "done" | "failed" | "skipped";
      reason?: string;
    };

export interface YoutubeFetchResult {
  sources: RawSourceContent[];
  /** Falls die Pipeline ein vollständiges JSON-LD von einem verlinkten Blog gefunden hat:
   *  Hint dass Synthesizer das priorisieren soll */
  has_jsonld_from_linked_page?: boolean;
  /** Wenn yt-dlp nichts laden konnte: Error mit hint */
  fatal_error?: { reason: string; user_suggestion: string };
}

// =============================================================================
// IMPLEMENTATION SKETCH (Claude Code: ausarbeiten)
// =============================================================================

/**
 * Führt den kompletten YouTube-Fetch aus.
 *
 * Implementation-Plan:
 *
 * ```
 * 1. yt-dlp Aufruf:
 *    youtube-dl-exec(url, {
 *      skipDownload: true,
 *      writeInfoJson: true,
 *      writeComments: true,
 *      extractorArgs: 'youtube:max_comments=20,max_replies=0',
 *      writeAutoSubs: true,
 *      writeSubs: true,
 *      subLangs: 'de,en,it,fr',
 *      convertSubs: 'srt',
 *      output: '/tmp/wdc-yt-{video_id}.%(ext)s',
 *    })
 *    → liefert .info.json + ggf. .de.srt / .en.srt
 *
 * 2. Parse info.json:
 *    - description → RawSourceContent type='description'
 *    - comments[] → finde pinned/top creator-comment → RawSourceContent type='pinned_comment'
 *    - chapters[] → speichern für selective transcription
 *
 * 3. URL-Extraktion aus description:
 *    - Regex auf URLs
 *    - Filter affiliate / social / merch
 *    - Für jede relevante URL: parallel `webSourceFetch(url)` (siehe web.ts)
 *    - Wenn JSON-LD Recipe gefunden → has_jsonld_from_linked_page = true
 *
 * 4. Captions parsen (falls vorhanden):
 *    - SRT-Datei einlesen
 *    - Timestamps strippen, nur Text
 *    - → RawSourceContent type='caption'
 *
 * 5. Decision: Audio-Transcribe nötig?
 *    - SKIP wenn: Description hat klare Zutaten-Liste (Heuristik: ≥5 zeilen mit Mengen-Pattern)
 *    - SKIP wenn: Pinned Comment hat klares Rezept
 *    - SKIP wenn: Linked Page lieferte JSON-LD
 *    - SKIP wenn: Captions vorhanden und genug Inhalt
 *    - SKIP wenn: Video > maxAudioSeconds und keine Chapters
 *    - DO IT wenn: keine andere Quelle ausreicht
 *
 * 6. Audio-Pipeline (falls nötig):
 *    - yt-dlp -x --audio-format mp3 -o /tmp/audio.mp3 (oder bestaudio)
 *    - Wenn chapters und einige matchen 'recipe|ingredient|cook|prep':
 *        → ffmpeg -ss start -t duration für jede Chapter, separat transkribieren
 *    - Sonst: ganzes File transkribieren
 *    - ElevenLabs Scribe Call (siehe integrations/elevenlabs/scribe.ts)
 *    - → RawSourceContent type='transcript' oder 'transcript_chapter'
 *
 * 7. Return: alle gefundenen Sources
 * ```
 *
 * Edge cases:
 * - Video private / age-restricted: yt-dlp wirft → return fatal_error mit user_suggestion
 * - Video > 30min: skip audio entirely, nur description+comments+captions
 * - Keine deutschen Captions: nimm englisch/italienisch in dieser Reihenfolge
 * - Pinned-Detection: yt-dlp setzt is_pinned nicht zuverlässig → Heuristik (siehe pickPinnedComment)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function fetchYoutube(_opts: YoutubeFetchOptions): Promise<YoutubeFetchResult> {
  throw new Error(
    "Not implemented — Claude Code: implement per pseudo-code in this file's docstring.",
  );
}

// =============================================================================
// UTILS (für Claude Code zum Wiederverwenden)
// =============================================================================

/**
 * Findet den wahrscheinlichsten Pinned-Comment des Creators.
 *
 * Heuristik: yt-dlp comments-Array hat oft den pinned an Position 0.
 * Aber: nicht zuverlässig. Daher kombinierter Score:
 *   - +5 wenn author_is_uploader
 *   - +3 wenn position 0
 *   - +2 wenn enthält viele Mengen-Patterns (g, ml, EL, TL)
 *   - +1 pro 100 chars (lange Kommentare = Rezepte)
 *   - -2 wenn enthält "subscribe" "patreon" "thanks"
 *
 * Return: Comment mit höchstem Score, oder null wenn keiner > Threshold.
 */
export function pickPinnedComment(
  comments: Array<{
    text: string;
    author: string;
    author_is_uploader?: boolean;
    is_pinned?: boolean;
    like_count?: number;
  }>,
  uploaderName: string,
): (typeof comments)[number] | null {
  if (comments.length === 0) return null;

  const scored = comments.map((c, idx) => {
    let score = 0;
    if (c.is_pinned) score += 10;
    if (c.author_is_uploader || c.author === uploaderName) score += 5;
    if (idx === 0) score += 3;

    const mengenPattern = /\b\d+\s*(g|kg|ml|l|EL|TL|Stk|Prise|Bund)\b/gi;
    const matches = c.text.match(mengenPattern) ?? [];
    score += Math.min(matches.length, 5);

    if (c.text.length > 200) score += Math.min(Math.floor(c.text.length / 200), 5);

    if (/subscribe|patreon|thanks for|merch|affiliate/i.test(c.text)) score -= 3;

    return { comment: c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;
  return best.score >= 5 ? best.comment : null;
}

/**
 * Extrahiert URLs aus Description. Filtert Standard-Noise (Affiliate, Social).
 */
export function extractRecipeLinks(description: string): string[] {
  const urlRegex = /https?:\/\/[^\s\)\]]+/gi;
  const urls = description.match(urlRegex) ?? [];

  const blacklist = [
    "amzn.to",
    "amazon.com",
    "amazon.de",
    "click.",
    "patreon.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "tiktok.com",
    "facebook.com",
    "youtube.com", // Kreuzverlinkung auf andere Videos
    "youtu.be",
    "tiktok.com",
    "merch",
    "shop.",
    "spotify.com",
    "open.spotify",
    "apple.co",
    "linktr.ee", // schauen wir uns separat an wenn nichts anderes hilft
  ];

  return urls
    .map((u) => u.replace(/[.,;]+$/, "")) // Trailing-Punctuation
    .filter((u) => !blacklist.some((b) => u.toLowerCase().includes(b)))
    .slice(0, 5); // hard cap, niemand hat mehr als 5 echte Recipe-Links
}

/**
 * Filter Chapters die wahrscheinlich das Rezept enthalten.
 * Nicht: Intro, Outro, Sponsorship, Q&A.
 */
export function filterRecipeChapters(
  chapters: Array<{ title: string; start_time: number; end_time: number }>,
): typeof chapters {
  if (!chapters || chapters.length === 0) return [];

  const recipePattern =
    /zutaten|ingredient|cooking|cook\b|recipe|rezept|prep|method|how.{0,3}to.{0,3}make|zubereit|anleitung|step/i;
  const skipPattern = /intro|outro|sponsor|merch|q.?a|outtake|blooper|subscribe/i;

  return chapters.filter((c) => recipePattern.test(c.title) && !skipPattern.test(c.title));
}
