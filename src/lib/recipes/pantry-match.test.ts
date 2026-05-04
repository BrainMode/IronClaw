import { describe, expect, it } from "vitest";
import {
  type PantryItem,
  type RecipeForMatching,
  buildShoppingList,
  findCookableRecipes,
  isPantryStaple,
} from "./pantry-match";

const carbonara: RecipeForMatching = {
  id: "r1",
  title: "Pasta Carbonara",
  ingredients: [
    { name: "Spaghetti", amount: 200, unit: "g" },
    { name: "Guanciale", amount: 100, unit: "g" },
    { name: "Eigelb", amount: 2, unit: "Stk" },
    { name: "Pecorino", amount: 50, unit: "g" },
    { name: "Schwarzer Pfeffer", amount: null, unit: null },
  ],
};

const aglioOlio: RecipeForMatching = {
  id: "r2",
  title: "Spaghetti Aglio e Olio",
  ingredients: [
    { name: "Spaghetti", amount: 200, unit: "g" },
    { name: "Knoblauch", amount: 4, unit: "Stk" },
    { name: "Olivenöl", amount: 4, unit: "EL" },
    { name: "Petersilie", amount: 1, unit: "Bund", optional: true },
    { name: "Chiliflocken", amount: 1, unit: "TL", optional: true },
    { name: "Salz", amount: null, unit: null },
  ],
};

const spareRibs: RecipeForMatching = {
  id: "r3",
  title: "BBQ Spare Ribs",
  ingredients: [
    { name: "Spare Ribs", amount: 1500, unit: "g" },
    { name: "BBQ-Sauce", amount: 200, unit: "ml" },
    { name: "Brauner Zucker", amount: 50, unit: "g" },
    { name: "Paprikapulver", amount: 2, unit: "EL" },
    { name: "Knoblauchpulver", amount: 1, unit: "EL" },
  ],
};

describe("isPantryStaple", () => {
  it("recognizes Salz", () => {
    expect(isPantryStaple("Salz")).toBe(true);
  });
  it("recognizes Pfeffer variants", () => {
    expect(isPantryStaple("Pfeffer")).toBe(true);
    expect(isPantryStaple("Schwarzer Pfeffer")).toBe(true);
  });
  it("does not consider Spaghetti a staple", () => {
    expect(isPantryStaple("Spaghetti")).toBe(false);
  });
});

