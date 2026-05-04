/**
 * Ingredient + Unit Normalization.
 *
 * Wird verwendet:
 *  - VOR Migros-MCP-Lookup: kanonische Zutatenamen für besseren Match
 *  - NACH LLM-Extraction: einheitliche Schreibweise speichern
 *  - VOR Cross-Recipe-Search: User soll mit "Karotten" auch "Rüebli"-Rezepte finden
 *
 * Strategien:
 *  - Statisches Mapping für häufigste Schweizer Dialekt-Varianten
 *  - Fuzzy-Match (lowercase, ohne Sonderzeichen) für nahezu identische Schreibweisen
 *  - Imperial → metrisch Konvertierung
 *
 * Was wir NICHT hier machen: tiefgreifende NLP / Embedding-basierte Ähnlichkeit.
 * Wenn das nötig wird (z.B. "Schalotte" ≈ "Frühlingszwiebel"?): separater AI-Tool-Call
 * im Cooking-Flow, nicht hier.
 */

// =============================================================================
// CANONICAL INGREDIENT NAMES (Schweiz-spezifische Dialekt-Map)
// =============================================================================

/**
 * Map: Variant → Canonical (kanonisch = Migros-suchtauglich)
 *
 * Migros-Sortiment verwendet teilweise deutsche und teilweise CH-Begriffe.
 * Faustregel: nimm den Begriff, der bei Migros am häufigsten vorkommt.
 */
const INGREDIENT_CANONICAL: Record<string, string> = {
  // Schweizerdeutsch → Standard-Deutsch
  härdöpfel: "Kartoffeln",
  kartoffel: "Kartoffeln",
  rüebli: "Karotten",
  rüben: "Karotten",
  karotte: "Karotten",
  karrotte: "Karotten",
  möhre: "Karotten",
  möhren: "Karotten",
  pouletbrust: "Hähnchenbrust",
  "poulet brust": "Hähnchenbrust",
  hühnerbrust: "Hähnchenbrust",
  hähnchenbrustfilet: "Hähnchenbrust",
  "chicken breast": "Hähnchenbrust",
  poulet: "Hähnchen",
  huhn: "Hähnchen",
  kohlrabi: "Kohlrabi",
  fenchel: "Fenchel",
  petersilienwurzel: "Petersilienwurzel",

  // English → Deutsch
  "olive oil": "Olivenöl",
  "extra virgin olive oil": "Olivenöl",
  evoo: "Olivenöl",
  salt: "Salz",
  pepper: "Pfeffer",
  "black pepper": "Schwarzer Pfeffer",
  garlic: "Knoblauch",
  "garlic clove": "Knoblauchzehe",
  "garlic cloves": "Knoblauchzehen",
  onion: "Zwiebel",
  onions: "Zwiebeln",
  shallot: "Schalotte",
  carrot: "Karotten",
  carrots: "Karotten",
  potato: "Kartoffeln",
  potatoes: "Kartoffeln",
  tomato: "Tomate",
  tomatoes: "Tomaten",
  flour: "Mehl",
  "all purpose flour": "Mehl",
  "all-purpose flour": "Mehl",
  sugar: "Zucker",
  "brown sugar": "Brauner Zucker",
  butter: "Butter",
  milk: "Milch",
  cream: "Rahm",
  "heavy cream": "Vollrahm",
  egg: "Ei",
  eggs: "Eier",
  "egg yolk": "Eigelb",
  "egg yolks": "Eigelb",
  "egg white": "Eiweiss",
  "egg whites": "Eiweiss",
  spaghetti: "Spaghetti",
  pasta: "Pasta",
  rice: "Reis",
  lemon: "Zitrone",
  lemons: "Zitronen",
  lime: "Limette",
  parsley: "Petersilie",
  basil: "Basilikum",
  thyme: "Thymian",
  rosemary: "Rosmarin",
  oregano: "Oregano",
  ginger: "Ingwer",
  "soy sauce": "Sojasauce",
  olive: "Oliven",
  olives: "Oliven",

  // Italian → Deutsch
  pomodori: "Tomaten",
  pomodoro: "Tomate",
  cipolla: "Zwiebel",
  aglio: "Knoblauch",
  "olio extra vergine d'oliva": "Olivenöl",
  burro: "Butter",
  uova: "Eier",
  guanciale: "Guanciale", // bleibt italienisch, kein deutsches Äquivalent
  pancetta: "Pancetta",
  pecorino: "Pecorino",
  "parmigiano reggiano": "Parmesan",
  parmigiano: "Parmesan",

  // French → Deutsch
  ail: "Knoblauch",
  oignon: "Zwiebel",
  beurre: "Butter",
  œufs: "Eier",
  oeufs: "Eier",
  "crème fraîche": "Crème fraîche",
  fromage: "Käse",
};

/**
 * Normalisiert einen Zutatennamen zur kanonischen Schreibweise.
 * Wenn nicht in der Map: Title-Case angewandt.
 */
