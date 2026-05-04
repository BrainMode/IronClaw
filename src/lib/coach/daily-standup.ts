/**
 * Daily Standup Generator.
 *
 * Wird typischerweise per Cron um 6 Uhr morgens für jeden aktiven User aufgerufen.
 * Alternativ: bei erstem App-Open des Tages on-demand getriggert (mit cache).
 *
 * Workflow:
 *   1. Sammle Kontext: gestern Nutrition, Sleep+HRV, heute geplant (Workout + Meal-Plan),
 *      aktive Goals, Wetter (Stans), Pantry-Hinweise (was läuft ab), Recent-Cooks
 *   2. Call AI mit dem Kontext + System-Prompt "morning standup"
 *   3. Parse strukturiertes Output (greeting + recap + outlook + tip + actions)
 *   4. Insert in daily_standups Tabelle
 *   5. Push-Notification (wenn aktiviert)
 */

import { z } from "zod";

// =============================================================================
// SCHEMAS
// =============================================================================

export const standupContentSchema = z.object({
  greeting: z.string().describe("Kurze freundliche Begrüßung, max 1 Satz"),
  yesterday_recap: z
    .string()
    .describe(
      "1-3 Sätze über gestern. Konkret: 'Du hast 1850 kcal gegessen (Ziel 2400), Protein 120g (Ziel 180g) — letzteres knapp.'",
    ),
  today_outlook: z
    .string()
    .describe(
      "1-2 Sätze über heute. Konkret: 'Heute Pull-Workout im Plan, Wetter 22°C → ideal für später MTB. Im Pantry läuft Lachs morgen ab.'",
    ),
  tip: z
    .string()
    .nullable()
    .describe(
      "1 fokussierter Tipp wenn relevant. Z.B. 'Iss heute 2 Eier + Hüttenkäse zum Frühstück, deckt 30g Protein.'",
    ),
  suggested_actions: z
    .array(
      z.object({
        label: z.string().describe("Kurzer Button-Text, max 4 Wörter"),
        action: z.enum([
          "open_today_workout",
          "open_meal_plan",
          "log_nutrition",
          "open_pantry",
          "open_recipe",
          "start_chat",
        ]),
        params: z.record(z.string()).optional(),
      }),
    )
    .max(3)
    .default([]),
});

export type StandupContent = z.infer<typeof standupContentSchema>;

// =============================================================================
// CONTEXT GATHERING
// =============================================================================

export interface StandupContext {
  user_id: string;
  for_date: Date;

  // Yesterday
  yesterday_nutrition: {
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    meals_logged: number;
  } | null;
  yesterday_workout: {
    completed: boolean;
    sets: number;
    duration_minutes: number;
  } | null;
  yesterday_activity: {
    type: string;
    duration_minutes: number;
    distance_km: number;
  } | null;
  last_night_sleep: {
    duration_hours: number | null;
    sleep_score: number | null;
    hrv_ms: number | null;
  } | null;

  // Today
  today_planned_workout: {
    template_name: string;
    exercises: string[];
  } | null;
  today_meal_plan_entries: Array<{
    meal_type: string;
    recipe_title: string | null;
    expected_kcal: number | null;
  }>;

  // Goals
  active_goal: {
    phase_type: "cut" | "bulk" | "maintenance" | "recomp";
    daily_kcal_target: number | null;
    daily_protein_g_target: number | null;
    progress_status: "on_track" | "too_fast" | "too_slow" | "stalled" | null;
  } | null;

  // Misc
  weather_today: {
    temp_c_max: number;
    condition: string; // 'sunny', 'rainy', 'cloudy'
  } | null;
  pantry_expiring_soon: Array<{ ingredient_name: string; expires_in_days: number }>;
  recent_cooks_count_7d: number;
}

/**
 * Sammelt allen Kontext für einen User. Implementation:
 * - Mehrere Supabase-Queries in Parallel
 * - Withings-API-Call wenn Token vorhanden
 * - Open-Meteo / OpenWeather für Wetter (Stans)
 *
 * Pseudo-Code-Plan in der Implementation.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function gatherStandupContext(
  _userId: string,
  _forDate: Date,
): Promise<StandupContext> {
  throw new Error("Not implemented — Claude Code: parallel queries per docstring");
}

// =============================================================================
// AI GENERATION
// =============================================================================

export interface GenerateStandupOptions {
  context: StandupContext;
  /** Override für Modell — default: Sonnet 4.6 (kürzer, schneller, billiger als Opus für Standup) */
  model?: string;
}

/**
 * Generiert via AI-SDK den Standup-Text aus dem Kontext.
 *
 * Implementation-Pattern:
 *
 * ```
 * const result = await generateObject({
 *   model: ai(opts.model ?? MODELS.fast),  // Sonnet ist hier ausreichend
 *   system: STANDUP_SYSTEM_PROMPT,
 *   prompt: buildContextPrompt(opts.context),
 *   schema: standupContentSchema,
 *   maxRetries: 1,
 * })
 * return result.object
 * ```
 *
 * STANDUP_SYSTEM_PROMPT muss vermitteln:
 * - Ton: freundlich, kurz, konkret. Kein Coach-Sprech ("rocke das").
 * - Fokus: Daten interpretieren, nicht wiederholen
 * - Action-First: jeder Punkt sollte aktionable sein oder informativ
 * - DEUTSCH, du-Form
 * - Max 4-5 Zeilen total
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function generateStandup(_opts: GenerateStandupOptions): Promise<StandupContent> {
  throw new Error("Not implemented");
}

// =============================================================================
// FULL PIPELINE
// =============================================================================

/**
 * Top-Level: gather + generate + persist + notify.
 *
 * Wird vom Cron-Job aufgerufen:
 *   for each active user:
 *     await runStandupPipeline(user_id, today)
 *
 * Idempotent — wenn schon ein Standup für (user_id, today) existiert: skip
 * (außer force_regenerate).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function runStandupPipeline(_input: {
  userId: string;
  forDate: Date;
  forceRegenerate?: boolean;
  pushNotificationOnReady?: boolean;
}): Promise<{ standup_id: string; content: StandupContent }> {
  throw new Error(
    "Not implemented — Claude Code: gatherContext → generate → upsert daily_standups → push if enabled",
  );
}
