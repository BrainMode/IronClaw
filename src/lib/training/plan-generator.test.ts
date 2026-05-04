import { describe, expect, it } from "vitest";
import {
  type EquipmentType,
  generateFullbodyX2,
  generateHomeQuick30,
  generatePlanForLocation,
} from "./plan-generator";

const FULL_GYM: EquipmentType[] = [
  "barbell",
  "dumbbell",
  "cable",
  "machine",
  "bench",
  "squat_rack",
  "leg_press",
  "pull_up_bar",
];

describe("generateFullbodyX2", () => {
  it("creates 2 days of 5-6 exercises with full gym equipment", () => {
    const plan = generateFullbodyX2(FULL_GYM);
    expect(plan.days).toHaveLength(2);
    expect(plan.days[0]!.name).toBe("Ganzkörper A");
    expect(plan.days[1]!.name).toBe("Ganzkörper B");
    expect(plan.days[0]!.exercises.length).toBeGreaterThanOrEqual(5);
    expect(plan.days[1]!.exercises.length).toBeGreaterThanOrEqual(5);
  });

  it("sets warmup sets correctly (first exercise gets more)", () => {
    const plan = generateFullbodyX2(FULL_GYM);
    const dayA = plan.days[0]!;
    expect(dayA.exercises[0]!.warmupSets).toBe(2);
    expect(dayA.exercises[1]!.warmupSets).toBe(1);
  });

  it("respects user preferences for reps/rir", () => {
    const plan = generateFullbodyX2(FULL_GYM, {
      workingSetsPerExercise: 3,
      repRangeMin: 8,
      preferredRirMin: 1,
    });
    const ex = plan.days[0]!.exercises[0]!;
    expect(ex.targetSets).toBe(3);
    expect(ex.targetReps).toBe(8);
    expect(ex.targetRir).toBe(1);
  });

  it("falls back to dumbbell-bench when no barbell", () => {
    const plan = generateFullbodyX2(["dumbbell", "bench", "cable", "machine"]);
    const dayA = plan.days[0]!;
    const chestExercise = dayA.exercises.find((e) =>
      ["barbell-bench-press", "dumbbell-bench-press", "cable-crossover"].includes(e.exerciseSlug),
    );
    expect(chestExercise?.exerciseSlug).toBe("dumbbell-bench-press");
  });

  it("falls back to leg-press when no squat-rack", () => {
    const plan = generateFullbodyX2(["dumbbell", "bench", "cable", "leg_press"]);
    const dayA = plan.days[0]!;
    expect(dayA.exercises[0]!.exerciseSlug).toBe("leg-press");
  });

  it("skips exercise slots when no equipment matches", () => {
    // Bodyweight + cable only — no leg movement possible
    const plan = generateFullbodyX2(["bodyweight", "cable", "pull_up_bar"]);
    const dayA = plan.days[0]!;
    // Squat slot should be empty (no barbell, no leg_press, no machine)
    const hasSquatExercise = dayA.exercises.some((e) =>
      ["back-squat", "leg-press", "hack-squat"].includes(e.exerciseSlug),
    );
    expect(hasSquatExercise).toBe(false);
    // But should still have at least pulldown + tricep-pushdown
    expect(dayA.exercises.some((e) => e.exerciseSlug === "lat-pulldown")).toBe(true);
  });

  it("dedupes within a day if same slug picked twice", () => {
    const plan = generateFullbodyX2(["dumbbell", "bench"]);
    const dayB = plan.days[1]!;
    const slugs = dayB.exercises.map((e) => e.exerciseSlug);
    const unique = new Set(slugs);
    expect(slugs.length).toBe(unique.size);
  });
});

describe("generateHomeQuick30", () => {
  it("creates 2 days with KB+Band+Bodyweight", () => {
    const plan = generateHomeQuick30(["kettlebell", "resistance_band", "bodyweight"]);
    expect(plan.name).toBe("Home Quick 30");
    expect(plan.days).toHaveLength(2);
    expect(plan.days[0]!.name).toBe("Home A — Push");
    expect(plan.days[1]!.name).toBe("Home B — Pull");
    expect(plan.days[0]!.exercises.length).toBeGreaterThanOrEqual(4);
  });

  it("prefers KB over Band over Bodyweight", () => {
    const plan = generateHomeQuick30(["kettlebell", "resistance_band", "bodyweight"]);
    const press = plan.days[0]!.exercises.find((e) =>
      ["kb-floor-press", "band-press", "push-up"].includes(e.exerciseSlug),
    );
    expect(press?.exerciseSlug).toBe("kb-floor-press");
  });

  it("falls back to bands when no KB", () => {
    const plan = generateHomeQuick30(["resistance_band", "bodyweight"]);
    const press = plan.days[0]!.exercises.find((e) =>
      ["kb-floor-press", "band-press", "push-up"].includes(e.exerciseSlug),
    );
    expect(press?.exerciseSlug).toBe("band-press");
  });

  it("falls back to bodyweight when no KB and no bands", () => {
    const plan = generateHomeQuick30(["bodyweight"]);
    const press = plan.days[0]!.exercises.find((e) =>
      ["kb-floor-press", "band-press", "push-up"].includes(e.exerciseSlug),
    );
    expect(press?.exerciseSlug).toBe("push-up");
  });

  it("uses minimal warmup sets for home (1 instead of 2)", () => {
    const plan = generateHomeQuick30(["kettlebell", "resistance_band"]);
    expect(plan.days[0]!.exercises[0]!.warmupSets).toBe(1);
  });
});

describe("generatePlanForLocation", () => {
  it("returns Iron Mike plan for 'gym'", () => {
    const plan = generatePlanForLocation("gym", [
      "barbell",
      "bench",
      "squat_rack",
      "cable",
      "dumbbell",
    ]);
    expect(plan.name).toBe("GK 2× — Iron Mike");
  });

  it("returns Home Quick plan for 'home'", () => {
    const plan = generatePlanForLocation("home", ["kettlebell", "resistance_band"]);
    expect(plan.name).toBe("Home Quick 30");
  });

  it("returns Home Quick plan for 'travel'", () => {
    const plan = generatePlanForLocation("travel", ["resistance_band"]);
    expect(plan.name).toBe("Home Quick 30");
  });

  it("returns Iron Mike plan for unknown custom locations", () => {
    const plan = generatePlanForLocation("custom-1", ["barbell", "squat_rack"]);
    expect(plan.name).toBe("GK 2× — Iron Mike");
  });
});
