/**
 * Pantry Matching — "Was kann ich mit meinen Zutaten kochen?"
 *
 * Match-Algorithmus:
 *   Für jedes Recipe in der DB:
 *     a. Liste der Recipe-Zutaten (kanonisch normalisiert)
 *     b. Liste der Pantry-Items (kanonisch normalisiert)
 *     c. Match: für jede Recipe-Zutat → ist sie im Pantry oder ein Staple?
 *     d. Score: % der Zutaten die abgedeckt sind, gewichtet
 *
 * Sortierung:
 *   - 100%-Match First (alles vorhanden)
 *   - dann 80%+
 *   - dann "Nur 1-2 fehlen"
 *
 * Edge cases:
 *   - Staples (Salz, Pfeffer, Öl, Wasser) immer als "vorhanden" annehmen
 *   - Mengen-Check optional: wenn pantry_check_amount=true wird auch Quantität geprüft
 *   - Optionale Zutaten zählen weniger negativ
 *   - Substitutionen: simpler Match (Hähnchen ≈ Pute), aber konservativ
 */

import { canonicalizeIngredient } from "./normalize";

export interface PantryItem {
  ingredient_name: string;
  amount: number | null;
  unit: string | null;
  expires_at?: Date | null;
}

export interface RecipeForMatching {
  id: string;
  title: string;
  ingredients: Array<{
    name: string;
    amount: number | null;
    unit: string | null;
    optional?: boolean;
  }>;
}

export interface MatchResult {
  recipe: RecipeForMatching;
  /** 0-1 — Anteil der nicht-optionalen Zutaten die abgedeckt sind */
  match_percent: number;
  /** Zutaten die exakt im Pantry sind */
  matched: string[];
  /** Zutaten die als Staples angenommen werden */
  staple_matched: string[];
  /** Zutaten die fehlen */
  missing: string[];
  /** Optionale Zutaten die fehlen — weniger schlimm */
  missing_optional: string[];
  /** Empfehlung: kannst du nachkaufen + dann auch Recipe X, Y, Z machen */
  near_miss: boolean; // true wenn match_percent >= 0.8 aber < 1
}

/**
 * Pantry-Staples die immer als "vorhanden" angenommen werden.
 * (Sonst wird kein Recipe je gematched, weil jeder hat Salz und Wasser.)
 *
 * Liste bewusst klein gehalten — Olivenöl ist drin (Denny hat 100% immer welches),
 * aber spezielle Öle wie Sesam-Öl nicht.
 */
const PANTRY_STAPLES = new Set([
  "Salz",
  "Pfeffer",
  "Schwarzer Pfeffer",
  "Wasser",
  "Olivenöl",
  "Pflanzenöl",
  "Sonnenblumenöl",
  "Butter", // bei Denny meistens da
  "Zucker",
  "Mehl", // immer im Vorrat
  "Weisser Pfeffer",
]);

/**
 * Helfer: ist eine Zutat als Staple zu betrachten?
 */
export function isPantryStaple(ingredientName: string): boolean {
  const canonical = canonicalizeIngredient(ingredientName);
  return PANTRY_STAPLES.has(canonical);
}

// =============================================================================
// MAIN MATCH FUNCTION
// =============================================================================

export interface MatchOptions {
  /** Wenn true: Mengen prüfen (User hat 100g, Recipe braucht 200g → fehlend) */
  check_amounts?: boolean;
  /** Tag-Filter — z.B. nur 'high-protein' Vorschläge */
  // (Tag-Filter wird im SQL erledigt, hier nicht nochmal)
  /** Wie viele Vorschläge max */
  limit?: number;
  /** Minimum match_percent für die Vorschlagsliste */
  min_match_percent?: number;
}

/**
 * Findet Recipes die mit dem aktuellen Pantry kochbar sind.
 *
 * Implementation-Hinweis: für 2 User mit ~100-500 Recipes ist O(recipes × ingredients)
 * easily machbar in-memory. Bei mehr Daten: pre-compute canonical_name als Spalte +
 * Inverse Index "ingredient → recipes" via gin index.
 */
