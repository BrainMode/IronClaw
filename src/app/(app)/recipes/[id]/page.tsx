import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

interface RecipeDetailPageProps {
  params: Promise<{ id: string }>;
}

interface ProvenanceJson {
  source_type?: string;
  confidence?: number;
  note?: string;
}

export default async function RecipeDetailPage({ params }: RecipeDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: recipe } = await supabase
    .from("recipes")
    .select(
      "id, title, description, source_type, source_url, servings_default, prep_time_minutes, cook_time_minutes, ai_tags, computed_tags, user_tags, kcal_per_serving, protein_g_per_serving, carbs_g_per_serving, fat_g_per_serving, notes, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!recipe) notFound();

  const { data: ingredients } = await supabase
    .from("recipe_ingredients")
    .select("id, position, name, amount, unit, notes, provenance")
    .eq("recipe_id", id)
    .order("position");

  const { data: steps } = await supabase
    .from("recipe_steps")
    .select("id, position, instruction, duration_minutes, provenance")
    .eq("recipe_id", id)
    .order("position");

  const allTags = [
    ...(recipe.ai_tags ?? []),
    ...(recipe.computed_tags ?? []),
    ...(recipe.user_tags ?? []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/recipes"
          className="text-sm text-(--color-muted-foreground) hover:text-(--color-foreground)"
        >
          ← Rezepte
        </Link>
        <h2 className="text-3xl font-bold tracking-tight mt-2">{recipe.title}</h2>
        {recipe.description && (
          <p className="text-(--color-muted-foreground) mt-1">{recipe.description}</p>
        )}
        <div className="flex flex-wrap gap-2 mt-3 text-xs text-(--color-muted-foreground)">
          <span>{recipe.servings_default} Portionen</span>
          {recipe.prep_time_minutes != null && <span>· {recipe.prep_time_minutes} min Prep</span>}
          {recipe.cook_time_minutes != null && <span>· {recipe.cook_time_minutes} min Cook</span>}
          {recipe.kcal_per_serving != null && (
            <span>· {Math.round(Number(recipe.kcal_per_serving))} kcal/Portion</span>
          )}
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {allTags.map((t: string) => (
            <span
              key={t}
              className="text-xs bg-(--color-secondary) text-(--color-secondary-foreground) px-2 py-0.5 rounded"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zutaten</CardTitle>
          <CardDescription>{ingredients?.length ?? 0} Stück</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {(ingredients ?? []).map((ing) => {
              const prov = ing.provenance as ProvenanceJson | null;
              return (
                <li
                  key={ing.id}
                  className="flex justify-between border-b border-(--color-border) py-1.5"
                >
                  <span>
                    {ing.amount && ing.unit ? (
                      <span className="tabular-nums text-(--color-muted-foreground) mr-2">
                        {ing.amount} {ing.unit}
                      </span>
                    ) : ing.amount ? (
                      <span className="tabular-nums text-(--color-muted-foreground) mr-2">
                        {ing.amount}
                      </span>
                    ) : null}
                    {ing.name}
                    {ing.notes && (
                      <span className="text-xs text-(--color-muted-foreground) italic ml-1">
                        ({ing.notes})
                      </span>
                    )}
                  </span>
                  {prov?.source_type && (
                    <span
                      className="text-xs text-(--color-muted-foreground) shrink-0 ml-2"
                      title={prov.note ?? ""}
                    >
                      {prov.source_type}
                      {prov.confidence != null && ` · ${(prov.confidence * 100).toFixed(0)}%`}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zubereitung</CardTitle>
          <CardDescription>{steps?.length ?? 0} Schritte</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm list-decimal pl-5">
            {(steps ?? []).map((s) => (
              <li key={s.id}>
                {s.instruction}
                {s.duration_minutes && (
                  <span className="text-xs text-(--color-muted-foreground) ml-2">
                    ({s.duration_minutes} min)
                  </span>
                )}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {recipe.source_url && (
        <p className="text-xs text-(--color-muted-foreground)">
          Quelle:{" "}
          <a
            href={recipe.source_url}
            target="_blank"
            rel="noreferrer noopener"
            className="underline"
          >
            {recipe.source_url}
          </a>
        </p>
      )}

      <div className="flex justify-end">
        <Button asChild variant="outline">
          <Link href="/recipes">Zurück</Link>
        </Button>
      </div>
    </div>
  );
}
