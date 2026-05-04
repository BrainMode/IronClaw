import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Heute</h2>
        <p className="text-(--color-muted-foreground)">
          Willkommen zurück, {user?.email?.split("@")[0] ?? "Athlet"}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Training</CardTitle>
            <CardDescription>Heute kein Plan aktiv.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-(--color-muted-foreground)">
              Sobald du im Training-Modul einen Plan setupst, erscheint hier deine nächste Session.
            </p>
          </CardContent>
        </Card>

        <Card>
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
      </div>
    </div>
  );
}
