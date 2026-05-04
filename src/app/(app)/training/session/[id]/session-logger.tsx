"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type CompletedSet,
  INCREMENTS,
  suggestNextWeight,
  suggestStartingWeight,
} from "@/lib/training/progression";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { endSession, logSet } from "../../actions";

import type { ExerciseRow, PlanExerciseRow, WorkoutSetRow } from "@/lib/training/queries";

interface SessionLoggerProps {
  sessionId: string;
  planExercises: PlanExerciseRow[];
  existingSets: WorkoutSetRow[];
}

function pickIncrementType(equipment: string[]): keyof typeof INCREMENTS {
  if (equipment.includes("barbell")) return "barbell";
  if (equipment.includes("smith_machine")) return "smith_machine";
  if (equipment.includes("dumbbell")) return "dumbbell";
  if (equipment.includes("cable")) return "cable";
  if (equipment.includes("machine") || equipment.includes("leg_press")) return "machine";
  return "bodyweight";
}

export function SessionLogger({ sessionId, planExercises, existingSets }: SessionLoggerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const sortedExercises = useMemo(
    () => [...planExercises].sort((a, b) => a.position - b.position),
    [planExercises],
  );

  // Find first exercise that hasn't reached target_sets in working sets yet
  const currentIdx = useMemo(() => {
    for (let i = 0; i < sortedExercises.length; i++) {
      const ex = sortedExercises[i];
      if (!ex?.exercise) continue;
      const working = existingSets.filter(
        (s) => s.exercise_id === ex.exercise!.id && s.set_type === "working",
      ).length;
      if (working < ex.target_sets) return i;
    }
    return sortedExercises.length; // all done
  }, [sortedExercises, existingSets]);

  const allDone = currentIdx >= sortedExercises.length;
  const current = allDone ? null : sortedExercises[currentIdx];

  return (
    <div className="space-y-4">
      {/* Progress indicator */}
      <div className="flex gap-1">
        {sortedExercises.map((ex, i) => {
          if (!ex?.exercise) return null;
          const working = existingSets.filter(
            (s) => s.exercise_id === ex.exercise!.id && s.set_type === "working",
          ).length;
          const done = working >= ex.target_sets;
          const active = i === currentIdx;
          return (
            <div
              key={ex.exercise.id}
              className={cn(
                "h-2 flex-1 rounded-full",
                done
                  ? "bg-(--color-success)"
                  : active
                    ? "bg-(--color-primary)"
                    : "bg-(--color-muted)",
              )}
              title={ex.exercise.name_de}
            />
          );
        })}
      </div>

      {current?.exercise ? (
        <ExerciseCard
          sessionId={sessionId}
          planExercise={current as PlanExerciseRow & { exercise: ExerciseRow }}
          existingSets={existingSets.filter((s) => s.exercise_id === current.exercise!.id)}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Alle Übungen abgeschlossen</CardTitle>
            <CardDescription>
              {existingSets.filter((s) => s.set_type === "working").length} Working-Sets,{" "}
              {existingSets.filter((s) => s.set_type === "warmup").length} Warmup-Sets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              size="lg"
              className="w-full"
              disabled={isPending}
              onClick={() => startTransition(() => endSession(sessionId))}
            >
              {isPending ? "Abschluss…" : "Session beenden"}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              await endSession(sessionId);
            })
          }
          className="text-sm text-(--color-muted-foreground) hover:text-(--color-foreground)"
        >
          Frühzeitig beenden
        </button>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="text-sm text-(--color-muted-foreground) hover:text-(--color-foreground)"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

interface ExerciseCardProps {
  sessionId: string;
  planExercise: PlanExerciseRow & { exercise: ExerciseRow };
  existingSets: WorkoutSetRow[];
}

function ExerciseCard({ sessionId, planExercise, existingSets }: ExerciseCardProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const ex = planExercise.exercise;
  const target = { reps: planExercise.target_reps, rir: planExercise.target_rir };
  const incrementType = pickIncrementType(ex.equipment);
  const increment = INCREMENTS[incrementType] ?? INCREMENTS.barbell;

  const workingDone = existingSets.filter((s) => s.set_type === "working").length;
  const warmupDone = existingSets.filter((s) => s.set_type === "warmup").length;
  const isWarmupPhase = warmupDone < planExercise.warmup_sets;
  const setType = isWarmupPhase ? "warmup" : "working";
  const nextPosition = existingSets.length + 1;

  // Suggestion: based on most recent working set OR estimate from history
  const lastWorkingSet = [...existingSets].reverse().find((s) => s.set_type === "working");
  const lastSetForSuggestion: CompletedSet | null = lastWorkingSet
    ? {
        weightKg: Number(lastWorkingSet.weight_kg),
        reps: lastWorkingSet.reps,
        rir: lastWorkingSet.rir ?? 0,
      }
    : null;

  const suggestion = lastSetForSuggestion
    ? suggestNextWeight(lastSetForSuggestion, target, increment ?? INCREMENTS.barbell!)
    : null;

  const startingWeight = suggestStartingWeight(incrementType);
  const defaultWeight = isWarmupPhase
    ? lastWorkingSet
      ? Math.round(Number(lastWorkingSet.weight_kg) * 0.5 * 2) / 2
      : Math.round(startingWeight * 0.5 * 2) / 2
    : (suggestion?.suggestedWeightKg ?? startingWeight);

  const defaultReps = isWarmupPhase ? 10 : target.reps;
  const defaultRir = isWarmupPhase ? 5 : target.rir;

  function onSubmit(formData: FormData) {
    setError(null);
    const weight = Number(formData.get("weight"));
    const reps = Number(formData.get("reps"));
    const rir = Number(formData.get("rir"));

    if (!Number.isFinite(weight) || weight <= 0) {
      setError("Gewicht ungültig");
      return;
    }
    if (!Number.isInteger(reps) || reps < 1) {
      setError("Reps müssen ≥ 1 sein");
      return;
    }
    if (!Number.isInteger(rir) || rir < 0) {
      setError("RIR muss ≥ 0 sein");
      return;
    }

    startTransition(async () => {
      const result = await logSet({
        sessionId,
        exerciseId: ex.id,
        position: nextPosition,
        setType,
        weightKg: weight,
        reps,
        rir,
      });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ex.name_de}</CardTitle>
        <CardDescription>
          {planExercise.warmup_sets > 0 && `${planExercise.warmup_sets} Aufwärm × `}
          {planExercise.target_sets} Working × {target.reps} @ RIR {target.rir} ·{" "}
          {ex.primary_muscle}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {ex.notes_de && (
          <p className="text-xs text-(--color-muted-foreground) italic">{ex.notes_de}</p>
        )}

        {existingSets.length > 0 && (
          <div className="space-y-1">
            {existingSets.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm tabular-nums">
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-xs",
                    s.set_type === "working"
                      ? "bg-(--color-primary) text-(--color-primary-foreground)"
                      : "bg-(--color-secondary) text-(--color-secondary-foreground)",
                  )}
                >
                  {s.set_type === "working" ? "W" : "WU"}
                </span>
                <span>
                  {s.weight_kg} kg × {s.reps} @ RIR {s.rir ?? "-"}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-md bg-(--color-muted) p-3 text-sm">
          <div className="font-medium">
            {isWarmupPhase
              ? `Aufwärm-Satz ${warmupDone + 1} / ${planExercise.warmup_sets}`
              : `Working-Satz ${workingDone + 1} / ${planExercise.target_sets}`}
          </div>
          {suggestion && !isWarmupPhase && (
            <div className="text-(--color-muted-foreground) mt-1">
              Vorschlag: {suggestion.reasoning}
            </div>
          )}
        </div>

        <form action={onSubmit} className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="weight">Kg</Label>
            <Input
              id="weight"
              name="weight"
              type="number"
              step={increment?.minIncrementKg ?? 0.5}
              defaultValue={defaultWeight}
              required
              inputMode="decimal"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="reps">Reps</Label>
            <Input
              id="reps"
              name="reps"
              type="number"
              step={1}
              defaultValue={defaultReps}
              required
              inputMode="numeric"
              min={1}
              max={50}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rir">RIR</Label>
            <Input
              id="rir"
              name="rir"
              type="number"
              step={1}
              defaultValue={defaultRir}
              required
              inputMode="numeric"
              min={0}
              max={10}
            />
          </div>

          {error && (
            <p className="col-span-3 text-sm text-(--color-destructive)" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" disabled={isPending} className="col-span-3" size="lg">
            {isPending ? "Logge…" : `${isWarmupPhase ? "Aufwärm-Satz" : "Working-Satz"} loggen`}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
