/**
 * Supplement-Catalog + Stack-Helpers.
 *
 * Häufig genutzte Supplements mit kanonischen Keys. LLM mappt User-Eingaben
 * auf diese keys; bei Unbekannten: 'other' + display_name freitext.
 *
 * Empfehlungs-Bereiche basierend auf:
 * - Examine.com (für Effekt-Größen)
 * - PubMed-Reviews
 * - Stronger by Science Cohorts-Analysen
 * - NIH ODS für Sicherheit/Obergrenzen
 *
 * NICHT als Quelle: DGE/USDA RDA — diese sind oft das absolute Minimum gegen
 * Mangelerscheinungen, nicht das Optimum für Performance/Hormongesundheit.
 */

export interface SupplementEntry {
  key: string;
  display_name: string;
  category: "essential" | "ergogenic" | "nootropic" | "recovery" | "longevity" | "other";
  /** Übliche Dosierung — Range, kein Punkt */
  typical_dosage: { min: number; max: number; unit: string };
  /** Standard-Frequenz */
  typical_frequency: string;
  /** Stichworte zur Indikation */
  indications: string[];
  /** Bekannte Wechselwirkungen / Sicherheitshinweise */
  cautions?: string[];
  evidence_strength: "strong" | "moderate" | "limited" | "anecdotal";
  /** Quellen — sehr knapp gehalten */
  evidence_sources?: string[];
}

export const SUPPLEMENT_CATALOG: SupplementEntry[] = [
  // CORE / Denny's Stack
  {
    key: "omega-3-epa-dha",
    display_name: "Omega-3 (EPA + DHA)",
    category: "essential",
    typical_dosage: { min: 2000, max: 4000, unit: "mg" },
    typical_frequency: "daily, mit Mahlzeit",
    indications: ["entzündungshemmend", "kardiovaskulär", "Stimmung", "Recovery"],
    cautions: ["bei Blutverdünnung Arzt fragen"],
    evidence_strength: "strong",
    evidence_sources: ["AHA-Reviews", "Examine.com Omega-3 page"],
  },
  {
    key: "vitamin-d3",
    display_name: "Vitamin D3",
    category: "essential",
    // Aktuelle Forschung: 25-(OH)D Optimum 50-70 ng/ml → braucht oft 4000-5000 IU/Tag
    typical_dosage: { min: 2000, max: 5000, unit: "IU" },
    typical_frequency: "daily mit Fett-Mahlzeit",
    indications: ["Knochengesundheit", "Immunsystem", "Testosteron-Optimierung"],
    cautions: ["mit K2 kombinieren um Calcium-Verteilung zu lenken"],
    evidence_strength: "strong",
    evidence_sources: ["Holick 2017 Endocrine Soc.", "Pilz et al. 2019"],
  },
  {
    key: "k2-mk7",
    display_name: "Vitamin K2 (MK-7)",
    category: "essential",
    typical_dosage: { min: 100, max: 200, unit: "ug" },
    typical_frequency: "daily",
    indications: ["Calcium-Verteilung", "Gefäße", "Knochen"],
    cautions: ["bei Blutverdünner-Therapie Arzt"],
    evidence_strength: "moderate",
  },
  {
    key: "magnesium-glycinate",
    display_name: "Magnesium-Glycinat",
    category: "essential",
    typical_dosage: { min: 200, max: 400, unit: "mg" },
    typical_frequency: "abends",
    indications: ["Schlaf", "Muskelregeneration", "Stress-Tolerance"],
    cautions: ["Citrat statt Glycinat hat abführende Wirkung"],
    evidence_strength: "strong",
  },
  {
    key: "creatine-monohydrate",
    display_name: "Kreatin-Monohydrat",
    category: "ergogenic",
    typical_dosage: { min: 3000, max: 5000, unit: "mg" },
    typical_frequency: "daily — Timing irrelevant",
    indications: ["Kraft", "Hypertrophie", "kognitive Performance"],
    evidence_strength: "strong",
    evidence_sources: ["ISSN Position Stand 2017", "Examine.com top-cited"],
  },
  {
    key: "zinc-bisglycinate",
    display_name: "Zink-Bisglycinat",
    category: "essential",
    typical_dosage: { min: 15, max: 25, unit: "mg" },
    typical_frequency: "abends, ohne Calcium",
    indications: ["Testosteron", "Immunsystem", "Wundheilung"],
    cautions: ["nicht mit Magnesium gleichzeitig — Resorption"],
    evidence_strength: "moderate",
  },

  // PROTEIN-PULVER & Performance
  {
    key: "whey-protein",
    display_name: "Whey-Protein",
    category: "ergogenic",
    typical_dosage: { min: 25, max: 40, unit: "g" },
    typical_frequency: "post-workout oder zur Protein-Bedarf-Deckung",
    indications: ["Protein-Bedarf bei Cuts/Bulks", "Recovery"],
    evidence_strength: "strong",
  },
  {
    key: "esn-eslids-deck",
    display_name: "ESN ESLID's Deck",
    category: "ergogenic",
    // Multi-Komponente: Whey + Casein + Casein-Hydrolysat
    typical_dosage: { min: 30, max: 50, unit: "g" },
    typical_frequency: "post-workout / abends",
    indications: ["Protein mit verlängerter Aminosäuren-Freisetzung"],
    evidence_strength: "moderate",
  },
  {
    key: "beta-alanine",
    display_name: "Beta-Alanin",
    category: "ergogenic",
    typical_dosage: { min: 3000, max: 5000, unit: "mg" },
    typical_frequency: "daily, gesplittet 2-3x",
    indications: ["Muskel-Ausdauer 60-240s Belastung"],
    cautions: ["Kribbeln (Parästhesie) — harmlos"],
    evidence_strength: "moderate",
  },
  {
    key: "caffeine-anhydrous",
    display_name: "Koffein (anhydrid)",
    category: "ergogenic",
    typical_dosage: { min: 100, max: 400, unit: "mg" },
    typical_frequency: "30-45min vor Workout",
    indications: ["Performance", "Fokus"],
    cautions: ["Nicht <8h vor Schlaf", "Toleranz bauen sich auf"],
    evidence_strength: "strong",
  },

  // LONGEVITY / NOOTROPIC
  {
    key: "ashwagandha-ksm66",
    display_name: "Ashwagandha (KSM-66)",
    category: "longevity",
    typical_dosage: { min: 300, max: 600, unit: "mg" },
    typical_frequency: "daily, abends",
    indications: ["Stress-Tolerance", "Schlafqualität", "Testosteron mild"],
    cautions: ["nicht in Schwangerschaft", "Schilddrüsen-Patienten Arzt"],
    evidence_strength: "moderate",
  },
  {
    key: "l-theanine",
    display_name: "L-Theanin",
    category: "nootropic",
    typical_dosage: { min: 100, max: 200, unit: "mg" },
    typical_frequency: "mit Koffein, oder allein zur Entspannung",
    indications: ["Fokus ohne Jitter", "Schlaf-Übergang"],
    evidence_strength: "moderate",
  },

  // RECOVERY
  {
    key: "glycine",
    display_name: "Glycin",
    category: "recovery",
    typical_dosage: { min: 3000, max: 5000, unit: "mg" },
    typical_frequency: "vor dem Schlaf",
    indications: ["Schlafqualität", "Tiefschlaf-Anteil"],
    evidence_strength: "moderate",
  },
];

