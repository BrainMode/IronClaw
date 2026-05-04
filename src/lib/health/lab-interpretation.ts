/**
 * Lab Result Pipeline.
 *
 * Workflow:
 *   1. User lädt Bluttest-PDF/Foto hoch
 *   2. Vision-LLM extrahiert strukturierte Werte (test_name, value, unit, range)
 *   3. AI-Interpretation:
 *      - vergleicht mit Referenzbereichen UND mit "optimalen" Bereichen aus aktueller Forschung
 *        (NICHT die Standard-Lab-Ranges, die oft sehr breit sind)
 *      - schlägt Supplements vor mit konkreten Marken + Dosierungen
 *      - schlägt Lifestyle-Anpassungen vor (Schlaf, Cardio, Sonnenlicht, …)
 *      - schlägt Follow-up-Tests vor
 *      - alle Empfehlungen mit Studien-Quellen
 *
 * Wichtig:
 *   - KEIN medizinischer Rat — Disclaimer in jeder Antwort
 *   - Quellen: PubMed, Examine.com, Stronger by Science, etc.
 *   - NICHT zitieren: DGE-Empfehlungen, RDA/USDA bei Werten wo aktuelle Forschung
 *     deutlich höhere Optimum-Bereiche zeigt (z.B. Vitamin D)
 */

import { z } from "zod";

// =============================================================================
// EXTRACTION SCHEMA
// =============================================================================

export const extractedTestValueSchema = z.object({
  /** Kanonischer Name (snake_case): 'vitamin_d_25oh', 'testosterone_total',
   *  'tsh', 'ferritin', 'b12_holotc', 'magnesium_serum', 'hba1c' */
  test_key: z.string(),
  display_name: z.string(),
  value: z.number(),
  unit: z.string(),
  /** Lab-eigener Referenzbereich (oft zu breit) */
  lab_reference_low: z.number().optional(),
  lab_reference_high: z.number().optional(),
  /** Lab's eigene Markierung */
  lab_flag: z.enum(["normal", "low", "high", "critical"]).optional(),
  source_quality: z.enum(["high", "medium", "low"]).default("high"),
});

export const extractedLabSchema = z.object({
  taken_at: z.string().describe("ISO date — wann der Bluttest war"),
  lab_name: z.string().optional(),
  panel_type: z.enum([
    "basic",
    "metabolic",
    "hormonal",
    "thyroid",
    "micronutrients",
    "inflammation",
    "custom",
  ]),
  values: z.array(extractedTestValueSchema).min(1),
  /** Was war im PDF nicht extrahierbar */
  extraction_warnings: z.array(z.string()).default([]),
});

export type ExtractedLab = z.infer<typeof extractedLabSchema>;

// =============================================================================
// INTERPRETATION SCHEMA
// =============================================================================

export const labInterpretationSchema = z.object({
  // Zusammenfassung — 2-3 Sätze, evidence-based
  summary: z.string(),

  // Pro Wert: Bewertung gegen optimal-Bereich, nicht nur lab-range
  value_assessments: z
    .array(
      z.object({
        test_key: z.string(),
        lab_classification: z.enum(["below_optimal", "optimal", "above_optimal", "needs_followup"]),
        // Optimal-Range basierend auf moderner Forschung
        // NICHT: Standard-Lab-Range (oft zu breit, USA-Daten alt)
        optimal_range_low: z.number().optional(),
        optimal_range_high: z.number().optional(),
        evidence_summary: z.string(),
        evidence_doi_or_url: z.string().optional(),
      }),
    )
    .default([]),

  // Konkrete Supplement-Empfehlungen
  supplement_suggestions: z
    .array(
      z.object({
        name: z.string(),
        suggested_brand: z.string().optional(),
        dosage_amount: z.number(),
        dosage_unit: z.string(),
        frequency: z.string(),
        duration_weeks: z.number().int().optional(),
        rationale: z.string(),
        evidence_summary: z.string(),
      }),
    )
    .default([]),

  // Lifestyle-Empfehlungen
  lifestyle_suggestions: z
    .array(
      z.object({
        category: z.enum([
          "sleep",
          "sun_exposure",
          "cardio",
          "strength",
          "nutrition",
          "stress",
          "cold_heat",
        ]),
        recommendation: z.string(),
        evidence_summary: z.string(),
      }),
    )
    .default([]),

  // Follow-up Tests
  followup_tests: z
    .array(
      z.object({
        test: z.string(),
        when_weeks: z.number().int().optional(),
        rationale: z.string(),
      }),
    )
    .default([]),

  // Disclaimer + sicherheitsrelevante Hinweise
  red_flags: z
    .array(z.string())
    .default([])
    .describe("Werte die sofort medizinisch geklärt werden sollten"),
  disclaimer: z.string(),
});

export type LabInterpretation = z.infer<typeof labInterpretationSchema>;

// =============================================================================
// PIPELINE
// =============================================================================

export interface InterpretLabInput {
  user_id: string;
  /** Path zum Original-PDF/Bild im Supabase Storage */
  source_file_path: string;
  /** Optional: User-Kontext für bessere Interpretation */
  user_context?: {
    age: number;
    sex: "male" | "female";
    weight_kg: number;
    activity_level: "sedentary" | "light" | "moderate" | "high" | "athlete";
    current_supplements: Array<{ name: string; dosage_amount: number; dosage_unit: string }>;
    symptoms?: string[]; // z.B. ['Müdigkeit', 'Konzentration schlecht']
    current_goal_phase?: "cut" | "bulk" | "maintenance" | "recomp";
  };
}

/**
 * Implementation-Plan:
 *
 * 1. Vision-LLM (Opus 4.7) extrahiert strukturiert aus PDF/Foto
 *    → ExtractedLab (validiert via extractedLabSchema)
 *
 * 2. Zweiter LLM-Call: Interpretation mit System-Prompt 'evidence-based, NOT DGE'
 *    Inputs: ExtractedLab + user_context
 *    Output: LabInterpretation
 *
 * 3. Persist in lab_results.ai_interpretation
 *    + evidence_sources für Audit-Trail
 *
 * 4. Trigger Coach-Notification: "Bluttest analysiert — X Auffälligkeiten"
 *
 * Wichtig: zwei Pässe halten Extraction sauber von Interpretation.
 * Falls extraction unsicher (PDF schlecht) → User korrigiert bevor interpretiert wird.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function extractLabValues(_input: {
  source_file_path: string;
}): Promise<ExtractedLab> {
  throw new Error("Not implemented");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function interpretLabResult(
  _input: InterpretLabInput,
): Promise<{ extracted: ExtractedLab; interpretation: LabInterpretation }> {
  throw new Error("Not implemented");
}

// =============================================================================
// SUPPLEMENT SUGGESTIONS APPLY
// =============================================================================

/**
 * Wenn User Supplement-Empfehlungen aus Interpretation annimmt:
 * Inserts in user_supplements + linkt zur lab_results.id als source_recommendation_id.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function applySupplementSuggestions(_input: {
  user_id: string;
  lab_result_id: string;
  accepted_suggestions: LabInterpretation["supplement_suggestions"];
}): Promise<{ created_supplement_ids: string[] }> {
  throw new Error("Not implemented");
}
