/**
 * Equipment Catalog.
 *
 * Kanonische Liste aller Küchen-/Grill-Geräte die in Recipes vorkommen können.
 * Wird verwendet zum:
 * - Equipment-Erkennung beim Import (LLM mappt erkanntes Gerät → kanonischer key)
 * - User-Equipment-Verwaltung (was hat Denny zuhause?)
 * - Recipe-Filterung ("zeige mir Rezepte die ich mit meinem Setup machen kann")
 * - Equipment-Hinweise im Recipe-Display
 *
 * Wenn LLM ein Equipment vorschlägt das nicht im Catalog ist:
 * → equipment_key='other', display_name=<freier Text>, UI markiert als "uncommon"
 */

export interface EquipmentEntry {
  key: string;
  display_name: string;
  category: "stove" | "oven" | "grill" | "small_appliance" | "tool" | "other";
  /** Aliases die der LLM als Synonyme erkennen soll */
  aliases: string[];
  /** Hat Denny das? (siehe userMemories) — kann später dynamisch werden über user_equipment table */
  denny_has?: boolean;
}

export const EQUIPMENT_CATALOG: EquipmentEntry[] = [
  // GRILL
  {
    key: "weber-grill",
    display_name: "Weber Grill",
    category: "grill",
    aliases: ["weber", "weber kettle", "kugelgrill", "weber genesis", "weber spirit"],
    denny_has: true,
  },
  {
    key: "gas-grill",
    display_name: "Gasgrill",
    category: "grill",
    aliases: ["gas grill", "gasgrill", "propane grill"],
  },
  {
    key: "kohle-grill",
    display_name: "Kohlegrill",
    category: "grill",
    aliases: ["kohlegrill", "charcoal grill", "holzkohle"],
  },
  {
    key: "smoker",
    display_name: "Smoker",
    category: "grill",
    aliases: ["smoker", "räucherofen", "offset smoker"],
  },
  {
    key: "raeucherrohr",
    display_name: "Räucherrohr",
    category: "grill",
    aliases: ["räucherrohr", "smoke tube", "smoker tube", "pellet tube"],
  },
  {
    key: "grill-rotisserie",
    display_name: "Grill-Rotisserie / Drehspiess",
    category: "grill",
    aliases: ["rotisserie", "drehspiess", "grillspiess"],
  },
  {
    key: "grill-pizzastein",
    display_name: "Pizzastein für Grill",
    category: "grill",
    aliases: ["grill pizzastein", "pizza stone for grill"],
  },
  {
    key: "fleischthermometer",
    display_name: "Fleischthermometer",
    category: "tool",
    aliases: ["thermometer", "kerntemperatur", "meat thermometer", "instant read thermometer"],
  },

  // OFEN
  {
    key: "backofen",
    display_name: "Backofen",
    category: "oven",
    aliases: ["ofen", "oven", "backofen"],
    denny_has: true,
  },
  {
    key: "pizzaofen",
    display_name: "Pizzaofen",
    category: "oven",
    aliases: ["pizzaofen", "pizza oven", "ooni", "gozney"],
  },
  {
    key: "pizzastein",
    display_name: "Pizzastein",
    category: "tool",
    aliases: ["pizzastein", "pizza stone", "baking stone"],
  },

  // STOVETOP
  {
    key: "induktionskochfeld",
    display_name: "Induktion",
    category: "stove",
    aliases: ["induktion", "induction"],
  },
  {
    key: "wok",
    display_name: "Wok",
    category: "tool",
    aliases: ["wok", "stir-fry pan"],
  },
  {
    key: "gusseisenpfanne",
    display_name: "Gusseisenpfanne",
    category: "tool",
    aliases: ["gusseisen", "cast iron", "gusseisenpfanne", "skillet"],
  },
  {
    key: "schmortopf",
    display_name: "Schmortopf / Bräter",
    category: "tool",
    aliases: ["bräter", "schmortopf", "dutch oven", "le creuset"],
  },

  // SMALL APPLIANCES
  {
    key: "kenwood-cooking-chef",
    display_name: "Kenwood Cooking Chef",
    category: "small_appliance",
    aliases: ["kenwood", "cooking chef", "küchenmaschine", "stand mixer", "kitchenaid"],
    denny_has: true,
  },
  {
    key: "thermomix",
    display_name: "Thermomix",
    category: "small_appliance",
    aliases: ["thermomix", "tm6", "tm5", "monsieur cuisine", "vorwerk"],
  },
  {
    key: "airfryer",
    display_name: "Heissluftfritteuse / Airfryer",
    category: "small_appliance",
    aliases: ["airfryer", "heissluftfritteuse", "philips airfryer", "ninja foodi"],
  },
  {
    key: "sous-vide",
    display_name: "Sous-Vide-Stick",
    category: "small_appliance",
    aliases: ["sous vide", "sous-vide", "anova", "joule", "garmix", "wasserbad"],
  },
  {
    key: "pressure-cooker",
    display_name: "Schnellkochtopf",
    category: "small_appliance",
    aliases: ["schnellkochtopf", "pressure cooker", "instant pot", "kuhn rikon"],
  },
  {
    key: "blender",
    display_name: "Standmixer",
    category: "small_appliance",
    aliases: ["mixer", "blender", "vitamix", "standmixer", "smoothie maker"],
  },
  {
    key: "stabmixer",
    display_name: "Stabmixer / Pürierstab",
    category: "small_appliance",
    aliases: ["stabmixer", "pürierstab", "immersion blender", "hand blender"],
  },
  {
    key: "food-processor",
    display_name: "Küchenmaschine / Food Processor",
    category: "small_appliance",
    aliases: ["food processor", "magimix", "küchenchopper"],
  },
  {
    key: "espressomaschine",
    display_name: "Espressomaschine",
    category: "small_appliance",
    aliases: ["espressomaschine", "siebträger", "espresso machine"],
  },
  {
    key: "waffeleisen",
    display_name: "Waffeleisen",
    category: "small_appliance",
    aliases: ["waffeleisen", "waffle iron"],
  },
  {
    key: "eismaschine",
    display_name: "Eismaschine",
    category: "small_appliance",
    aliases: ["eismaschine", "ice cream maker"],
  },
  {
    key: "dehydrator",
    display_name: "Dörrgerät / Dehydrator",
    category: "small_appliance",
    aliases: ["dörrgerät", "dehydrator", "trockner"],
  },

  // TOOLS
  {
    key: "fleischwolf",
    display_name: "Fleischwolf",
    category: "tool",
    aliases: ["fleischwolf", "meat grinder"],
  },
  {
    key: "vakuumierer",
    display_name: "Vakuumierer",
    category: "tool",
    aliases: ["vakuumierer", "vacuum sealer"],
  },
  {
    key: "küchenwaage",
    display_name: "Küchenwaage",
    category: "tool",
    aliases: ["küchenwaage", "kitchen scale", "waage"],
  },
];