// =============================================================================
// HELPERS
// =============================================================================

const ALIAS_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const e of SUPPLEMENT_CATALOG) {
    map[e.key.toLowerCase()] = e.key;
    map[e.display_name.toLowerCase()] = e.key;
    // Common aliases
  }
  // Manuell hinzufügen
  map["omega 3"] = "omega-3-epa-dha";
  map.fischöl = "omega-3-epa-dha";
  map["fish oil"] = "omega-3-epa-dha";
  map.d3 = "vitamin-d3";
  map["vitamin d"] = "vitamin-d3";
  map.k2 = "k2-mk7";
  map.mk7 = "k2-mk7";
  map.magnesium = "magnesium-glycinate";
  map.mg = "magnesium-glycinate";
  map.creatine = "creatine-monohydrate";
  map.kreatin = "creatine-monohydrate";
  map.zink = "zinc-bisglycinate";
  map.whey = "whey-protein";
  map.protein = "whey-protein";
  map["eslid's deck"] = "esn-eslids-deck";
  map["eslids deck"] = "esn-eslids-deck";
  map.esn = "esn-eslids-deck";
  map.ashwagandha = "ashwagandha-ksm66";
  return map;
})();

export function canonicalizeSupplement(input: string): {
  key: string;
  display_name: string;
  is_known: boolean;
} {
  const lower = input.toLowerCase().trim();
  const matchedKey = ALIAS_MAP[lower];
  if (matchedKey) {
    const entry = SUPPLEMENT_CATALOG.find((e) => e.key === matchedKey)!;
    return { key: entry.key, display_name: entry.display_name, is_known: true };
  }
  return { key: "other", display_name: input.trim(), is_known: false };
}

/**
 * Default-Stack für Denny basierend auf userMemories — als Seed verwendet.
 * User kann das nachher in der UI editieren.
 */
export const DENNY_DEFAULT_STACK: Array<{
  key: string;
  dosage: number;
  unit: string;
  frequency: string;
}> = [
  { key: "omega-3-epa-dha", dosage: 3000, unit: "mg", frequency: "daily" },
  { key: "vitamin-d3", dosage: 4000, unit: "IU", frequency: "daily" },
  { key: "k2-mk7", dosage: 100, unit: "ug", frequency: "daily" },
  { key: "esn-eslids-deck", dosage: 40, unit: "g", frequency: "post-workout" },
  { key: "creatine-monohydrate", dosage: 5000, unit: "mg", frequency: "daily" },
  { key: "magnesium-glycinate", dosage: 300, unit: "mg", frequency: "evening" },
];
