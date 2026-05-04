/**
 * Goal Progress Assessment + Auto-Adjust Logic.
 *
 * REVISED (Mai 2026): Wochenmittel statt tägliche Punkte.
 *
 * Tägliche Gewichtsmessung schwankt stark wegen:
 * - Salz / Glykogen / Wasser (±1-2 kg in 24h möglich)
 * - Stress (Cortisol → Wassereinlagerung)
 * - Verdauung / Stuhlgang
 * - Frauenzyklus (für Frau)
 *
 * Lösung: 7-Tage-Trim-Mean als primärer Trend-Indikator.
 *
 * Algorithmus:
 *   1. Aggregiere zu wöchentlichen Mittelwerten (Trim-Mean: höchsten + niedrigsten Wert
 *      aus jeder Woche entfernen, dann Mittel)
 *   2. Brauche ≥ 3 Wochen mit ausreichend Daten (≥ 4 Messungen pro Woche)
 *   3. Linear-Regression auf wöchentliche Mittelwerte → kg/Woche
 *   4. Vergleiche mit erwarteter Rate aus Goal
 *   5. Bewertung erst alle 7 Tage (Cooldown)
 *
 * Faustregeln (aus Lyle McDonald / Helms / RP):
 *   - 1 kg Körperfett = ~7700 kcal
 *   - Cut: -500 kcal → -0.5 kg/Woche
 *   - Bulk: +250-500 kcal → +0.25-0.5 kg/Woche
 *
 * Edge-Cases:
 *   - User reist und misst nicht: Lücke-Detection, Pause-Empfehlung
 *   - Frau-Zyklus: erkenne 4-Wochen-Periodizität, normalisiere
 *   - Plötzlicher Sprung (>2kg/Woche): Outlier-Flag, vermutlich Ernährungs-Cheat
 *     oder Krankheit → keine Empfehlung, manuelle Review
 */

export interface GoalForAssessment {
  id: string;
  user_id: string;
  phase_type: "cut" | "bulk" | "maintenance" | "recomp";
  start_weight_kg: number;
  target_weight_kg: number | null;
  weekly_rate_kg: number | null;
  daily_kcal_target: number | null;
  started_at: Date;
  adjustment_mode: "manual" | "semi_auto" | "auto";
  adjustment_log: AdjustmentLogEntry[];
}

export interface AdjustmentLogEntry {
  at: string;
  reason: string;
  previous_kcal: number;
  new_kcal: number;
  weekly_trend_kg: number;
}

export interface BodyMeasurement {
  date: Date;
  weight_kg: number;
}

export interface WeeklyAverage {
  /** ISO-Wochen-Anker (Montag der Woche) */
  week_start: Date;
  trimmed_mean_kg: number;
  raw_mean_kg: number;
  measurement_count: number;
  /** Wieviele Outlier wurden entfernt */
  trimmed_count: number;
  /** Spannweite — hilfreich für Confidence */
  range_kg: number;
}

export interface GoalAssessment {
  status: "on_track" | "too_fast" | "too_slow" | "stalled" | "insufficient_data" | "anomaly";
  observed_weekly_rate_kg: number | null;
  expected_weekly_rate_kg: number | null;
  weeks_of_data: number;
  weekly_averages: WeeklyAverage[];
  recommended_kcal_change: number | null;
  rationale: string;
  confidence: number;
  /** Wenn ja: das ist eine Anomalie, lieber AI-LLM nachbewerten lassen statt blind anwenden */
  needs_ai_interpretation: boolean;
}

const KCAL_PER_KG_FAT = 7700;
const MIN_WEEKS_FOR_TREND = 3;
const PREFERRED_WEEKS_FOR_CONFIDENCE = 4;
const MIN_MEASUREMENTS_PER_WEEK = 3;
const MIN_DAYS_BETWEEN_ADJUSTMENTS = 7;
const MAX_KCAL_ADJUSTMENT = 300;

