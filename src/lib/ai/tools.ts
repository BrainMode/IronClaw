/**
 * AI Tool Definitions für den Coach-Chat.
 *
 * Diese Tools werden vom AI Coach (Opus 4.7) via Vercel AI SDK aufgerufen.
 * Implementations sind separat — diese Datei definiert nur die Schemas.
 *
 * WICHTIG: Tools laufen SERVER-SIDE in Next.js API-Routes. RLS-Kontext
 * (auth.uid()) muss korrekt gesetzt sein, sodass jeder DB-Query automatisch
 * nur Daten des aufrufenden Users zurückgibt.
 *
 * Jeder Tool-Call wird in `ai_tool_calls` geloggt (siehe schema.sql).
 */

import { tool } from "ai";
import { z } from "zod";

// =============================================================================
// SCHEMAS — Eingabe / Ausgabe
// =============================================================================

const dateRangeSchema = z
  .object({
    from: z.string().describe("ISO 8601 Datum, z.B. '2026-04-15'"),
    to: z.string().describe("ISO 8601 Datum, z.B. '2026-05-03'"),
  })
  .describe("Datums-Bereich, inklusiv");

// =============================================================================
// READ-TOOLS
// =============================================================================

export const getWorkoutHistory = tool({
  description:
    "Hole die letzten Workout-Sätze des Users. Optional gefiltert nach Übung. Standard: letzte 30 Tage.",
  parameters: z.object({
    exercise_slug: z
      .string()
      .optional()
      .describe("Slug der Übung (z.B. 'barbell-bench-press'). Weglassen für alle Übungen."),
    days_back: z
      .number()
      .int()
      .min(1)
      .max(365)
      .default(30)
      .describe("Wieviele Tage zurück. Default: 30."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(50)
      .describe("Maximale Anzahl Sätze. Default: 50."),
  }),
  execute: async (_args) => {
    // Implementation in src/lib/ai/tools/get-workout-history.ts
    throw new Error("Not implemented — see implementations file");
  },
});

export const getNutritionSummary = tool({
  description:
    "Aggregierte Ernährungs-Daten für einen Datums-Bereich. Pro Tag: kcal, Protein, Carbs, Fett, Ballaststoffe + Anzahl Mahlzeiten.",
  parameters: z.object({
    range: dateRangeSchema,
    include_targets: z
      .boolean()
      .default(true)
      .describe("Wenn true: vergleicht Ist-Werte mit macro_targets des Users."),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

export const getBodyMetrics = tool({
  description:
    "Body-Metriken (Withings, manuell): Gewicht, Körperfett, HRV, Schlaf, Resting-HR, etc. Max 90 Tage Range.",
  parameters: z.object({
    range: dateRangeSchema,
    metrics: z
      .array(z.enum(["weight_kg", "body_fat_pct", "hrv_ms", "resting_hr", "muscle_mass_kg"]))
      .optional()
      .describe("Welche Metriken. Weglassen = alle verfügbaren."),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

export const getActivities = tool({
  description:
    "Cardio- und Outdoor-Aktivitäten (Strava, Health Connect, manuell). Inkl. Zone-2-Minuten für Mike's Cardio-Tracking.",
  parameters: z.object({
    range: dateRangeSchema,
    type: z
      .enum(["run", "walk", "hike", "mtb", "road_bike", "swim", "sup", "climbing", "any"])
      .default("any"),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

// =============================================================================
// SUGGESTION-TOOLS (Agent macht Empfehlung)
// =============================================================================

export const suggestExerciseReplacement = tool({
  description:
    "Schlage Ersatz-Übungen vor wenn User die Original-Übung nicht ausführen kann. Berücksichtigt User-Equipment und Hebel-Logik.",
  parameters: z.object({
    exercise_slug: z.string().describe("Slug der Original-Übung"),
    reason: z.enum(["pain", "no_equipment", "preference", "temporary"]).describe("Grund"),
    user_note: z
      .string()
      .optional()
      .describe(
        "Freitext, z.B. 'Schulter sticht links beim Ablassen' oder 'keine Squat Rack heute'",
      ),
    is_permanent: z
      .boolean()
      .default(false)
      .describe("true = Substitution dauerhaft persistieren. false = nur diese Session."),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

export const decideDeload = tool({
  description:
    "Entscheide eigenständig ob ein Deload sinnvoll ist. Analysiert Reps-Verlauf, HRV, Schlaf, Body-Metrics. Output enthält Begründung und ggf. konkreten Deload-Plan (welche Übungen, welches reduzierte Gewicht).",
  parameters: z.object({
    exercise_slug: z
      .string()
      .optional()
      .describe("Spezifische Übung. Weglassen = ganzheitliche Analyse über alle Übungen."),
    consider_hrv: z
      .boolean()
      .default(true)
      .describe("HRV-Trend in Entscheidung einbeziehen (wenn Daten vorhanden)"),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

// =============================================================================
// WRITE-TOOLS
// =============================================================================

export const logWorkoutSet = tool({
  description:
    "Logge einen Workout-Satz im Auftrag des Users. Nur verwenden wenn User explizit per Chat einen Satz mitteilt (z.B. 'log: Bank 90×6 RIR1').",
  parameters: z.object({
    session_id: z
      .string()
      .uuid()
      .optional()
      .describe("Wenn null/undefined: starte automatisch neue Session oder verwende offene."),
    exercise_slug: z.string(),
    weight_kg: z.number().positive(),
    reps: z.number().int().min(1).max(50),
    rir: z.number().int().min(0).max(10),
    set_type: z.enum(["warmup", "working", "dropset", "amrap"]).default("working"),
    notes: z.string().optional(),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

export const logNutrition = tool({
  description:
    "Logge eine Mahlzeit per Chat. Manuell mit Beschreibung, oder via Foto-URL für Vision-Schätzung.",
  parameters: z.object({
    description: z.string(),
    meal_type: z.enum(["breakfast", "lunch", "dinner", "snack", "other"]).default("other"),
    photo_url: z.string().url().optional().describe("Wenn gesetzt: Foto-Schätzung via Vision-LLM"),
    kcal: z.number().nonnegative().optional(),
    protein_g: z.number().nonnegative().optional(),
    carbs_g: z.number().nonnegative().optional(),
    fat_g: z.number().nonnegative().optional(),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

// =============================================================================
// GOALS / PHASES (Cut / Bulk / Maintenance)
// =============================================================================

export const setGoal = tool({
  description:
    "Setze ein neues Goal/Phase für den User (Cut, Bulk, Maintenance, Recomp). Ersetzt aktives Goal. Setzt Macro-Targets entsprechend.",
  parameters: z.object({
    phase_type: z.enum(["cut", "bulk", "maintenance", "recomp"]),
    target_weight_kg: z.number().positive().optional(),
    target_end_at: z.string().optional().describe("ISO Datum"),
    weekly_rate_kg: z
      .number()
      .optional()
      .describe(
        "Erwartete Rate. Negativ für Cut (z.B. -0.5 = 0.5kg/Woche abnehmen). Positiv für Bulk.",
      ),
    daily_kcal_target: z.number().int().positive().optional(),
    daily_protein_g_target: z.number().nonnegative().optional(),
    daily_carbs_g_target: z.number().nonnegative().optional(),
    daily_fat_g_target: z.number().nonnegative().optional(),
    adjustment_mode: z
      .enum(["manual", "semi_auto", "auto"])
      .default("semi_auto")
      .describe("Wie aggressiv soll der Coach kcal anpassen wenn Trend abweicht."),
    notes: z.string().optional(),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

export const assessGoalProgress = tool({
  description:
    "Analyse: ist der User on-track für sein aktives Goal? Vergleicht erwartete vs. tatsächliche Gewichts-Trajektorie, Macro-Compliance, schlägt ggf. kcal-Anpassung vor. Ohne Argumente: holt aktives Goal automatisch.",
  parameters: z.object({
    proposed_kcal_change: z
      .number()
      .int()
      .optional()
      .describe(
        "Wenn gesetzt: simuliere diese kcal-Anpassung und zeige Auswirkung statt Vorschlag",
      ),
    apply: z
      .boolean()
      .default(false)
      .describe(
        "Wenn true UND adjustment_mode != 'manual': wende den vorgeschlagenen Adjustment direkt an.",
      ),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

// =============================================================================
// MEAL PLANNING
// =============================================================================

export const createMealPlan = tool({
  description:
    "Generiere einen Meal-Plan für N Tage. Berücksichtigt aktives Goal (Macro-Targets), Pantry (priorisiere was da ist), Recent-Cooks (vermeide Wiederholung), User-Tags-Präferenzen, Equipment.",
  parameters: z.object({
    start_date: z.string().describe("ISO Datum, Beginn des Plans"),
    days: z.number().int().min(1).max(14).default(7),
    name: z.string().optional().describe("z.B. 'Cut Woche 18'"),
    prefer_pantry: z
      .boolean()
      .default(true)
      .describe("Wenn true: bevorzuge Recipes für die Pantry-Zutaten vorhanden sind"),
    avoid_recent_cooks_days: z
      .number()
      .int()
      .nonnegative()
      .default(7)
      .describe("Vermeide Recipes die innerhalb der letzten N Tage gekocht wurden"),
    required_tags: z.array(z.string()).optional().describe("z.B. ['high-protein']"),
    excluded_tags: z.array(z.string()).optional().describe("z.B. ['cheat-meal']"),
    meal_types_per_day: z
      .array(z.enum(["breakfast", "lunch", "dinner", "snack"]))
      .default(["breakfast", "lunch", "dinner"]),
    macro_constraints_override: z
      .object({
        kcal_per_day: z.number().int().positive().optional(),
        protein_g_per_day: z.number().nonnegative().optional(),
        kcal_tolerance_pct: z
          .number()
          .min(0)
          .max(50)
          .default(10)
          .describe("Prozent-Abweichung pro Tag erlaubt"),
      })
      .optional()
      .describe("Override aktiver Goal-Targets für diesen Plan"),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

export const getMealPlan = tool({
  description:
    "Hole aktiven Meal-Plan oder einen für ein bestimmtes Datum. Inklusive Macro-Aggregate pro Tag.",
  parameters: z.object({
    for_date: z.string().optional().describe("ISO Datum. Wenn weggelassen: aktuell aktiver Plan."),
    plan_id: z.string().uuid().optional(),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

export const updateMealPlanEntry = tool({
  description:
    "Ändere einen einzelnen Plan-Eintrag (Recipe austauschen, Mengen ändern, Mealtype umsortieren).",
  parameters: z.object({
    entry_id: z.string().uuid(),
    new_recipe_id: z.string().uuid().optional(),
    new_free_text: z.string().optional(),
    servings_planned: z.number().positive().optional(),
    new_meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
    new_for_date: z.string().optional(),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

// =============================================================================
// PHOTO CALORIE ESTIMATION
// =============================================================================

export const estimateMealFromPhoto = tool({
  description:
    "Schätze Nährwerte aus einem Foto. Vision-LLM analysiert Teller, schätzt Portion, kcal, Makros. Confidence wird mitgegeben — User kann editieren bevor er loggt. Nutze wenn User ein Foto schickt oder 'log mein Mittagessen, hier ist ein Bild' sagt.",
  parameters: z.object({
    photo_storage_path: z.string().describe("Supabase Storage path des hochgeladenen Bilds"),
    user_hint: z
      .string()
      .optional()
      .describe(
        "Freier Text vom User, z.B. 'Tagliata mit Rucola und Parmesan, Restaurant-Portion'",
      ),
    plate_size_hint: z
      .enum(["small", "medium", "large", "xl"])
      .optional()
      .describe("Hilft bei Portion-Schätzung. Sonst aus Bild geschätzt."),
    auto_log: z
      .boolean()
      .default(false)
      .describe(
        "Wenn true: direkt in nutrition_logs eintragen. Default false → User bestätigt erst.",
      ),
    meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

// =============================================================================
// DAILY STANDUP / PROACTIVE COACHING
// =============================================================================

export const generateDailyStandup = tool({
  description:
    "Generiere den Morgen-Brief für den User. Analysiert: gestern Nutrition (vs. Goal), Sleep+HRV (Withings), heute geplantes Training, Wetter, Pantry. Output: kurzer Brief + aktionable Vorschläge. Wird typischerweise vom Backend-Cron aufgerufen, kann aber auch manuell vom User getriggert werden ('mach mein Standup').",
  parameters: z.object({
    for_date: z.string().optional().describe("ISO Datum. Default: heute."),
    force_regenerate: z
      .boolean()
      .default(false)
      .describe("Wenn schon einer existiert: neu erzeugen statt cached"),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

// =============================================================================
// RECIPE VARIATION (P1)
// =============================================================================

export const suggestRecipeVariation = tool({
  description:
    "Modifiziere ein Recipe um eine Macro-/Diet-Vorgabe zu erfüllen. Beispiel: 'mach das proteinreicher', 'low-carb Version', 'vegan'. AI schlägt Substitutionen vor + neue Mengen + neue Macros. User kann annehmen → wird als neues Recipe gespeichert (Original bleibt).",
  parameters: z.object({
    recipe_id: z.string().uuid(),
    goal: z.enum([
      "more_protein",
      "less_carbs",
      "less_fat",
      "less_kcal",
      "vegan",
      "vegetarisch",
      "glutenfrei",
      "laktosefrei",
      "schneller_zubereitbar",
    ]),
    intensity: z
      .enum(["mild", "moderate", "aggressive"])
      .default("moderate")
      .describe("Wie stark Original ändern"),
    save_as_new: z
      .boolean()
      .default(false)
      .describe("Wenn true: Variation direkt als neues Recipe speichern."),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

// =============================================================================
// BODY PHOTOS / WEEKLY CHECK-IN
// =============================================================================

export const requestWeeklyCheckin = tool({
  description:
    "Erinnere User dass es Zeit für den wöchentlichen Body-Photo-Check-in ist. Typischerweise Sonntag morgens ausgelöst, oder wenn User es manuell anfragt. Sendet Push-Notification wenn aktiviert.",
  parameters: z.object({
    days_since_last: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Tage seit letztem Check-in. Hilft beim Wording."),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

export const analyzeBodyPhotos = tool({
  description:
    "Analysiere ein gerade hochgeladenes Body-Photo-Set. Vision-LLM erkennt Muskel-Entwicklung pro Gruppe, Posture-Patterns, Imbalances, Conditioning-Trend vs. Vorwoche. Liefert volume_adjustments und recommended_priorities die der Coach in `training_preferences.muscle_priorities` übernehmen kann.",
  parameters: z.object({
    body_photo_id: z.string().uuid(),
    compare_with_previous: z
      .boolean()
      .default(true)
      .describe("Vergleich mit letztem Photo-Set wenn vorhanden"),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

export const updateMusclePriorities = tool({
  description:
    "Setze Muscle-Priorities (z.B. ['shoulders', 'back']) im aktiven Goal oder global in training_preferences. Plan-Generator + Volume-Anpasser nutzen das. Typischerweise nach `analyze_body_photos` aufgerufen.",
  parameters: z.object({
    muscle_priorities: z
      .array(
        z.enum([
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
        ]),
      )
      .max(4)
      .describe("Max 4 Prioritäten — sonst keine echte Priorität mehr"),
    scope: z
      .enum(["goal", "global"])
      .default("goal")
      .describe("'goal' = nur aktuelles Goal, 'global' = training_preferences"),
    rationale: z.string().describe("Begründung für Audit-Trail"),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

// =============================================================================
// LABS + SUPPLEMENTS
// =============================================================================

export const interpretLabResult = tool({
  description:
    "Interpretiere einen hochgeladenen Bluttest. Vision-LLM extrahiert Werte aus PDF/Foto, zweiter LLM-Pass macht Interpretation gegen aktuelle Forschung (NICHT DGE/USDA). Output enthält concerning_values, supplement_suggestions mit Studien-Quellen, lifestyle_suggestions, followup_tests. Schlägt automatisch konkrete Marken + Dosierungen vor.",
  parameters: z.object({
    source_file_path: z.string().describe("Storage-Path der hochgeladenen Datei"),
    panel_type: z
      .enum([
        "basic",
        "metabolic",
        "hormonal",
        "thyroid",
        "micronutrients",
        "inflammation",
        "custom",
      ])
      .optional(),
    apply_supplement_suggestions: z
      .boolean()
      .default(false)
      .describe("Wenn true: User muss bestätigen, dann werden user_supplements eingetragen"),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

export const suggestBloodTestPanel = tool({
  description:
    "Schlage konkretes Bluttest-Panel vor — basierend auf User-Symptomen oder Routine-Check (alle 6-12 Monate). Konkrete Werte mit Begründung. Z.B. bei Müdigkeit: D3 + B12 (Holo-TC) + Ferritin + TSH+fT3 + Testosteron+SHBG.",
  parameters: z.object({
    reason: z.enum([
      "routine_followup",
      "fatigue",
      "performance_drop",
      "sleep_issues",
      "mood_concerns",
      "body_composition_stalled",
      "custom",
    ]),
    custom_symptoms: z.array(z.string()).optional(),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

export const updateSupplements = tool({
  description:
    "User's Supplement-Stack updaten. Multi-Operation: hinzufügen/entfernen/Dosis ändern. Verwendet kanonisches SUPPLEMENT_CATALOG, bei unbekannten Names → 'other'.",
  parameters: z.object({
    operations: z
      .array(
        z.object({
          op: z.enum(["add", "update", "stop"]),
          name: z.string().describe("Z.B. 'Omega-3', 'Vitamin D3', 'Creatine'"),
          dosage_amount: z.number().positive().optional(),
          dosage_unit: z.string().optional(),
          frequency: z.string().optional(),
          brand: z.string().optional(),
          reason: z.string().optional(),
          source_lab_result_id: z.string().uuid().optional(),
        }),
      )
      .min(1)
      .max(20),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

export const getCurrentSupplements = tool({
  description: "Liste der aktuell aktiven Supplements + ihre Dosierungen.",
  parameters: z.object({
    include_history: z
      .boolean()
      .default(false)
      .describe("Wenn true: auch beendete Supplements mit ended_at"),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

// =============================================================================
// TRAINING PREFERENCES
// =============================================================================

export const updateTrainingPreferences = tool({
  description:
    "User's Trainings-Setup ändern (Frequenz, Split-Style, Volumen, Rep-Range). Wirkt sich auf Plan-Generator + Progression-Logik aus.",
  parameters: z.object({
    strength_sessions_per_week: z.number().int().min(1).max(7).optional(),
    cardio_sessions_per_week: z.number().int().min(0).max(7).optional(),
    split_style: z
      .enum([
        "fullbody_x2",
        "fullbody_x3",
        "upper_lower",
        "push_pull_legs",
        "bro_split",
        "arnold_split",
        "custom",
      ])
      .optional(),
    volume_style: z.enum(["low_volume_high_intensity", "medium", "high_volume_classic"]).optional(),
    rep_range_min: z.number().int().min(1).max(20).optional(),
    rep_range_max: z.number().int().min(1).max(30).optional(),
    preferred_rir_min: z.number().int().min(0).max(5).optional(),
    preferred_rir_max: z.number().int().min(0).max(5).optional(),
    session_duration_target_min: z.number().int().min(15).optional(),
    session_duration_target_max: z.number().int().max(180).optional(),
    training_goals: z
      .array(z.enum(["fat_loss", "strength", "hypertrophy", "endurance", "mobility", "longevity"]))
      .optional(),
    cardio_zone_focus: z.enum(["zone_2", "zone_5_hiit", "mixed", "sport_specific"]).optional(),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

// =============================================================================
// SEARCH-TOOLS
// =============================================================================

export const findRecipe = tool({
  description:
    "Suche im Rezept-Katalog des Households. Filterung nach Volltext, Tags, Macro-Profilen, Equipment, max Cooking-Time.",
  parameters: z.object({
    query: z.string().optional().describe("Freitext-Suche im Titel/Description"),
    tags: z
      .array(z.string())
      .optional()
      .describe(
        "Tags wie 'high-protein', 'healthy-fast-food', 'bbq', 'italienisch'. Multi-tag = AND",
      ),
    max_total_minutes: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Maximale Total-Time (prep + cook)"),
    min_protein_g: z.number().nonnegative().optional().describe("Mindest-Protein pro Portion"),
    max_kcal: z.number().positive().optional().describe("Maximal-kcal pro Portion"),
    requires_equipment: z
      .array(z.string())
      .optional()
      .describe(
        "Filter auf Recipes die nur das vorhandene Equipment brauchen. Z.B. ['weber-grill', 'backofen']",
      ),
    only_cookable_with_pantry: z
      .boolean()
      .default(false)
      .describe(
        "Wenn true: nur Recipes für die alle Zutaten im Household-Pantry sind (oder Staples).",
      ),
    sort: z
      .enum(["recent", "favorite", "least_cooked", "highest_protein", "fastest"])
      .default("recent"),
    limit: z.number().int().min(1).max(20).default(5),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

export const findRecipesForPantry = tool({
  description:
    "Antwortet auf 'Was kann ich heute kochen mit dem was ich habe?'. Matcht Pantry-Items des Households gegen alle Recipes. Returnt Liste mit match_percent + missing ingredients.",
  parameters: z.object({
    extra_ingredients: z
      .array(z.string())
      .optional()
      .describe(
        "Zusätzliche Zutaten die der User mündlich erwähnt hat aber nicht im Pantry sind. Z.B. ['Lachs vom Markt']",
      ),
    min_match_percent: z
      .number()
      .min(0)
      .max(1)
      .default(0.6)
      .describe("Min Match-Quote. 1.0 = alles vorhanden, 0.8 = bis zu 1-2 Zutaten fehlen."),
    include_near_miss: z
      .boolean()
      .default(true)
      .describe(
        "Wenn true: auch Recipes mit 80-99% match. Output zeigt was fehlt → 'Wenn du noch X kaufst…'",
      ),
    filter_tags: z
      .array(z.string())
      .optional()
      .describe("Optional: nur Recipes mit diesen Tags (z.B. ['quick'] für schnelle Vorschläge)"),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

export const getPantry = tool({
  description: "Was hat der Household aktuell zuhause? Aggregierte Pantry-Liste.",
  parameters: z.object({
    expiring_soon_days: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Wenn gesetzt: hervorhebe Items die in <N Tagen ablaufen (für 'verbrauche bald'-Vorschläge)",
      ),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

export const updatePantry = tool({
  description:
    "Pantry-Item hinzufügen/updaten/entfernen. Multi-Operation in einem Call (z.B. 'ich hab eingekauft: 500g Hähnchen, 200g Reis, 1 Avocado').",
  parameters: z.object({
    operations: z
      .array(
        z.object({
          op: z.enum(["add", "update", "remove"]),
          ingredient_name: z.string(),
          amount: z.number().nullable().optional(),
          unit: z.string().nullable().optional(),
          expires_at: z.string().nullable().optional(),
          notes: z.string().optional(),
        }),
      )
      .min(1)
      .max(30),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

export const logCookedRecipe = tool({
  description:
    "Logge dass ein Recipe gekocht und gegessen wurde. Erstellt nutrition_log Eintrag automatisch + dekrementiert Pantry. Verwende wenn User sagt 'das hab ich gerade gegessen' oder 'pack das in mein Mittagessen'.",
  parameters: z.object({
    recipe_id: z.string().uuid(),
    meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
    servings_eaten: z
      .number()
      .positive()
      .default(1)
      .describe("Wieviele Portionen der User gegessen hat. Kann <1 sein (halbe Portion)."),
    cooked_at: z.string().optional().describe("ISO Timestamp. Default: jetzt."),
    deduct_from_pantry: z.boolean().default(true),
    rating: z.number().int().min(1).max(5).optional(),
    notes: z.string().optional(),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

export const getRecentCooks = tool({
  description:
    "Was hat der User in den letzten Tagen gekocht? Hilft bei Variation-Vorschlägen ('diese Woche schon 3× Hähnchen — wie wär's mit Fisch?').",
  parameters: z.object({
    days_back: z.number().int().min(1).max(60).default(14),
    user_scope: z
      .enum(["self", "household"])
      .default("self")
      .describe("'self' = nur eigene cooks, 'household' = auch Frau"),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

export const buildShoppingList = tool({
  description:
    "Baue eine Einkaufsliste für eine geplante Liste von Recipes (z.B. Wochenplan). Aggregiert Zutaten, exkludiert was schon im Pantry ist + Staples.",
  parameters: z.object({
    recipe_ids: z.array(z.string().uuid()).min(1).max(20),
    portion_overrides: z
      .record(z.string(), z.number().positive())
      .optional()
      .describe("Optional: pro recipe_id andere Portion (z.B. '2 Portionen statt default 4')"),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

export const searchMigros = tool({
  description:
    "Suche Migros-Produkte (für Verfügbarkeit, Preise, Nährwerte). Geht über migros-mcp Server.",
  parameters: z.object({
    query: z.string().describe("Produkt-Suchbegriff, z.B. 'Hähnchenbrust bio'"),
    limit: z.number().int().min(1).max(20).default(5),
    check_stock_at: z
      .string()
      .optional()
      .describe("Filiale (z.B. 'Stans') — wenn gesetzt, wird Verfügbarkeit geprüft"),
  }),
  execute: async (_args) => {
    throw new Error("Not implemented");
  },
});

// =============================================================================
// EXPORT TOOLS-MAP
// =============================================================================

/**
 * Komplette Tool-Map für AI SDK.
 * Verwende in API-Route:
 *   const result = await streamText({
 *     model: openrouter("anthropic/claude-opus-4.7"),
 *     system: coachSystemPrompt,
 *     messages,
 *     tools: COACH_TOOLS,
 *   });
 */
export const COACH_TOOLS = {
  // Read - Workout/Body/Activity
  get_workout_history: getWorkoutHistory,
  get_nutrition_summary: getNutritionSummary,
  get_body_metrics: getBodyMetrics,
  get_activities: getActivities,

  // Suggestions
  suggest_exercise_replacement: suggestExerciseReplacement,
  decide_deload: decideDeload,

  // Write - Workout/Nutrition
  log_workout_set: logWorkoutSet,
  log_nutrition: logNutrition,

  // Recipes / Pantry / Cooking
  find_recipe: findRecipe,
  find_recipes_for_pantry: findRecipesForPantry,
  get_pantry: getPantry,
  update_pantry: updatePantry,
  log_cooked_recipe: logCookedRecipe,
  get_recent_cooks: getRecentCooks,
  build_shopping_list: buildShoppingList,

  // Photo / Vision
  estimate_meal_from_photo: estimateMealFromPhoto,

  // Goals & Phases
  set_goal: setGoal,
  assess_goal_progress: assessGoalProgress,

  // Meal Planning
  create_meal_plan: createMealPlan,
  get_meal_plan: getMealPlan,
  update_meal_plan_entry: updateMealPlanEntry,

  // Proactive Coach
  generate_daily_standup: generateDailyStandup,

  // Recipe Variations
  suggest_recipe_variation: suggestRecipeVariation,

  // Body Photos / Weekly Check-in
  request_weekly_checkin: requestWeeklyCheckin,
  analyze_body_photos: analyzeBodyPhotos,
  update_muscle_priorities: updateMusclePriorities,

  // Health: Labs + Supplements
  interpret_lab_result: interpretLabResult,
  suggest_blood_test_panel: suggestBloodTestPanel,
  update_supplements: updateSupplements,
  get_current_supplements: getCurrentSupplements,

  // Training Setup
  update_training_preferences: updateTrainingPreferences,

  // External
  search_migros: searchMigros,
} as const;

export type CoachToolName = keyof typeof COACH_TOOLS;
