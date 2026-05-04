/**
 * Quick sanity-check that schema applied correctly:
 * - all expected tables exist
 * - RLS policies installed
 * - exercises seeded
 *
 * Run: node --env-file=.env scripts/verify-schema.mjs
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, {
  ssl: "require",
  prepare: false,
  max: 1,
});

const tables = await sql`
  select table_name
  from information_schema.tables
  where table_schema='public'
  order by table_name
`;

const policies = await sql`
  select count(*)::int as c from pg_policies where schemaname='public'
`;

const exercises = await sql`
  select count(*)::int as c, count(distinct primary_muscle)::int as muscles
  from exercises
`;

const types = await sql`
  select typname
  from pg_type
  where typtype='e' and typnamespace=(select oid from pg_namespace where nspname='public')
  order by typname
`;

const triggers = await sql`
  select count(*)::int as c
  from information_schema.triggers
  where trigger_schema='public'
`;

console.log("Tables:", tables.length);
for (const t of tables) console.log("  -", t.table_name);
console.log("\nEnums:", types.length);
for (const t of types) console.log("  -", t.typname);
console.log("\nRLS policies:", policies[0].c);
console.log("Triggers:", triggers[0].c);
console.log("Exercises seeded:", exercises[0].c, "across", exercises[0].muscles, "muscle groups");

await sql.end();
