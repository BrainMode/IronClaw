/**
 * Pipeline-Orchestrator. Nimmt User-Input (URL / Plain-Text / Image-Path),
 * detects source-type, dispatch zur richtigen Fetcher-Strategy, builds bundle,
 * runs synthesis. Returns ExtractionResult.
 *
 * v1: nur Web-URL und Manual-Text. YouTube/Instagram/TikTok/Image folgen in
 * separaten PRs (Phase 4b/c).
 */

import type {
  ExtractedIngredient,
  ExtractedRecipe,
  ExtractedStep,
  ExtractionResult,
  SourceType,
} from "./schema";
import { type DetectedSourceType, detectSource } from "./sources/detector";
import { fetchWebUrl } from "./sources/web";
import { synthesize, synthesizeWithLlm } from "./synthesis";

/** A JSON-LD-mapped recipe before per-field provenance gets stamped on. */
export type MappedJsonLdRecipe = Omit<ExtractedRecipe, "ingredients" | "steps"> & {
  ingredients: Omit<ExtractedIngredient, "provenance">[];
  steps: Omit<ExtractedStep, "provenance">[];
};

// =============================================================================
// CORE TYPES
// =============================================================================

export interface RawSourceContent {
  type: SourceType;
  content: string | Record<string, unknown>;
  metadata: {
    url?: string;
    fetched_at: string;
    char_count?: number;
    language?: string;
    notes?: string;
    confidence_hint?: number;
  };
}

export interface FetchLogEntry {
  step: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  started_at?: string;
  finished_at?: string;
  message?: string;
  emoji?: string;
}

export interface ExtractionBundle {
  primary_url?: string;
  detected_type: DetectedSourceType;
  sources: RawSourceContent[];
  fetch_log: FetchLogEntry[];
  has_jsonld_recipe?: boolean;
  /** JSON-LD recipes that have been pre-mapped to our format —
   *  if exactly one, the orchestrator can shortcut the LLM call. */
  jsonld_mapped_recipes?: MappedJsonLdRecipe[];
}

// =============================================================================
// PUBLIC API
// =============================================================================

export interface RunExtractionInput {
  input: string;
  isImage?: boolean;
  imagePath?: string;
  userHint?: string;
  /** Optional: für Job-Tracking. v1 ist synchronous, kein Job-System aktiv. */
  jobId?: string;
  userId?: string;
  householdId?: string;
}

export interface RunExtractionResult {
  result: ExtractionResult;
  bundle: ExtractionBundle;
}

export async function runExtraction(input: RunExtractionInput): Promise<RunExtractionResult> {
  const fetchLog: FetchLogEntry[] = [];
  const startedAt = new Date().toISOString();

  // 1. Detect
  fetchLog.push({ step: "detect_source", status: "running", started_at: startedAt });
  const detected = await detectSource({ input: input.input, isImage: input.isImage });
  const last = fetchLog[fetchLog.length - 1];
  if (last) {
    last.status = "done";
    last.finished_at = new Date().toISOString();
  }

  // 2. Dispatch
  switch (detected.type) {
    case "web_url": {
      if (!detected.canonical_url) {
        return errorBundle(detected.type, fetchLog, "no_recipe_found", "URL fehlt.");
      }
      const fetchResult = await fetchWebUrl({
        url: detected.canonical_url,
        onProgress: (e) => {
          fetchLog.push({
            step: e.step,
            status: e.status === "running" ? "running" : e.status,
            started_at: new Date().toISOString(),
          });
        },
      });

      if (fetchResult.fatal_error) {
        return errorBundle(
          detected.type,
          fetchLog,
          "source_unreachable",
          fetchResult.fatal_error.reason,
          fetchResult.fatal_error.user_suggestion,
        );
      }

      const bundle: ExtractionBundle = {
        primary_url: detected.canonical_url,
        detected_type: detected.type,
        sources: fetchResult.sources,
        fetch_log: fetchLog,
        has_jsonld_recipe: (fetchResult.jsonld_recipes?.length ?? 0) > 0,
        jsonld_mapped_recipes: fetchResult.jsonld_recipes,
      };

      // SHORTCUT: exactly one JSON-LD recipe found, no markdown fallback active
      const onlyJsonLd =
        fetchResult.jsonld_recipes &&
        fetchResult.jsonld_recipes.length === 1 &&
        !bundle.sources.some((s) => s.type === "firecrawl_markdown");

      if (onlyJsonLd) {
        const mapped = fetchResult.jsonld_recipes![0]!;
        const result = applyJsonLdProvenance(mapped, fetchResult.partial);
        return { result, bundle };
      }

      // SLOW PATH: LLM-Synthesis
      const result = await synthesizeWithLlm({ bundle, userHint: input.userHint });
      return { result, bundle };
    }

    case "manual_text": {
      const bundle: ExtractionBundle = {
        detected_type: detected.type,
        sources: [
          {
            type: "manual",
            content: input.input,
            metadata: {
              fetched_at: new Date().toISOString(),
              char_count: input.input.length,
            },
          },
        ],
        fetch_log: fetchLog,
      };
      const result = await synthesize({ bundle, userHint: input.userHint });
      return { result, bundle };
    }

    case "youtube_video":
    case "youtube_shorts":
    case "youtube_playlist":
    case "instagram_post":
    case "instagram_reel":
    case "instagram_carousel":
    case "instagram_story":
    case "tiktok":
    case "facebook_post":
    case "facebook_video":
    case "facebook_reel":
    case "pinterest":
    case "image_upload":
      return errorBundle(
        detected.type,
        fetchLog,
        "unsupported_source",
        `${detected.type} folgt in einem späteren Update — aktuell nur Web-URLs und Plain-Text.`,
        "Kopier den Recipe-Text als Plain-Text hier rein und ich extrahier ihn.",
      );

    case "unsupported":
      return errorBundle(
        detected.type,
        fetchLog,
        "unsupported_source",
        "Diese Quelle wird nicht unterstützt.",
      );
  }
}

