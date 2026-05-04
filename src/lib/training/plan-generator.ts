/**
 * Auto-Generator für Iron-Mike-Style Trainings-Pläne.
 *
 * Pure function — keine DB-Calls. Output ist eine PlanTemplate die danach
 * via insertPlanFromTemplate() in DB geschrieben wird.
 *
 * Logik (siehe docs/TRAINING_LOGIC.md):
 *   - fullbody_x2: 2 Sessions/Woche, Ganzkörper (jeden Muskel 2× treffen)
 *   - 1-2 Working Sets pro Übung, RIR=0, 6 Reps Ziel
 *   - 5-6 Übungen pro Session → ~30-40 Min
 *   - Day A betont vertikale Pull + Beinpresse-Schwerpunkt
 *   - Day B betont horizontale Pull + Hüft-Hinge-Schwerpunkt
 *
 * Equipment-Aware: jeder "Slot" hat Fallback-Chain. Wenn User keine Langhantel hat,
 * fällt Bench Press auf DB-Bench, dann Cable Crossover etc. zurück.
 */

import type { TrainingPreferences } from "./queries";

export type EquipmentType =
  | "barbell"
  | "dumbbell"
  | "cable"
  | "machine"
  | "bodyweight"
  | "kettlebell"
  | "resistance_band"
  | "trx"
  | "smith_machine"
  | "leg_press"
  | "pull_up_bar"
  | "dip_bars"
  | "bench"
  | "squat_rack"
  | "rower"
  | "bike"
  | "treadmill"
  | "elliptical"
  | "none";

export interface PlanExerciseTemplate {
  exerciseSlug: string;
  /** Anzahl Working-Sets — pro Übung, default 2 für Mike */
  targetSets: number;
  /** Ziel-Reps (Mike default 6) */
  targetReps: number;
  /** Ziel-RIR (Mike default 0 = bis Versagen) */
  targetRir: number;
  /** Aufwärmsätze — 2 für erste Übung, 1 für nachfolgende */
  warmupSets: number;
  notes?: string;
}

export interface PlanDayTemplate {
  name: string;
  position: number;
  exercises: PlanExerciseTemplate[];
}

export interface PlanTemplate {
  name: string;
  description: string;
  days: PlanDayTemplate[];
}

/**
 * Wähle aus einer Liste von Optionen die erste Übung deren Equipment vorhanden ist.
 * Jede Option = { slug, requires: equipment[] } — alle requires müssen erfüllt sein.
 */
type ExerciseOption = { slug: string; requires: EquipmentType[] };

function pickByEquipment(options: ExerciseOption[], available: EquipmentType[]): string | null {
  for (const opt of options) {
    if (opt.requires.every((req) => available.includes(req))) {
      return opt.slug;
    }
  }
  return null;
}

/** Mike fullbody_x2 — Day A */
const DAY_A_SLOTS: { name: string; options: ExerciseOption[] }[] = [
  {
    name: "Quads (Mike: Beinpresse first, Kniebeuge nicht primär)",
    // Mike ist explizit: Kniebeuge ist nicht der effektivste Weg (aktive
    // Insuffizienz vom Rectus Femoris). Bevorzuge Beinpresse + Beinstrecker.
    // Kniebeuge nur wenn nichts anderes da ist.
    options: [
      { slug: "leg-press", requires: ["leg_press"] },
      { slug: "hack-squat", requires: ["machine"] },
      { slug: "leg-extension", requires: ["machine"] },
      { slug: "back-squat", requires: ["barbell", "squat_rack"] },
    ],
  },
  {
    name: "Chest (Mike: Maschine/Cable bevorzugt vor Bench)",
    // Mike-Empfehlung Brust: Pec Deck (Butterfly) + Cable Crossover für
    // konstante Spannung über ROM. Bench Press ist OK aber nicht primär.
    options: [
      { slug: "chest-fly-machine", requires: ["machine"] },
      { slug: "cable-crossover", requires: ["cable"] },
      { slug: "dumbbell-bench-press", requires: ["dumbbell", "bench"] },
      { slug: "barbell-bench-press", requires: ["barbell", "bench", "squat_rack"] },
    ],
  },
  {
    name: "Vertical Pull (Back lats)",
    options: [
      { slug: "lat-pulldown", requires: ["cable"] },
      { slug: "pull-up", requires: ["pull_up_bar"] },
    ],
  },
  {
    name: "Tricep (long head stretch)",
    options: [
      { slug: "overhead-tricep-extension-cable", requires: ["cable"] },
      { slug: "skullcrusher", requires: ["barbell", "bench"] },
      { slug: "tricep-pushdown", requires: ["cable"] },
    ],
  },
  {
    name: "Bicep (long head stretch)",
    options: [
      { slug: "incline-dumbbell-curl", requires: ["dumbbell", "bench"] },
      { slug: "preacher-curl", requires: ["barbell"] },
      { slug: "cable-curl", requires: ["cable"] },
    ],
  },
  {
    name: "Calves",
    options: [
      { slug: "calf-press-leg-press", requires: ["leg_press"] },
      { slug: "standing-calf-raise", requires: ["machine"] },
      { slug: "standing-calf-raise", requires: ["dumbbell"] },
    ],
  },
];

