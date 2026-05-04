/**
 * Recipe Import — Public-API-Wrapper.
 *
 * Dünner Wrapper um die echte Multi-Source-Pipeline in extraction-strategy.ts.
 * Bietet zwei Einstiegspunkte:
 *   - startImport(): asynchron, kreiert Job, returnt jobId sofort
 *   - awaitImport(): blockiert bis Job fertig (für Tests / sync Pfade)
 *
 * Frontend nutzt typischerweise startImport() + Supabase-Realtime-Subscription
 * auf den Job für Live-Progress.
 *
 * Siehe docs/RECIPE_IMPORT.md für Pipeline-Details.
 */

import { hashInput, runExtraction } from "./extraction-strategy";
import type { ExtractionResult } from "./schema";

export interface StartImportInput {
  /** Was der User reinwirft: URL, Plain-Text, oder Hinweis dass image_path gesetzt ist */
  input: string;
  /** Wenn ein Bild hochgeladen wurde, der Pfad (Supabase Storage oder lokal) */
  imagePath?: string;
  /** Optional: User-Hint für Synthesizer */
  userHint?: string;
  userId: string;
  householdId: string;
}

export interface StartImportResult {
  jobId: string;
  /** Wenn Cache-Hit: result direkt verfügbar, kein Wait nötig */
  cachedResult?: ExtractionResult;
}

/**
 * Startet einen Import-Job. UI subscribt nachher auf Job-Updates via Supabase Realtime.
 *
 * Implementation-Plan:
 *
 *   1. const inputHash = await hashInput({ input, imagePath })
 *   2. Cache-Check: SELECT * FROM recipe_extraction_jobs
 *                   WHERE input_hash = $1 AND status = 'done'
 *                   AND created_at > now() - interval '30 days'
 *      → wenn Hit: return { jobId: cached.id, cachedResult: cached.result }
 *   3. Cache-Miss: INSERT INTO recipe_extraction_jobs (...) VALUES (...) RETURNING id
 *   4. Trigger: runExtraction({ jobId, ... }).catch(err => updateJob(failed))
 *      WICHTIG: nicht awaiten — sofort zurückkehren
 *   5. return { jobId }
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function startImport(_input: StartImportInput): Promise<StartImportResult> {
  throw new Error(
    "Not implemented — Claude Code: see docstring. Insert job, fire-and-forget runExtraction, return jobId.",
  );
}

/**
 * Sync-Variante. Hauptsächlich für Tests / Server-Skripte.
 * Frontend sollte startImport + Realtime nutzen.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function awaitImport(_input: StartImportInput): Promise<ExtractionResult> {
  throw new Error("Not implemented — Claude Code: thin wrapper über startImport + poll");
}

export { hashInput, runExtraction };