/**
 * Map: lowercase alias → kanonischer key. Wird beim LLM-Output-Mapping verwendet.
 */
export const EQUIPMENT_ALIAS_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const entry of EQUIPMENT_CATALOG) {
    map[entry.key.toLowerCase()] = entry.key;
    map[entry.display_name.toLowerCase()] = entry.key;
    for (const alias of entry.aliases) {
      map[alias.toLowerCase()] = entry.key;
    }
  }
  return map;
})();

/**
 * Versucht einen vom LLM vorgeschlagenen Equipment-Namen auf den Catalog zu mappen.
 * Falls kein Match: returnt 'other' und der Original-Name wird in display_name gespeichert.
 */
export function canonicalizeEquipment(input: string): {
  key: string;
  display_name: string;
} {
  const lower = input.toLowerCase().trim();
  const matchedKey = EQUIPMENT_ALIAS_MAP[lower];
  if (matchedKey) {
    const entry = EQUIPMENT_CATALOG.find((e) => e.key === matchedKey)!;
    return { key: entry.key, display_name: entry.display_name };
  }

  // Fuzzy: try without diacritics + spaces
  const normalized = lower.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, "");
  for (const [alias, key] of Object.entries(EQUIPMENT_ALIAS_MAP)) {
    const aliasNorm = alias.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, "");
    if (aliasNorm === normalized) {
      const entry = EQUIPMENT_CATALOG.find((e) => e.key === key)!;
      return { key: entry.key, display_name: entry.display_name };
    }
  }

  return { key: "other", display_name: input.trim() };
}

/**
 * Liste der Equipment-Keys die Denny laut userMemories besitzt.
 * Frontend verwendet das initial; user_equipment Tabelle kann das später erweitern/ändern.
 */
export const DEFAULT_DENNY_EQUIPMENT: string[] = EQUIPMENT_CATALOG.filter((e) => e.denny_has).map(
  (e) => e.key,
);
