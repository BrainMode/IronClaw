import { describe, expect, it } from "vitest";
import { type IngredientForNutrition, aggregateNutrition, computeRecipeTags } from "./tagging";

describe("computeRecipeTags", () => {
  it("tags healthy fast food when all conditions met", () => {
    const tags = computeRecipeTags(
      {
        kcal_per_serving: 450,
        protein_g_per_serving: 35,
        carbs_g_per_serving: 30,
        fat_g_per_serving: 15,
        fiber_g_per_serving: 5,
      },
      { total_time_minutes: 20, servings_default: 2, ai_tags: [] },
    );
    expect(tags).toContain("healthy-fast-food");
    expect(tags).toContain("high-protein");
    expect(tags).toContain("quick");
  });

  it("does not tag healthy-fast-food when kcal too high", () => {
    const tags = computeRecipeTags(
      {
        kcal_per_serving: 800,
        protein_g_per_serving: 40,
        carbs_g_per_serving: 50,
        fat_g_per_serving: 30,
        fiber_g_per_serving: 5,
      },
      { total_time_minutes: 20, servings_default: 2, ai_tags: [] },
    );
    expect(tags).not.toContain("healthy-fast-food");
    expect(tags).toContain("high-protein");
    expect(tags).toContain("quick");
  });

  it("tags low-carb at 25g threshold", () => {
    const tags = computeRecipeTags(
      {
        kcal_per_serving: 600,
        protein_g_per_serving: 50,
        carbs_g_per_serving: 15,
        fat_g_per_serving: 35,
        fiber_g_per_serving: 5,
      },
      { total_time_minutes: 60, servings_default: 2, ai_tags: [] },
    );
    expect(tags).toContain("low-carb");
    expect(tags).toContain("high-protein");
  });

  it("tags spare-ribs scenario correctly: high-protein, slow-food, NOT low-carb/healthy-fast-food", () => {
    // Realistisch: 800g Spare Ribs für 2, Marinade mit Honig/BBQ-Sauce,
    // 4h Smoker → kcal hoch, Protein hoch, Carbs medium-low, Fett hoch
    const tags = computeRecipeTags(
      {
        kcal_per_serving: 850,
        protein_g_per_serving: 60,
        carbs_g_per_serving: 30,
        fat_g_per_serving: 55,
        fiber_g_per_serving: 1,
      },
      { total_time_minutes: 240, servings_default: 2, ai_tags: ["bbq", "cheat-meal"] },
    );
    expect(tags).toContain("high-protein");
    expect(tags).toContain("slow-food");
    expect(tags).not.toContain("low-carb");
    expect(tags).not.toContain("low-fat");
    expect(tags).not.toContain("healthy-fast-food");
    expect(tags).not.toContain("low-cal");
  });

  it("returns only time tags when nutrition is missing", () => {
    const tags = computeRecipeTags(
      {
        kcal_per_serving: null,
        protein_g_per_serving: null,
        carbs_g_per_serving: null,
        fat_g_per_serving: null,
        fiber_g_per_serving: null,
      },
      { total_time_minutes: 15, servings_default: 2, ai_tags: [] },
    );
    expect(tags).toEqual(["quick"]);
  });

  it("tags balanced macro distribution", () => {
    const tags = computeRecipeTags(
      {
        kcal_per_serving: 600,
        protein_g_per_serving: 35, // ~23% kcal
        carbs_g_per_serving: 75, // 50% kcal
        fat_g_per_serving: 18, // ~27% kcal
        fiber_g_per_serving: 8,
      },
      { total_time_minutes: 35, servings_default: 2, ai_tags: [] },
    );
    expect(tags).toContain("balanced");
  });
});

describe("aggregateNutrition", () => {
  it("aggregates simple recipe correctly", () => {
    const ingredients: IngredientForNutrition[] = [
      {
        amount: 200,
        unit: "g",
        kcal_per_100g: 350, // Spaghetti
        protein_g_per_100g: 12,
        carbs_g_per_100g: 70,
        fat_g_per_100g: 1.5,
        fiber_g_per_100g: 3,
      },
      {
        amount: 100,
        unit: "g",
        kcal_per_100g: 540, // Guanciale (fettreich)
        protein_g_per_100g: 8,
        carbs_g_per_100g: 0,
        fat_g_per_100g: 55,
        fiber_g_per_100g: 0,
      },
    ];
    const result = aggregateNutrition(ingredients, 2);
    // 200g Spaghetti: 700 kcal, 24g P, 140g C, 3g F → /2 = 350, 12, 70, 1.5
    // 100g Guanciale: 540 kcal, 8g P, 0g C, 55g F → /2 = 270, 4, 0, 27.5
    // Sum per serving: 620 kcal, 16g P, 70g C, 29g F (approx)
    expect(result.kcal_per_serving).toBeCloseTo(620, 0);
    expect(result.protein_g_per_serving).toBeCloseTo(16, 0);
    expect(result.completeness).toBe(1);
  });

  it("handles unknown-unit ingredients gracefully", () => {
    const ingredients: IngredientForNutrition[] = [
      {
        amount: 100,
        unit: "g",
        kcal_per_100g: 350,
        protein_g_per_100g: 12,
        carbs_g_per_100g: 70,
        fat_g_per_100g: 1.5,
        fiber_g_per_100g: 3,
      },
      {
        // Z.B. "1 Stk Knoblauchzehe" — wir können das nicht in g umrechnen
        amount: 1,
        unit: "Stk",
        kcal_per_100g: 150,
        protein_g_per_100g: 6,
        carbs_g_per_100g: 33,
        fat_g_per_100g: 0.5,
        fiber_g_per_100g: 2,
      },
    ];
    const result = aggregateNutrition(ingredients, 1);
    // Knoblauch wird ignoriert in aggregation → nur Spaghetti zählt
    expect(result.kcal_per_serving).toBeCloseTo(350, 0);
    expect(result.completeness).toBe(1); // alle Zutaten mit MASS hatten Nährwert
  });

  it("returns nulls when no nutrition data available", () => {
    const ingredients: IngredientForNutrition[] = [
      {
        amount: 200,
        unit: "g",
        kcal_per_100g: null,
        protein_g_per_100g: null,
        carbs_g_per_100g: null,
        fat_g_per_100g: null,
        fiber_g_per_100g: null,
      },
    ];
    const result = aggregateNutrition(ingredients, 2);
    expect(result.kcal_per_serving).toBeNull();
    expect(result.protein_g_per_serving).toBeNull();
    expect(result.completeness).toBe(0);
  });

  it("scales correctly for different serving counts", () => {
    const ing: IngredientForNutrition = {
      amount: 1000,
      unit: "g",
      kcal_per_100g: 100,
      protein_g_per_100g: 10,
      carbs_g_per_100g: 0,
      fat_g_per_100g: 5,
      fiber_g_per_100g: 0,
    };
    const r2 = aggregateNutrition([ing], 2);
    const r4 = aggregateNutrition([ing], 4);
    expect(r2.kcal_per_serving).toBeCloseTo(500, 0);
    expect(r4.kcal_per_serving).toBeCloseTo(250, 0);
  });
});
