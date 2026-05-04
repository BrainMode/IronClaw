/**
 * OpenRouter Client für Vercel AI SDK.
 *
 * OpenRouter ist OpenAI-kompatibel — wir verwenden den `@ai-sdk/openai-compatible`
 * Provider und zeigen ihn auf openrouter.ai.
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

if (!process.env.OPENROUTER_API_KEY) {
  // Lazy check — werfen erst beim ersten Aufruf, damit Build nicht crasht
  // wenn Env nicht gesetzt
}

export const openrouter = createOpenAICompatible({
  name: "openrouter",
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  baseURL: "https://openrouter.ai/api/v1",
  // Empfohlene Header für OpenRouter (App-Tracking, optional)
  headers: {
    "HTTP-Referer": "https://wdc-fitness.local",
    "X-Title": "WDC Fitness",
  },
});

/**
 * Helper-Re-Export für saubereres Import-Pattern.
 *
 * Beispiel:
 *   import { ai, MODELS } from "@/lib/ai/client";
 *   const result = await streamText({
 *     model: ai(MODELS.primary),
 *     ...
 *   });
 */
export const ai = openrouter;

export { MODELS, pickModel } from "./models";
