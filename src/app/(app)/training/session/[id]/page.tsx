import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionWithSets } from "@/lib/training/queries";
import { notFound } from "next/navigation";
import { SessionLogger } from "./session-logger";

interface SessionPageProps {
  params: Promise<{ id: string }>;
}

export default async function SessionPage({ params }: SessionPageProps) {
  const { id } = await params;
  const result = await getSessionWithSets(id);
  if (!result) notFound();

  const { session, sets } = result;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{session.day_name ?? "Session"}</h2>
        <p className="text-(--color-muted-foreground)">
          Gestartet:{" "}
          {new Date(session.started_at).toLocaleString("de-CH", {
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {session.ended_at && " · Beendet"}
        </p>
      </div>

      {session.ended_at ? (
        <Card>
          <CardHeader>
            <CardTitle>Session beendet</CardTitle>
            <CardDescription>
              {sets.length} Sätze geloggt. Bereit für die nächste Einheit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {sets
              .filter((s) => s.set_type === "working")
              .map((s) => (
                <div
                  key={s.id}
                  className="flex justify-between text-sm tabular-nums border-b border-(--color-border) py-1.5 last:border-0"
                >
                  <span className="text-(--color-muted-foreground)">
                    {s.exercise_id.slice(0, 8)}
                  </span>
                  <span>
                    {s.weight_kg} kg × {s.reps} @ RIR {s.rir ?? "-"}
                  </span>
                </div>
              ))}
          </CardContent>
        </Card>
      ) : (
        <SessionLogger
          sessionId={session.id}
          planExercises={session.plan_exercises}
          existingSets={sets}
        />
      )}
    </div>
  );
}
