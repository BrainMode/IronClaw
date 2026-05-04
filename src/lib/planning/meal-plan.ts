/**
 * Meal Plan Generator.
 *
 * Wird vom AI-Coach via `create_meal_plan` Tool gerufen oder direkt aus UI.
 *
 * Strategie (zwei-stufig):
 *
 * STUFE 1 — Candidate-Filtering:
 *   Aus allen Recipes filtere die plausiblen Kandidaten:
 *   - Tag-Filter (required_tags, excluded_tags)
 *   - Equipment hat User
 *   - Recipe wurde nicht in den letzten N Tagen gekocht
 *   - Hat ausreichend Nutrition-Daten (sonst können wir Macros nicht prüfen)
 *
 * STUFE 2 — Greedy Tag-Constraint-Filling mit Backtracking:
 *   Für jeden Tag, für jeden Mealtype:
 *     Score Kandidaten:
 *       + Pantry-Match (mehr Zutaten da → besserer Score)
 *       + passt in noch verbleibendes Macro-Budget des Tages
 *       + nicht das gleiche Recipe wie an Vortagen (penalisiert)
 *       + ausgewogene Cuisine-Verteilung über die Woche
 *     Wähle Top-Kandidat. Wenn keiner passt: Backtrack zum letzten Mealtype.
 *
 * Vereinfachung im MVP: kein echtes Backtracking, sondern Best-Effort + Warnings.
 * Wenn das nicht reicht (selten): User editiert manuell oder "regeneriere".
 */

import type { MealType } from "../recipes/cook-log";

// =============================================================================
// TYPES
// =============================================================================

export interface PlanGenerationInput {
  user_id: string;
  household_id: string;
  start_date: Date;
  days: number;

  meal_types_per_day: MealType[];

  /** Macro-Constraints pro Tag */
  daily_kcal_target?: number;
  daily_protein_g_target?: number;
  daily_carbs_g_target?: number;
  daily_fat_g_target?: number;
  /** Toleranz pro Tag in Prozent (default 10%) */
  kcal_tolerance_pct?: number;

  /** Filter */
  required_tags?: string[];
  excluded_tags?: string[];
  user_owned_equipment?: string[]; // equipment_keys

  /** Vermeide Recipes die innerhalb der letzten N Tage gekocht wurden */
  avoid_recent_cooks_days?: number;

  /** Wenn true: bevorzuge Recipes mit hohem Pantry-Match */
  prefer_pantry?: boolean;

  /** Lookups */
  candidates: PlanCandidate[];
  recent_cooks: RecentCook[];
  pantry_canonical_names: Set<string>;
}

export interface PlanCandidate {
  recipe_id: string;
  title: string;
  ai_tags: string[];
  computed_tags: string[];
  user_tags: string[];
  servings_default: number;
  kcal_per_serving: number | null;
  protein_g_per_serving: number | null;
  carbs_g_per_serving: number | null;
  fat_g_per_serving: number | null;
  total_time_minutes: number | null;
  required_equipment: string[]; // canonical keys
  /** Welche kanonischen Zutaten enthält das Recipe? Für Pantry-Match */
  ingredient_canonical_names: string[];
  /** Wie oft wurde das Recipe gekocht — niedrige Cook-Counts = "neue" Recipes bevorzugen */
  times_cooked: number;
}

export interface RecentCook {
  recipe_id: string;
  cooked_at: Date;
}

export interface MealPlanResult {
  entries: PlanEntry[];
  warnings: string[];
  daily_aggregates: DailyAggregate[];
}

export interface PlanEntry {
  for_date: Date;
  meal_type: MealType;
  recipe_id: string | null;
  recipe_title: string | null;
  free_text: string | null;
  servings_planned: number;
  expected_kcal: number | null;
  expected_protein_g: number | null;
  expected_carbs_g: number | null;
  expected_fat_g: number | null;
}

export interface DailyAggregate {
  for_date: Date;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** True wenn innerhalb der Toleranz aller Targets */
  meets_targets: boolean;
}

// =============================================================================
// MAIN GENERATOR
// =============================================================================

const DEFAULT_TOLERANCE = 0.1;

