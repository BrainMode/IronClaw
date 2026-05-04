/**
 * Auto-Tagging für Recipes.
 *
 * Zwei-stufiger Tag-Prozess:
 *
 * 1. AI-Tags (vom LLM beim Import gesetzt):
 *    - Cuisine, Diet, Lifestyle, Cooking-Style, Season
 *    - Beispiele: italienisch, vegan, meal-prep, bbq, sommerlich
 *    - Quelle: extracted_recipe.ai_tags aus Synthesis
 *
 * 2. Computed-Tags (vom Server nach Nutrition-Computation gesetzt):
 *    - Macro-Profile: high-protein, low-carb, low-fat, low-cal, balanced
 *    - Time-Profile: quick, healthy-fast-food, slow-food
 *    - Hier definiert.
 *
 * 3. User-Tags (manuelle Tags vom User):
 *    - Lieblings, mama-rezept, date-night, ...
 *    - User editiert direkt in der UI.
 *
 * Trigger für computed_tags Recomputation:
 * - Nach Nutrition-Lookup-Job-Completion (hat sich kcal_per_serving etc. gesetzt)
 * - Nach Recipe-Edit (User ändert servings/ingredients)
 * - Manuell via Admin-Aufruf
 */

// =============================================================================
// COMPUTED TAGS
// =============================================================================

export interface RecipeNutrition {
  kcal_per_serving: number | null;
  protein_g_per_serving: number | null;
  carbs_g_per_serving: number | null;
  fat_g_per_serving: number | null;
  fiber_g_per_serving: number | null;
}

export interface RecipeMetadata {
  total_time_minutes: number | null; // prep + cook
  servings_default: number;
  ai_tags: string[]; // damit wir z.B. 'cheat-meal' respektieren
}

/**
 * Schwellen für die computed Tags. Bewusst etwas konservativ damit die Tags wirklich was aussagen.
 *
 * Quellen / Begründungen:
 * - high-protein: ≥30g pro Portion ist eine sportlich relevante Schwelle (DGE empfiehlt 0.8g/kg/d,
 *   für Krafttraining 1.6-2.2g/kg/d → für 90kg Denny ~145-200g/d → 30g pro Mahlzeit ist sinnvoll)
 * - low-carb: ≤25g pro Portion ist gängige Definition (sub-kcal-basiert weil simpler/transparenter)
 * - low-fat: ≤10g pro Portion (entspricht ≤90 kcal Fett, deutlich unter Standard)
 * - low-cal: ≤400 kcal pro Portion
 * - healthy-fast-food: ≤30 min Total + ≥20g Protein + ≤600 kcal — Dennys "schnell aber sinnvoll"
 */
export const TAG_THRESHOLDS = {
  highProteinG: 30,
  lowCarbG: 25,
  lowFatG: 10,
  lowCalKcal: 400,

  healthyFastFood: {
    maxTotalMinutes: 30,
    minProteinG: 20,
    maxKcal: 600,
  },

  quickMaxMinutes: 20,
  slowFoodMinMinutes: 90,
} as const;

/**
 * Berechnet die computed_tags für ein Rezept.
 * Returns: text[] kompatibel mit recipes.computed_tags Spalte.
 *
 * Wenn nutrition unvollständig (kein kcal/protein etc.): keine macro-tags, nur time-tags.
 */
export function computeRecipeTags(nutrition: RecipeNutrition, metadata: RecipeMetadata): string[] {
  const tags: string[] = [];

  // Time-basierte Tags brauchen keine Nutrition
  const time = metadata.total_time_minutes;
  if (time !== null) {
    if (time <= TAG_THRESHOLDS.quickMaxMinutes) tags.push("quick");
    else if (time >= TAG_THRESHOLDS.slowFoodMinMinutes) tags.push("slow-food");
  }

  // Macro-Tags nur wenn Nutrition komplett genug ist
  const hasMacros =
    nutrition.protein_g_per_serving !== null &&
    nutrition.carbs_g_per_serving !== null &&
    nutrition.fat_g_per_serving !== null;

  if (!hasMacros) return tags;

  const protein = nutrition.protein_g_per_serving!;
  const carbs = nutrition.carbs_g_per_serving!;
  const fat = nutrition.fat_g_per_serving!;
  const kcal = nutrition.kcal_per_serving;

  if (protein >= TAG_THRESHOLDS.highProteinG) tags.push("high-protein");
  if (carbs <= TAG_THRESHOLDS.lowCarbG) tags.push("low-carb");
  if (fat <= TAG_THRESHOLDS.lowFatG) tags.push("low-fat");
  if (kcal !== null && kcal <= TAG_THRESHOLDS.lowCalKcal) tags.push("low-cal");

  // Healthy-Fast-Food: konjunktive Bedingungen
  if (
    time !== null &&
    time <= TAG_THRESHOLDS.healthyFastFood.maxTotalMinutes &&
    protein >= TAG_THRESHOLDS.healthyFastFood.minProteinG &&
    kcal !== null &&
    kcal <= TAG_THRESHOLDS.healthyFastFood.maxKcal
  ) {
    tags.push("healthy-fast-food");
  }

  // Macro-Distribution-Tag (informational, ergänzend)
  if (kcal !== null && kcal > 0) {
    const proteinKcalShare = (protein * 4) / kcal;
    const carbsKcalShare = (carbs * 4) / kcal;
    const fatKcalShare = (fat * 9) / kcal;
    if (proteinKcalShare >= 0.35) {
      // Über 35% kcal aus Protein — sehr proteinreich
      if (!tags.includes("high-protein")) tags.push("high-protein");
    }
    if (
      proteinKcalShare >= 0.2 &&
      proteinKcalShare <= 0.35 &&
      carbsKcalShare >= 0.4 &&
      carbsKcalShare <= 0.55 &&
      fatKcalShare >= 0.2 &&
      fatKcalShare <= 0.35
    ) {
      tags.push("balanced");
    }
  }

  return tags;
}