describe("findCookableRecipes", () => {
  it("returns 100% match when all ingredients in pantry", () => {
    const pantry: PantryItem[] = [
      { ingredient_name: "Spaghetti", amount: 500, unit: "g" },
      { ingredient_name: "Guanciale", amount: 200, unit: "g" },
      { ingredient_name: "Eigelb", amount: 6, unit: "Stk" },
      { ingredient_name: "Pecorino", amount: 100, unit: "g" },
    ];
    const matches = findCookableRecipes(pantry, [carbonara]);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.match_percent).toBe(1);
    expect(matches[0]!.missing).toEqual([]);
    expect(matches[0]!.staple_matched).toContain("Schwarzer Pfeffer");
  });

  it("near-miss when one non-staple ingredient missing", () => {
    const pantry: PantryItem[] = [
      { ingredient_name: "Spaghetti", amount: 500, unit: "g" },
      { ingredient_name: "Guanciale", amount: 200, unit: "g" },
      { ingredient_name: "Eigelb", amount: 6, unit: "Stk" },
      // Pecorino fehlt
    ];
    const matches = findCookableRecipes(pantry, [carbonara]);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.missing).toEqual(["Pecorino"]);
    expect(matches[0]!.near_miss).toBe(true);
    // 3 von 4 echten required (Pfeffer ist Staple, zählt nicht)
    expect(matches[0]!.match_percent).toBeCloseTo(0.75, 2);
  });

  it("ranks 100% matches above near-miss", () => {
    const pantry: PantryItem[] = [
      { ingredient_name: "Spaghetti", amount: 500, unit: "g" },
      { ingredient_name: "Guanciale", amount: 200, unit: "g" },
      { ingredient_name: "Eigelb", amount: 6, unit: "Stk" },
      { ingredient_name: "Pecorino", amount: 100, unit: "g" },
      { ingredient_name: "Knoblauch", amount: 1, unit: "Stk" },
      // Olivenöl ist staple, alle Aglio-Zutaten da → 100%
    ];
    const matches = findCookableRecipes(pantry, [aglioOlio, carbonara]);
    // beide 100% — sortiert nach completeness der optionals
    expect(matches[0]!.match_percent).toBe(1);
    expect(matches[1]!.match_percent).toBe(1);
  });

  it("filters out recipes below min_match_percent", () => {
    const pantry: PantryItem[] = [
      { ingredient_name: "Spaghetti", amount: 500, unit: "g" },
      { ingredient_name: "Knoblauch", amount: 5, unit: "Stk" },
      // Nichts anderes
    ];
    const matches = findCookableRecipes(pantry, [carbonara, aglioOlio, spareRibs], {
      min_match_percent: 0.6,
    });
    // Carbonara: 1 von 4 echten required (Pfeffer ist Staple) = 25% → fällt raus
    // Aglio: 2 von 2 echten required (Spaghetti, Knoblauch — Olivenöl/Salz Staples) = 100% → drin
    // SpareRibs: 0 von 5 → fällt raus
    expect(matches).toHaveLength(1);
    expect(matches[0]!.recipe.id).toBe("r2");
    expect(matches[0]!.match_percent).toBe(1);
  });

  it("does not penalize for missing optional ingredients in match score", () => {
    const pantry: PantryItem[] = [
      { ingredient_name: "Spaghetti", amount: 500, unit: "g" },
      { ingredient_name: "Knoblauch", amount: 5, unit: "Stk" },
      // Petersilie + Chili fehlen, sind aber optional
    ];
    const matches = findCookableRecipes(pantry, [aglioOlio]);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.match_percent).toBe(1); // alle required vorhanden
    expect(matches[0]!.missing_optional).toContain("Petersilie");
    expect(matches[0]!.missing_optional).toContain("Chiliflocken");
  });

  it("handles empty pantry", () => {
    const matches = findCookableRecipes([], [carbonara, aglioOlio], { min_match_percent: 0.5 });
    // Kein Match, weil nichts Vorhandenes außer Stapeln
    // Aglio hat 3 required: Spaghetti, Knoblauch, Olivenöl. Olivenöl ist Staple → 1/3 ≈ 33%
    expect(matches).toHaveLength(0);
  });
});

describe("buildShoppingList", () => {
  it("aggregates same ingredient across recipes", () => {
    const pantry: PantryItem[] = [];
    const list = buildShoppingList(pantry, [carbonara, aglioOlio]);
    const spaghetti = list.find((i) => i.ingredient_name === "Spaghetti");
    expect(spaghetti).toBeDefined();
    expect(spaghetti?.amount).toBe(400); // 200 + 200
    expect(spaghetti?.for_recipes).toEqual(["Pasta Carbonara", "Spaghetti Aglio e Olio"]);
  });

  it("excludes staples from shopping list", () => {
    const list = buildShoppingList([], [aglioOlio]);
    expect(list.find((i) => i.ingredient_name === "Salz")).toBeUndefined();
    expect(list.find((i) => i.ingredient_name === "Olivenöl")).toBeUndefined();
  });

  it("excludes already-in-pantry items", () => {
    const pantry: PantryItem[] = [{ ingredient_name: "Spaghetti", amount: 500, unit: "g" }];
    const list = buildShoppingList(pantry, [aglioOlio]);
    expect(list.find((i) => i.ingredient_name === "Spaghetti")).toBeUndefined();
  });
});
