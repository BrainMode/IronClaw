/**
 * POST /api/recipes/import
 *
 * Body: { input: string; userHint?: string }
 *
 * Synchronously runs the extraction pipeline and returns:
 *   - { ok: true, result: ExtractionResult, bundle: ExtractionBundle }
 *   - { ok: false, error: string }
 *
 * v1 ist synchron — Vercel-Pro 60s reichen für Web-URL-Extraction (JSON-LD-Path
 * <2s, Firecrawl-Fallback ~10s, LLM-Synthesis ~10-20s). Für Audio-Transkription
 * (YouTube später) wechseln wir auf Job-System mit Polling.
 */

import { extractRecipe } from "@/lib/recipes/import";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 60;

const bodySchema = z.object({
  input: z.string().min(1).max(50000),
  userHint: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Nicht eingeloggt." }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Invalid request: ${e instanceof Error ? e.message : "schema"}` },
      { status: 400 },
    );
  }

  try {
    const { result, bundle } = await extractRecipe({
      input: body.input,
      userHint: body.userHint,
    });
    return NextResponse.json({ ok: true, result, bundle });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Unbekannter Fehler beim Extrahieren des Rezepts.",
      },
      { status: 500 },
    );
  }
}
