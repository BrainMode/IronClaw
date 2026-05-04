import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function RecipesPage() {
  const supabase = await createClient();
  const { data: recipes } = await supabase
    .from("recipes")
    .select(
      "id, title, description, source_type, source_url, prep_time_minutes, cook_time_minutes, ai_tags, kcal_per_serving, protein_g_per_serving, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Rezepte</h2>
          <p className="text-(--color-muted-foreground)">
            {recipes?.length ?? 0} im Haushalt-Katalog
          </p>
        </div>
        <Button asChild>
          <Link href="/recipes/import">+ Importieren</Link>
        </Button>
      </div>

      {!recipes || recipes.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Noch leer</CardTitle>
            <CardDescription>
              Wirf deine erste Recipe-URL rein (chefkoch.de, bettybossi.ch, etc.) — bei Sites mit
              JSON-LD-Recipe-Schema (80%+) extrahieren wir ohne LLM-Cost in Sekunden.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full" size="lg">
              <Link href="/recipes/import">Erstes Rezept importieren</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {recipes.map((r) => {
            const totalMin = (r.prep_time_minutes ?? 0) + (r.cook_time_minutes ?? 0);
            return (
              <Link key={r.id} href={`/recipes/${r.id}`} className="block">
                <Card className="hover:bg-(--color-accent) transition-colors">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{r.title}</div>
                        <div className="text-sm text-(--color-muted-foreground) line-clamp-1">
                          {r.description ?? r.source_url ?? r.source_type}
                        </div>
                        {r.ai_tags && r.ai_tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {r.ai_tags.slice(0, 4).map((t: string) => (
                              <span
                                key={t}
                                className="text-xs bg-(--color-secondary) text-(--color-secondary-foreground) px-2 py-0.5 rounded"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-(--color-muted-foreground) tabular-nums whitespace-nowrap text-right">
                        {totalMin > 0 && <div>{totalMin} min</div>}
                        {r.kcal_per_serving && (
                          <div>{Math.round(Number(r.kcal_per_serving))} kcal</div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
