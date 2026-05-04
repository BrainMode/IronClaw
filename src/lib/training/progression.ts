/**
 * WDC Fitness — RIR-based Weight Progression
 *
 * Implementiert Iron Mike's Trainings-Methodik:
 * - Ziel: 5-7 Reps mit RIR=0 (Muskelversagen am letzten Rep)
 * - Standard-Zielwert: 6 Reps, RIR=0
 * - Wenn User mehr Reps schafft (oder RIR > 0): Gewicht hoch
 * - Wenn User Reps verfehlt: Gewicht halten oder runter
 *
 * Hardware-Constraint: 0.25kg Mini-Scheiben verfügbar
 * → Auf der STANGE bedeutet das 0.5kg-Schritte (2x 0.25kg, je eine pro Seite)
 * → Bei Kurzhantel/Kabel können auch 0.25kg-Schritte sinnvoll sein
 *
 * Algorithmus: Estimated 1RM via Brzycki-Formel, korrigiert für RIR.
 *   1RM = weight × (36 / (37 - reps_at_failure))
 *   reps_at_failure = reps + RIR
 *
 * Dann zurückgerechnet: bei welchem Gewicht treffe ich target_reps mit target_rir?
 *   target_weight = e1RM × (37 - (target_reps + target_rir)) / 36
 */

// =============================================================================
// TYPES
// =============================================================================

export interface CompletedSet {
  weightKg: number;
  reps: number;
  rir: number; // Reps in Reserve, 0 = bis Muskelversagen
}

export interface RepTarget {
  reps: number;
  rir: number;
}

export interface ProgressionSuggestion {
  suggestedWeightKg: number;
  reasoning: string;
  /** "increase" | "hold" | "decrease" — semantische Klassifikation */
  direction: "increase" | "hold" | "decrease";
  /** Estimated 1RM aus dem letzten Set, für Tracking */
  estimated1RM: number;
}

export interface IncrementOptions {
  /** Bei Langhantel: minimaler Schritt = 0.5kg (= 2× 0.25kg auf je einer Seite) */
  minIncrementKg: number;
  /** Cap für Erhöhung pro Session — unrealistische Sprünge dämpfen */
  maxIncreasePerSessionKg: number;
}

// =============================================================================
// DEFAULTS
// =============================================================================

export const DEFAULT_TARGET: RepTarget = { reps: 6, rir: 0 };

/**
 * Increment-Defaults nach Equipment-Typ.
 * Bei der Stange addieren sich Scheiben auf beide Seiten — 0.25kg Mini-Scheiben
 * ergeben einen STANGEN-Schritt von 0.5kg.
 */
export const INCREMENTS: Record<string, IncrementOptions> = {
  barbell: { minIncrementKg: 0.5, maxIncreasePerSessionKg: 5 },
  dumbbell: { minIncrementKg: 0.5, maxIncreasePerSessionKg: 2.5 },
  cable: { minIncrementKg: 1.25, maxIncreasePerSessionKg: 5 },
  machine: { minIncrementKg: 2.5, maxIncreasePerSessionKg: 10 },
  smith_machine: { minIncrementKg: 0.5, maxIncreasePerSessionKg: 5 },
  bodyweight: { minIncrementKg: 1.25, maxIncreasePerSessionKg: 5 }, // Gewichtsgürtel
};

// =============================================================================
// CORE ALGORITHM
// =============================================================================

/**
 * Estimated 1RM via Brzycki-Formel.
 * @param set abgeschlossener Set mit RIR-Angabe
 * @returns geschätztes 1RM in kg
 */
export function estimated1RMFromSet(set: CompletedSet): number {
  const repsAtFailure = set.reps + set.rir;
  // Brzycki: gilt für reps_at_failure 1-10. Über 10 wird Schätzung ungenauer.
  if (repsAtFailure <= 0) {
    throw new Error("reps + rir must be > 0");
  }
  if (repsAtFailure >= 37) {
    // Formel divergiert, nehme einen sinnvollen Cap
    return set.weightKg * 1.5;
  }
  return set.weightKg * (36 / (37 - repsAtFailure));
}

/**
 * Berechne Gewicht das nötig ist, um `target.reps` Reps mit `target.rir` zu treffen,
 * gegeben e1RM.
 */
export function targetWeightFrom1RM(estimated1RM: number, target: RepTarget): number {
  const targetFailureReps = target.reps + target.rir;
  if (targetFailureReps >= 37) {
    return estimated1RM * 0.5;
  }
  return (estimated1RM * (37 - targetFailureReps)) / 36;
}

/**
 * Runde auf den nächsten Inkrement-Schritt NACH UNTEN
 * (konservativ — lieber etwas weniger als zu viel).
 */
export function roundToIncrement(
  weightKg: number,
  incrementKg: number,
  mode: "down" | "nearest" = "down",
): number {
  if (incrementKg <= 0) return weightKg;
  if (mode === "down") {
    return Math.floor(weightKg / incrementKg) * incrementKg;
  }
  return Math.round(weightKg / incrementKg) * incrementKg;
}

