/**
 * Applies supabase/schema.sql + supabase/seed.sql to the configured DATABASE_URL.
 *
 * Run via: node --env-file=.env scripts/apply-schema.mjs
 *
 * Apply order:
 *   1. schema.sql — extensions, types, tables, RLS policies, triggers
 *   2. seed.sql — exercise catalog
 *
 * Idempotent? NO. If you re-run, you'll get duplicate-type / table-exists errors.
 * For schema iteration: use Drizzle migrations.
 */

import { readFile } from "node:fs/promises";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "Missing DATABASE_URL env. Run with: node --env-file=.env scripts/apply-schema.mjs",
  );
  process.exit(1);
}

const sql = postgres(url, {
  ssl: "require",
  prepare: false,
  // Single connection so transaction context is consistent
  max: 1,
});

async function applyFile(path) {
  console.log(`\n→ Reading ${path}…`);
  const content = await readFile(path, "utf8");
  console.log(`  ${content.length} chars. Applying…`);
  const start = Date.now();
  // postgres-js's .unsafe() supports multi-statement DDL
  await sql.unsafe(content);
  console.log(`  ✓ Applied in ${Date.now() - start}ms`);
}

try {
  console.log("Connecting to:", url.replace(/:[^@]+@/, ":***@"));
  await applyFile("supabase/schema.sql");
  await applyFile("supabase/seed.sql");
  console.log("\n✅ All migrations applied successfully.");
} catch (e) {
  console.error("\n❌ Failed:", e.message);
  if (e.severity) console.error("  Severity:", e.severity);
  if (e.code) console.error("  Code:", e.code);
  if (e.position) console.error("  Position:", e.position);
  process.exit(1);
} finally {
  await sql.end();
}
