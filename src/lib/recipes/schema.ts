/**
 * Zod-Schemas für Rezept-Extraktion mit Provenance-Tracking.
 *
 * Wird verwendet um LLM-Outputs zu validieren bevor sie in die DB gehen.
 * Bei Validierungsfehler: Retry mit explizitem Fehler-Hinweis im Prompt.
 *
 * Provenance: jede Zutat / jeder Step kennt seine Quelle (Description, Pinned Comment,
 * Audio-Transcript, JSON-LD, etc.). UI rendert das als Badges, User sieht wo Unsicherheit liegt.
 *
 * Siehe docs/RECIPE_IMPORT.md für komplette Pipeline-Beschreibung.
 */

import { z } from "zod";

// =============================================================================
// PROVENANCE
// =============================================================================

export const sourceTypeSchema = z.enum([
  "description", // Plattform-Beschreibung (YouTube/Instagram/TikTok caption)
  "pinned_comment", // Top-/Pinned-Kommentar des Creators
  "caption", // Instagram Caption / Reel Caption
  "transcript", // STT-Output von Audio (ElevenLabs Scribe)
  "transcript_chapter", // selektiv transkribierte Chapter
  "jsonld", // schema.org Recipe JSON-LD vom Web
  "microdata", // älteres schema.org via HTML microdata
  "firecrawl_markdown", // Webseite via Firecrawl, dann LLM
  "image_ocr", // Vision-LLM auf Foto/Carousel-Slide
  "linked_page", // Bio-Link / Outbound-Link aus Caption gefolgt
  "manual", // User-Eingabe als Plain Text
]);

export type SourceType = z.infer<typeof sourceTypeSchema>;

export const provenanceSchema = z.object({
  source_type: sourceTypeSchema,
  /** 0-1, niedriger wenn Quelle weniger vertrauenswürdig */
  confidence: z.number().min(0).max(1),
  /** Optional: Hinweis wie "Konflikt mit Audio-Transcript: 240g" oder "aus Italienisch übersetzt" */
  note: z.string().optional(),
  /** Optional: kurzer Snippet aus der Original-Quelle, für Debug + UI-Hover */
  source_snippet: z.string().max(500).optional(),
});

export type Provenance = z.infer<typeof provenanceSchema>;

// =============================================================================
// SUB-SCHEMAS
// =============================================================================

export const ingredientSchema = z.object({
  name: z.string().min(1).max(200),
  amount: z.number().positive().nullable(),
  unit: z
    .string()
    .nullable()
    .refine(
      (u: string | null) =>
        u === null || ["g", "kg", "ml", "l", "Stk", "EL", "TL", "Prise", "Bund"].includes(u),
      { message: "Unsupported unit" },
    ),
  notes: z.string().max(500).optional(),
  /** Optional: ist diese Zutat als optional markiert ("nach Geschmack", "or skip") */
  optional: z.boolean().optional(),
  provenance: provenanceSchema,
});

export const stepSchema = z.object({
  instruction: z.string().min(1).max(1000),
  duration_minutes: z.number().int().positive().nullable().optional(),
  /** Optional: Timestamp im Original-Video (Format "12:34") */
  source_timestamp: z.string().optional(),
  provenance: provenanceSchema,
});

// =============================================================================
// EQUIPMENT
// =============================================================================

export const recipeEquipmentSchema = z.object({
  /** Kanonischer Key (siehe equipment.ts EQUIPMENT_CATALOG). LLM darf neue vorschlagen → 'other'. */
  equipment_key: z.string().min(1).max(50),
  /** Display-Name fürs UI */
  display_name: z.string().min(1).max(100),
  importance: z.enum(["required", "recommended", "optional"]).default("required"),
  notes: z.string().max(300).optional(),
});

export type RecipeEquipment = z.infer<typeof recipeEquipmentSchema>;

// =============================================================================
// MAIN SCHEMA
// =============================================================================