/** Mike fullbody_x2 — Day B */
const DAY_B_SLOTS: { name: string; options: ExerciseOption[] }[] = [
  {
    name: "Hip Hinge (Hamstrings)",
    options: [
      { slug: "romanian-deadlift", requires: ["barbell"] },
      { slug: "romanian-deadlift", requires: ["dumbbell"] },
      { slug: "seated-leg-curl", requires: ["machine"] },
      { slug: "lying-leg-curl", requires: ["machine"] },
    ],
  },
  {
    name: "Incline Press (Upper Chest)",
    options: [
      { slug: "incline-dumbbell-press", requires: ["dumbbell", "bench"] },
      { slug: "cable-crossover", requires: ["cable"] },
    ],
  },
  {
    name: "Horizontal Pull (Mid-Back)",
    options: [
      { slug: "chest-supported-row", requires: ["machine"] },
      { slug: "chest-supported-row", requires: ["dumbbell", "bench"] },
      { slug: "seated-cable-row", requires: ["cable"] },
      { slug: "barbell-row", requires: ["barbell"] },
    ],
  },
  {
    name: "Vertical Press (Front Delts)",
    options: [
      { slug: "overhead-press-barbell", requires: ["barbell", "squat_rack"] },
      { slug: "seated-dumbbell-press", requires: ["dumbbell", "bench"] },
    ],
  },
  {
    name: "Side Delts (Iso)",
    options: [
      { slug: "lateral-raise-cable", requires: ["cable"] },
      { slug: "lateral-raise-dumbbell", requires: ["dumbbell"] },
    ],
  },
  {
    name: "Glutes",
    options: [
      { slug: "hip-thrust", requires: ["barbell", "bench"] },
      { slug: "hip-thrust", requires: ["dumbbell", "bench"] },
    ],
  },
];

type Slot = { name: string; options: ExerciseOption[] };

/**
 * Wähle die Mitte einer min/max Range — bei Mike's 5-7 ergibt das 6 (Sweet-Spot),
 * bei classic 8-12 ergibt das 10. Wenn min/max nicht angegeben: fallback auf default.
 */
function rangeTarget(min: number | undefined, max: number | undefined, fallback: number): number {
  if (min === undefined || max === undefined) return fallback;
  return Math.round((min + max) / 2);
}

function buildDay(
  name: string,
  position: number,
  slots: Slot[],
  available: EquipmentType[],
  prefs: Partial<TrainingPreferences>,
): PlanDayTemplate {
  const targetSets = prefs.workingSetsPerExercise ?? 2;
  // Mike: ZIEL ist die Mitte der Range (z.B. 5-7 → 6 Reps), nicht das Min.
  const targetReps = rangeTarget(prefs.repRangeMin, prefs.repRangeMax, 6);
  const targetRir = rangeTarget(prefs.preferredRirMin, prefs.preferredRirMax, 0);
  const warmupFirst = prefs.warmupSetsFirstExercise ?? 2;
  const warmupOthers = prefs.warmupSetsSubsequent ?? 1;

  const exercises: PlanExerciseTemplate[] = [];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot) continue;
    const slug = pickByEquipment(slot.options, available);
    if (!slug) continue;
    if (exercises.some((e) => e.exerciseSlug === slug)) continue;
    exercises.push({
      exerciseSlug: slug,
      targetSets,
      targetReps,
      targetRir,
      warmupSets: i === 0 ? warmupFirst : warmupOthers,
      notes: slot.name,
    });
  }
  return { name, position, exercises };
}

export function generateFullbodyX2(
  available: EquipmentType[],
  prefs: Partial<TrainingPreferences> = {},
): PlanTemplate {
  return {
    name: "GK 2× — Iron Mike",
    description:
      "Ganzkörper-Split, 2× pro Woche. Pro Übung 1-2 Working Sets bis Muskelversagen, " +
      "5-7 Reps. Day A: Squat + Vertical Pull, Day B: Hip Hinge + Horizontal Pull.",
    days: [
      buildDay("Ganzkörper A", 1, DAY_A_SLOTS, available, prefs),
      buildDay("Ganzkörper B", 2, DAY_B_SLOTS, available, prefs),
    ],
  };
}

// ============================================================================
// HOME-GYM QUICK PLAN — Kettlebell + Band + Bodyweight, 4-5 Übungen, ~30min
// ============================================================================

