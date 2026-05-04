import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NutritionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Ernährung</h2>
        <p className="text-(--color-muted-foreground)">Macro-Tracking + Quick-Log.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Phase 5</CardTitle>
          <CardDescription>Nutrition-Modul folgt nach Recipes (Phase 4).</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-(--color-muted-foreground)">
            Geplant: Barcode-Scanner (Open Food Facts), Photo-Calorie-Estimation (Vision-LLM),
            Manual-Log, Macro-Ringe gegen Daily Targets, Recipes als Mahlzeit-Source.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
