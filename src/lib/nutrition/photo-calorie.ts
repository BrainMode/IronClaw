/**
 * Photo Calorie Estimation.
 *
 * User-Flow:
 *   1. User schießt Foto vom Teller (Restaurant, Selbst-gekocht, Snack)
 *   2. Upload zu Supabase Storage
 *   3. Vision-LLM (Opus 4.7) analysiert: Identifiziert Items, schätzt Mengen, kcal/Macros
 *   4. UI zeigt Schätzung + Confidence + Edit-Option
 *   5. User bestätigt → Insert in nutrition_logs
 *
 * Wichtig: Confidence ist hier essenziell. ±20-30% Genauigkeit ist OK,
 * solange klar kommuniziert. UI rendert Confidence-Badge prominent.
 *
 * Design-Entscheidung: Vision macht die KOMPLETTE Schätzung in einem Pass.
 * Kein separater "Identify Items → Lookup Database" Workflow — zu langsam,
 * zu viele Edge-Cases (Restaurant-Portion vs. Standard, etc.).
 *
 * Optional: User-Hint hilft enorm. "Tagliata mit Rucola, Restaurant-Portion"
 * ist 5x genauer als nur Bild.
 */

import { z } from "zod";

// =============================================================================
// SCHEMA
// =============================================================================

export const photoCalorieResultSchema = z.object({
  detected_items: z
    .array(
      z.object({
        name: z.string().describe("Name des erkannten Items, z.B. 'Hähnchenbrust gegrillt'"),
        portion_g_estimate: z.number().nonnegative(),
        portion_confidence: z.number().min(0).max(1),
      }),
    )
    .min(1),
  total_kcal: z.number().nonnegative(),
  total_protein_g: z.number().nonnegative(),
  total_carbs_g: z.number().nonnegative(),
  total_fat_g: z.number().nonnegative(),
  total_fiber_g: z.number().nonnegative().optional(),
  /** Aggregierte Confidence — User sieht das prominent */
  overall_confidence: z.number().min(0).max(1),
  /** Begründung für Confidence-Niveau, z.B. 'Sauce-Zusammensetzung unklar' */
  uncertainty_factors: z.array(z.string()).default([]),
  /** Plausible Bandbreite, falls overall_confidence < 0.7 */
  kcal_range_low: z.number().nonnegative().optional(),
  kcal_range_high: z.number().nonnegative().optional(),
  /** "Es könnte sich auch handeln um …" */
  alternative_interpretations: z.array(z.string()).default([]),
});

export type PhotoCalorieResult = z.infer<typeof photoCalorieResultSchema>;

// =============================================================================
// MAIN ESTIMATION
// =============================================================================

export interface EstimateOptions {
  photo_storage_path: string;
  user_hint?: string;
  plate_size_hint?: "small" | "medium" | "large" | "xl";
  /** Override Modell — Vision braucht Opus 4.7 */
  model?: string;
}

/**
 * Implementation-Plan:
 *
 * ```
 * 1. const { data, error } = await supabase.storage
 *      .from('meal-photos')
 *      .download(opts.photo_storage_path)
 *    → Bytes
 *
 * 2. base64 = Buffer.from(await data.arrayBuffer()).toString('base64')
 *
 * 3. const result = await generateObject({
 *      model: ai(opts.model ?? MODELS.primary),  // Opus 4.7
 *      schema: photoCalorieResultSchema,
 *      messages: [{
 *        role: 'user',
 *        content: [
 *          { type: 'image', image: `data:image/jpeg;base64,${base64}` },
 *          { type: 'text', text: PHOTO_PROMPT(opts.user_hint, opts.plate_size_hint) },
 *        ],
 *      }],
 *    })
 *
 * 4. Logge AI-Cost in ai_usage_logs (feature='photo_calorie')
 *
 * 5. Return result.object für UI-Confirmation
 * ```
 *
 * PHOTO_PROMPT muss vermitteln:
 * - Schätze in metrischen Einheiten
 * - Sei eher zu hoch als zu niedrig (User will nicht Kalorien unterschätzen wenn er Cuts)
 * - Wenn unsicher: kcal_range_low/high statt false-precision
 * - Identifiziere Items separat — User kann später einzelne korrigieren
 * - Plate-Size-Hint nutzen wenn da (small=20cm, medium=24cm, large=28cm, xl=32cm Teller)
 * - User-Hint übergewichten ("Restaurant-Portion" → größer schätzen)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function estimateMealFromPhoto(_opts: EstimateOptions): Promise<PhotoCalorieResult> {
  throw new Error("Not implemented — Claude Code: see docstring pattern");
}

// =============================================================================
// AUTO-LOG WRAPPER
// =============================================================================

export interface AutoLogInput extends EstimateOptions {
  user_id: string;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  /** Wenn true: User hat im Vorfeld bestätigt blind zu loggen (z.B. via API) */
  skip_confirmation: boolean;
}

/**
 * Convenience: estimate + log direkt. Nur wenn user-confirmed.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function estimateAndLog(
  _input: AutoLogInput,
): Promise<{ estimate: PhotoCalorieResult; nutrition_log_id: string }> {
  throw new Error("Not implemented");
}
