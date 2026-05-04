/**
 * Listet GRANTs für die public-Schema-Tabellen, die wir per Migration erstellt haben.
 * Run: node --env-file=.env scripts/check-grants.mjs
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", prepare: false, max: 1 });

const tables = [
  "equipment_locations",
  "user_equipment",
  "training_plans",
  "training_plan_days",
  "training_plan_exercises",
  "workout_sessions",
  "workout_sets",
  "households",
  "household_members",
  "exercises",
];

for (const t of tables) {
  const grants = await sql`
    select grantee, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = ${t}
    and grantee in ('anon', 'authenticated', 'service_role')
    order by grantee, privilege_type
  `;
  const grouped = new Map();
  for (const g of grants) {
    const list = grouped.get(g.grantee) ?? [];
    list.push(g.privilege_type);
    grouped.set(g.grantee, list);
  }
  const summary = Array.from(grouped.entries())
    .map(([role, privs]) => `${role}=[${privs.join(",")}]`)
    .join(" ");
  console.log(`${t.padEnd(28)} ${summary || "(no grants for app roles!)"}`);
}
await sql.end();
