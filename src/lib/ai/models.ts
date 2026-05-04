/**
 * AI-Modell-Auswahl.
 * Default ist Opus 4.7. Nur wenn ein Task explizit Volume-/Cost-Optimierung braucht,
 * runter auf günstigere Modelle.
 */

export const MODELS = {
  /** Default: Reasoning, Vision, Tool-Calling, Coach-Chat */
  primary: "anthropic/claude-opus-4.7",

  /** Bulk-Text-Extraction (z.B. Webseiten → strukturierte Rezepte). 2.5x günstiger. */
  bulk: "google/gemini-3.1-pro",

  /** Schnelle Antworten (kurze Statusabfragen). Sonnet 4.6. */
  fast: "anthropic/claude-sonnet-4.6",
} as const;

export type ModelKey = keyof typeof MODELS;
export type ModelString = (typeof MODELS)[ModelKey];

/**
 * Decision-Helper: gegeben Task-Typ, welches Modell?
 */
export function pickModel(
  task:
    | "coach_chat"
    | "vision_recipe_extraction"
    | "vision_calorie_estimation"
    | "web_recipe_extraction"
    | "exercise_substitution"
    | "deload_decision"
    | "quick_status",
): ModelString {
  switch (task) {
    case "coach_chat":
    case "vision_recipe_extraction":
    case "vision_calorie_estimation":
    case "exercise_substitution":
    case "deload_decision":
      return MODELS.primary;
    case "web_recipe_extraction":
      return MODELS.bulk;
    case "quick_status":
      return MODELS.fast;
  }
}