// =============================================================================
// NUTRITION COMPUTATION (aggregating ingredient nutrition → per-serving)
// =============================================================================

export interface IngredientForNutrition {
  amount: number | null;
  unit: string | null;
  /** kcal per 100g (oder per 100ml für liquids — wir behandeln gleich) */
  kcal_per_100g: number | null;
  protein_g_per_100g: number | null;
  carbs_g_per_100g: number | null;
  fat_g_per_100g: number | null;
  fiber_g_per_100g: number | null;
}

export interface NutritionAggregate {
  kcal_per_serving: number | null;
  protein_g_per_serving: number | null;
  carbs_g_per_serving: number | null;
  fat_g_per_serving: number | null;
  fiber_g_per_serving: number | null;
  /** 0-1: % der Zutaten (gewichtet nach Masse) für die Nährwerte vorlagen */
  completeness: number;
}

/**
 * Aggregiert Nährwerte über alle Zutaten und teilt durch servings.
 * Behandelt Einheiten-Konvertierung intern (g/ml → 100g equivalent, EL/TL via approx).
 *
 * Nicht-massenhafte Einheiten (Stk, Prise, Bund) werden ignoriert für die Aggregation
 * — es sei denn die Zutat hat ein "average_g_per_unit" Feld (zukünftige Erweiterung).
 */
export function aggregateNutrition(
  ingredients: IngredientForNutrition[],
  servings: number,
): NutritionAggregate {
  let totalKcal = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;
  let totalFiber = 0;
  let totalAccountedMass = 0;
  let totalAttemptedMass = 0;

  let anyMacroSeen = false;
  let anyKcalSeen = false;

  for (const ing of ingredients) {
    const massG = ingredientMassGrams(ing.amount, ing.unit);
    if (massG === null) continue;

    totalAttemptedMass += massG;

    if (ing.kcal_per_100g !== null) {
      totalKcal += (massG / 100) * ing.kcal_per_100g;
      anyKcalSeen = true;
      totalAccountedMass += massG; // wir zählen mass nur wenn Nährwert da war
    }
    if (ing.protein_g_per_100g !== null) {
      totalProtein += (massG / 100) * ing.protein_g_per_100g;
      anyMacroSeen = true;
    }
    if (ing.carbs_g_per_100g !== null) {
      totalCarbs += (massG / 100) * ing.carbs_g_per_100g;
      anyMacroSeen = true;
    }
    if (ing.fat_g_per_100g !== null) {
      totalFat += (massG / 100) * ing.fat_g_per_100g;
      anyMacroSeen = true;
    }
    if (ing.fiber_g_per_100g !== null) {
      totalFiber += (massG / 100) * ing.fiber_g_per_100g;
    }
  }

  if (!anyKcalSeen && !anyMacroSeen) {
    return {
      kcal_per_serving: null,
      protein_g_per_serving: null,
      carbs_g_per_serving: null,
      fat_g_per_serving: null,
      fiber_g_per_serving: null,
      completeness: 0,
    };
  }

  const completeness =
    totalAttemptedMass > 0 ? Math.min(1, totalAccountedMass / totalAttemptedMass) : 0;

  return {
    kcal_per_serving: round1(totalKcal / servings),
    protein_g_per_serving: round1(totalProtein / servings),
    carbs_g_per_serving: round1(totalCarbs / servings),
    fat_g_per_serving: round1(totalFat / servings),
    fiber_g_per_serving: round1(totalFiber / servings),
    completeness,
  };
}

/**
 * Schätzt das Gewicht in Gramm für eine Mengenangabe.
 * Wenn Einheit nicht zu Gramm konvertierbar (Stk, Prise, Bund): null.
 */
function ingredientMassGrams(amount: number | null, unit: string | null): number | null {
  if (amount === null || !unit) return null;

  switch (unit) {
    case "g":
      return amount;
    case "kg":
      return amount * 1000;
    case "ml":
      return amount; // approximation: water density. OK für Aggregation.
    case "l":
      return amount * 1000;
    case "EL":
      return amount * 15;
    case "TL":
      return amount * 5;
    case "Prise":
      return amount * 0.5;
    case "Bund":
      return amount * 30; // grobe Schätzung
    case "Stk":
      return null; // Nicht ohne Density-Lookup. Future enhancement.
    default:
      return null;
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