const HOME_DAY_A_SLOTS: Slot[] = [
  {
    name: "Quads (Squat / Lunge)",
    options: [
      // KB BSS first (loaded), TRX BSS for stability + range, KB Goblet, BW
      { slug: "kb-bulgarian-split-squat", requires: ["kettlebell"] },
      { slug: "trx-bulgarian-split-squat", requires: ["trx"] },
      { slug: "kb-goblet-squat", requires: ["kettlebell"] },
      { slug: "bw-bulgarian-split-squat", requires: ["bodyweight"] },
    ],
  },
  {
    name: "Horizontal Press (Chest)",
    options: [
      { slug: "kb-floor-press", requires: ["kettlebell"] },
      { slug: "trx-push-up", requires: ["trx"] },
      { slug: "band-press", requires: ["resistance_band"] },
      { slug: "push-up", requires: ["bodyweight"] },
    ],
  },
  {
    name: "Vertical Pull (Lats)",
    options: [
      // TRX bietet keinen Vertical-Pull — Band oder BW Inverted-Row
      { slug: "band-pulldown", requires: ["resistance_band"] },
      { slug: "inverted-row", requires: ["bodyweight"] },
    ],
  },
  {
    name: "Tricep (long head stretch)",
    options: [
      { slug: "kb-tricep-extension", requires: ["kettlebell"] },
      { slug: "trx-tricep-extension", requires: ["trx"] },
      { slug: "band-overhead-tricep", requires: ["resistance_band"] },
    ],
  },
  {
    name: "Bicep",
    options: [
      { slug: "kb-curl", requires: ["kettlebell"] },
      { slug: "trx-curl", requires: ["trx"] },
      { slug: "band-curl", requires: ["resistance_band"] },
    ],
  },
];

const HOME_DAY_B_SLOTS: Slot[] = [
  {
    name: "Hip Hinge (Hamstrings/Glutes)",
    options: [
      // TRX hat keinen sinnvollen Hinge — KB ist hier optimal
      { slug: "kb-swing", requires: ["kettlebell"] },
      { slug: "kb-rdl", requires: ["kettlebell"] },
      { slug: "kb-suitcase-deadlift", requires: ["kettlebell"] },
    ],
  },
  {
    name: "Horizontal Pull (Back upper)",
    options: [
      // TRX-Row ist exzellent — gleichwertig zu KB Bent Row, oft bevorzugt
      { slug: "trx-row", requires: ["trx"] },
      { slug: "kb-row-bent", requires: ["kettlebell"] },
      { slug: "band-row-seated", requires: ["resistance_band"] },
      { slug: "inverted-row", requires: ["bodyweight"] },
    ],
  },
  {
    name: "Vertical Press (Shoulders)",
    options: [
      { slug: "kb-press-overhead", requires: ["kettlebell"] },
      { slug: "trx-pike", requires: ["trx"] },
      { slug: "bw-pike-push-up", requires: ["bodyweight"] },
    ],
  },
  {
    name: "Side Delts",
    options: [{ slug: "band-lateral-raise", requires: ["resistance_band"] }],
  },
  {
    name: "Posture / Rear Delts",
    options: [{ slug: "band-pull-apart", requires: ["resistance_band"] }],
  },
];

/**
 * Home-Quick-30 — 4-5 Übungen, ~25-30 min Working + 10-15 min Aufwärmen.
 * Iron-Mike-konform: 1-2 Working Sets bis Versagen, 5-7 Reps, RIR=0.
 *
 * Bei Equipment-Mangel (z.B. nur Bands) fallen einzelne Slots weg —
 * Plan kann mit nur 3-4 Übungen rauskommen, das ist OK.
 */
export function generateHomeQuick30(
  available: EquipmentType[],
  prefs: Partial<TrainingPreferences> = {},
): PlanTemplate {
  // Reduziertes Aufwärmen bei Home — kein Cold-Start nach Anfahrt
  const homePrefs: Partial<TrainingPreferences> = {
    ...prefs,
    warmupSetsFirstExercise: prefs.warmupSetsFirstExercise ?? 1,
    warmupSetsSubsequent: prefs.warmupSetsSubsequent ?? 1,
  };

  return {
    name: "Home Quick 30",
    description:
      "Home-Variante mit Kettlebell + Bands + Bodyweight. " +
      "5 Übungen pro Session, 1-2 Working Sets bis Muskelversagen, ~30 min. " +
      "Day A: Push + Quads, Day B: Pull + Hinge + Posture.",
    days: [
      buildDay("Home A — Push", 1, HOME_DAY_A_SLOTS, available, homePrefs),
      buildDay("Home B — Pull", 2, HOME_DAY_B_SLOTS, available, homePrefs),
    ],
  };
}

/**
 * Wählt den passenden Plan-Generator basierend auf Location-Key.
 * 'gym' → Iron Mike fullbody_x2 mit voller Equipment-Range
 * 'home' / 'travel' → Home-Quick-30 mit KB/Band/Bodyweight
 */
export function generatePlanForLocation(
  locationKey: string,
  available: EquipmentType[],
  prefs: Partial<TrainingPreferences> = {},
): PlanTemplate {
  if (locationKey === "home" || locationKey === "travel") {
    return generateHomeQuick30(available, prefs);
  }
  return generateFullbodyX2(available, prefs);
}
