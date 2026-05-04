import type { ExtractionResult } from "@/lib/recipes/schema";

export interface ExtractFromUrlOptions {
  url: string;
  /** Verwende Opus 4.7 statt Gemini? Default: false (Cost). */
  useHighQualityModel?: boolean;
}

export async function extractRecipeFromUrl(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _opts: ExtractFromUrlOptions,
): Promise<ExtractionResult> {
  throw new Error(
    "Not implemented — Claude Code: implement Firecrawl scrape + LLM extract pipeline",
  );
}
