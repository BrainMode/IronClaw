import { describe, expect, it } from "vitest";
import {
  DEFAULT_TARGET,
  INCREMENTS,
  estimated1RMFromSet,
  pickBestSet,
  roundToIncrement,
  suggestNextWeight,
  targetWeightFrom1RM,
} from "./progression";

describe("estimated1RMFromSet", () => {
  it("computes Brzycki correctly for typical working set", () => {
    // 100kg × 6 reps RIR=0 → e1RM ≈ 116.1kg
    const e1RM = estimated1RMFromSet({ weightKg: 100, reps: 6, rir: 0 });
    expect(e1RM).toBeCloseTo(116.13, 1);
  });

  it("accounts for RIR > 0 by extrapolating to failure", () => {
    // 100kg × 6 reps RIR=2 → effective failure at 8 reps → e1RM higher
    const e1RM = estimated1RMFromSet({ weightKg: 100, reps: 6, rir: 2 });
    expect(e1RM).toBeCloseTo(124.14, 1);
  });

  it("returns weight if 1 rep at failure", () => {
    // RIR=0 means 1RM exactly equals weight when reps=1
    const e1RM = estimated1RMFromSet({ weightKg: 100, reps: 1, rir: 0 });
    expect(e1RM).toBeCloseTo(100, 1);
  });

  it("throws on invalid input", () => {
    expect(() => estimated1RMFromSet({ weightKg: 100, reps: 0, rir: 0 })).toThrow();
  });
});

describe("targetWeightFrom1RM", () => {
  it("computes weight for target reps × rir", () => {
    // e1RM 120 → for 6 reps RIR=0: target weight ≈ 103.3
    const w = targetWeightFrom1RM(120, { reps: 6, rir: 0 });
    expect(w).toBeCloseTo(103.33, 1);
  });

  it("is inverse of estimated1RMFromSet", () => {
    const set = { weightKg: 87.5, reps: 5, rir: 0 };
    const e1RM = estimated1RMFromSet(set);
    const back = targetWeightFrom1RM(e1RM, { reps: 5, rir: 0 });
    expect(back).toBeCloseTo(set.weightKg, 1);
  });
});

describe("roundToIncrement", () => {
  it("rounds down by default", () => {
    expect(roundToIncrement(102.7, 0.5)).toBe(102.5);
    expect(roundToIncrement(102.49, 0.5)).toBe(102.0);
  });

  it("can round to nearest", () => {
    expect(roundToIncrement(102.7, 0.5, "nearest")).toBe(102.5);
    expect(roundToIncrement(102.8, 0.5, "nearest")).toBe(103.0);
  });

  it("handles 0.25 increment for cables/dumbbells", () => {
    expect(roundToIncrement(15.7, 0.25)).toBe(15.5);
    expect(roundToIncrement(15.76, 0.25)).toBe(15.75);
  });
});

describe("suggestNextWeight — Iron Mike Scenarios", () => {
  const target = DEFAULT_TARGET; // 6 reps, RIR=0
  const barbell = INCREMENTS.barbell!; // 0.5kg steps

  it("scenario: user nailed 6×0RIR exactly @ 100kg → minimal increase to 100.5kg", () => {
    const result = suggestNextWeight({ weightKg: 100, reps: 6, rir: 0 }, target, barbell);
    expect(result.direction).toBe("increase");
    expect(result.suggestedWeightKg).toBe(100.5);
  });

  it("scenario: user did 6 reps with RIR=2 @ 90kg → significant increase", () => {
    // user undertrained — algorithm should push for ~94.5kg
    const result = suggestNextWeight({ weightKg: 90, reps: 6, rir: 2 }, target, barbell);
    expect(result.direction).toBe("increase");
    expect(result.suggestedWeightKg).toBeGreaterThan(90);
    expect(result.suggestedWeightKg).toBeLessThanOrEqual(95);
    // Reasoning should mention RIR/Reserve
    expect(result.reasoning.toLowerCase()).toMatch(/reserve|rir/);
  });

  it("scenario: user got 7 reps RIR=0 @ 80kg → moderate increase to ~82.5kg", () => {
    // Mike: "wenn du die siebte hinkriegst, dann bist du stärker geworden, leg drauf"
    // e1RM ≈ 96, target weight for 6×0 ≈ 82.7, rounded down to 82.5
    const result = suggestNextWeight({ weightKg: 80, reps: 7, rir: 0 }, target, barbell);
    expect(result.direction).toBe("increase");
    expect(result.suggestedWeightKg).toBeGreaterThan(80);
    expect(result.suggestedWeightKg).toBeLessThanOrEqual(85);
  });

  it("scenario: only 5 reps achieved @ 100kg → hold weight", () => {
    // 5 reps is at the edge of Mike's 5-7 range, RIR=0 means failure → hold
    const result = suggestNextWeight({ weightKg: 100, reps: 5, rir: 0 }, target, barbell);
    expect(result.direction).toBe("hold");
    expect(result.suggestedWeightKg).toBe(100);
  });

  it("scenario: only 4 reps achieved @ 100kg → decrease", () => {
    const result = suggestNextWeight({ weightKg: 100, reps: 4, rir: 0 }, target, barbell);
    expect(result.direction).toBe("decrease");
    expect(result.suggestedWeightKg).toBeLessThan(100);
  });

  it("respects max increase cap per session", () => {
    // User claims very high RIR — the algorithm shouldn't jump 20kg
    const result = suggestNextWeight({ weightKg: 100, reps: 6, rir: 5 }, target, barbell);
    expect(result.suggestedWeightKg).toBeLessThanOrEqual(100 + barbell.maxIncreasePerSessionKg);
  });

  it("uses 0.25kg increments for cable", () => {
    const cable = INCREMENTS.cable!;
    const result = suggestNextWeight({ weightKg: 22.5, reps: 6, rir: 0 }, target, cable);
    // Smallest increase is 1.25kg for cables
    expect(result.suggestedWeightKg % 1.25).toBeCloseTo(0, 5);
  });

  it("returns suggested weight rounded to 0.5kg increment for barbell", () => {
    const result = suggestNextWeight({ weightKg: 87.5, reps: 6, rir: 1 }, target, barbell);
    // multiple of 0.5
    expect((result.suggestedWeightKg * 2) % 1).toBe(0);
  });
});

describe("pickBestSet", () => {
  it("picks set with highest e1RM", () => {
    const sets = [
      { weightKg: 80, reps: 6, rir: 0 },
      { weightKg: 90, reps: 5, rir: 0 },
      { weightKg: 75, reps: 8, rir: 1 },
    ];
    const best = pickBestSet(sets);
    expect(best.weightKg).toBe(90);
    // 90×5×0RIR has e1RM ~101.25, 80×6×0 has ~92.9, 75×8×1 has ~96.4
  });

  it("throws on empty array", () => {
    expect(() => pickBestSet([])).toThrow();
  });
});
