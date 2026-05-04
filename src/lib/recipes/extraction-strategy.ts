import type { ExtractionResult, SourceType } from "./schema";
import type { DetectedSourceType } from "./sources/detector";

// =============================================================================
// CORE TYPES
// =============================================================================

/**
 * Eine Roh-Quelle die ein Source-Fetcher gesammelt hat.
 * Mehrere RawSourceContents werden vom Synthesizer kombiniert.
 */
export interface RawSourceContent {
  type: SourceType;
  /** Der eigentliche Inhalt — Text oder strukturiertes Object (für JSON-LD) */
  content: string | Record<string, unknown>;
  metadata: {
    /** Original-URL der Quelle */
    url?: string;
    /** Zeitpunkt des Fetch */
    fetched_at: string;
    /** Länge in Zeichen (für Cost-Schätzung + UI) */
    char_count?: number;
    /** Erkannte Sprache der Quelle */
    language?: string;
    /** Free-text Notizen, z.B. "auto-generated captions" */
    notes?: string;
    /** Pinned-Comment-Score wenn type='pinned_comment' */
    confidence_hint?: number;
  };
}

/**
 * Ein Eintrag im Progress-Log. UI rendert das als Liste mit Spinnern.
 */
export interface FetchLogEntry {
  step: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  started_at?: string;
  finished_at?: string;
  message?: string;
  /** Optional: emoji für UI-Lazy-Display */
  emoji?: string;
}

export interface ExtractionBundle {
  primary_url?: string;
  detected_type: DetectedSourceType;
  sources: RawSourceContent[];
  fetch_log: FetchLogEntry[];
  /** Hint für Synthesizer wenn JSON-LD gefunden wurde */
  has_jsonld_recipe?: boolean;
}

// =============================================================================
// PUBLIC API
// =============================================================================

export interface RunExtractionInput {
  input: string; // URL or plain text
  isImage?: boolean;
  imagePath?: string;
  userHint?: string;
  jobId: string;
  userId: string;
  householdId: string;
}

export interface RunExtractionResult {
  jobId: string;
  result: ExtractionResult;
  bundle: ExtractionBundle;
}

/**
 * Führt die komplette Pipeline aus für einen Job.
 *
 * Implementation-Plan:
 *
 * ```
 * 1. updateJob(jobId, { status: 'detecting', progress: [{step: 'detect_source', status: 'running'}] })
 *
 * 2. const detected = await detectSource({ input, isImage })
 *    updateJob(jobId, { detected_source_type: detected.type, ... })
 *
 * 3. Check Idempotenz-Cache:
 *    const cached = await findCachedJob(input_hash)
 *    if (cached && cached.created_at within 30d) → return cached.result
 *
 * 4. Source-Fetcher dispatchen:
 *    switch (detected.type) {
 *      case 'youtube_video':
 *      case 'youtube_shorts':
 *        bundle = await fetchYoutube({ url: detected.canonical_url!, ... })
 *      case 'instagram_post':
 *      case 'instagram_reel':
 *      case 'instagram_carousel':
 *        bundle = await fetchInstagram({ url, type })
 *      case 'tiktok':
 *        bundle = await fetchTiktok({ url })
 *      case 'facebook_*':
 *        bundle = await fetchFacebook({ url, type })
 *      case 'pinterest':
 *        result = await fetchPinterest({ url })
 *        if (result.resolved_url) → recurse with new URL
 *      case 'web_url':
 *        bundle = await fetchWebUrl({ url })
 *        if (bundle.jsonld_recipes && bundle.jsonld_recipes.length === 1) → SHORTCUT, kein LLM nötig
 *      case 'image_upload':
 *        bundle = await fetchImage({ imagePath })
 *      case 'manual_text':
 *        bundle = { sources: [{ type: 'manual', content: input, ... }], fetch_log: [...] }
 *      case 'unsupported':
 *      case 'youtube_playlist':
 *        return error
 *    }
 *    Stream Progress-Events vom Fetcher → in jobs.progress
 *
 * 5. updateJob(jobId, { status: 'synthesizing', sources: bundle.sources })
 *
 * 6. SHORTCUT-PFAD: wenn JSON-LD-only und genau ein Recipe gefunden:
 *      Apply provenance (alle Felder bekommen { source_type: 'jsonld', confidence: 0.95 })
 *      Skip LLM-Call. Direkt persisten.
 *
 *    NORMAL-PFAD: synthesize(bundle) → ExtractionResult
 *      - Build mega-prompt (siehe synthesis.ts)
 *      - generateObject mit recipe-extraction.md prompt + extractedRecipeSchema
 *      - LLM kriegt alle Sources gleichzeitig, entscheidet welche zu trauen
 *
 * 7. Validate via extractionResultSchema. Bei Fail → retry once mit explizitem Fehler-Hinweis.
 *
 * 8. updateJob(jobId, {
 *      status: isExtractionError(result) ? 'failed' : 'awaiting_user',
 *      result: result,
 *    })
 *
 * 9. UI zeigt Recipe mit Provenance-Badges, User editiert/bestätigt.
 *
 * 10. On confirm: persistRecipe(...) → Migros-Lookup async im Hintergrund
 *     updateJob(status: 'done', created_recipe_id: ...)
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function runExtraction(_input: RunExtractionInput): Promise<RunExtractionResult> {
  throw new Error(
    "Not implemented — Claude Code: this is the orchestrator. Implement step-by-step per the docstring.",
  );
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * SHA256-Hash des Input-Payloads für Idempotenz-Cache.
 */
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

/**
 * Append progress entry. UI subscribt via Supabase Realtime auf jobs-Updates.
 */
export function appendProgress(log: FetchLogEntry[], entry: FetchLogEntry): FetchLogEntry[] {
  return [...log, { ...entry, started_at: entry.started_at ?? new Date().toISOString() }];
}

/**
 * Für jeden Source-Type: Default-Confidence-Score der zur Provenance gemappt wird.
 * Synthesizer kann das per Source-Quality anpassen (z.B. auto-generated captions niedriger).
 */
export const SOURCE_CONFIDENCE_DEFAULTS: Record<SourceType, number> = {
  jsonld: 0.95,
  microdata: 0.85,
  description: 0.85,
  pinned_comment: 0.85,
  caption: 0.8,
  manual: 0.9,
  linked_page: 0.9, // weil Recipe-Blog wahrscheinlich JSON-LD hatte
  firecrawl_markdown: 0.7,
  image_ocr: 0.65,
  transcript_chapter: 0.6,
  transcript: 0.55,
};
