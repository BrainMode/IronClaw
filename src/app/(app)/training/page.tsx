import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAllActivePlans, getLocations, getRecentSessions } from "@/lib/training/queries";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StartSessionButton } from "./start-session-button";

export default async function TrainingPage() {
  const locations = await getLocations();

  if (locations.length === 0) {
    redirect("/training/setup/anamnese");
  }

  const allPlans = await getAllActivePlans();
  const hasAnyPlan = allPlans.some((x) => x.plan !== null);

  if (!hasAnyPlan) {
    redirect("/training/setup");
  }

  const recent = await getRecentSessions(3);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Training</h2>
          <p className="text-(--color-muted-foreground)">
            {locations.length} {locations.length === 1 ? "Trainings-Ort" : "Trainings-Orte"}
          </p>
        </div>
        <Link
          href="/training/history"
          className="text-sm text-(--color-muted-foreground) hover:text-(--color-foreground)"
        >
          Verlauf →
        </Link>
      </div>

      {/* Per-location cards with Start button + plan summary */}
      <div className="space-y-4">
        {allPlans.map(({ location, plan }) => (
          <Card key={location.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>{location.display_name}</CardTitle>
                  <CardDescription>
                    {plan ? plan.plan.name : "Kein Plan generiert"} · {location.equipment.length}{" "}
                    Geräte
                  </CardDescription>
                </div>
                {plan && (
                  <span className="text-xs text-(--color-muted-foreground) tabular-nums">
                    {plan.days.length}× / Woche
                  </span>
                )}
              </div>
            </CardHeader>
            {plan ? (
              <>
                <CardContent>
                  <div className="space-y-3">
                    {plan.days.map((day) => (
                      <details key={day.id} className="text-sm">
                        <summary className="cursor-pointer font-medium hover:text-(--color-foreground)">
                          {day.name} · {day.exercises.length} Übungen
                        </summary>
                        <ol className="mt-2 space-y-1 ml-4">
                          {[...day.exercises]
                            .sort((a, b) => a.position - b.position)
                            .map((ex) => (
                              <li
                                key={ex.id}
                                className="flex items-center justify-between text-(--color-muted-foreground)"
                              >
                                <span>{ex.exercise?.name_de ?? "—"}</span>
                                <span className="tabular-nums">
                                  {ex.target_sets} × {ex.target_reps} @ RIR {ex.target_rir}
                                </span>
                              </li>
                            ))}
                        </ol>
                      </details>
                    ))}
                  </div>
                </CardContent>
                <CardFooter>
                  <StartSessionButton
                    locationId={location.id}
                    locationLabel={location.display_name}
                  />
                </CardFooter>
              </>
            ) : (
              <CardContent>
                <p className="text-sm text-(--color-muted-foreground)">
                  Equipment-Inventar gespeichert, aber Plan-Generierung schlug fehl. Geh zu{" "}
                  <Link href="/training/setup" className="underline">
                    Setup
                  </Link>{" "}
                  und füge mehr Equipment hinzu.
                </p>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {recent.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Letzte Sessions</h3>
          <div className="space-y-2">
            {recent.map((s) => (
              <Card key={s.id}>
                <CardContent className="py-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{s.day_name ?? "Session"}</div>
                    <div className="text-sm text-(--color-muted-foreground)">
                      {new Date(s.started_at).toLocaleDateString("de-CH", {
                        weekday: "short",
                        day: "2-digit",
                        month: "2-digit",
                      })}
                      {s.duration_minutes ? ` · ${Math.round(s.duration_minutes)} min` : ""}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/training/session/${s.id}`}>Detail</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Link
          href="/training/setup"
          className="text-sm text-(--color-muted-foreground) hover:text-(--color-foreground)"
        >
          Locations + Equipment editieren
        </Link>
      </div>
    </div>
  );
}
