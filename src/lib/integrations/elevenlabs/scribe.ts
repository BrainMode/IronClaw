/**
 * ElevenLabs Scribe — Speech-to-Text für Video-Transkription.
 *
 * Verwendet wenn:
 * - Rezept aus YouTube-Video, das KEINE Captions hat
 * - Rezept aus Instagram/TikTok Reel (haben oft keine Captions)
 *
 * Flow:
 *   1. Video-URL via yt-dlp herunterladen → audio extract (z.B. .mp3, mono, 16khz)
 *      → ODER: client-side via ffmpeg.wasm wenn der User die Datei hochlädt
 *   2. Audio-Datei an ElevenLabs Scribe POSTen
 *   3. Transcript zurück
 *   4. → recipe-extraction.md prompt mit `<source type="video_transcript">`
 *
 * Doku: https://elevenlabs.io/docs/api-reference/speech-to-text/convert
 *
 * Sprache: 'auto' lassen — Scribe kann Deutsch/Italienisch/Englisch/etc. selbst erkennen.
 *
 * Cost-Hinweis: Scribe ist nicht das billigste STT, aber Genauigkeit für Kochinhalte
 * (Mengen, Zutaten, Verben) ist sehr gut. Alternative Whisper via OpenRouter
 * würde auch funktionieren — falls Cost-Optimierung nötig.
 */

import { z } from "zod";

export const transcriptionResultSchema = z.object({
  text: z.string(),
  language: z.string().optional(),
  duration_seconds: z.number().optional(),
  words: z
    .array(
      z.object({
        text: z.string(),
        start: z.number(),
        end: z.number(),
      }),
    )
    .optional(),
});

export type TranscriptionResult = z.infer<typeof transcriptionResultSchema>;

export async function transcribeAudio(_audioBuffer: Buffer): Promise<TranscriptionResult> {
  throw new Error("Not implemented — Claude Code: use elevenlabs SDK speech-to-text endpoint");
}

/**
 * High-level: nimm eine Video-URL, gib Transcript zurück.
 * Pipeline: youtube-dl → audio extract → ElevenLabs Scribe.
 */
export async function transcribeVideoUrl(_url: string): Promise<TranscriptionResult> {
  throw new Error("Not implemented");
}