function errorBundle(
  detectedType: DetectedSourceType,
  fetchLog: FetchLogEntry[],
  errorCode: "no_recipe_found" | "source_unreachable" | "unsupported_source" | "extraction_failed",
  reason: string,
  userSuggestion?: string,
): RunExtractionResult {
  return {
    result: {
      error: errorCode,
      reason,
      user_suggestion: userSuggestion,
    },
    bundle: {
      detected_type: detectedType,
      sources: [],
      fetch_log: fetchLog,
    },
  };
}

function applyJsonLdProvenance(
  mapped: MappedJsonLdRecipe,
  partial: boolean | undefined,
): ExtractionResult {
  if (!mapped.title || !mapped.ingredients || !mapped.steps) {
    return {
      error: "no_recipe_found",
      reason: "JSON-LD Recipe ist unvollständig (Title/Ingredients/Steps fehlen).",
    };
  }
  const provenance = { source_type: "jsonld" as const, confidence: 0.95 };
  return {
    title: mapped.title,
    description: mapped.description,
    servings: mapped.servings ?? 2,
    prep_time_minutes: mapped.prep_time_minutes,
    cook_time_minutes: mapped.cook_time_minutes,
    ai_tags: mapped.ai_tags ?? [],
    equipment: mapped.equipment ?? [],
    ingredients: mapped.ingredients.map((i) => ({ ...i, provenance })),
    steps: mapped.steps.map((s) => ({ ...s, provenance })),
    extraction_confidence: 0.95,
    extraction_warnings: partial ? ["Site hatte Paywall — Anleitung möglicherweise gekürzt."] : [],
    sources_used: ["jsonld"],
    source_language: mapped.source_language,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

export async function hashInput(input: RunExtractionInput): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(
    JSON.stringify({
      input: input.input,
      isImage: input.isImage,
      imagePath: input.imagePath,
    }),
  );
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function appendProgress(log: FetchLogEntry[], entry: FetchLogEntry): FetchLogEntry[] {
  return [...log, { ...entry, started_at: entry.started_at ?? new Date().toISOString() }];
}

export const SOURCE_CONFIDENCE_DEFAULTS: Record<SourceType, number> = {
  jsonld: 0.95,
  microdata: 0.85,
  description: 0.85,
  pinned_comment: 0.85,
  caption: 0.8,
  manual: 0.9,
  linked_page: 0.9,
  firecrawl_markdown: 0.7,
  image_ocr: 0.65,
  transcript_chapter: 0.6,
  transcript: 0.55,
};
