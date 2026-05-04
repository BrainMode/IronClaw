/**
 * Open Food Facts Lookup (Barcode → Nährwerte).
 *
 * Doku: https://wiki.openfoodfacts.org/API
 * API v2: https://world.openfoodfacts.org/api/v2/product/{barcode}.json
 *
 * Wichtig:
 * - Coverage in CH ist gut für Markenprodukte, schwächer bei Migros-Eigenmarken
 *   → bei misses fallback auf Migros MCP search
 * - Kostenlos, keine Auth nötig
 * - User-Agent header pflegen ("WDC-Fitness/1.0")
 * - Resultate cachen in food_items_cache
 *
 * Schema des Response: products[0].nutriments enthält:
 *   energy-kcal_100g, proteins_100g, carbohydrates_100g, fat_100g, fiber_100g
 */

import { z } from "zod";

export const offProductSchema = z.object({
  code: z.string(),
  product_name: z.string().optional(),
  brands: z.string().optional(),
  nutriments: z
    .object({
      "energy-kcal_100g": z.number().optional(),
      proteins_100g: z.number().optional(),
      carbohydrates_100g: z.number().optional(),
      fat_100g: z.number().optional(),
      fiber_100g: z.number().optional(),
      salt_100g: z.number().optional(),
      sugars_100g: z.number().optional(),
    })
    .optional(),
  image_url: z.string().optional(),
});

export type OffProduct = z.infer<typeof offProductSchema>;

export async function lookupBarcode(_barcode: string): Promise<OffProduct | null> {
  throw new Error(
    "Not implemented — Claude Code: fetch from world.openfoodfacts.org/api/v2/product/{barcode}.json",
  );
}
