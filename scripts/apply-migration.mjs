/**
 * Applies a single SQL migration file to the configured DATABASE_URL.
 *
 * Usage:
 *   node --env-file=.env scripts/apply-migration.mjs supabase/migrations/0001_multi_location.sql
 *
 * Migration files MUST be idempotent — we don't track applied migrations yet.
 * For schema iteration use Drizzle migrations instead (drizzle-kit generate).
 */

import { readFile } from "node:fs/promises";
import postgres from "postgres";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node --env-file=.env scripts/apply-migration.mjs <path-to-sql>");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Missing DATABASE_URL env.");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });

try {
  console.log(`→ Reading ${path}…`);
  const content = await readFile(path, "utf8");
  console.log(`  ${content.length} chars. Applying…`);
  const start = Date.now();
  await sql.unsafe(content);
  console.log(`✓ Applied in ${Date.now() - start}ms`);
} catch (e) {
  console.error("\n❌ Failed:", e.message);
  if (e.severity) console.error("  Severity:", e.severity);
  if (e.code) console.error("  Code:", e.code);
  if (e.position) console.error("  Position:", e.position);
  process.exit(1);
} finally {
  await sql.end();
}
