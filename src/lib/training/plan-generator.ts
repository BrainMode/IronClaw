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
    name: "Squat (Quads compound)",
    options: [
      { slug: "back-squat", requires: ["barbell", "squat_rack"] },
      { slug: "leg-press", requires: ["leg_press"] },
      { slug: "hack-squat", requires: ["machine"] },
    ],
  },
  {
    name: "Horizontal Press (Chest)",
    options: [
      { slug: "barbell-bench-press", requires: ["barbell", "bench", "squat_rack"] },
      { slug: "dumbbell-bench-press", requires: ["dumbbell", "bench"] },
      { slug: "cable-crossover", requires: ["cable"] },
      { slug: "chest-fly-machine", requires: ["machine"] },
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

export function generateFullbodyX2(
  available: EquipmentType[],
  prefs: Partial<TrainingPreferences> = {},
): PlanTemplate {
  const targetSets = prefs.workingSetsPerExercise ?? 2;
  const targetReps = prefs.repRangeMin ?? 6;
  const targetRir = prefs.preferredRirMin ?? 0;
  const warmupFirst = prefs.warmupSetsFirstExercise ?? 2;
  const warmupOthers = prefs.warmupSetsSubsequent ?? 1;

  function buildDay(name: string, position: number, slots: typeof DAY_A_SLOTS): PlanDayTemplate {
    const exercises: PlanExerciseTemplate[] = [];
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (!slot) continue;
      const slug = pickByEquipment(slot.options, available);
      if (!slug) continue;
      // De-dupe falls 2 Slots dieselbe Übung wählen würden (selten, aber möglich)
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

  return {
    name: "GK 2× — Iron Mike",
    description:
      "Ganzkörper-Split, 2× pro Woche. Pro Übung 1-2 Working Sets bis Muskelversagen, " +
      "5-7 Reps. Day A betont Squat + Vertical Pull, Day B betont Hip Hinge + Horizontal Pull.",
    days: [buildDay("Ganzkörper A", 1, DAY_A_SLOTS), buildDay("Ganzkörper B", 2, DAY_B_SLOTS)],
  };
}