export function assessGoalProgress(
  goal: GoalForAssessment,
  measurements: BodyMeasurement[],
): GoalAssessment {
  const sorted = [...measurements].sort((a, b) => a.date.getTime() - b.date.getTime());

  // 1. Aggregiere zu wöchentlichen Mittelwerten
  const weeklyAverages = computeWeeklyAverages(sorted);
  const usableWeeks = weeklyAverages.filter(
    (w) => w.measurement_count >= MIN_MEASUREMENTS_PER_WEEK,
  );

  if (usableWeeks.length < MIN_WEEKS_FOR_TREND) {
    return {
      status: "insufficient_data",
      observed_weekly_rate_kg: null,
      expected_weekly_rate_kg: goal.weekly_rate_kg,
      weeks_of_data: usableWeeks.length,
      weekly_averages: weeklyAverages,
      recommended_kcal_change: null,
      rationale: `Brauche ${MIN_WEEKS_FOR_TREND} Wochen mit je ≥${MIN_MEASUREMENTS_PER_WEEK} Messungen — aktuell ${usableWeeks.length} brauchbare Wochen.`,
      confidence: 0,
      needs_ai_interpretation: false,
    };
  }

  // 2. Cooldown: nicht öfter als 1× pro Woche anpassen
  if (goal.adjustment_log.length > 0) {
    const lastAdjustment = goal.adjustment_log[goal.adjustment_log.length - 1];
    if (!lastAdjustment) {
      throw new Error("Inconsistent adjustment_log");
    }
    const daysSince = daysBetween(new Date(lastAdjustment.at), new Date());
    if (daysSince < MIN_DAYS_BETWEEN_ADJUSTMENTS) {
      return {
        status: "on_track",
        observed_weekly_rate_kg: null,
        expected_weekly_rate_kg: goal.weekly_rate_kg,
        weeks_of_data: usableWeeks.length,
        weekly_averages: weeklyAverages,
        recommended_kcal_change: null,
        rationale: `Letzte Anpassung vor ${Math.round(daysSince)} Tagen — Cooldown ${MIN_DAYS_BETWEEN_ADJUSTMENTS} Tage, Adjustment braucht Zeit zum Wirken.`,
        confidence: 0.7,
        needs_ai_interpretation: false,
      };
    }
  }

  // 3. Trend via Linear Regression auf wöchentlichen Mittelwerten
  const observedRate = computeWeeklyTrendFromAverages(usableWeeks);
  const expected = goal.weekly_rate_kg ?? expectedRateForPhase(goal.phase_type);

  // 4. Anomalie-Check: massive Sprünge zwischen Wochen → AI nachbewerten
  const weekToWeekRange = maxWeekDelta(usableWeeks);
  const isAnomaly = Math.abs(weekToWeekRange) > 2.0;
  if (isAnomaly) {
    return {
      status: "anomaly",
      observed_weekly_rate_kg: observedRate,
      expected_weekly_rate_kg: expected,
      weeks_of_data: usableWeeks.length,
      weekly_averages: weeklyAverages,
      recommended_kcal_change: null,
      rationale: `Wochen-zu-Wochen-Sprung von ${weekToWeekRange.toFixed(1)} kg erkannt — vermutlich Reise / Krankheit / Ernährungs-Cheat. Coach soll Kontext berücksichtigen.`,
      confidence: 0.4,
      needs_ai_interpretation: true,
    };
  }

  // 5. Confidence wächst mit mehr Wochen
  const confidence = Math.min(1, usableWeeks.length / PREFERRED_WEEKS_FOR_CONFIDENCE);

  // 6. Bewertung
  const deviation = observedRate - expected;
  const tolerancePerWeek = 0.15;

  let status: GoalAssessment["status"];
  let recommendedKcalChange: number | null = null;
  let rationale = "";

  switch (goal.phase_type) {
    case "cut": {
      if (Math.abs(deviation) <= tolerancePerWeek) {
        status = "on_track";
        rationale = `Cut on-track: ${observedRate.toFixed(2)} kg/Woche vs. Ziel ${expected.toFixed(2)} (Wochenmittel über ${usableWeeks.length} Wochen).`;
      } else if (deviation > tolerancePerWeek) {
        status = "too_slow";
        recommendedKcalChange = -Math.round(
          Math.min(MAX_KCAL_ADJUSTMENT, (deviation * KCAL_PER_KG_FAT) / 7),
        );
        rationale = `Cut zu langsam: ${observedRate.toFixed(2)} vs. erwartete ${expected.toFixed(2)} kg/Woche über ${usableWeeks.length} Wochen. Vorschlag: ${recommendedKcalChange} kcal/Tag.`;
      } else {
        status = "too_fast";
        recommendedKcalChange = Math.round(
          Math.min(MAX_KCAL_ADJUSTMENT, (Math.abs(deviation) * KCAL_PER_KG_FAT) / 7),
        );
        rationale = `Cut zu aggressiv: ${observedRate.toFixed(2)} vs. ${expected.toFixed(2)} kg/Woche. Risiko Muskelverlust + Hormon-Disruption, +${recommendedKcalChange} kcal/Tag empfohlen.`;
      }
      break;
    }
    case "bulk": {
      if (Math.abs(deviation) <= tolerancePerWeek) {
        status = "on_track";
        rationale = `Bulk on-track bei ${observedRate.toFixed(2)} kg/Woche.`;
      } else if (deviation < -tolerancePerWeek) {
        status = "too_slow";
        recommendedKcalChange = Math.round(
          Math.min(MAX_KCAL_ADJUSTMENT, (Math.abs(deviation) * KCAL_PER_KG_FAT) / 7),
        );
        rationale = `Bulk zu langsam: ${observedRate.toFixed(2)} vs. ${expected.toFixed(2)} kg/Woche. +${recommendedKcalChange} kcal/Tag.`;
      } else {
        status = "too_fast";
        recommendedKcalChange = -Math.round(
          Math.min(MAX_KCAL_ADJUSTMENT, (deviation * KCAL_PER_KG_FAT) / 7),
        );
        rationale = `Bulk zu schnell: ${observedRate.toFixed(2)} vs. ${expected.toFixed(2)} kg/Woche → mehr Fett als Muskel. ${recommendedKcalChange} kcal/Tag.`;
      }
      break;
    }
    case "maintenance":
    case "recomp": {
      const tolerance = 0.2;
      if (Math.abs(observedRate) <= tolerance) {
        status = "on_track";
        rationale = `Gewicht stabil bei ${observedRate.toFixed(2)} kg/Woche.`;
      } else {
        status = observedRate > 0 ? "too_fast" : "too_slow";
        recommendedKcalChange =
          Math.round(Math.min(150, (Math.abs(observedRate) * KCAL_PER_KG_FAT) / 7)) *
          (observedRate > 0 ? -1 : 1);
        rationale = `Drift in Maintenance: ${observedRate.toFixed(2)} kg/Woche. Korrektur ${recommendedKcalChange} kcal/Tag.`;
      }
      break;
    }
  }

  return {
    status,
    observed_weekly_rate_kg: observedRate,
    expected_weekly_rate_kg: expected,
    weeks_of_data: usableWeeks.length,
    weekly_averages: weeklyAverages,
    recommended_kcal_change: recommendedKcalChange,
    rationale,
    confidence,
    needs_ai_interpretation: false,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Aggregiert tägliche Messungen zu Wochenmitteln mit Trim-Mean.
 * Trim-Mean: bei ≥4 Messungen pro Woche → höchsten + niedrigsten entfernen.
 */
export function computeWeeklyAverages(measurements: BodyMeasurement[]): WeeklyAverage[] {
  const byWeek = new Map<string, BodyMeasurement[]>();

  for (const m of measurements) {
    const monday = mondayOfWeek(m.date);
    const key = monday.toISOString().slice(0, 10);
    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key)!.push(m);
  }

  return Array.from(byWeek.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, weekMeasurements]) => {
      const weights = weekMeasurements.map((m) => m.weight_kg);
      const sortedWeights = [...weights].sort((a, b) => a - b);
      const max = sortedWeights[sortedWeights.length - 1] ?? 0;
      const min = sortedWeights[0] ?? 0;
      const range = max - min;

      let trimmed = sortedWeights;
      let trimmedCount = 0;

      // Trim-Mean: bei genug Datenpunkten Outlier entfernen
      if (sortedWeights.length >= 5) {
        // Trim 1 von jedem Ende (10% trim für 5+ Punkte)
        trimmed = sortedWeights.slice(1, -1);
        trimmedCount = 2;
      } else if (sortedWeights.length === 4) {
        // Bei genau 4: trim nur 1 (nimm die 3 plausibelsten)
        // Wir entscheiden welche: wenn Ausreißer am unteren oder oberen Ende?
        // Heuristik: entferne den Wert der am weitesten vom Median entfernt ist
        const median = sortedWeights[2] ?? 0;
        const deltas = sortedWeights.map((w) => Math.abs(w - median));
        const maxIdx = deltas.indexOf(Math.max(...deltas));
        trimmed = sortedWeights.filter((_, i) => i !== maxIdx);
        trimmedCount = 1;
      }

      const trimmedMean = trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
      const rawMean = weights.reduce((s, v) => s + v, 0) / weights.length;

      return {
        week_start: new Date(key),
        trimmed_mean_kg: round2(trimmedMean),
        raw_mean_kg: round2(rawMean),
        measurement_count: weights.length,
        trimmed_count: trimmedCount,
        range_kg: round2(range),
      };
    });
}

