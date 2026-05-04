/**
 * Debug: zeigt für jeden Auth-User die Membership-Rolle.
 * Run: node --env-file=.env scripts/debug-membership.mjs
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", prepare: false, max: 1 });

const rows = await sql`
  select u.id, u.email, m.household_id, m.role, h.name as household_name
  from auth.users u
  left join household_members m on m.user_id = u.id
  left join households h on h.id = m.household_id
  order by u.created_at desc
`;
for (const r of rows) {
  console.log(
    `${r.email}: role=${r.role ?? "(none)"} household=${r.household_name ?? "(none)"} (${r.household_id ?? "no id"})`,
  );
}
await sql.end();
