/**
 * Migros MCP Client (programmatisch).
 *
 * Repo: https://github.com/lewpgs/migros-mcp
 *
 * In der Production-App rufen wir den MCP-Server NICHT direkt — stattdessen
 * verwenden wir das zugrundeliegende Package `migros-api-wrapper` direkt
 * (was der MCP-Server intern auch macht). Das ist effizienter als einen
 * separaten MCP-Server zu hosten nur für die App.
 *
 * Während Entwicklung mit Claude Code: MCP-Server hochfahren und CC kann
 * direkt mit Migros-Daten testen:
 *   claude mcp add migros -- npx -y migros-mcp
 *
 * Aktuell ist `migros-api-wrapper` ein NPM-Package. Wenn das nicht (mehr) verfügbar
 * ist: alternativ über @modelcontextprotocol/sdk den MCP-Server als Subprocess
 * starten und dessen Tools rufen.
 *
 * WARNUNG: Alle Endpoints sind UNOFFICIAL. Kann jederzeit brechen wenn Migros
 * ihre API ändert. Implementiere robustes Error-Handling.
 */

import { z } from "zod";

// =============================================================================
// SCHEMAS (orientiert am Output der MCP-Tools)
// =============================================================================

export const migrosProductSchema = z.object({
  product_id: z.string(),
  name: z.string(),
  brand: z.string().nullable().optional(),
  price_chf: z.number().nullable().optional(),
  unit_price: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  available_online: z.boolean().nullable().optional(),
});

export const migrosProductDetailsSchema = migrosProductSchema.extend({
  ingredients: z.string().nullable().optional(),
  allergens: z.array(z.string()).nullable().optional(),
  // Nährwerte pro 100g
  nutrition_per_100g: z
    .object({
      kcal: z.number().nullable(),
      protein_g: z.number().nullable(),
      carbs_g: z.number().nullable(),
      fat_g: z.number().nullable(),
      fiber_g: z.number().nullable(),
      salt_g: z.number().nullable(),
      sugar_g: z.number().nullable(),
    })
    .nullable()
    .optional(),
  raw: z.unknown(),
});

export const migrosStoreSchema = z.object({
  store_id: z.string(),
  name: z.string(),
  address: z.string(),
  city: z.string(),
  postcode: z.string(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  opening_hours: z.unknown().nullable().optional(),
});

export type MigrosProduct = z.infer<typeof migrosProductSchema>;
export type MigrosProductDetails = z.infer<typeof migrosProductDetailsSchema>;
export type MigrosStore = z.infer<typeof migrosStoreSchema>;

// =============================================================================
// CLIENT INTERFACE
// =============================================================================

export interface MigrosClient {
  searchProducts(query: string, limit?: number): Promise<MigrosProduct[]>;
  getProductDetails(productId: string): Promise<MigrosProductDetails | null>;
  getStock(
    productId: string,
    storeId: string,
  ): Promise<{ available: boolean; quantity?: number } | null>;
  searchStores(
    near: { lat: number; lng: number } | { city: string; postcode?: string },
  ): Promise<MigrosStore[]>;
  getPromotions(query?: string): Promise<MigrosProduct[]>;
}

// =============================================================================
// IMPLEMENTATION (Skeleton — Claude Code wird das ausbauen)
// =============================================================================

/**
 * Implementation Plan (für Claude Code):
 *
 * Option A: NPM `migros-api-wrapper` direkt verwenden
 *   import { MigrosApi } from "migros-api-wrapper";
 *   const client = new MigrosApi();
 *   const products = await client.searchProducts(query);
 *
 * Option B: MCP-Server als Subprocess (wenn migros-api-wrapper deprecated)
 *   import { Client } from "@modelcontextprotocol/sdk/client";
 *   import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio";
 *   const transport = new StdioClientTransport({ command: "npx", args: ["-y", "migros-mcp"] });
 *   const client = new Client(...);
 *   const result = await client.callTool({ name: "search_products", arguments: { query } });
 *
 * Option A ist effizienter (kein Subprocess overhead). Falls API breakt,
 * Fallback auf MCP-Server (der vom Maintainer aktualisiert wird) leichter.
 *
 * Cache-Strategie: alle gefetchten Produkte in food_items_cache table
 * persistieren (siehe schema.sql). TTL ~7 Tage für Preise, dauerhaft für
 * Nährwerte (ändern sich selten).
 *
 * Stans-Filiale fest in env: MIGROS_DEFAULT_STORE_ID="0..." (rauszufinden via
 * search_stores beim ersten Setup).
 */
export class MigrosClientImpl implements MigrosClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async searchProducts(_query: string, _limit?: number): Promise<MigrosProduct[]> {
    throw new Error("Not implemented — Claude Code: see implementation plan in this file");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getProductDetails(_productId: string): Promise<MigrosProductDetails | null> {
    throw new Error("Not implemented");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getStock(
    _productId: string,
    _storeId: string,
  ): Promise<{ available: boolean; quantity?: number } | null> {
    throw new Error("Not implemented");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async searchStores(_near: Parameters<MigrosClient["searchStores"]>[0]): Promise<MigrosStore[]> {
    throw new Error("Not implemented");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getPromotions(_query?: string): Promise<MigrosProduct[]> {
    throw new Error("Not implemented");
  }
}

let _instance: MigrosClient | null = null;
export function getMigrosClient(): MigrosClient {
  if (!_instance) {
    _instance = new MigrosClientImpl();
  }
  return _instance as MigrosClient;
}