/**
 * Linear-Regression auf wöchentlichen Mittelwerten. Slope = kg / Woche.
 */
function computeWeeklyTrendFromAverages(weeks: WeeklyAverage[]): number {
  const n = weeks.length;
  if (n === 0) return 0;
  const first = weeks[0];
  if (!first) return 0;
  const t0 = first.week_start.getTime();
  const xs = weeks.map((w) => (w.week_start.getTime() - t0) / (1000 * 60 * 60 * 24 * 7));
  const ys = weeks.map((w) => w.trimmed_mean_kg);

  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const xi = xs[i] ?? 0;
    const yi = ys[i] ?? 0;
    num += (xi - meanX) * (yi - meanY);
    den += (xi - meanX) ** 2;
  }
  if (den === 0) return 0;
  return num / den; // kg/Woche
}

function maxWeekDelta(weeks: WeeklyAverage[]): number {
  let max = 0;
  for (let i = 1; i < weeks.length; i++) {
    const curr = weeks[i];
    const prev = weeks[i - 1];
    if (!curr || !prev) continue;
    const delta = curr.trimmed_mean_kg - prev.trimmed_mean_kg;
    if (Math.abs(delta) > Math.abs(max)) max = delta;
  }
  return max;
}

function expectedRateForPhase(phase: "cut" | "bulk" | "maintenance" | "recomp"): number {
  switch (phase) {
    case "cut":
      return -0.5;
    case "bulk":
      return 0.25;
    case "maintenance":
    case "recomp":
      return 0;
  }
}

function mondayOfWeek(d: Date): Date {
  const day = d.getDay() || 7; // Sunday = 0 → 7
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day - 1));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
