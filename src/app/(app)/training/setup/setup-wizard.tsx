"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EquipmentType } from "@/lib/training/plan-generator";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { generatePlan, saveEquipment } from "../actions";

interface EquipmentOption {
  key: EquipmentType;
  label: string;
  group: "Hanteln" | "Maschinen" | "Bodyweight" | "Cardio";
  defaultChecked?: boolean;
}

const OPTIONS: EquipmentOption[] = [
  // Hanteln
  { key: "barbell", label: "Langhantel", group: "Hanteln", defaultChecked: true },
  { key: "dumbbell", label: "Kurzhanteln", group: "Hanteln", defaultChecked: true },
  { key: "kettlebell", label: "Kettlebell", group: "Hanteln" },
  { key: "bench", label: "Bank", group: "Hanteln", defaultChecked: true },
  { key: "squat_rack", label: "Squat Rack", group: "Hanteln", defaultChecked: true },
  // Maschinen
  { key: "cable", label: "Kabelzug", group: "Maschinen", defaultChecked: true },
  { key: "machine", label: "Selectorize-Maschinen", group: "Maschinen", defaultChecked: true },
  { key: "leg_press", label: "Beinpresse", group: "Maschinen", defaultChecked: true },
  { key: "smith_machine", label: "Smith Machine", group: "Maschinen" },
  // Bodyweight
  { key: "pull_up_bar", label: "Klimmzugstange", group: "Bodyweight", defaultChecked: true },
  { key: "dip_bars", label: "Dip-Barren", group: "Bodyweight" },
  { key: "resistance_band", label: "Widerstandsbänder", group: "Bodyweight" },
  // Cardio
  { key: "rower", label: "Rudergerät", group: "Cardio" },
  { key: "bike", label: "Fahrrad / Spinning", group: "Cardio", defaultChecked: true },
  { key: "treadmill", label: "Laufband", group: "Cardio", defaultChecked: true },
  { key: "elliptical", label: "Crosstrainer", group: "Cardio" },
];

const GROUPS: EquipmentOption["group"][] = ["Hanteln", "Maschinen", "Bodyweight", "Cardio"];

export function SetupWizard({ initial }: { initial: string[] }) {
  const router = useRouter();
  const initialSet =
    initial.length > 0
      ? new Set(initial)
      : new Set(OPTIONS.filter((o) => o.defaultChecked).map((o) => o.key as string));
  const [selected, setSelected] = useState<Set<string>>(initialSet);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function onGenerate() {
    setError(null);
    startTransition(async () => {
      const eqList = Array.from(selected) as EquipmentType[];
      const eqResult = await saveEquipment(eqList);
      if (!eqResult.ok) {
        setError(eqResult.error);
        return;
      }
      const planResult = await generatePlan();
      if (!planResult.ok) {
        setError(planResult.error);
        return;
      }
      router.push("/training");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {GROUPS.map((group) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle className="text-base">{group}</CardTitle>
            <CardDescription>
              {group === "Hanteln" && "Freie Gewichte + Bank/Rack"}
              {group === "Maschinen" && "Kabel, Selectorize, Beinpresse"}
              {group === "Bodyweight" && "Klimmzugstange, Dip-Barren, Bänder"}
              {group === "Cardio" && "Optional — für Zone-2-Cardio"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {OPTIONS.filter((o) => o.group === group).map((opt) => {
                const checked = selected.has(opt.key);
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => toggle(opt.key)}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors text-left",
                      checked
                        ? "bg-(--color-primary) text-(--color-primary-foreground) border-(--color-primary)"
                        : "border-(--color-border) hover:bg-(--color-accent) hover:text-(--color-accent-foreground)",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-4 w-4 items-center justify-center rounded border",
                        checked
                          ? "border-(--color-primary-foreground) bg-(--color-primary-foreground)/20"
                          : "border-(--color-border)",
                      )}
                      aria-hidden
                    >
                      {checked && (
                        <svg
                          className="h-3 w-3"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          aria-hidden="true"
                        >
                          <path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      {error && (
        <p className="text-sm text-(--color-destructive)" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button onClick={onGenerate} disabled={isPending} size="lg" className="flex-1">
          {isPending ? "Generiere…" : "Plan erstellen"}
        </Button>
      </div>
    </div>
  );
}
