import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getRecentSessions } from "@/lib/training/queries";
import Link from "next/link";

export default async function HistoryPage() {
  const sessions = await getRecentSessions(50);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Training-Verlauf</h2>
        <p className="text-(--color-muted-foreground)">Letzte {sessions.length} Sessions.</p>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Noch nichts geloggt</CardTitle>
            <CardDescription>
              Sobald du deine erste Session abgeschlossen hast, taucht sie hier auf.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <Link key={s.id} href={`/training/session/${s.id}`} className="block">
              <Card className="hover:bg-(--color-accent) transition-colors">
                <CardContent className="py-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{s.day_name ?? "Session"}</div>
                    <div className="text-sm text-(--color-muted-foreground)">
                      {new Date(s.started_at).toLocaleDateString("de-CH", {
                        weekday: "short",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                      {s.duration_minutes ? ` · ${Math.round(s.duration_minutes)} min` : ""}
                      {s.ended_at ? "" : " · läuft noch"}
                    </div>
                  </div>
                  <div className="text-(--color-muted-foreground) text-sm">→</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
