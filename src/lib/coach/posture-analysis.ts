/**
 * Body-Photo Posture & Imbalance Analysis.
 *
 * User schießt einmal pro Woche 3 Photos (Front, Side, Back).
 * Vision-LLM (Opus 4.7) analysiert das Set strukturiert:
 *
 * - Relative Muskel-Entwicklung (Brust vs. Rücken, Beine vs. Oberkörper, …)
 * - Posture-Patterns (vorgeschobener Kopf, runde Schultern, anteriore Beckenkippung)
 * - Skin-Fold-Hinweise (wo erscheint BF% am höchsten — Bauch/Hüfte/Brust?)
 * - Conditioning-Trend vs. letztem Photo-Set
 * - Konkrete Volume-Anpassungs-Vorschläge für den Trainings-Coach
 *
 * Wichtig: KEINE absoluten BF%-Schätzungen aus dem Foto (zu unzuverlässig).
 * Stattdessen: relative Trends + visuelle Indikatoren mit explizit Confidence.
 *
 * Anti-Halluzination:
 *   - Kein "Gewichtskommentar" ("du bist zu dick / dünn")
 *   - Kein Body-Shaming
 *   - Faktisch + actionable: was würde Mike Israetel sehen?
 *
 * Output wird ai_analysis jsonb in body_photos Tabelle.
 * Coach kann das als Basis für muscle_priorities Update nutzen.
 */

import { z } from "zod";

// =============================================================================
// SCHEMA
// =============================================================================

export const muscleGroupSchema = z.enum([
  "chest",
  "back_lats",
  "back_traps",
  "back_lower",
  "shoulders_front",
  "shoulders_side",
  "shoulders_rear",
  "arms_biceps",
  "arms_triceps",
  "arms_forearms",
  "core_abs",
  "core_obliques",
  "legs_quads",
  "legs_hamstrings",
  "legs_glutes",
  "legs_calves",
]);

export type MuscleGroup = z.infer<typeof muscleGroupSchema>;

export const developmentLevelSchema = z.enum([
  "underdeveloped", // deutlich unter Niveau der Nachbar-Gruppen
  "moderate", // ok, kann ausgebaut werden
  "well_developed", // gut sichtbar
  "highly_developed", // hervorstechend
  "not_assessable", // im Foto nicht zu sehen / unklar
]);

export type DevelopmentLevel = z.infer<typeof developmentLevelSchema>;

export const muscleAssessmentSchema = z.object({
  group: muscleGroupSchema,
  development: developmentLevelSchema,
  /** Confidence 0-1 — niedrig wenn Beleuchtung schlecht, Pose ungünstig */
  confidence: z.number().min(0).max(1),
  /** Notizen ('linke Schulter sichtbar weniger entwickelt als rechte') */
  note: z.string().optional(),
});

export const postureObservationSchema = z.object({
  pattern: z.enum([
    "forward_head_posture",
    "rounded_shoulders",
    "anterior_pelvic_tilt",
    "posterior_pelvic_tilt",
    "uneven_shoulders",
    "uneven_hips",
    "knee_valgus", // X-Beine
    "knee_varus", // O-Beine
    "swayback",
    "hyperlordosis",
    "kyphosis",
  ]),
  severity: z.enum(["mild", "moderate", "pronounced"]),
  confidence: z.number().min(0).max(1),
  /** Korrektur-Hinweis, evidenz-basiert (siehe coach-system.md für Quellen) */
  recommendation: z.string(),
});

export const conditioningTrendSchema = z.object({
  /** Relativ zum letzten Photo-Set wenn vorhanden */
  vs_previous: z.enum(["leaner", "stable", "softer", "no_previous_data"]).optional(),
  /** Wo BF% am sichtbarsten — relevant für Cut-Strategie und Hormon-Diskussion */
  highest_bf_distribution: z
    .array(z.enum(["abdomen", "lower_back", "chest", "thighs", "glutes", "arms"]))
    .max(3)
    .default([]),
  /** Geschätzte BF%-Range, NICHT als Punkt-Schätzung */
  estimated_bf_range_low: z.number().min(3).max(50).nullable(),
  estimated_bf_range_high: z.number().min(3).max(50).nullable(),
  /** Confidence in der BF%-Range */
  bf_estimation_confidence: z.number().min(0).max(1),
});

