-- =============================================================================
-- Migration 0001 — Multi-Location Training (Gym, Home, Travel, …)
-- =============================================================================
-- Idempotent: safe to re-run.
-- Run via: node --env-file=.env scripts/apply-migration.mjs supabase/migrations/0001_multi_location.sql
-- =============================================================================

-- 1. equipment_locations — pro User mehrere Trainings-Orte
create table if not exists equipment_locations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Stable slug: 'gym', 'home', 'travel', or custom-<n>
  key text not null,
  -- Anzeigename: 'Gym', 'Home Gym', 'Travel Bag'
  display_name text not null,
  -- Sortierung im UI
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);
create index if not exists equipment_locations_user_idx on equipment_locations(user_id);

alter table equipment_locations enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'equipment_locations' and policyname = 'owner only locations'
  ) then
    create policy "owner only locations" on equipment_locations for all using (user_id = auth.uid());
  end if;
end $$;


-- 2. user_equipment.location_id — welches Equipment ist an welchem Ort
alter table user_equipment add column if not exists location_id uuid references equipment_locations(id) on delete cascade;

-- 3. training_plans.location_id — pro Location ein Plan
alter table training_plans add column if not exists location_id uuid references equipment_locations(id) on delete set null;

-- 4. workout_sessions.location_id — wo wurde trainiert (Audit)
alter table workout_sessions add column if not exists location_id uuid references equipment_locations(id) on delete set null;


-- 5. Migration für existing users: jeder User mit existing user_equipment OR training_plans
--    bekommt eine Default-'gym' Location, und die alten Rows werden dort eingehängt.
do $$
declare
  u record;
  gym_id uuid;
begin
  for u in (
    select user_id from user_equipment where location_id is null
    union
    select user_id from training_plans where location_id is null
  )
  loop
    -- 'gym' Location anlegen falls fehlt
    insert into equipment_locations (user_id, key, display_name, position)
    values (u.user_id, 'gym', 'Gym', 0)
    on conflict (user_id, key) do nothing;

    select id into gym_id from equipment_locations
      where user_id = u.user_id and key = 'gym';

    update user_equipment    set location_id = gym_id where user_id = u.user_id and location_id is null;
    update training_plans    set location_id = gym_id where user_id = u.user_id and location_id is null;
    update workout_sessions  set location_id = gym_id where user_id = u.user_id and location_id is null;
  end loop;
end $$;


-- 6. user_equipment PK migration: was (user_id, equipment), neu (location_id, equipment)
--    nur wenn alle Rows location_id haben
do $$
declare
  null_count int;
begin
  select count(*) into null_count from user_equipment where location_id is null;
  if null_count = 0 then
    -- Alte PK weg
    if exists (
      select 1 from pg_constraint where conrelid = 'user_equipment'::regclass and contype = 'p'
    ) then
      alter table user_equipment drop constraint user_equipment_pkey;
    end if;
    -- Neue PK
    if not exists (
      select 1 from pg_constraint where conrelid = 'user_equipment'::regclass and contype = 'p'
    ) then
      alter table user_equipment alter column location_id set not null;
      alter table user_equipment add primary key (location_id, equipment);
    end if;
  end if;
end $$;


-- 7. RLS-Policy für user_equipment (war 'owner only', greift via location_id auch)
--    keine Änderung nötig — bestehender Policy filtert via user_id, das ist immer gesetzt
