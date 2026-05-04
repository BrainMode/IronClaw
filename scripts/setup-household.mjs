/**
 * Setup-Household nach Supabase-Auth-User-Creation.
 *
 * Was es macht:
 *   1. Findet Auth-User per Email (Denny + Frau)
 *   2. Erstellt 'Weber Family' Household (idempotent)
 *   3. Trägt Membership-Rollen ein: Denny=admin, Frau=recipe_only
 *   4. Setzt Defaults für Denny: macro_targets, training_preferences, user_preferences
 *
 * Setup vor dem Ausführen:
 *   - Im Supabase-Dashboard → Authentication → Users → "Add user (auto-confirmed)"
 *     • Denny: Email kontakt@dennyweber.ch + Passwort (selber wählen)
 *     • Frau:  ihre Email + Passwort  (optional — kann später)
 *
 * Run: node --env-file=.env scripts/setup-household.mjs
 *
 * Idempotent: Re-Run ist safe — überspringt was schon existiert.
 */

import postgres from "postgres";

const DENNY_EMAIL = "kontakt@dennyweber.ch";
const FRAU_EMAIL = process.env.FRAU_EMAIL ?? null; // optional, set via env
const HOUSEHOLD_NAME = "Weber Family";

const sql = postgres(process.env.DATABASE_URL, {
  ssl: "require",
  prepare: false,
  max: 1,
});

async function findUserId(email) {
  const rows = await sql`select id from auth.users where email = ${email} limit 1`;
  return rows[0]?.id ?? null;
}

try {
  const dennyId = await findUserId(DENNY_EMAIL);
  if (!dennyId) {
    console.error(
      `❌ Kein Auth-User für ${DENNY_EMAIL}. Bitte zuerst im Supabase-Dashboard anlegen.`,
    );
    process.exit(1);
  }
  console.log(`✓ Denny:  ${DENNY_EMAIL} → ${dennyId}`);

  let frauId = null;
  if (FRAU_EMAIL) {
    frauId = await findUserId(FRAU_EMAIL);
    if (!frauId) {
      console.warn(`⚠ Kein Auth-User für ${FRAU_EMAIL} — überspringe Frau-Setup.`);
    } else {
      console.log(`✓ Frau:  ${FRAU_EMAIL} → ${frauId}`);
    }
  } else {
    console.log("ℹ FRAU_EMAIL nicht gesetzt — Frau-Setup übersprungen.");
  }

  // Household: erstellen wenn nicht da
  const existing = await sql`
    select h.id from households h
    join household_members m on m.household_id = h.id
    where m.user_id = ${dennyId}
    limit 1
  `;
  let householdId = existing[0]?.id ?? null;

  if (!householdId) {
    const inserted = await sql`
      insert into households (name) values (${HOUSEHOLD_NAME}) returning id
    `;
    householdId = inserted[0].id;
    console.log(`✓ Household '${HOUSEHOLD_NAME}' angelegt → ${householdId}`);
  } else {
    console.log(`✓ Household existiert bereits → ${householdId}`);
  }

  // Memberships
  await sql`
    insert into household_members (household_id, user_id, role)
    values (${householdId}, ${dennyId}, 'admin')
    on conflict (household_id, user_id) do update set role = 'admin'
  `;
  console.log("✓ Denny als admin eingetragen.");

  if (frauId) {
    await sql`
      insert into household_members (household_id, user_id, role)
      values (${householdId}, ${frauId}, 'recipe_only')
      on conflict (household_id, user_id) do update set role = 'recipe_only'
    `;
    console.log("✓ Frau als recipe_only eingetragen.");
  }

  // Denny-Defaults — können später per UI angepasst werden
  await sql`
    insert into user_preferences (user_id) values (${dennyId})
    on conflict (user_id) do nothing
  `;
  await sql`
    insert into training_preferences (user_id) values (${dennyId})
    on conflict (user_id) do nothing
  `;
  // Macro-Targets: konservative Schätzung, du editierst per UI
  await sql`
    insert into macro_targets (
      user_id, kcal_target, protein_g_target, carbs_g_target, fat_g_target,
      fiber_g_target, training_day_kcal_offset, training_day_protein_offset
    ) values (
      ${dennyId}, 2400, 180, 250, 80, 30, 200, 20
    )
    on conflict (user_id) do nothing
  `;
  console.log(
    "✓ Defaults für Denny gesetzt (user_preferences, training_preferences, macro_targets).",
  );

  if (frauId) {
    await sql`
      insert into user_preferences (user_id) values (${frauId})
      on conflict (user_id) do nothing
    `;
    console.log("✓ user_preferences für Frau gesetzt.");
  }

  console.log("\n✅ Household-Setup abgeschlossen.");
  console.log(`   Household-ID: ${householdId}`);
  console.log(`   Denny: ${dennyId} (admin)`);
  if (frauId) console.log(`   Frau:  ${frauId} (recipe_only)`);
} catch (e) {
  console.error("\n❌ Fehler:", e.message);
  if (e.code) console.error("  Code:", e.code);
  process.exit(1);
} finally {
  await sql.end();
}
