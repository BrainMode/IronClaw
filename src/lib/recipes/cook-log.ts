/**
 * Cook-Log — wenn User "Heute gekocht und gegessen" tappt.
 *
 * Verantwortung:
 * 1. recipe_cooks Row erstellen (Snapshot der Nährwerte zum Zeitpunkt)
 * 2. nutrition_logs Rows erstellen (kcal/protein/carbs/fat als Mahlzeit)
 * 3. Optional: pantry_items decrementieren (Zutaten anteilig aufbrauchen)
 * 4. recipes.times_cooked + last_cooked_at via DB-Trigger automatisch
 *
 * Multi-User-Aspekt: wenn Denny und seine Frau zusammen kochen + essen, kann jeder
 * für sich loggen (eigener nutrition_log Eintrag). Wer das Pantry decrementiert, ist
 * Convention: nur einer (default: Recipe-Cook-Owner). UI bietet Toggle.
 */

import { canonicalizeIngredient } from "./normalize";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface RecipeForCookLog {
  id: string;
  household_id: string;
  servings_default: number;
  kcal_per_serving: number | null;
  protein_g_per_serving: number | null;
  carbs_g_per_serving: number | null;
  fat_g_per_serving: number | null;
  ingredients: Array<{
    name: string;
    amount: number | null;
    unit: string | null;
  }>;
}

export interface LogCookedInput {
  recipe: RecipeForCookLog;
  user_id: string;
  meal_type: MealType;
  /** Wieviele Portionen gegessen — kann <1 sein wenn nur halbe gegessen */
  servings_eaten: number;
  /** Wenn true: pantry_items für die Zutaten reduzieren */
  deduct_from_pantry: boolean;
  cooked_at?: Date;
  rating?: number;
  notes?: string;
}

export interface CookLogResult {
  cook_id: string;
  nutrition_log_ids: string[];
  pantry_updates: PantryUpdate[];
  pantry_warnings: string[]; // z.B. "Du hast nur 80g Mehl, brauchtest 100g — auf 0 gesetzt"
}

