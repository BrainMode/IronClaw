-- =============================================================================
-- Migration 0005 — Schema/Table Privileges für app roles
-- =============================================================================
-- Beim Supabase-Setup hatten wir 'Automatically expose new tables' deaktiviert
-- (Sicherheits-Empfehlung). Folge: weder anon noch authenticated noch
-- service_role haben SELECT/INSERT/UPDATE/DELETE auf den public Tabellen.
-- RLS-Policies allein reichen nicht — Postgres prüft GRANTs ZUERST.
--
-- Dieser Migration setzt jetzt explizit:
--   - authenticated: full CRUD (gefiltert durch unsere RLS-Policies)
--   - service_role: full CRUD (RLS-bypass — für admin-Scripts + Cron-Jobs)
--   - anon: nur SELECT (für künftigen Demo-Mode auf shared catalogs)
--
-- Plus default privileges für künftige Tabellen — sodass wir das nicht
-- pro Migration neu setzen müssen.
-- =============================================================================

-- Schema usage (sollte schon da sein, aber idempotent)
grant usage on schema public to anon, authenticated, service_role;

-- Existing tables
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant select on all tables in schema public to anon;

-- Sequences (falls wir mal welche haben — UUID-Defaults brauchen keine)
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Functions (z.B. current_household_id helper)
grant execute on all functions in schema public to anon, authenticated, service_role;

-- Default privileges: alle künftigen Tabellen erben das automatisch
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
