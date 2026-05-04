/**
 * Facebook Source Fetcher.
 *
 * Facebook ist die instabilste Plattform für automatisierten Zugriff:
 * - Public posts manchmal accessbiar, manchmal nicht
 * - Viele Recipe-Posts in geschlossenen Gruppen → kein Zugriff
 * - yt-dlp braucht oft Cookies (Workaround: best-effort, fail gracefully)
 *
 * Strategie:
 * 1. yt-dlp versuchen (writeInfoJson für Caption-Text)
 * 2. Bei video/reel: Audio-Transcript-Pipeline
 * 3. Bei Failure: User auffordern Text/Screenshot zu schicken
 *
 * Wir zielen NICHT auf perfekte Coverage — Facebook-Recipes landen primär
 * über andere Pfade (User pasted Text manuell, oder Plattform Linkt zu Blog).
 */

import type { RawSourceContent } from "../extraction-strategy";

export interface FacebookFetchOptions {
  url: string;
  type: "facebook_post" | "facebook_video" | "facebook_reel";
  onProgress?: (event: FacebookFetchEvent) => void;
}

export type FacebookFetchEvent =
  | { step: "metadata"; status: "running" | "done" | "failed" }
  | { step: "audio_transcribe"; status: "running" | "done" | "skipped" };

export interface FacebookFetchResult {
  sources: RawSourceContent[];
  fatal_error?: { reason: string; user_suggestion: string };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function fetchFacebook(_opts: FacebookFetchOptions): Promise<FacebookFetchResult> {
  throw new Error(
    "Not implemented — Claude Code: yt-dlp best-effort. Wenn fehlschlägt, return fatal_error mit user_suggestion 'Bitte Caption als Text einfügen'.",
  );
}