/**
 * Hauptfunktion: nimm das BESTE Set einer Übung aus der letzten Session
 * (höchste Reps × Gewicht-Kombi) und berechne Vorschlag für nächste Session.
 *
 * Strategie:
 * 1. Wenn das beste Set RIR > 0 hatte: User unterforderte sich → erhöhe deutlich
 * 2. Wenn target.reps erreicht mit RIR=0: leichte Erhöhung (1 Schritt)
 * 3. Wenn target.reps NICHT erreicht (failure unter target): halten oder runter
 */
export function suggestNextWeight(
  bestSetLastSession: CompletedSet,
  target: RepTarget,
  increment: IncrementOptions,
): ProgressionSuggestion {
  const e1RM = estimated1RMFromSet(bestSetLastSession);
  const idealWeight = targetWeightFrom1RM(e1RM, target);
  const lastWeight = bestSetLastSession.weightKg;

  let suggested: number;
  let direction: ProgressionSuggestion["direction"];
  let reasoning: string;

  const reps = bestSetLastSession.reps;
  const rir = bestSetLastSession.rir;
  const repsAtFailure = reps + rir;
  const targetFailureReps = target.reps + target.rir;
  const diff = repsAtFailure - targetFailureReps;

  // Mike: produktive Zone ist 5-7 Reps. Off-by-1 ist OK → hold.
  if (diff > 0) {
    // User hätte mehr geschafft → erhöhe
    const rawIncrease = idealWeight - lastWeight;
    const cappedIncrease = Math.min(
      Math.max(rawIncrease, increment.minIncrementKg),
      increment.maxIncreasePerSessionKg,
    );
    suggested = roundToIncrement(lastWeight + cappedIncrease, increment.minIncrementKg, "down");
    // Sicherstellen dass mindestens EIN Schritt höher
    if (suggested <= lastWeight) {
      suggested = lastWeight + increment.minIncrementKg;
    }
    direction = "increase";
    reasoning = `Letztes Mal ${reps} Reps mit ${rir} RIR @ ${lastWeight}kg → noch Reserve. Hochrechnung ergibt ${idealWeight.toFixed(1)}kg, schlage ${suggested}kg vor.`;
  } else if (diff === 0) {
    // Exakt getroffen → kleinster Schritt hoch
    // (Mike: "wenn du die siebte hinkriegst, leg drauf" — bei genauem Treffer minimal progressieren)
    suggested = roundToIncrement(
      lastWeight + increment.minIncrementKg,
      increment.minIncrementKg,
      "down",
    );
    if (suggested <= lastWeight) {
      suggested = lastWeight + increment.minIncrementKg;
    }
    direction = "increase";
    reasoning = `Exakt ${reps} Reps × ${rir} RIR @ ${lastWeight}kg getroffen. Minimaler Schritt drauf: ${suggested}kg.`;
  } else if (diff === -1) {
    // Off-by-1: noch in produktiver Range (5 bei Ziel 6) — Gewicht halten, nochmal angreifen
    suggested = lastWeight;
    direction = "hold";
    reasoning = `${reps} Reps × ${rir} RIR @ ${lastWeight}kg — knapp unter Ziel (${target.reps}×${target.rir}RIR). Gewicht halten und nochmal angreifen.`;
  } else {
    // 2+ Reps unter Ziel → Gewicht war zu schwer
    const rawDecrease = lastWeight - idealWeight;
    const cappedDecrease = Math.max(rawDecrease, increment.minIncrementKg);
    suggested = roundToIncrement(lastWeight - cappedDecrease, increment.minIncrementKg, "down");
    direction = "decrease";
    reasoning = `Nur ${reps} Reps statt ${target.reps} @ ${lastWeight}kg — zu schwer. Zurück auf ${suggested}kg.`;
  }

  return {
    suggestedWeightKg: suggested,
    reasoning,
    direction,
    estimated1RM: Math.round(e1RM * 10) / 10,
  };
}

/**
 * Kein vorheriger Set → Startgewicht-Schätzung.
 * Sehr konservativ: User wärmt sich ohnehin auf und merkt selbst.
 */
export function suggestStartingWeight(exerciseType: keyof typeof INCREMENTS = "barbell"): number {
  const increment = INCREMENTS[exerciseType] ?? INCREMENTS.barbell;
  if (!increment) return 20; // sollte nie passieren, fallback
  return increment.minIncrementKg * 2; // dann selber justieren
}

/**
 * Helper: aus mehreren Sets der letzten Session den "besten" rauspicken.
 * Definition: höchste estimated 1RM.
 */
export function pickBestSet(sets: CompletedSet[]): CompletedSet {
  if (sets.length === 0) {
    throw new Error("No sets to pick from");
  }
  return sets.reduce((best, candidate) => {
    return estimated1RMFromSet(candidate) > estimated1RMFromSet(best) ? candidate : best;
  });
}
