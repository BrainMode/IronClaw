import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getActivePlan, getRecentSessions } from "@/lib/training/queries";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StartSessionButton } from "./start-session-button";

export default async function TrainingPage() {
  const active = await getActivePlan();

  if (!active) {
    redirect("/training/setup");
  }

  const recent = await getRecentSessions(3);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Training</h2>
          <p className="text-(--color-muted-foreground)">{active.plan.name}</p>
        </div>
        <Link
          href="/training/history"
          className="text-sm text-(--color-muted-foreground) hover:text-(--color-foreground)"
        >
          Verlauf →
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Heute trainieren</CardTitle>
          <CardDescription>Starte die nächste Session aus deinem Plan.</CardDescription>
        </CardHeader>
        <CardFooter>
          <StartSessionButton />
        </CardFooter>
      </Card>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Plan-Übersicht</h3>
        {active.days.map((day) => (
          <Card key={day.id}>
            <CardHeader>
              <CardTitle className="text-base">{day.name}</CardTitle>
              <CardDescription>{day.exercises.length} Übungen</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2">
                {[...day.exercises]
                  .sort((a, b) => a.position - b.position)
                  .map((ex) => (
                    <li key={ex.id} className="flex items-center justify-between text-sm">
                      <span>{ex.exercise?.name_de ?? "—"}</span>
                      <span className="text-(--color-muted-foreground) tabular-nums">
                        {ex.target_sets} × {ex.target_reps} @ RIR {ex.target_rir}
                      </span>
                    </li>
                  ))}
              </ol>
            </CardContent>
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

      <div className="flex justify-end">
        <Link
          href="/training/setup"
          className="text-sm text-(--color-muted-foreground) hover:text-(--color-foreground)"
        >
          Plan neu generieren
        </Link>
      </div>
    </div>
  );
}
