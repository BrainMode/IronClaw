import { describe, expect, it } from "vitest";
import {
  type BodyMeasurement,
  type GoalForAssessment,
  assessGoalProgress,
  computeWeeklyAverages,
} from "./assessment";

function buildCutGoal(overrides: Partial<GoalForAssessment> = {}): GoalForAssessment {
  return {
    id: "g1",
    user_id: "u1",
    phase_type: "cut",
    start_weight_kg: 90,
    target_weight_kg: 85,
    weekly_rate_kg: -0.5,
    daily_kcal_target: 2400,
    started_at: new Date("2026-04-01"),
    adjustment_mode: "semi_auto",
    adjustment_log: [],
    ...overrides,
  };
}

/**
 * Helper: erzeugt N Wochen tägliche Messungen mit linearem Trend + tägliches Salz/Wasser-Noise.
 * targetRate = kg/Woche. Mit täglichem Rauschen ±0.6kg um den Trend.
 */
function makeNoisyMeasurements(
  startWeight: number,
  weeks: number,
  weeklyRate: number,
  startDate: Date = new Date("2026-04-01"),
  measurementsPerWeek = 5,
): BodyMeasurement[] {
  const result: BodyMeasurement[] = [];
  const dailyRate = weeklyRate / 7;
  // Pseudo-RNG (deterministisch für Tests)
  let seed = 42;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let week = 0; week < weeks; week++) {
    // Wähle measurementsPerWeek Tage aus der Woche
    for (let m = 0; m < measurementsPerWeek; m++) {
      const dayOffset = week * 7 + Math.floor(rand() * 7);
      const trueWeight = startWeight + dayOffset * dailyRate;
      // Salz/Wasser-Noise: ±0.6 kg
      const noise = (rand() - 0.5) * 1.2;
      result.push({
        date: new Date(startDate.getTime() + dayOffset * 24 * 60 * 60 * 1000),
        weight_kg: Math.round((trueWeight + noise) * 10) / 10,
      });
    }
  }
  return result;
}

describe("computeWeeklyAverages", () => {
  it("trimmed mean removes outliers when ≥5 measurements", () => {
    // 5 Messungen, eine deutlich abweichend
    const _start = new Date("2026-04-06"); // Montag
    const measurements: BodyMeasurement[] = [
      { date: new Date("2026-04-06"), weight_kg: 90.0 },
      { date: new Date("2026-04-07"), weight_kg: 89.8 },
      { date: new Date("2026-04-08"), weight_kg: 90.2 },
      { date: new Date("2026-04-09"), weight_kg: 89.9 },
      { date: new Date("2026-04-10"), weight_kg: 92.5 }, // Outlier (Pizza-Abend)
    ];
    const avgs = computeWeeklyAverages(measurements);
    expect(avgs).toHaveLength(1);
    // Trim 1 von jedem Ende: [89.8, 92.5] entfernt → [89.9, 90.0, 90.2] → 90.03
    expect(avgs[0]!.trimmed_mean_kg).toBeCloseTo(90.03, 1);
    // Raw mean inkl Outlier: ~90.48
    expect(avgs[0]!.raw_mean_kg).toBeCloseTo(90.48, 1);
    expect(avgs[0]!.trimmed_count).toBe(2);
  });

  it("groups measurements by ISO week (Monday)", () => {
    const measurements: BodyMeasurement[] = [
      { date: new Date("2026-04-06T08:00"), weight_kg: 90 }, // Mo Woche 15
      { date: new Date("2026-04-09T08:00"), weight_kg: 89.8 }, // Do Woche 15
      { date: new Date("2026-04-13T08:00"), weight_kg: 89.5 }, // Mo Woche 16
    ];
    const avgs = computeWeeklyAverages(measurements);
    expect(avgs).toHaveLength(2);
  });
});

