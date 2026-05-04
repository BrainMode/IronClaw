/**
 * Recipe Import — public-API wrapper around extraction-strategy.
 *
 * v1: synchronous path. Caller awaits the full extraction. Job persistence
 * happens on save (separate server action). For long-running sources
 * (YouTube audio transcription) we'll switch to async + polling in v2.
 */

import { type RunExtractionResult, hashInput, runExtraction } from "./extraction-strategy";

export interface StartImportInput {
  input: string;
  imagePath?: string;
  userHint?: string;
}

export async function extractRecipe(input: StartImportInput): Promise<RunExtractionResult> {
  return runExtraction({
    input: input.input,
    imagePath: input.imagePath,
    userHint: input.userHint,
  });
}

export { hashInput, runExtraction };
export type { RunExtractionResult };