export interface PantryUpdate {
  pantry_item_id: string;
  ingredient_name: string;
  previous_amount: number | null;
  new_amount: number | null;
  unit: string | null;
  /** Wenn deplete_threshold (z.B. <10g) erreicht — auf null setzen + Hinweis */
  depleted: boolean;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Verarbeitet einen Cook-Event.
 *
 * Implementation-Plan:
 *
 * ```
 * 1. snapshot computed = {
 *      kcal: recipe.kcal_per_serving * servings_eaten,
 *      protein: recipe.protein_g_per_serving * servings_eaten,
 *      ...
 *    }
 *
 * 2. Insert recipe_cooks row mit Snapshot-Werten
 *    (Trigger update_recipe_cook_stats() läuft automatisch)
 *
 * 3. Insert nutrition_logs rows:
 *    - eine Row pro Macro (oder eine Row mit allen Macros — abhängig vom Schema)
 *    - linked to recipe_cooks via recipe_cook_id
 *    - meal_type, eaten_at = cooked_at, user_id
 *
 * 4. Wenn deduct_from_pantry:
 *    - Für jede Recipe-Zutat:
 *      - canonical = canonicalizeIngredient(ing.name)
 *      - pantry_item = SELECT FROM pantry_items WHERE ingredient_name = canonical
 *        AND household_id = recipe.household_id AND auto_decrement = true
 *      - Wenn vorhanden:
 *        - usedAmount = ing.amount * (servings_eaten / recipe.servings_default)
 *        - new_amount = max(0, pantry.amount - convertUnit(usedAmount, ing.unit, pantry.unit))
 *        - if new_amount <= small_threshold (10g/10ml): DELETE pantry_item, depleted=true
 *        - else UPDATE pantry_items SET amount = new_amount
 *    - Stapel & non-decrementable items skippen
 *
 * 5. Return CookLogResult für UI-Confirmation
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function logCookedRecipe(_input: LogCookedInput): Promise<CookLogResult> {
  throw new Error("Not implemented — Claude Code: implement per docstring. Insert in transaction.");
}

// =============================================================================
// HELPER: pantry decrement berechnung (pure function)
// =============================================================================

export interface PantryItemForDecrement {
  id: string;
  ingredient_name: string; // canonical
  amount: number | null;
  unit: string | null;
  auto_decrement: boolean;
}

/**
 * Pure-Function: berechnet welche Pantry-Updates gemacht werden müssen.
 * Side-effect-frei → testbar. Schreibt nicht in die DB.
 */
export function computePantryDecrement(
  pantry: PantryItemForDecrement[],
  recipe: RecipeForCookLog,
  servingsEaten: number,
): { updates: PantryUpdate[]; warnings: string[] } {
  const updates: PantryUpdate[] = [];
  const warnings: string[] = [];

  const pantryByName = new Map<string, PantryItemForDecrement>();
  for (const p of pantry) {
    pantryByName.set(canonicalizeIngredient(p.ingredient_name), p);
  }

  const scaleFactor = servingsEaten / Math.max(1, recipe.servings_default);

  for (const ing of recipe.ingredients) {
    if (ing.amount === null) continue;
    const canonical = canonicalizeIngredient(ing.name);
    const pantryItem = pantryByName.get(canonical);
    if (!pantryItem || !pantryItem.auto_decrement) continue;

    const used = ing.amount * scaleFactor;

    // Unit-Konvertierung muss matchen — vereinfacht:
    if (pantryItem.unit !== ing.unit) {
      // Wenn nicht gleiche Einheit → Skip + Warning, manuelles Anpassen vom User
      warnings.push(
        `${ing.name}: Pantry hat ${pantryItem.unit}, Recipe braucht ${ing.unit} — bitte manuell anpassen`,
      );
      continue;
    }

    if (pantryItem.amount === null) {
      // Keine Mengenangabe im Pantry → kein Decrement möglich
      continue;
    }

    let newAmount = pantryItem.amount - used;
    let depleted = false;

    // Threshold für "as good as empty" — Schmieröl, kleine Reste
    const threshold = pantryItem.unit === "g" ? 10 : pantryItem.unit === "ml" ? 10 : 0;

    if (newAmount <= threshold) {
      newAmount = 0;
      depleted = true;
      if (pantryItem.amount < used) {
        warnings.push(
          `${ing.name}: hattest nur ${pantryItem.amount}${pantryItem.unit}, Rezept brauchte ${used.toFixed(0)}${ing.unit}`,
        );
      }
    }

    updates.push({
      pantry_item_id: pantryItem.id,
      ingredient_name: pantryItem.ingredient_name,
      previous_amount: pantryItem.amount,
      new_amount: depleted ? null : newAmount,
      unit: pantryItem.unit,
      depleted,
    });
  }

  return { updates, warnings };
}

// =============================================================================
// SNAPSHOT (für Recipe-Cook Eintrag)
// =============================================================================

export function buildNutritionSnapshot(
  recipe: RecipeForCookLog,
  servingsEaten: number,
): {
  kcal_consumed: number | null;
  protein_g_consumed: number | null;
  carbs_g_consumed: number | null;
  fat_g_consumed: number | null;
} {
  return {
    kcal_consumed:
      recipe.kcal_per_serving === null ? null : Math.round(recipe.kcal_per_serving * servingsEaten),
    protein_g_consumed:
      recipe.protein_g_per_serving === null
        ? null
        : Math.round(recipe.protein_g_per_serving * servingsEaten * 10) / 10,
    carbs_g_consumed:
      recipe.carbs_g_per_serving === null
        ? null
        : Math.round(recipe.carbs_g_per_serving * servingsEaten * 10) / 10,
    fat_g_consumed:
      recipe.fat_g_per_serving === null
        ? null
        : Math.round(recipe.fat_g_per_serving * servingsEaten * 10) / 10,
  };
}

/**
 * Default-Mealtype basierend auf Uhrzeit. UI kann override anbieten.
 */
export function inferMealType(at: Date = new Date()): MealType {
  const hour = at.getHours();
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 22) return "dinner";
  return "snack";
}