export function canonicalizeIngredient(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;

  const key = trimmed.toLowerCase();

  // Direct match
  if (INGREDIENT_CANONICAL[key]) return INGREDIENT_CANONICAL[key];

  // Try without leading articles ("die Zwiebeln", "das Hähnchen")
  const stripped = key.replace(/^(der|die|das|the|le|la|il|lo)\s+/i, "");
  if (stripped !== key && INGREDIENT_CANONICAL[stripped]) {
    return INGREDIENT_CANONICAL[stripped];
  }

  // Fallback: original mit Title-Case bei erstem Wort
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

// =============================================================================
// UNIT NORMALIZATION (Imperial → Metrisch)
// =============================================================================

export interface NormalizedAmount {
  amount: number | null;
  unit: string | null;
  /** Falls Konvertierung stattgefunden hat: Original für UI */
  original_amount?: number;
  original_unit?: string;
}

/**
 * Konvertiert Imperial-Einheiten in metrisch. Behandelt:
 *   cup, tbsp/EL, tsp/TL, oz, lb, fl_oz
 *
 * Cup ist ambivalent: 1 cup Mehl ≈ 125g, 1 cup Butter ≈ 227g, 1 cup Flüssigkeit = 240ml.
 * Wenn `ingredientName` mitgegeben: nutze Lookup für density-basierte Konvertierung.
 */
export function normalizeAmount(
  amount: number | null,
  unit: string | null | undefined,
  ingredientName?: string,
): NormalizedAmount {
  if (amount === null || !unit) {
    return { amount, unit: unit ?? null };
  }

  const u = unit.toLowerCase().trim();

  // Schon metrisch
  if (["g", "kg", "ml", "l", "stk", "el", "tl", "prise", "bund"].includes(u)) {
    return { amount, unit: capitalizeUnit(u) };
  }

  // Volume-Conversions (1:1 zu ml)
  const volumeMap: Record<string, number> = {
    cup: 240,
    cups: 240,
    "fl oz": 30,
    fl_oz: 30,
    "fluid ounce": 30,
    "fluid ounces": 30,
    tbsp: 15,
    tablespoon: 15,
    tablespoons: 15,
    tsp: 5,
    teaspoon: 5,
    teaspoons: 5,
  };

  if (volumeMap[u] !== undefined) {
    const ml = amount * volumeMap[u];
    // tsp/tbsp besser als TL/EL
    if (u === "tsp" || u === "teaspoon" || u === "teaspoons") {
      return { amount, unit: "TL", original_amount: amount, original_unit: u };
    }
    if (u === "tbsp" || u === "tablespoon" || u === "tablespoons") {
      return { amount, unit: "EL", original_amount: amount, original_unit: u };
    }
    // cup: volume oder mass je nach Zutat
    if (u === "cup" || u === "cups") {
      const massCup = cupToGrams(ingredientName);
      if (massCup !== null) {
        return {
          amount: amount * massCup,
          unit: "g",
          original_amount: amount,
          original_unit: u,
        };
      }
    }
    return { amount: ml, unit: "ml", original_amount: amount, original_unit: u };
  }

  // Mass-Conversions
  const massMap: Record<string, number> = {
    oz: 28.35,
    ounce: 28.35,
    ounces: 28.35,
    lb: 453.6,
    lbs: 453.6,
    pound: 453.6,
    pounds: 453.6,
  };

  if (massMap[u] !== undefined) {
    const g = amount * massMap[u];
    return { amount: g, unit: "g", original_amount: amount, original_unit: u };
  }

  // Unbekannte Einheit — leave as-is, downstream wird als Validation-Error markiert
  return { amount, unit: capitalizeUnit(u) };
}

function capitalizeUnit(u: string): string {
  const map: Record<string, string> = {
    g: "g",
    kg: "kg",
    ml: "ml",
    l: "l",
    stk: "Stk",
    el: "EL",
    tl: "TL",
    prise: "Prise",
    bund: "Bund",
  };
  return map[u] ?? u;
}

/**
 * 1 cup → Gramm, abhängig von Zutat.
 * Returns null wenn Zutat nicht im Lookup → fallback zu volume (ml).
 */
function cupToGrams(ingredientName?: string): number | null {
  if (!ingredientName) return null;
  const lower = ingredientName.toLowerCase();

  // Häufigste Cup-Conversions
  if (/mehl|flour/.test(lower)) return 125;
  if (/zucker|sugar/.test(lower)) return 200;
  if (/braun.*zucker|brown sugar/.test(lower)) return 220;
  if (/puderzucker|powdered sugar|icing sugar/.test(lower)) return 120;
  if (/butter/.test(lower)) return 227;
  if (/öl|oil/.test(lower)) return 220;
  if (/honig|honey|sirup|syrup/.test(lower)) return 340;
  if (/reis|rice/.test(lower)) return 195;
  if (/haferflocken|oats|rolled oats/.test(lower)) return 90;

  // Bei Beeren / Gemüse-Stücke: oft 150g
  if (/beeren|berries|blaubeeren|blueberries|himbeeren/.test(lower)) return 150;

  return null;
}

// =============================================================================
// COMBINED PIPELINE
// =============================================================================

export function normalizeIngredient(input: {
  name: string;
  amount: number | null;
  unit: string | null;
  notes?: string;
}): {
  name: string;
  amount: number | null;
  unit: string | null;
  notes?: string;
  conversion_note?: string;
} {
  const canonicalName = canonicalizeIngredient(input.name);
  const { amount, unit, original_amount, original_unit } = normalizeAmount(
    input.amount,
    input.unit,
    canonicalName,
  );

  let conversion_note: string | undefined;
  if (original_unit && original_unit !== unit) {
    conversion_note = `Original: ${original_amount} ${original_unit}`;
  }

  return {
    name: canonicalName,
    amount,
    unit,
    notes: input.notes,
    conversion_note,
  };
}