export function generateMealPlan(input: PlanGenerationInput): MealPlanResult {
  const tolerance = input.kcal_tolerance_pct ?? DEFAULT_TOLERANCE;
  const warnings: string[] = [];

  // 1. Candidate-Filter (Equipment + Tags + Recently-Cooked + Macro-Daten)
  const filteredCandidates = filterCandidates(input);
  if (filteredCandidates.length === 0) {
    return {
      entries: [],
      warnings: ["Keine geeigneten Recipes für die Kriterien gefunden."],
      daily_aggregates: [],
    };
  }

  // 2. Plan tagweise füllen
  const entries: PlanEntry[] = [];
  const usedRecipeIds = new Map<string, Date>(); // anti-repetition

  for (let dayOffset = 0; dayOffset < input.days; dayOffset++) {
    const forDate = addDays(input.start_date, dayOffset);

    let dayKcal = 0;
    let dayProtein = 0;
    let _dayCarbs = 0;
    let _dayFat = 0;

    for (const mealType of input.meal_types_per_day) {
      const remainingKcal =
        input.daily_kcal_target !== undefined ? input.daily_kcal_target - dayKcal : undefined;
      const remainingProtein =
        input.daily_protein_g_target !== undefined
          ? input.daily_protein_g_target - dayProtein
          : undefined;

      const mealTypeAllocation = allocationForMealType(mealType, input.meal_types_per_day);

      const candidate = pickBestCandidate({
        candidates: filteredCandidates,
        mealType,
        targetKcalForMeal:
          input.daily_kcal_target !== undefined
            ? input.daily_kcal_target * mealTypeAllocation
            : undefined,
        remainingKcal,
        remainingProtein,
        usedRecipeIds,
        forDate,
        avoidWindow: input.avoid_recent_cooks_days ?? 7,
        pantry: input.pantry_canonical_names,
        preferPantry: input.prefer_pantry ?? true,
      });

      if (!candidate) {
        warnings.push(
          `${forDate.toISOString().slice(0, 10)} ${mealType}: kein passendes Recipe gefunden`,
        );
        entries.push({
          for_date: forDate,
          meal_type: mealType,
          recipe_id: null,
          recipe_title: null,
          free_text: "(noch zu planen)",
          servings_planned: 1,
          expected_kcal: null,
          expected_protein_g: null,
          expected_carbs_g: null,
          expected_fat_g: null,
        });
        continue;
      }

      const servings = 1; // could be smarter — scale up for bulk-meal-prep
      entries.push({
        for_date: forDate,
        meal_type: mealType,
        recipe_id: candidate.recipe_id,
        recipe_title: candidate.title,
        free_text: null,
        servings_planned: servings,
        expected_kcal: nullableScale(candidate.kcal_per_serving, servings),
        expected_protein_g: nullableScale(candidate.protein_g_per_serving, servings),
        expected_carbs_g: nullableScale(candidate.carbs_g_per_serving, servings),
        expected_fat_g: nullableScale(candidate.fat_g_per_serving, servings),
      });

      usedRecipeIds.set(candidate.recipe_id, forDate);
      dayKcal += candidate.kcal_per_serving ?? 0;
      dayProtein += candidate.protein_g_per_serving ?? 0;
      _dayCarbs += candidate.carbs_g_per_serving ?? 0;
      _dayFat += candidate.fat_g_per_serving ?? 0;
    }
  }

  // 3. Daily aggregates + tolerance check
  const daily_aggregates = computeDailyAggregates(entries, input, tolerance);

  const offDays = daily_aggregates.filter((d) => !d.meets_targets);
  if (offDays.length > 0) {
    warnings.push(
      `${offDays.length} Tag(e) außerhalb Macro-Toleranz — User könnte editieren oder andere Targets setzen.`,
    );
  }

  return { entries, warnings, daily_aggregates };
}

// =============================================================================
// HELPERS
// =============================================================================

function filterCandidates(input: PlanGenerationInput): PlanCandidate[] {
  const recentlyCooked = new Set(
    input.recent_cooks
      .filter(
        (c) => daysBetween(c.cooked_at, input.start_date) < (input.avoid_recent_cooks_days ?? 7),
      )
      .map((c) => c.recipe_id),
  );

  return input.candidates.filter((c) => {
    // Tag-Filter
    if (input.required_tags) {
      const allTags = [...c.ai_tags, ...c.computed_tags, ...c.user_tags];
      if (!input.required_tags.every((t) => allTags.includes(t))) return false;
    }
    if (input.excluded_tags) {
      const allTags = [...c.ai_tags, ...c.computed_tags, ...c.user_tags];
      if (input.excluded_tags.some((t) => allTags.includes(t))) return false;
    }

    // Equipment
    if (input.user_owned_equipment) {
      const owned = new Set(input.user_owned_equipment);
      const requiresAll = c.required_equipment.every((e) => owned.has(e));
      if (!requiresAll) return false;
    }

    // Anti-Repetition: schon kürzlich gekocht
    if (recentlyCooked.has(c.recipe_id)) return false;

    // Min Nutrition-Daten
    if (c.kcal_per_serving === null || c.protein_g_per_serving === null) return false;

    return true;
  });
}

