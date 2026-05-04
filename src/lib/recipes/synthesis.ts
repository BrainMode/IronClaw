/**
 * Synthesis — der zentrale LLM-Call der ein ExtractionBundle in ein finales Rezept verwandelt.
 *
 * Input:  ExtractionBundle (mehrere RawSourceContents, Quellen-Metadaten)
 * Output: ExtractionResult (Rezept mit Per-Field-Provenance, oder Fehler)
 *
 * Wesentliche Verantwortung:
 * - Build context-prompt mit allen Sources, klar gelabelt
 * - LLM-Call (Opus 4.7 mit recipe-extraction.md system prompt)
 * - Zod-Validation des Outputs
 * - Bei Konflikt: Provenance-Field reflektiert "Konflikt mit ...: 240g vs 200g"
 *
 * Decision: SHORTCUT bei JSON-LD-Single-Recipe → wir bypass den LLM-Call ganz.
 * Bei MultipleRecipes auf Site → LLM kriegt sie und User wählt nachher in UI.
 */

import { MODELS, ai } from "@/lib/ai/client";
import { generateObject } from "ai";
import type { ExtractionBundle, RawSourceContent } from "./extraction-strategy";
import {
  type ExtractedRecipe,
  type ExtractionResult,
  extractionResultSchema,
  isExtractionError,
} from "./schema";

// =============================================================================
// PUBLIC API
// =============================================================================

export interface SynthesizeOptions {
  bundle: ExtractionBundle;
  /** User-Hint, z.B. "Großmutter's Rezept" — geht in den Prompt für Bias */
  userHint?: string;
  /** Override für Modell-Auswahl */
  model?: string;
}

/**
 * SHORTCUT: wenn ExtractionBundle ein JSON-LD-Recipe enthält und kein widersprüchliches
 * andere Quellen, baue Recipe direkt zusammen ohne LLM-Aufruf.
 */
export function trySynthesisShortcut(bundle: ExtractionBundle): ExtractedRecipe | null {
  const jsonldSource = bundle.sources.find((s) => s.type === "jsonld");
  if (!jsonldSource || typeof jsonldSource.content !== "object") return null;

  // Nur shortcut wenn es KEINE andere konkurrierenden Quellen gibt
  // (Description, Pinned Comment etc., die widersprechen könnten)
  const hasCompetingSources = bundle.sources.some((s) =>
    ["description", "pinned_comment", "caption", "transcript"].includes(s.type),
  );
  if (hasCompetingSources) return null;

  // Content sollte schon ein gemapptes Recipe sein (jsonld.ts macht das im web.ts Fetcher)
  // Wir vertrauen drauf — wenn unmapped, müsste hier mapJsonLdToRecipe noch laufen
  const recipe = jsonldSource.content as Partial<ExtractedRecipe>;

  if (!recipe.title || !recipe.ingredients || !recipe.steps) return null;

  // Provenance-Stamping
  const provenance = { source_type: "jsonld" as const, confidence: 0.95 };
  return {
    title: recipe.title,
    description: recipe.description,
    servings: recipe.servings ?? 2,
    prep_time_minutes: recipe.prep_time_minutes,
    cook_time_minutes: recipe.cook_time_minutes,
    ai_tags: recipe.ai_tags ?? [],
    equipment: recipe.equipment ?? [],
    ingredients: recipe.ingredients.map((i) => ({ ...i, provenance })),
    steps: recipe.steps.map((s) => ({ ...s, provenance })),
    extraction_confidence: 0.95,
    extraction_warnings: [],
    sources_used: ["jsonld"],
    source_language: recipe.source_language,
  };
}

/**
 * Hauptpfad: LLM kriegt das Bundle und macht synthesis.
 */
export async function synthesizeWithLlm(opts: SynthesizeOptions): Promise<ExtractionResult> {
  const systemPrompt = await loadRecipeExtractionPrompt();
  const userMessage = buildBundlePrompt(opts.bundle, opts.userHint);

  const result = await generateObject({
    model: ai(opts.model ?? MODELS.primary),
    system: systemPrompt,
    prompt: userMessage,
    schema: extractionResultSchema,
    maxRetries: 1,
  });

  return result.object;
}

/**
 * Top-Level: shortcut probieren, sonst LLM.
 */
export async function synthesize(opts: SynthesizeOptions): Promise<ExtractionResult> {
  const shortcut = trySynthesisShortcut(opts.bundle);
  if (shortcut) return shortcut;
  return synthesizeWithLlm(opts);
}

// =============================================================================
// PROMPT BUILDING
// =============================================================================

/**
 * Baut den User-Message Inhalt für den Synthesizer.
 * Format: jede Source als <source type="..."> Block mit Metadaten.
 *
 * Der LLM ist im System-Prompt instruiert wie er die Sources priorisiert.
 */
function buildBundlePrompt(bundle: ExtractionBundle, userHint?: string): string {
  const parts: string[] = [];

  parts.push("<bundle>");
  parts.push(`  <detected_type>${bundle.detected_type}</detected_type>`);
  if (bundle.primary_url) {
    parts.push(`  <primary_url>${escapeXml(bundle.primary_url)}</primary_url>`);
  }
  if (userHint) {
    parts.push(`  <user_hint>${escapeXml(userHint)}</user_hint>`);
  }

  for (const src of bundle.sources) {
    parts.push(formatSource(src));
  }

  parts.push("</bundle>");

  parts.push("");
  parts.push(
    "Synthesisiere das Rezept aus diesen Quellen. Befolge die Vertrauens-Hierarchie aus dem System-Prompt. " +
      "Bei Konflikten: vermerke sie in der Provenance des betreffenden Felds. " +
      "Wenn keine Quelle ein Rezept enthält: returniere `{error: 'no_recipe_found', reason: '...'}`.",
  );

  return parts.join("\n");
}

function formatSource(src: RawSourceContent): string {
  const meta = [
    src.metadata.url ? `url="${escapeXml(src.metadata.url)}"` : null,
    src.metadata.language ? `language="${src.metadata.language}"` : null,
    src.metadata.notes ? `notes="${escapeXml(src.metadata.notes)}"` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const content =
    typeof src.content === "string" ? src.content : JSON.stringify(src.content, null, 2);

  return `  <source type="${src.type}" ${meta}>
${escapeXml(content)}
  </source>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Lädt den System-Prompt aus dem Markdown-File.
 * Implementation: bei Build via Vite/Webpack inlinen (`?raw` import).
 * Hier: read at runtime — Claude Code muss eine sinnvolle Variante wählen.
 */
let cachedPrompt: string | null = null;
async function loadRecipeExtractionPrompt(): Promise<string> {
  if (cachedPrompt) return cachedPrompt;
  // Server-side only — Next.js bundles fs into the route handler.
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const promptPath = path.join(process.cwd(), "src/lib/ai/prompts/recipe-extraction.md");
  cachedPrompt = await readFile(promptPath, "utf8");
  return cachedPrompt;
}

// Re-export for convenience
export { isExtractionError };
