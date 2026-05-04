"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EquipmentType } from "@/lib/training/plan-generator";
import type { EquipmentLocation } from "@/lib/training/queries";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type LocationInput, generateAllPlans, saveLocations } from "../actions";

interface EquipmentOption {
  key: EquipmentType;
  label: string;
  group: "Hanteln" | "Maschinen" | "Bodyweight" | "Cardio";
  /** Sinnvolle Defaults pro Location-Key */
  defaultIn?: ("gym" | "home" | "travel")[];
}

const OPTIONS: EquipmentOption[] = [
  // Hanteln
  { key: "barbell", label: "Langhantel", group: "Hanteln", defaultIn: ["gym"] },
  {
    key: "dumbbell",
    label: "Kurzhanteln",
    group: "Hanteln",
    defaultIn: ["gym", "home"],
  },
  {
    key: "kettlebell",
    label: "Kettlebells",
    group: "Hanteln",
    defaultIn: ["home"],
  },
  { key: "bench", label: "Bank", group: "Hanteln", defaultIn: ["gym"] },
  {
    key: "squat_rack",
    label: "Squat Rack",
    group: "Hanteln",
    defaultIn: ["gym"],
  },
  // Maschinen
  { key: "cable", label: "Kabelzug", group: "Maschinen", defaultIn: ["gym"] },
  {
    key: "machine",
    label: "Selectorize-Maschinen",
    group: "Maschinen",
    defaultIn: ["gym"],
  },
  {
    key: "leg_press",
    label: "Beinpresse",
    group: "Maschinen",
    defaultIn: ["gym"],
  },
  { key: "smith_machine", label: "Smith Machine", group: "Maschinen" },
  // Bodyweight
  {
    key: "pull_up_bar",
    label: "Klimmzugstange",
    group: "Bodyweight",
    defaultIn: ["gym", "home"],
  },
  { key: "dip_bars", label: "Dip-Barren", group: "Bodyweight" },
  {
    key: "resistance_band",
    label: "Widerstandsbänder",
    group: "Bodyweight",
    defaultIn: ["home", "travel"],
  },
  {
    key: "trx",
    label: "TRX (Suspension Trainer)",
    group: "Bodyweight",
    defaultIn: ["home"],
  },
  {
    key: "bodyweight",
    label: "Nur Körpergewicht (Push-up, etc.)",
    group: "Bodyweight",
    defaultIn: ["home", "travel"],
  },
  // Cardio
  { key: "rower", label: "Rudergerät", group: "Cardio" },
  {
    key: "bike",
    label: "Fahrrad / Spinning",
    group: "Cardio",
    defaultIn: ["gym"],
  },
  {
    key: "treadmill",
    label: "Laufband",
    group: "Cardio",
    defaultIn: ["gym"],
  },
  { key: "elliptical", label: "Crosstrainer", group: "Cardio" },
];

const GROUPS: EquipmentOption["group"][] = ["Hanteln", "Maschinen", "Bodyweight", "Cardio"];

interface LocationDraft {
  id: string | null;
  key: string;
  display_name: string;
  equipment: Set<string>;
}

function defaultEquipmentFor(locationKey: "gym" | "home" | "travel" | "custom"): Set<string> {
  if (locationKey === "custom") return new Set();
  return new Set(
    OPTIONS.filter((o) => o.defaultIn?.includes(locationKey)).map((o) => o.key as string),
  );
}