interface PickInput {
  candidates: PlanCandidate[];
  mealType: MealType;
  targetKcalForMeal?: number;
  remainingKcal?: number;
  remainingProtein?: number;
  usedRecipeIds: Map<string, Date>;
  forDate: Date;
  avoidWindow: number;
  pantry: Set<string>;
  preferPantry: boolean;
}

function pickBestCandidate(input: PickInput): PlanCandidate | null {
  let best: PlanCandidate | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const c of input.candidates) {
    // Anti-repetition innerhalb des Plans
    const lastUse = input.usedRecipeIds.get(c.recipe_id);
    if (lastUse && daysBetween(lastUse, input.forDate) < input.avoidWindow) continue;

    let score = 0;

    // Macro-Fit
    const kcal = c.kcal_per_serving!;
    if (input.targetKcalForMeal !== undefined) {
      const diff = Math.abs(kcal - input.targetKcalForMeal);
      score -= diff / 100; // 100 kcal off = -1 Punkt
    }
    if (input.remainingKcal !== undefined && kcal > input.remainingKcal * 1.2) {
      // Zu groß für verbleibendes Tagesbudget
      score -= 50;
    }

    // Protein-Bonus wenn Protein-Ziel noch nicht erfüllt
    if (input.remainingProtein !== undefined && input.remainingProtein > 30) {
      const protein = c.protein_g_per_serving ?? 0;
      score += protein / 10;
    }

    // Pantry-Match-Bonus
    if (input.preferPantry && input.pantry.size > 0) {
      const ingNames = c.ingredient_canonical_names;
      const overlap = ingNames.filter((n) => input.pantry.has(n)).length;
      score += overlap * 2;
    }

    // Mealtype-Heuristik: Frühstücks-Tags bevorzugen für breakfast
    if (input.mealType === "breakfast" && c.ai_tags.includes("frühstück")) score += 5;
    if (input.mealType === "snack" && c.ai_tags.includes("snack")) score += 5;
    if (input.mealType === "dinner" && c.ai_tags.includes("hauptgang")) score += 3;

    // Variety-Bonus: weniger oft gekocht = bevorzugt
    score -= Math.min(5, c.times_cooked / 2);

    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  return best;
}

/**
 * Wieviel Anteil des Tagesbudgets pro Meal — naive Heuristik.
 */
function allocationForMealType(meal: MealType, all: MealType[]): number {
  const allocation: Record<MealType, number> = {
    breakfast: 0.25,
    lunch: 0.35,
    dinner: 0.35,
    snack: 0.1,
  };
  const totalAllocated = all.reduce((s, m) => s + allocation[m], 0);
  return allocation[meal] / totalAllocated;
}

function computeDailyAggregates(
  entries: PlanEntry[],
  input: PlanGenerationInput,
  tolerance: number,
): DailyAggregate[] {
  const byDate = new Map<string, PlanEntry[]>();
  for (const e of entries) {
    const key = e.for_date.toISOString().slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(e);
  }

  return Array.from(byDate.entries()).map(([key, dayEntries]) => {
    const kcal = sum(dayEntries, (e) => e.expected_kcal);
    const protein = sum(dayEntries, (e) => e.expected_protein_g);
    const carbs = sum(dayEntries, (e) => e.expected_carbs_g);
    const fat = sum(dayEntries, (e) => e.expected_fat_g);

    const meetsKcal =
      input.daily_kcal_target === undefined ||
      Math.abs(kcal - input.daily_kcal_target) / input.daily_kcal_target <= tolerance;
    const meetsProtein =
      input.daily_protein_g_target === undefined ||
      protein >= input.daily_protein_g_target * (1 - tolerance);

    return {
      for_date: new Date(key),
      kcal,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
      meets_targets: meetsKcal && meetsProtein,
    };
  });
}

function nullableScale(v: number | null, factor: number): number | null {
  return v === null ? null : v * factor;
}

function sum<T>(arr: T[], fn: (x: T) => number | null): number {
  return arr.reduce((s, x) => s + (fn(x) ?? 0), 0);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}
