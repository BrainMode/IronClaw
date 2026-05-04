import type { ExtractedIngredient, ExtractedRecipe, ExtractedStep } from "./schema";

// =============================================================================
// PARSING
// =============================================================================

/**
 * Extrahiert ALLE Recipe-Objekte aus einem HTML-String.
 * Returns leeres Array wenn keines gefunden.
 */
export function extractRecipesFromHtml(html: string): unknown[] {
  const recipes: unknown[] = [];
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (;;) {
    const match = scriptRegex.exec(html);
    if (match === null) break;
    const jsonText = (match[1] ?? "").trim();
    if (!jsonText) continue;
    try {
      const parsed = JSON.parse(jsonText);
      const found = findRecipeInJsonLd(parsed);
      recipes.push(...found);
    } catch {
      // Manche Sites haben kaputtes JSON-LD — skip silent
    }
  }

  return recipes;
}

function findRecipeInJsonLd(obj: unknown): unknown[] {
  if (!obj || typeof obj !== "object") return [];

  // Array von Objekten
  if (Array.isArray(obj)) {
    return obj.flatMap((item) => findRecipeInJsonLd(item));
  }

  const o = obj as Record<string, unknown>;

  // Direct Recipe
  const type = o["@type"];
  if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) {
    return [o];
  }

  // @graph wrapper (sehr häufig bei WordPress)
  if (o["@graph"] && Array.isArray(o["@graph"])) {
    return findRecipeInJsonLd(o["@graph"]);
  }

  return [];
}

// =============================================================================
// MAPPING zu unserem ExtractedRecipe
// =============================================================================

/**
 * Mappt ein schema.org Recipe Object zu unserem internen Format.
 * Bei Mehrdeutigkeiten / fehlenden Feldern: best-effort.
 */
export function mapJsonLdToRecipe(jsonld: unknown): Omit<
  ExtractedRecipe,
  "ingredients" | "steps"
