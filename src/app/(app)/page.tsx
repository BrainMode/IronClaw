import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getAllActivePlans } from "@/lib/training/queries";
import Link from "next/link";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const plans = await getAllActivePlans();
  const planCount = plans.filter((p) => p.plan !== null).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Heute</h2>
        <p className="text-(--color-muted-foreground)">
          Willkommen zurück, {user?.email?.split("@")[0] ?? "Athlet"}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/training" className="block">
          <Card className="hover:bg-(--color-accent) transition-colors h-full">
            <CardHeader>
              <CardTitle>Training</CardTitle>
              <CardDescription>
                {planCount > 0
                  ? `${planCount} aktive ${planCount === 1 ? "Plan" : "Pläne"} verfügbar`
                  : "Noch kein Plan — Setup starten"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-(--color-muted-foreground)">
                {planCount > 0
                  ? "Starte deine nächste Session."
                  : "Definiere Equipment + generiere Iron Mike Plan."}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/nutrition" className="block">
          <Card className="hover:bg-(--color-accent) transition-colors h-full">
            <CardHeader>
              <CardTitle>Ernährung</CardTitle>
              <CardDescription>Heute noch nichts geloggt.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-(--color-muted-foreground)">
                Macro-Targets erst setzen — dann zeigt sich hier dein Tagesfortschritt.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
