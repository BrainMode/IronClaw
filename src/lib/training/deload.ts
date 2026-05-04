/**
 * Deload-Entscheidungs-Helper.
 *
 * Wird vom AI-Coach via `decide_deload`-Tool aufgerufen, kann aber auch
 * standalone verwendet werden (z.B. UI-Hinweis "Du solltest deloaden").
 *
 * Mike's Logik:
 * - 2 aufeinanderfolgende Sessions die Reps-Ziele verfehlen → Deload-Kandidat
 * - HRV deutlich unter Baseline (>15% niedriger als 30-Tage-Mittel) bei mehreren Tagen → ja
 * - Kombiniert: Reps-Stagnation + HRV-Drop → starkes Ja
 *
 * Output ist immer eine Empfehlung, keine harte Regel — finale Entscheidung
 * trifft entweder User oder AI-Coach mit Kontext.
 */

import type { CompletedSet, RepTarget } from "./progression";

export interface SessionSummary {
  sessionId: string;
  startedAt: Date;
  setsForExercise: CompletedSet[];
  bestSet: CompletedSet;
}

export interface HrvContext {
  /** Last 7-day HRV mittelwert in ms */
  recent7d: number;
  /** 30-day baseline */
  baseline30d: number;
}

export interface DeloadAssessment {
  recommend: boolean;
  confidence: number; // 0-1
  reasoning: string;
  /** Wenn recommend=true: Vorschlag wie viel zu reduzieren */
  reductionPct: number; // z.B. 0.2 = -20%
  triggers: DeloadTrigger[];
}

export type DeloadTrigger =
  | "reps_stagnation_2_sessions"
  | "reps_failure_2_sessions"
  | "hrv_drop_significant"
  | "no_data";

/**
 * Prüfe ob eine Session ihre Reps-Ziele verfehlt hat.
 * "Verfehlt" = 2+ Reps unter Ziel beim besten Satz.
 */
export function sessionMissedTarget(best: CompletedSet, target: RepTarget): boolean {
  const repsAtFailure = best.reps + best.rir;
  const targetFailureReps = target.reps + target.rir;
  return repsAtFailure < targetFailureReps - 1;
}

/**
 * Prüfe ob eine Session stagnierte: gleiches oder weniger Gewicht/e1RM
 * im Vergleich zur Vor-Session.
 */
export function sessionStagnated(current: SessionSummary, previous: SessionSummary): boolean {
  // Vergleiche Bestes Set: e1RM des Current sollte > Previous sein
  // (Vereinfacht — könnte differenzierter sein)
  return (
    current.bestSet.weightKg <= previous.bestSet.weightKg &&
    current.bestSet.reps <= previous.bestSet.reps
  );
}

/**
 * Hauptfunktion: gegeben letzte 2-3 Sessions + HRV → empfehle Deload?
 */
export function assessDeload(
  recentSessions: SessionSummary[],
  target: RepTarget,
  hrv?: HrvContext,
): DeloadAssessment {
  const triggers: DeloadTrigger[] = [];
  const reasons: string[] = [];

  if (recentSessions.length < 2) {
    return {
      recommend: false,
      confidence: 0.3,
      reasoning: "Zu wenig Session-Daten für sichere Empfehlung. Weitertrainieren, Daten sammeln.",
      reductionPct: 0,
      triggers: ["no_data"],
    };
  }

  // Sortiere nach Datum aufsteigend
  const sorted = [...recentSessions].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const previous = sorted[sorted.length - 2];
  const current = sorted[sorted.length - 1];
  if (!previous || !current) {
    return {
      recommend: false,
      confidence: 0.3,
      reasoning: "Zu wenig Session-Daten für sichere Empfehlung.",
      reductionPct: 0,
      triggers: ["no_data"],
    };
  }

  // Trigger 1: 2 aufeinanderfolgende Verfehlungen
  const bothMissed =
    sessionMissedTarget(previous.bestSet, target) && sessionMissedTarget(current.bestSet, target);
  if (bothMissed) {
    triggers.push("reps_failure_2_sessions");
    reasons.push("Letzte 2 Sessions: Reps-Ziel deutlich verfehlt (>=2 Reps unter Target).");
  }

  // Trigger 2: Stagnation (gleicher oder schlechterer Wert)
  if (recentSessions.length >= 2) {
    const stagnated = sessionStagnated(current, previous);
    if (stagnated && !bothMissed) {
      triggers.push("reps_stagnation_2_sessions");
      reasons.push(
        "Stagnation: keine Progression in den letzten 2 Sessions, aber Reps noch im Bereich.",
      );
    }
  }

  // Trigger 3: HRV-Drop
  if (hrv) {
    const hrvRatio = hrv.recent7d / hrv.baseline30d;
    if (hrvRatio < 0.85) {
      triggers.push("hrv_drop_significant");
      reasons.push(
        `HRV-Drop signifikant: 7d-Mittel ${hrv.recent7d.toFixed(0)}ms vs Baseline ${hrv.baseline30d.toFixed(0)}ms (${((1 - hrvRatio) * 100).toFixed(0)}% niedriger).`,
      );
    }
  }

  // Aggregation
  if (triggers.length === 0) {
    return {
      recommend: false,
      confidence: 0.7,
      reasoning: "Keine Deload-Trigger aktiv. Progression weiter wie geplant.",
      reductionPct: 0,
      triggers: [],
    };
  }

  // Confidence steigt mit Anzahl Trigger
  const confidence = Math.min(0.5 + triggers.length * 0.2, 0.95);

  // Reduktion: 20% Standard, 25% wenn HRV stark betroffen
  const hasHrvDrop = triggers.includes("hrv_drop_significant");
  const hasFailure = triggers.includes("reps_failure_2_sessions");
  const reductionPct = hasFailure && hasHrvDrop ? 0.25 : 0.2;

  return {
    recommend: true,
    confidence,
    reasoning: reasons.join(" "),
    reductionPct,
    triggers,
  };
}

/**
 * Hilfsfunktion: berechne empfohlenes Deload-Gewicht.
 */
export function applyDeload(currentWeightKg: number, reductionPct: number): number {
  const reduced = currentWeightKg * (1 - reductionPct);
  // Auf 0.5kg-Schritt runden
  return Math.floor(reduced * 2) / 2;
}