> & {
  ingredients: Omit<ExtractedIngredient, "provenance">[];
  steps: Omit<ExtractedStep, "provenance">[];
} {
  const o = jsonld as Record<string, unknown>;

  const title = String(o.name ?? o.headline ?? "Unbenanntes Rezept");
  const description = stripHtml(asString(o.description));
  const servings = parseServings(o.recipeYield);
  const prepTime = parseDuration(o.prepTime);
  const cookTime = parseDuration(o.cookTime);

  // Ingredients
  const rawIngredients = (o.recipeIngredient ?? o.ingredients ?? []) as unknown[];
  const ingredients = (Array.isArray(rawIngredients) ? rawIngredients : [])
    .map((raw) => parseIngredient(raw))
    .filter((i): i is NonNullable<typeof i> => i !== null);

  // Instructions
  const rawSteps = (o.recipeInstructions ?? []) as unknown[];
  const steps = flattenInstructions(Array.isArray(rawSteps) ? rawSteps : [rawSteps])
    .map((s) => parseStep(s))
    .filter((s): s is NonNullable<typeof s> => s !== null);

  // Tags from keywords / recipeCategory / recipeCuisine
  const ai_tags = extractTags(o);

  return {
    title,
    description: description || undefined,
    servings,
    prep_time_minutes: prepTime,
    cook_time_minutes: cookTime,
    ai_tags,
    equipment: [],
    ingredients,
    steps,
    extraction_confidence: 0.95, // JSON-LD ist sehr vertrauenswürdig
    extraction_warnings: [],
    sources_used: ["jsonld"],
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "@value" in v) {
    return String((v as Record<string, unknown>)["@value"] ?? "");
  }
  return "";
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseServings(v: unknown): number {
  if (typeof v === "number") return Math.max(1, Math.floor(v));
  if (typeof v === "string") {
    const m = v.match(/\d+/);
    if (m?.[0]) return Math.max(1, Number.parseInt(m[0], 10));
  }
  if (Array.isArray(v) && v.length > 0) return parseServings(v[0]);
  return 2; // default
}

/**
 * Parst ISO 8601 Duration (PT1H30M) oder Zahl-Minuten oder String "30 min".
 */
function parseDuration(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Math.floor(v);

  const s = asString(v).trim();
  if (!s) return null;

  // ISO 8601: PT1H30M
  const iso = s.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (iso) {
    const h = Number.parseInt(iso[1] ?? "0", 10);
    const m = Number.parseInt(iso[2] ?? "0", 10);
    return h * 60 + m;
  }

  // "30 min", "1 hour 15 minutes"
  const numMatch = s.match(/(\d+)\s*(min|stund|hour|h\b|m\b)/i);
  if (numMatch?.[1] && numMatch[2]) {
    const n = Number.parseInt(numMatch[1], 10);
    const unit = numMatch[2].toLowerCase();
    if (unit.startsWith("h") || unit.startsWith("st")) return n * 60;
    return n;
  }

  return null;
}

/**
 * Parst eine Ingredient-Zeile: kann String sein ("200g Spaghetti")
 * oder Objekt ({name, amount, ...}).
 */
function parseIngredient(raw: unknown): Omit<ExtractedIngredient, "provenance"> | null {
  if (typeof raw === "string") {
    return parseIngredientString(raw);
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const name = asString(o.name);
    if (!name) return null;
    return {
      name,
      amount: typeof o.amount === "number" ? o.amount : null,
      unit: asString(o.unitText) || null,
      notes: asString(o.description) || undefined,
    };
  }
  return null;
}

/**
 * Heuristik: parsiere "200g Spaghetti" → {name: "Spaghetti", amount: 200, unit: "g"}
 * Recht naiv — der Synthesizer-Pass kann später feiner normalisieren via LLM.
 */
function parseIngredientString(s: string): Omit<ExtractedIngredient, "provenance"> | null {
  const trimmed = s.trim();
  if (!trimmed) return null;

  // Match: "<amount><unit> <name>" oder "<amount> <unit> <name>"
  const re =
    /^(?<amount>[\d,./]+)?\s*(?<unit>g|kg|ml|l|EL|TL|Stk|Stück|Prise|Bund|cup|cups|tsp|tbsp|oz|lb)?\s+(?<name>.+)$/i;
  const m = trimmed.match(re);

  if (!m || !m.groups?.name) {
    return { name: trimmed, amount: null, unit: null };
  }

  const amount = m.groups.amount
    ? Number.parseFloat(m.groups.amount.replace(",", ".").replace(/[/].*$/, ""))
    : null;
  const unit = normalizeUnit(m.groups.unit);
  const name = m.groups.name.trim();

  return {
    name,
    amount: amount && Number.isFinite(amount) && amount > 0 ? amount : null,
    unit,
  };
}

function normalizeUnit(u: string | undefined): string | null {
  if (!u) return null;
  const lower = u.toLowerCase();
  const map: Record<string, string> = {
    stück: "Stk",
    stk: "Stk",
    el: "EL",
    tl: "TL",
    g: "g",
    kg: "kg",
    ml: "ml",
    l: "l",
    prise: "Prise",
    bund: "Bund",
    // Convert imperial to metric units (rough)
    cup: "ml",
    cups: "ml",
    tsp: "TL",
    tbsp: "EL",
    oz: "g",
    lb: "g",
  };
  return map[lower] ?? null;
}

/**
 * Instructions können nested sein:
 *   - String: "Spaghetti kochen"
 *   - HowToStep: { "@type": "HowToStep", "text": "..." }
 *   - HowToSection: { "@type": "HowToSection", "itemListElement": [...] }
 */
function flattenInstructions(items: unknown[]): unknown[] {
  return items.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (o["@type"] === "HowToSection" && Array.isArray(o.itemListElement)) {
        return flattenInstructions(o.itemListElement);
      }
      return [item];
    }
    return [];
  });
}

function parseStep(raw: unknown): Omit<ExtractedStep, "provenance"> | null {
  if (typeof raw === "string") {
    const cleaned = stripHtml(raw);
    if (!cleaned) return null;
    return { instruction: cleaned };
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const text = stripHtml(asString(o.text ?? o.name ?? ""));
    if (!text) return null;
    return { instruction: text };
  }
  return null;
}

function extractTags(o: Record<string, unknown>): string[] {
  const tags: string[] = [];

  // keywords kann String oder Array sein
  const kw = o.keywords;
  if (typeof kw === "string") {
    tags.push(
      ...kw
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
    );
  } else if (Array.isArray(kw)) {
    tags.push(
      ...kw
        .map(String)
        .map((k) => k.trim())
        .filter(Boolean),
    );
  }

  // recipeCategory
  const cat = o.recipeCategory;
  if (typeof cat === "string") tags.push(cat);
  else if (Array.isArray(cat)) tags.push(...cat.map(String));

  // recipeCuisine
  const cuisine = o.recipeCuisine;
  if (typeof cuisine === "string") tags.push(cuisine);
  else if (Array.isArray(cuisine)) tags.push(...cuisine.map(String));

  // dedupe + lowercase + cap at 5
  const unique = Array.from(new Set(tags.map((t) => t.toLowerCase())));
  return unique.slice(0, 5);
}