export function findCookableRecipes(
  pantry: PantryItem[],
  recipes: RecipeForMatching[],
  options: MatchOptions = {},
): MatchResult[] {
  const minMatch = options.min_match_percent ?? 0.6;
  const limit = options.limit ?? 50;

  // Pantry → Set kanonischer Namen für O(1) Lookup
  const pantrySet = new Map<string, PantryItem>();
  for (const item of pantry) {
    const canonical = canonicalizeIngredient(item.ingredient_name);
    pantrySet.set(canonical, item);
  }

  const results: MatchResult[] = [];

  for (const recipe of recipes) {
    const matched: string[] = [];
    const stapleMatched: string[] = [];
    const missing: string[] = [];
    const missingOptional: string[] = [];

    let requiredCount = 0;
    let coveredCount = 0;

    for (const ing of recipe.ingredients) {
      const canonical = canonicalizeIngredient(ing.name);
      const isOptional = ing.optional === true;
      const isStaple = PANTRY_STAPLES.has(canonical);

      // Staples zählen nicht als "required" — sie sind quasi kostenlos vorhanden.
      // Optional-Zutaten zählen auch nicht als required.
      if (!isOptional && !isStaple) requiredCount++;

      // Staple → immer ok
      if (isStaple) {
        stapleMatched.push(ing.name);
        continue;
      }

      const inPantry = pantrySet.get(canonical);
      if (inPantry) {
        // Optional: Mengen-Check
        if (options.check_amounts && ing.amount !== null && inPantry.amount !== null) {
          // Vereinfacht: gleiche Einheit oder beide leer → einfacher Vergleich
          if (ing.unit === inPantry.unit && inPantry.amount < ing.amount) {
            // Nicht genug → als fehlend werten
            if (isOptional) missingOptional.push(ing.name);
            else missing.push(ing.name);
            continue;
          }
        }
        matched.push(ing.name);
        if (!isOptional) coveredCount++;
      } else {
        if (isOptional) missingOptional.push(ing.name);
        else missing.push(ing.name);
      }
    }

    const matchPercent = requiredCount > 0 ? coveredCount / requiredCount : 1;
    if (matchPercent < minMatch) continue;

    results.push({
      recipe,
      match_percent: matchPercent,
      matched,
      staple_matched: stapleMatched,
      missing,
      missing_optional: missingOptional,
      // Near-miss: 1-2 echte Zutaten fehlen — egal ob das 50% oder 90% sind, der User
      // muss nur kurz einkaufen. Ist die useful Definition für "Wenn du noch X kaufst…"
      near_miss: missing.length > 0 && missing.length <= 2 && matchPercent >= 0.5,
    });
  }

  // Sortierung: 100% > 80%+ > 60%+; Tie-break: weniger missing optionals oben
  results.sort((a, b) => {
    if (a.match_percent !== b.match_percent) return b.match_percent - a.match_percent;
    if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length;
    return a.missing_optional.length - b.missing_optional.length;
  });

  return results.slice(0, limit);
}

// =============================================================================
// SHOPPING LIST: was muss ich kaufen um Recipe X zu kochen?
// =============================================================================

export interface ShoppingListEntry {
  ingredient_name: string;
  amount: number | null;
  unit: string | null;
  /** Welche Recipes brauchen das */
  for_recipes: string[];
}

/**
 * Generiert eine Shopping-List für eine Liste von Recipes basierend auf aktuellem Pantry.
 * Aggregiert Mengen wenn die gleiche Zutat in mehreren Recipes vorkommt.
 */
export function buildShoppingList(
  pantry: PantryItem[],
  recipes: RecipeForMatching[],
): ShoppingListEntry[] {
  const pantrySet = new Map<string, PantryItem>();
  for (const item of pantry) {
    pantrySet.set(canonicalizeIngredient(item.ingredient_name), item);
  }

  const needed = new Map<
    string,
    { amount: number | null; unit: string | null; for_recipes: string[]; display_name: string }
  >();

  for (const recipe of recipes) {
    for (const ing of recipe.ingredients) {
      if (ing.optional) continue;
      const canonical = canonicalizeIngredient(ing.name);
      if (PANTRY_STAPLES.has(canonical)) continue;

      const have = pantrySet.get(canonical);
      // Vereinfacht: wenn schon im Pantry, skip (ohne Mengen-Check für jetzt)
      if (have) continue;

      const existing = needed.get(canonical);
      if (existing) {
        if (existing.unit === ing.unit && existing.amount !== null && ing.amount !== null) {
          existing.amount += ing.amount;
        }
        if (!existing.for_recipes.includes(recipe.title)) {
          existing.for_recipes.push(recipe.title);
        }
      } else {
        needed.set(canonical, {
          amount: ing.amount,
          unit: ing.unit,
          for_recipes: [recipe.title],
          display_name: canonical,
        });
      }
    }
  }

  return Array.from(needed.values()).map((v) => ({
    ingredient_name: v.display_name,
    amount: v.amount,
    unit: v.unit,
    for_recipes: v.for_recipes,
  }));
}