describe("assessGoalProgress (weekly aggregation)", () => {
  it("requires ≥3 weeks of usable data", () => {
    // Nur 2 Wochen Daten
    const measurements = makeNoisyMeasurements(90, 2, -0.5);
    const result = assessGoalProgress(buildCutGoal(), measurements);
    expect(result.status).toBe("insufficient_data");
    expect(result.weeks_of_data).toBeLessThan(3);
    expect(result.recommended_kcal_change).toBeNull();
  });

  it("on-track when weekly trend matches expected", () => {
    const measurements = makeNoisyMeasurements(90, 4, -0.5);
    const result = assessGoalProgress(buildCutGoal(), measurements);
    expect(result.status).toBe("on_track");
    // Pseudo-RNG-Noise kann Trend leicht verschieben — innerhalb Toleranz reicht
    expect(result.observed_weekly_rate_kg).toBeGreaterThan(-0.7);
    expect(result.observed_weekly_rate_kg).toBeLessThan(-0.3);
    expect(result.recommended_kcal_change).toBeNull();
  });

  it("recognizes too-slow cut despite daily noise", () => {
    // Cut praktisch auf null trotz Rauschen
    const measurements = makeNoisyMeasurements(90, 4, -0.05);
    const result = assessGoalProgress(buildCutGoal(), measurements);
    expect(result.status).toBe("too_slow");
    expect(result.recommended_kcal_change).toBeLessThan(0);
    expect(result.rationale).toContain("Cut zu langsam");
    expect(result.rationale).toContain("Wochen");
  });

  it("warns when cut too aggressive", () => {
    const measurements = makeNoisyMeasurements(90, 4, -1.5);
    const result = assessGoalProgress(buildCutGoal(), measurements);
    expect(result.status).toBe("too_fast");
    expect(result.recommended_kcal_change).toBeGreaterThan(0);
  });

  it("flags anomaly on >2kg week-to-week jump", () => {
    // 3 Wochen normale Daten + 1 Woche mit massiven Sprung (Reise/Krankheit)
    const week1 = makeNoisyMeasurements(90, 1, -0.5, new Date("2026-04-06"));
    const week2 = makeNoisyMeasurements(89.5, 1, -0.5, new Date("2026-04-13"));
    const week3 = makeNoisyMeasurements(89, 1, -0.5, new Date("2026-04-20"));
    const week4 = makeNoisyMeasurements(92, 1, 0, new Date("2026-04-27")); // Sprung!
    const measurements = [...week1, ...week2, ...week3, ...week4];
    const result = assessGoalProgress(buildCutGoal(), measurements);
    expect(result.status).toBe("anomaly");
    expect(result.needs_ai_interpretation).toBe(true);
    expect(result.recommended_kcal_change).toBeNull();
    expect(result.rationale).toContain("Sprung");
  });

  it("respects cooldown after recent adjustment", () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 3);
    const goal = buildCutGoal({
      adjustment_log: [
        {
          at: recentDate.toISOString(),
          reason: "test",
          previous_kcal: 2500,
          new_kcal: 2300,
          weekly_trend_kg: -0.1,
        },
      ],
    });
    const measurements = makeNoisyMeasurements(90, 4, -0.05); // wäre eigentlich too_slow
    const result = assessGoalProgress(goal, measurements);
    expect(result.status).toBe("on_track");
    expect(result.rationale).toContain("Cooldown");
  });

  it("ignores weeks with too few measurements", () => {
    const _start = new Date("2026-04-06");
    // 4 volle Wochen + 1 Woche mit nur 1 Messung
    const fullWeeks = makeNoisyMeasurements(90, 4, -0.5);
    const sparseWeek: BodyMeasurement[] = [{ date: new Date("2026-05-04"), weight_kg: 88 }];
    const result = assessGoalProgress(buildCutGoal(), [...fullWeeks, ...sparseWeek]);
    // Sparse Woche hat <3 Messungen → wird ignoriert
    expect(result.weeks_of_data).toBe(4);
    expect(result.status).toBe("on_track");
  });

  it("confidence increases with more weeks", () => {
    const fewWeeks = makeNoisyMeasurements(90, 3, -0.5);
    const manyWeeks = makeNoisyMeasurements(90, 6, -0.5);
    const fewResult = assessGoalProgress(buildCutGoal(), fewWeeks);
    const manyResult = assessGoalProgress(buildCutGoal(), manyWeeks);
    expect(manyResult.confidence).toBeGreaterThanOrEqual(fewResult.confidence);
  });

  it("for bulk: too slow → recommend more kcal", () => {
    const goal: GoalForAssessment = {
      ...buildCutGoal(),
      phase_type: "bulk",
      weekly_rate_kg: 0.25,
    };
    const measurements = makeNoisyMeasurements(85, 4, 0.02);
    const result = assessGoalProgress(goal, measurements);
    expect(result.status).toBe("too_slow");
    expect(result.recommended_kcal_change).toBeGreaterThan(0);
  });
});