export const bodyPhotoAnalysisSchema = z.object({
  // Muskel-Entwicklung pro Gruppe
  muscle_assessments: z.array(muscleAssessmentSchema).min(3),

  // Erkannte Posture-Patterns
  posture_observations: z.array(postureObservationSchema).default([]),

  // Conditioning
  conditioning: conditioningTrendSchema,

  // Sichtbare Imbalances (links/rechts oder zwischen Muskelgruppen)
  imbalances: z
    .array(
      z.object({
        type: z.enum([
          "left_right_asymmetry",
          "agonist_antagonist", // z.B. Brust >> Rücken
          "upper_lower", // Oberkörper >> Beine
          "specific_lag",
        ]),
        affected_groups: z.array(muscleGroupSchema),
        description: z.string(),
        recommendation: z.string(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .default([]),

  // Konkrete Empfehlungen für muscle_priorities Update
  // Coach kann diese in user_goals.muscle_priorities oder
  // training_preferences.muscle_priorities übernehmen.
  recommended_priorities: z.array(muscleGroupSchema).max(3).default([]),

  // Volume-Anpassung pro Muskel-Gruppe (Multiplikator vs. Standard)
  // 1.0 = normal, 1.5 = 50% mehr Sets, 0.7 = 30% weniger
  volume_adjustments: z.record(muscleGroupSchema, z.number().min(0.5).max(2.0)).optional(),

  // Allgemeine Beobachtungen + actionable summary
  summary: z.string().describe("2-3 Sätze, faktisch, actionable. Kein Body-Shaming."),

  // Was war im Foto-Set NICHT zu beurteilen — Hinweis an User
  not_assessable: z.array(z.string()).default([]),

  // Foto-Quality
  photo_quality_concerns: z
    .array(z.enum(["lighting", "pose", "framing", "clothing_obstruction", "blur"]))
    .default([]),
});

export type BodyPhotoAnalysis = z.infer<typeof bodyPhotoAnalysisSchema>;

// =============================================================================
// PIPELINE
// =============================================================================

export interface AnalyzeBodyPhotosInput {
  user_id: string;
  /** Storage-Paths */
  photo_paths: { front?: string; side?: string; back?: string };
  /** Optional: Kontext */
  current_weight_kg?: number;
  current_bf_pct?: number;
  /** Optional: Photo-Set des letzten Check-ins, für Vergleich */
  previous_photo_paths?: { front?: string; side?: string; back?: string };
  previous_taken_at?: Date;
  /** Optional: User-Notiz, z.B. 'Schulter zwickt seit Wochen' */
  user_note?: string;
}

/**
 * Implementation-Plan:
 *
 * ```
 * 1. Lade alle Photos aus Supabase Storage (auch previous wenn vorhanden)
 * 2. base64 each
 * 3. generateObject({
 *      model: ai('anthropic/claude-opus-4.7'),  // Vision = Opus
 *      schema: bodyPhotoAnalysisSchema,
 *      messages: [{
 *        role: 'user',
 *        content: [
 *          { type: 'image', image: front_b64 },
 *          { type: 'image', image: side_b64 },
 *          { type: 'image', image: back_b64 },
 *          // optional previous:
 *          { type: 'image', image: prev_front_b64 },
 *          ...
 *          { type: 'text', text: BUILD_PROMPT(input) }
 *        ]
 *      }]
 *    })
 *
 * 4. Logge AI-Cost in ai_usage_logs (feature='body_photo_analysis')
 *
 * 5. UPDATE body_photos SET ai_analysis = result, ai_analyzed_at = now() WHERE id = ?
 *
 * 6. Trigger Coach-Notification: "Wöchentliche Analyse fertig — schau rein"
 * ```
 *
 * BUILD_PROMPT muss vermitteln:
 * - Sei faktisch, nicht persönlich
 * - Kein Body-Shaming, kein Gewichtskommentar
 * - Vergleiche nur dort wo Vergleichsdaten vorhanden
 * - Niedrige Confidence wenn unsicher — niemals 80% wenn 50%
 * - Empfehlungen evidence-based: bei Posture-Korrekturen Quellen wie
 *   StrongerByScience, Mike Israetel (RP), Eric Cressey (für Schultern)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function analyzeBodyPhotos(
  _input: AnalyzeBodyPhotosInput,
): Promise<BodyPhotoAnalysis> {
  throw new Error("Not implemented — Claude Code: see docstring");
}

/**
 * Wrapper: macht die Analyse + persistiert + triggert Notification.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function runWeeklyCheckIn(_input: {
  user_id: string;
  body_photo_id: string;
}): Promise<{ analysis: BodyPhotoAnalysis; notification_sent: boolean }> {
  throw new Error("Not implemented");
}
