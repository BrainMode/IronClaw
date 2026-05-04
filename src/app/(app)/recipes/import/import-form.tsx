"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ExtractionBundle } from "@/lib/recipes/extraction-strategy";
import type { ExtractedRecipe, ExtractionError, ExtractionResult } from "@/lib/recipes/schema";
import type { DetectedSourceType } from "@/lib/recipes/sources/detector";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveRecipe } from "../actions";

function isError(r: ExtractionResult): r is ExtractionError {
  return "error" in r;
}
function isMultiple(
  r: ExtractionResult,
): r is { multiple: true; recipes: ExtractedRecipe[]; source_url?: string } {
  return "multiple" in r && (r as { multiple: boolean }).multiple === true;
}

export function ImportForm() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [userHint, setUserHint] = useState("");
  const [isExtracting, setExtracting] = useTransition();
  const [isSaving, setSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<{
    result: ExtractionResult;
    bundle: ExtractionBundle;
  } | null>(null);

  function onExtract(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setError(null);
    setExtracted(null);
    setExtracting(async () => {
      try {
        const res = await fetch("/api/recipes/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: input.trim(), userHint: userHint.trim() || undefined }),
        });
        const json = await res.json();
        if (!json.ok) {
          setError(json.error ?? "Extraction fehlgeschlagen.");
          return;
        }
        setExtracted({ result: json.result, bundle: json.bundle });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Netzwerk-Fehler.");
      }
    });
  }

  function onSave() {
    if (!extracted || isError(extracted.result)) return;
    if (isMultiple(extracted.result)) {
      setError("Multiple-Recipe-Auswahl noch nicht implementiert.");
      return;
    }
    setError(null);
    const recipe = extracted.result;
    const bundle = extracted.bundle;
    setSaving(async () => {
      const res = await saveRecipe({
        recipe,
        detectedType: bundle.detected_type as DetectedSourceType,
        sourceUrl: bundle.primary_url,
        sourceRawContent: { fetch_log: bundle.fetch_log },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/recipes/${res.recipeId}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Quelle</CardTitle>
          <CardDescription>
            Wirf URL oder Plain-Text rein. App erkennt JSON-LD bei den meisten Recipe-Blogs und
            extrahiert ohne LLM-Cost.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onExtract}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="input">URL oder Recipe-Text</Label>
              <Input
                id="input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="https://www.chefkoch.de/rezepte/... oder Plain-Text Rezept"
                disabled={isExtracting}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hint">Hinweis für KI (optional)</Label>
              <Input
                id="hint"
                value={userHint}
                onChange={(e) => setUserHint(e.target.value)}
                placeholder="z.B. 'Großmutter's Variante mit weniger Salz'"
                disabled={isExtracting}
              />
            </div>
            {error && (
              <p className="text-sm text-(--color-destructive)" role="alert">
                {error}
              </p>
            )}
          </CardContent>
          <CardContent>
            <Button
              type="submit"
              disabled={isExtracting || !input.trim()}
              className="w-full"
              size="lg"
            >
              {isExtracting ? "Extrahiere…" : "Rezept extrahieren"}
            </Button>
          </CardContent>
        </form>
      </Card>

      {/* Fetch log */}
      {extracted?.bundle?.fetch_log && extracted.bundle.fetch_log.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline</CardTitle>
            <CardDescription>{extracted.bundle.detected_type}</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1 text-sm">
              {extracted.bundle.fetch_log.map((step, i) => (
                <li
                  key={`${step.step}-${i}`}
                  className="flex justify-between text-(--color-muted-foreground)"
                >
                  <span>{step.step.replace(/_/g, " ")}</span>
                  <span
                    className={cn(
                      step.status === "done" && "text-(--color-success)",
                      step.status === "failed" && "text-(--color-destructive)",
                    )}
                  >
                    {step.status}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Preview + save */}
      {extracted && renderResult(extracted.result, onSave, isSaving)}
    </div>
  );
}

function renderResult(result: ExtractionResult, onSave: () => void, isSaving: boolean) {
  if (isError(result)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-(--color-destructive)">
            {result.error.replace(/_/g, " ")}
          </CardTitle>
          <CardDescription>{result.reason}</CardDescription>
        </CardHeader>
        {result.user_suggestion && (
          <CardContent>
            <p className="text-sm">{result.user_suggestion}</p>
          </CardContent>
        )}
      </Card>
    );
  }
  if (isMultiple(result)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mehrere Rezepte gefunden</CardTitle>
          <CardDescription>
            Auswahl-UI folgt — aktuell nimm den ersten Recipe via Plain-Text-Eingabe.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return <RecipePreview recipe={result} onSave={onSave} isSaving={isSaving} />;
}

function RecipePreview({
  recipe,
  onSave,
  isSaving,
}: {
  recipe: ExtractedRecipe;
  onSave: () => void;
  isSaving: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{recipe.title}</CardTitle>
        {recipe.description && <CardDescription>{recipe.description}</CardDescription>}
        <div className="flex flex-wrap gap-2 mt-2 text-xs text-(--color-muted-foreground)">
          <span>{recipe.servings} Portionen</span>
          {recipe.prep_time_minutes != null && <span>· {recipe.prep_time_minutes} min Prep</span>}
          {recipe.cook_time_minutes != null && <span>· {recipe.cook_time_minutes} min Cook</span>}
          <span>· Confidence {(recipe.extraction_confidence * 100).toFixed(0)}%</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {recipe.ai_tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {recipe.ai_tags.map((t) => (
              <span
                key={t}
                className="text-xs bg-(--color-secondary) text-(--color-secondary-foreground) px-2 py-0.5 rounded"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <div>
          <h3 className="font-semibold mb-2">Zutaten ({recipe.ingredients.length})</h3>
          <ul className="space-y-1 text-sm">
            {recipe.ingredients.map((ing, i) => (
              <li
                key={`${ing.name}-${i}`}
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
                <span className="text-xs text-(--color-muted-foreground) shrink-0 ml-2">
                  {ing.provenance.source_type}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-semibold mb-2">Zubereitung ({recipe.steps.length} Schritte)</h3>
          <ol className="space-y-2 text-sm list-decimal pl-5">
            {recipe.steps.map((s, i) => (
              <li key={`step-${i}-${s.instruction.slice(0, 20)}`}>
                {s.instruction}
                {s.duration_minutes && (
                  <span className="text-xs text-(--color-muted-foreground) ml-2">
                    ({s.duration_minutes} min)
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>

        {recipe.extraction_warnings.length > 0 && (
          <div className="bg-(--color-muted) p-3 rounded text-sm">
            <div className="font-medium mb-1">Hinweise</div>
            <ul className="list-disc pl-4 space-y-0.5 text-(--color-muted-foreground)">
              {recipe.extraction_warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
      <CardContent>
        <Button onClick={onSave} disabled={isSaving} className="w-full" size="lg">
          {isSaving ? "Speichere…" : "In Bibliothek speichern"}
        </Button>
      </CardContent>
    </Card>
  );
}