export function SetupWizard({ initial }: { initial: EquipmentLocation[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [drafts, setDrafts] = useState<LocationDraft[]>(() => {
    if (initial.length > 0) {
      return initial.map((l) => ({
        id: l.id,
        key: l.key,
        display_name: l.display_name,
        equipment: new Set(l.equipment),
      }));
    }
    // Default: Gym + Home pre-populated with sensible defaults
    return [
      {
        id: null,
        key: "gym",
        display_name: "Gym",
        equipment: defaultEquipmentFor("gym"),
      },
      {
        id: null,
        key: "home",
        display_name: "Home Gym",
        equipment: defaultEquipmentFor("home"),
      },
    ];
  });

  function updateDraft(idx: number, patch: Partial<LocationDraft>) {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  function toggleEquipment(idx: number, key: string) {
    setDrafts((prev) =>
      prev.map((d, i) => {
        if (i !== idx) return d;
        const next = new Set(d.equipment);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return { ...d, equipment: next };
      }),
    );
  }

  function addLocation() {
    const customCount = drafts.filter((d) => d.key.startsWith("custom-")).length;
    const newKey = `custom-${customCount + 1}`;
    setDrafts((prev) => [
      ...prev,
      {
        id: null,
        key: newKey,
        display_name: "Custom",
        equipment: defaultEquipmentFor("custom"),
      },
    ]);
  }

  function removeLocation(idx: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
  }

  function onGenerate() {
    setError(null);
    if (drafts.length === 0) {
      setError("Mindestens eine Location nötig.");
      return;
    }
    if (drafts.some((d) => d.equipment.size === 0)) {
      setError(
        "Mindestens eine Location hat kein Equipment ausgewählt — sonst kann kein Plan generiert werden.",
      );
      return;
    }

    const input: LocationInput[] = drafts.map((d) => ({
      id: d.id,
      key: d.key,
      display_name: d.display_name,
      equipment: Array.from(d.equipment) as EquipmentType[],
    }));

    startTransition(async () => {
      const saveResult = await saveLocations(input);
      if (!saveResult.ok) {
        setError(saveResult.error);
        return;
      }
      const planResult = await generateAllPlans();
      if (!planResult.ok) {
        setError(planResult.error);
        return;
      }
      router.push("/training");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {drafts.map((draft, idx) => (
        <Card key={`${draft.key}-${idx}`}>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value={draft.display_name}
                onChange={(e) => updateDraft(idx, { display_name: e.target.value })}
                placeholder="z.B. Gym, Home Gym, Travel Bag"
                className="font-semibold text-base h-9"
              />
              {drafts.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLocation(idx)}
                  className="text-sm text-(--color-muted-foreground) hover:text-(--color-destructive) px-2"
                  aria-label="Location entfernen"
                >
                  ✕
                </button>
              )}
            </div>
            <CardDescription>
              {draft.equipment.size} Geräte ausgewählt
              {draft.key === "gym" && " · generiert Iron Mike GK 2× Plan"}
              {(draft.key === "home" || draft.key === "travel") &&
                " · generiert Home Quick 30 Plan (KB / Bands / Bodyweight)"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {GROUPS.map((group) => (
              <div key={group}>
                <Label className="text-(--color-muted-foreground) text-xs uppercase tracking-wide">
                  {group}
                </Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {OPTIONS.filter((o) => o.group === group).map((opt) => {
                    const checked = draft.equipment.has(opt.key);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => toggleEquipment(idx, opt.key)}
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors text-left",
                          checked
                            ? "bg-(--color-primary) text-(--color-primary-foreground) border-(--color-primary)"
                            : "border-(--color-border) hover:bg-(--color-accent) hover:text-(--color-accent-foreground)",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-flex h-4 w-4 items-center justify-center rounded border shrink-0",
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
                              <path
                                d="M3 8.5l3 3 7-7"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </span>
                        <span className="leading-tight">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Button type="button" variant="outline" onClick={addLocation} className="w-full">
        + Location hinzufügen (z.B. Travel)
      </Button>

      {error && (
        <p className="text-sm text-(--color-destructive)" role="alert">
          {error}
        </p>
      )}

      <div className="sticky bottom-24 -mx-4 px-4 pb-2 pt-3 border-t border-(--color-border) bg-(--color-background)/95 backdrop-blur">
        <Button onClick={onGenerate} disabled={isPending} size="lg" className="w-full">
          {isPending
            ? "Generiere Pläne…"
            : `${drafts.length === 1 ? "Plan" : "Pläne"} erstellen (${drafts.length})`}
        </Button>
      </div>
    </div>
  );
}
