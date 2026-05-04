/**
 * Image-Source Fetcher.
 *
 * User lädt ein Foto hoch (handgeschrieben, Kochbuch-Seite, Screenshot, ...).
 * Vision-LLM (Opus 4.7) macht OCR + Strukturierung in einem Schritt.
 *
 * Edge cases:
 * - Mehrere Rezepte auf einer Seite (Doppelseite Kochbuch) → MultipleRecipesResult
 * - Foto vom Esstisch / Fertigem Gericht → Vision erkennt das, return error 'no_recipe_found'
 * - Screenshot von Instagram-Post → einfach behandeln, OCR pass durch
 * - Reflektionen / Schatten / Hand im Bild → Vision schafft, Confidence sinkt
 */

import type { RawSourceContent } from "../extraction-strategy";

export interface ImageFetchOptions {
  /** Path to image in Supabase Storage oder lokales Path */
  imagePath: string;
  /** Optional: Hinweis vom User, was im Bild ist (z.B. "Großmutter's Tagliatelle") */
  userHint?: string;
}

export interface ImageFetchResult {
  sources: RawSourceContent[];
}

/**
 * Implementation-Plan:
 *
 * 1. Image-Bytes laden (Supabase Storage oder fs)
 * 2. Vision-LLM-Call mit prompt "extrahiere Rezept, oder return no_recipe_found"
 *    Wichtig: Bild geht direkt zum Synthesizer als RawSourceContent type='image_ocr'
 *    (kein separater Text-Pass)
 * 3. Wenn User-Hint vorhanden: in System-Prompt erwähnen
 *
 * Synthesizer macht den eigentlichen Extraction-LLM-Call mit dem Bild.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function fetchImage(_opts: ImageFetchOptions): Promise<ImageFetchResult> {
  throw new Error("Not implemented");
}