export const extractedRecipeSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  servings: z.number().int().min(1).max(50).default(2),
  prep_time_minutes: z.number().int().min(0).max(600).nullable().optional(),
  cook_time_minutes: z.number().int().min(0).max(600).nullable().optional(),

  /**
   * AI-Tags vom LLM beim Import gesetzt.
   * Erlaubte Kategorien:
   * - Cuisine: italienisch, asiatisch, mexikanisch, mediterran, schweizerisch, deutsch, ...
   * - Diet: vegan, vegetarisch, glutenfrei, laktosefrei, pescetarisch
   * - Lifestyle: meal-prep, freezer-friendly, one-pot, family, party, romantisch, comfort-food
   * - Season: sommerlich, winterlich, herbstlich, frühlingshaft, weihnachten
   * - Cooking-Style: bbq, grill, pfannengericht, ofengericht, salat, suppe, eintopf, dessert,
   *   frühstück, snack, hauptgang, vorspeise, fingerfood, cheat-meal
   *
   * NICHT hier: high-protein, low-carb, low-fat, healthy-fast-food, low-cal —
   * diese sind COMPUTED tags (siehe tagging.ts) und werden vom Server nach
   * Nutrition-Computation gesetzt. LLM soll die nicht raten.
   */
  ai_tags: z.array(z.string().min(1).max(30)).max(8).default([]),

  /** Equipment das zum Kochen gebraucht wird */
  equipment: z.array(recipeEquipmentSchema).default([]),

  ingredients: z.array(ingredientSchema).min(1),
  steps: z.array(stepSchema).min(1),

  /** Sprache der Original-Quelle (de, en, it, fr, …) */
  source_language: z.string().length(2).optional(),

  /** Aggregierte Confidence über das gesamte Rezept (0-1) */
  extraction_confidence: z.number().min(0).max(1),

  /** Liste von Warnungen für den User (z.B. "Mengen aus Audio-Transcript geschätzt") */
  extraction_warnings: z.array(z.string()).default([]),

  /** Welche Quellen wurden genutzt — UI kann diese als "Datenquellen" anzeigen */
  sources_used: z.array(sourceTypeSchema).default([]),
});

export type ExtractedRecipe = z.infer<typeof extractedRecipeSchema>;
export type ExtractedIngredient = z.infer<typeof ingredientSchema>;
export type ExtractedStep = z.infer<typeof stepSchema>;

// =============================================================================
// MULTI-RECIPE-RESULT (z.B. "10 Pasta-Rezepte" auf einer Seite)
// =============================================================================

export const multipleRecipesSchema = z.object({
  multiple: z.literal(true),
  recipes: z.array(extractedRecipeSchema),
  source_url: z.string().url().optional(),
});

export type MultipleRecipesResult = z.infer<typeof multipleRecipesSchema>;

// =============================================================================
// ERROR-PFAD
// =============================================================================

export const extractionErrorSchema = z.object({
  error: z.enum([
    "no_recipe_found",
    "source_unreachable",
    "login_required",
    "paywall",
    "too_long",
    "unsupported_source",
    "image_unclear",
    "extraction_failed",
  ]),
  reason: z.string(),
  /** Optional: User-actionable Vorschlag, z.B. "Bitte Caption als Text einfügen" */
  user_suggestion: z.string().optional(),
});

export type ExtractionError = z.infer<typeof extractionErrorSchema>;

/**
 * Discriminated Union: entweder ein Rezept, mehrere, oder ein Fehler.
 */
export const extractionResultSchema = z.union([
  extractedRecipeSchema,
  multipleRecipesSchema,
  extractionErrorSchema,
]);

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export function isExtractionError(result: ExtractionResult): result is ExtractionError {
  return "error" in result;
}

export function isMultipleRecipes(result: ExtractionResult): result is MultipleRecipesResult {
  return "multiple" in result && result.multiple === true;
}
