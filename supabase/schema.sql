-- =============================================================================
-- WDC Fitness — Supabase Postgres Schema
-- =============================================================================
-- Ausführen via Supabase SQL Editor oder `supabase db push`.
-- Voraussetzung: Supabase Auth Schema existiert bereits (auth.users).
-- =============================================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";  -- für Recipe-Search

-- =============================================================================
-- HOUSEHOLDS & MEMBERSHIP
-- =============================================================================

create table households (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Rolle bestimmt was ein User innerhalb des Households sehen darf.
-- 'admin'        : voller Zugriff auf alle eigenen Daten + alle Recipes
-- 'recipe_only'  : nur Recipes (lesen/schreiben), KEIN Zugriff auf andere Daten
create type member_role as enum ('admin', 'recipe_only');

create table household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'admin',
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_idx on household_members(user_id);

-- User-Preferences: Locale, Maßeinheiten, etc.
-- Vorbereitung für i18n (siehe docs/I18N_STRATEGY.md). Aktuell DE-only,
-- aber struktur ist da damit Forks andere Sprachen aktivieren können.
create table user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  locale text not null default 'de-CH',
  weight_unit text not null default 'kg' check (weight_unit in ('kg', 'lbs')),
  height_unit text not null default 'cm' check (height_unit in ('cm', 'in')),
  temperature_unit text not null default 'C' check (temperature_unit in ('C', 'F')),
  -- Notification-Settings
  daily_standup_enabled boolean not null default true,
  weekly_checkin_reminder boolean not null default true,
  push_workout_reminder boolean not null default true,
  -- AI-Persönlichkeit-Tuning
  coach_style text not null default 'direct' check (coach_style in ('direct', 'gentle', 'analytical')),
  updated_at timestamptz not null default now()
);

alter table user_preferences enable row level security;
create policy "owner only prefs" on user_preferences for all using (user_id = auth.uid());

-- Helper: aktuelles household des authentifizierten Users
create or replace function current_household_id()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select household_id
  from household_members
  where user_id = auth.uid()
  limit 1
$$;

create or replace function current_member_role()
returns member_role
language sql stable
security definer
set search_path = public
as $$
  select role
  from household_members
  where user_id = auth.uid()
  limit 1
$$;


-- =============================================================================
-- RECIPES (household-scoped)
-- =============================================================================

create type recipe_source_type as enum (
  'manual', 'photo', 'web_url', 'youtube', 'instagram', 'tiktok', 'facebook', 'other_video'
);

create table recipes (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  created_by uuid not null references auth.users(id),

  title text not null,
  description text,
  servings_default int not null default 2,
  prep_time_minutes int,
  cook_time_minutes int,
  total_time_minutes int generated always as (
    coalesce(prep_time_minutes, 0) + coalesce(cook_time_minutes, 0)
  ) stored,

  -- Quelle
  source_type recipe_source_type not null,
  source_url text,                  -- für web_url, youtube, etc.
  source_image_path text,           -- Supabase Storage path (für photo)
  source_raw_content jsonb,         -- raw fetch/transcript für späteren Re-Extract

  -- Aggregierte Nährwerte (pro Standard-Portion!)
  -- Werden async vom Migros-Lookup-Job + Tagging-Job befüllt
  kcal_per_serving numeric,
  protein_g_per_serving numeric,
  carbs_g_per_serving numeric,
  fat_g_per_serving numeric,
  fiber_g_per_serving numeric,
  nutrition_completeness numeric,   -- 0-1, % der Zutaten mit Nährwert-Match
  nutrition_computed_at timestamptz,

  -- Tags: dreigeteilt
  -- 1. ai_tags: vom LLM beim Import gesetzt (cuisine, diet, lifestyle)
  --    z.B. ['italienisch', 'vegetarisch', 'meal-prep', 'sommerlich']
  -- 2. computed_tags: vom Server gesetzt nach Nutrition-Computation
  --    z.B. ['high-protein', 'low-carb', 'healthy-fast-food', 'low-cal']
  -- 3. user_tags: manuell vom User
  --    z.B. ['lieblings', 'mama-rezept', 'date-night']
  ai_tags text[] not null default '{}',
  computed_tags text[] not null default '{}',
  user_tags text[] not null default '{}',

  -- Legacy: vereinheitlichte Sicht für Suche/Filter (Trigger erhält das aktuell)
  tags text[] generated always as (
    array_cat(array_cat(ai_tags, computed_tags), user_tags)
  ) stored,

  notes text,
  is_favorite boolean not null default false,

  -- Cook-Stats (denormalisiert für schnelles Querying)
  times_cooked int not null default 0,
  last_cooked_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipes_household_idx on recipes(household_id);
create index recipes_title_trgm_idx on recipes using gin (title gin_trgm_ops);
create index recipes_tags_idx on recipes using gin (tags);
create index recipes_total_time_idx on recipes(total_time_minutes) where total_time_minutes is not null;
create index recipes_protein_idx on recipes(protein_g_per_serving desc) where protein_g_per_serving is not null;
create index recipes_kcal_idx on recipes(kcal_per_serving) where kcal_per_serving is not null;
create index recipes_last_cooked_idx on recipes(household_id, last_cooked_at desc nulls last);

create table recipe_ingredients (
  id uuid primary key default uuid_generate_v4(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  position int not null,

  name text not null,               -- "Hähnchenbrust", "Olivenöl"
  amount numeric,                   -- Menge in unit
  unit text,                        -- "g", "ml", "Stk", "EL"

  -- Provenance: woher kommt diese Zutat? Siehe docs/RECIPE_IMPORT.md
  -- Schema: { source_type, confidence, note? }
  -- source_type: 'description' | 'pinned_comment' | 'caption' | 'transcript'
  --            | 'jsonld' | 'firecrawl_markdown' | 'image_ocr' | 'linked_page' | 'manual'
  provenance jsonb,

  -- Migros-Verknüpfung (asynchron befüllt nach Import)
  migros_product_id text,
  migros_product_name text,
  migros_price_chf numeric,
  migros_available_at_stans boolean,
  migros_last_checked_at timestamptz,

  -- Open Food Facts Fallback
  off_product_code text,

  -- Nährwerte pro Einheit (von Migros oder OFF gelernt)
  kcal_per_100g numeric,
  protein_g_per_100g numeric,
  carbs_g_per_100g numeric,
  fat_g_per_100g numeric,

  notes text,
  created_at timestamptz not null default now()
);

create index recipe_ingredients_recipe_idx on recipe_ingredients(recipe_id);
create index recipe_ingredients_migros_idx on recipe_ingredients(migros_product_id) where migros_product_id is not null;

create table recipe_steps (
  id uuid primary key default uuid_generate_v4(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  position int not null,
  instruction text not null,
  duration_minutes int,
  -- Provenance siehe recipe_ingredients
  provenance jsonb,
  created_at timestamptz not null default now()
);

create index recipe_steps_recipe_idx on recipe_steps(recipe_id);


-- =============================================================================
-- RECIPE EXTRACTION JOBS — async multi-source recipe import
-- =============================================================================
-- Ein Job pro Import-Anfrage. UI subscribed via Supabase Realtime auf updates.
-- Worker-Service (Vercel Function ODER externer Worker) verarbeitet Status='pending'.
-- Siehe docs/RECIPE_IMPORT.md für komplette Pipeline-Beschreibung.

create type extraction_job_status as enum (
  'pending', 'detecting', 'fetching', 'transcribing',
  'synthesizing', 'awaiting_user', 'done', 'failed'
);

create table recipe_extraction_jobs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,

  -- Input: was hat der User reingeworfen
  -- Schema: { type: 'url'|'text'|'image', url?, text?, image_path? }
  input_payload jsonb not null,
  input_hash text not null,           -- SHA256 für Idempotenz/Cache

  detected_source_type text,          -- 'youtube_video', 'instagram_reel', 'web_url', etc.

  status extraction_job_status not null default 'pending',

  -- Live-Progress: Array von { step, status, started_at, finished_at, message? }
  -- Streamt zur UI via Supabase Realtime
  progress jsonb default '[]'::jsonb,

  -- Gesammelte Sources (siehe RawSourceContent in extraction-strategy.ts)
  sources jsonb,

  -- Finales ExtractionResult oder Fehler
  result jsonb,
  error_text text,

  -- Bei erfolgreichem Save: foreign key zum erstellten Recipe
  created_recipe_id uuid references recipes(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipe_extraction_jobs_user_idx on recipe_extraction_jobs(user_id, created_at desc);
create index recipe_extraction_jobs_status_idx on recipe_extraction_jobs(status) where status in ('pending', 'detecting', 'fetching', 'transcribing', 'synthesizing');
create index recipe_extraction_jobs_input_hash_idx on recipe_extraction_jobs(input_hash, status) where status = 'done';


-- =============================================================================
-- RECIPE EQUIPMENT — was braucht es um das Rezept zu kochen?
-- =============================================================================
-- Equipment-Namen sind kanonisch (siehe src/lib/recipes/equipment.ts EQUIPMENT_CATALOG).
-- Beim Import erkennt der LLM Equipment aus den Steps. User kann manuell editieren.
-- Frontend zeigt: "Du brauchst: Weber-Grill, Räucherrohr". Wenn User "Räucherrohr" nicht
-- in user_equipment hat → Hinweis, weil sonst nicht kochbar.

create table recipe_equipment (
  id uuid primary key default uuid_generate_v4(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  -- Kanonischer Name aus EQUIPMENT_CATALOG (z.B. 'weber-grill', 'sous-vide-stick',
  -- 'pizzastein', 'räucherrohr', 'kenwood-cooking-chef', 'airfryer')
  -- Wenn LLM einen unbekannten Namen vorschlägt: speichern + UI zeigt als "uncommon"
  equipment_key text not null,
  -- Display-Name in der UI ("Weber Genesis II", "Sous-Vide-Stick (z.B. Anova)")
  display_name text not null,
  -- 'required' = ohne dieses Equipment geht's nicht
  -- 'recommended' = besser, aber improvisierbar
  -- 'optional' = nice-to-have
  importance text not null default 'required'
    check (importance in ('required', 'recommended', 'optional')),
  notes text,                        -- z.B. "indirekte Hitze auf Niedrigtemperatur"
  created_at timestamptz not null default now(),

  unique(recipe_id, equipment_key)
);

create index recipe_equipment_recipe_idx on recipe_equipment(recipe_id);
create index recipe_equipment_key_idx on recipe_equipment(equipment_key);


-- =============================================================================
-- PANTRY — was hat der Haushalt zuhause?
-- =============================================================================
-- Wird genutzt für "Was kann ich heute kochen?" Vorschläge.
-- Quellen: manuelles Adding, Migros-Kassenbon-Scan (Phase 2), AI-Coach-Conversation.
-- Pantry-Staples (Salz, Pfeffer, Wasser, Olivenöl) werden im Pantry-Match-Code als
-- "implizit vorhanden" behandelt — User muss die nicht jedes Mal eintragen.

create table pantry_items (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  added_by uuid not null references auth.users(id),

  -- Kanonischer Zutaten-Name (siehe canonicalizeIngredient in normalize.ts)
  ingredient_name text not null,
  amount numeric,
  unit text,                          -- 'g', 'ml', 'Stk', etc.
  -- Optional: vom User getragene Notiz ("im Tiefkühler", "vom Bauern")
  notes text,
  -- Auto-Decrement nach Cook-Logging? Default ja.
  auto_decrement boolean not null default true,

  expires_at date,                    -- für "verbrauche bald" Hinweise
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pantry_items_household_idx on pantry_items(household_id);
create index pantry_items_name_idx on pantry_items(household_id, ingredient_name);
create index pantry_items_expires_idx on pantry_items(household_id, expires_at)
  where expires_at is not null;


-- =============================================================================
-- RECIPE COOKS — Log was wann nachgekocht wurde
-- =============================================================================
-- Wenn User "Heute gekocht" tappt: ein recipe_cooks Row + entsprechende
-- nutrition_logs Rows (eine pro Macro). Optional: Pantry decrement.
-- AI-Coach nutzt das für Kontext: "Du hast vor 3 Tagen Spare Ribs gegessen,
-- diese Woche schon 4× Hähnchen — wie wär's mit was anderem?"

-- meal_type wird in recipe_cooks (4 Standard-Meals) UND nutrition_logs ('other'
-- für freistehende Snacks / Pre-Workout-Shake / Restaurant-Smalltalk) verwendet.
create type meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack', 'other');

create table recipe_cooks (
  id uuid primary key default uuid_generate_v4(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,

  cooked_at timestamptz not null default now(),
  meal_type meal_type not null,
  servings_eaten numeric not null default 1,

  -- Snapshots: zum Zeitpunkt des Cookings — falls Recipe später editiert wird,
  -- bleibt die historische Wahrheit erhalten
  kcal_consumed numeric,
  protein_g_consumed numeric,
  carbs_g_consumed numeric,
  fat_g_consumed numeric,

  pantry_decremented boolean not null default false,
  rating int check (rating between 1 and 5),  -- optional
  notes text,                          -- "diesmal mit weniger Salz"

  created_at timestamptz not null default now()
);

create index recipe_cooks_recipe_idx on recipe_cooks(recipe_id, cooked_at desc);
create index recipe_cooks_user_idx on recipe_cooks(user_id, cooked_at desc);
create index recipe_cooks_household_recent_idx on recipe_cooks(household_id, cooked_at desc);

-- Trigger: bei recipe_cooks insert → recipes.times_cooked++ und last_cooked_at update
create or replace function update_recipe_cook_stats()
returns trigger language plpgsql as $$
begin
  update recipes
    set times_cooked = times_cooked + 1,
        last_cooked_at = greatest(coalesce(last_cooked_at, NEW.cooked_at), NEW.cooked_at)
    where id = NEW.recipe_id;
  return NEW;
end;
$$;

create trigger recipe_cooks_update_recipe_stats
  after insert on recipe_cooks
  for each row execute function update_recipe_cook_stats();


-- =============================================================================
-- USER-SPEZIFISCHE DATEN (NICHT shared via household)
-- =============================================================================

-- =============================================================================
-- MAKRO-ZIELE
-- =============================================================================

create table macro_targets (
  user_id uuid primary key references auth.users(id) on delete cascade,

  kcal_target int not null,
  protein_g_target int not null,
  carbs_g_target int not null,
  fat_g_target int not null,
  fiber_g_target int,

  -- Trainings-Tag-Adjustment (wird auf Basiswerte addiert wenn Training-Tag erkannt)
  training_day_kcal_offset int default 0,
  training_day_protein_offset int default 0,
  training_day_carbs_offset int default 0,
  training_day_fat_offset int default 0,

  updated_at timestamptz not null default now()
);


-- =============================================================================
-- NUTRITION LOGGING
-- =============================================================================

-- meal_type ist oben definiert (gleicher Type wird in recipe_cooks + nutrition_logs verwendet)
create type nutrition_source as enum ('barcode', 'recipe', 'photo_estimate', 'manual', 'restaurant_estimate');

create table nutrition_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,

  logged_at timestamptz not null default now(),
  meal_type meal_type not null default 'other',

  -- Was wurde gegessen
  description text not null,
  recipe_id uuid references recipes(id),    -- falls aus Rezept (mit Portions-Skalierung)
  recipe_servings numeric,                  -- Anzahl Portionen vom Rezept

  -- Nährwerte (final, ggf. user-edited)
  kcal numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  fiber_g numeric,

  -- Quelle / Metadaten
  source nutrition_source not null,
  source_image_path text,                   -- Foto bei photo_estimate
  source_barcode text,                      -- bei barcode
  confidence_score numeric,                 -- 0-1, bei AI-Schätzungen
  ai_raw_response jsonb,                    -- für Audit / Debug

  notes text,
  created_at timestamptz not null default now()
);

create index nutrition_logs_user_date_idx on nutrition_logs(user_id, logged_at desc);

-- Cache für barcode-lookup, vermeidet doppelte API-Calls
create table food_items_cache (
  id uuid primary key default uuid_generate_v4(),
  barcode text unique,
  name text not null,
  brand text,
  kcal_per_100g numeric,
  protein_g_per_100g numeric,
  carbs_g_per_100g numeric,
  fat_g_per_100g numeric,
  fiber_g_per_100g numeric,
  source text not null,                     -- 'openfoodfacts', 'migros', 'manual'
  source_data jsonb,
  fetched_at timestamptz not null default now()
);

create index food_items_cache_barcode_idx on food_items_cache(barcode);
create index food_items_cache_name_trgm_idx on food_items_cache using gin (name gin_trgm_ops);


-- =============================================================================
-- TRAINING
-- =============================================================================

-- Übungs-Katalog (nicht user-scoped, geteilt)
create type muscle_group as enum (
  'chest', 'back_lats', 'back_upper', 'shoulders_front', 'shoulders_side',
  'shoulders_rear', 'biceps', 'triceps', 'forearms',
  'quads', 'hamstrings', 'glutes', 'calves', 'core', 'cardio'
);

create type equipment_type as enum (
  'barbell', 'dumbbell', 'cable', 'machine', 'bodyweight',
  'kettlebell', 'resistance_band', 'smith_machine', 'leg_press',
  'pull_up_bar', 'dip_bars', 'bench', 'squat_rack',
  'rower', 'bike', 'treadmill', 'elliptical', 'none'
);

create table exercises (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,                -- 'barbell-bench-press'
  name_de text not null,                    -- 'Bankdrücken Langhantel'
  name_en text not null,
  primary_muscle muscle_group not null,
  secondary_muscles muscle_group[],
  equipment equipment_type[] not null,      -- mehrere möglich (z.B. ['barbell', 'bench'])

  -- Bewegungs-Charakteristik (für AI Substitution)
  movement_pattern text,                    -- 'horizontal_push', 'vertical_pull', 'hip_hinge', etc.
  is_compound boolean not null default false,
  is_unilateral boolean not null default false,

  -- Hebellogik / Notes (wichtig für Mike's Substitution-Logik)
  notes_de text,                            -- z.B. "Lange Trizeps-Kopf braucht Schulterextension"

  created_at timestamptz not null default now()
);

create index exercises_primary_muscle_idx on exercises(primary_muscle);
create index exercises_equipment_idx on exercises using gin (equipment);


-- User-Equipment (was hat User im Gym/Home Gym)
create table user_equipment (
  user_id uuid not null references auth.users(id) on delete cascade,
  equipment equipment_type not null,
  available boolean not null default true,
  notes text,
  primary key (user_id, equipment)
);


-- Training-Plan-Templates
create table training_plans (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,                       -- 'GK 2x/Woche'
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Plan-Days (z.B. "GK A", "GK B")
create table training_plan_days (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references training_plans(id) on delete cascade,
  position int not null,                    -- Reihenfolge
  name text not null,                       -- 'Ganzkörper A'
  notes text,
  created_at timestamptz not null default now()
);

-- Übungen pro Plan-Day (mit Default-Setvorgaben)
create table training_plan_exercises (
  id uuid primary key default uuid_generate_v4(),
  plan_day_id uuid not null references training_plan_days(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  position int not null,

  -- Default-Vorgaben (kann per Session überschrieben werden)
  target_sets int not null default 2,
  target_reps int not null default 6,       -- Mike: 5–7, default 6
  target_rir int not null default 0,
  warmup_sets int not null default 1,

  notes text,
  created_at timestamptz not null default now()
);

create index training_plan_exercises_day_idx on training_plan_exercises(plan_day_id);


-- Substitutionen (User-spezifisch — "diese Übung tut weh, ersetz durch jene")
create type substitution_reason as enum (
  'pain', 'no_equipment', 'preference', 'temporary'
);

create table exercise_substitutions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_exercise_id uuid not null references exercises(id),
  replacement_exercise_id uuid not null references exercises(id),
  reason substitution_reason not null,
  is_permanent boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create index exercise_substitutions_user_idx on exercise_substitutions(user_id);


-- Workout-Sessions (eine pro Trainings-Einheit)
create table workout_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_day_id uuid references training_plan_days(id),

  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_minutes int generated always as (
    case when ended_at is not null
      then extract(epoch from (ended_at - started_at)) / 60
      else null
    end
  ) stored,

  -- Subjektive Bewertung
  perceived_effort int,                     -- 1-10 RPE
  notes text,

  -- AI-Coach-Output für diese Session
  ai_summary text,
  ai_deload_recommendation jsonb,

  created_at timestamptz not null default now()
);

create index workout_sessions_user_date_idx on workout_sessions(user_id, started_at desc);


-- Einzelne Sets innerhalb einer Session
create type set_type as enum ('warmup', 'working', 'dropset', 'amrap');

create table workout_sets (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references workout_sessions(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  position int not null,
  set_type set_type not null default 'working',

  weight_kg numeric not null,
  reps int not null,
  rir int,                                  -- Reps in Reserve, null wenn nicht angegeben
  reached_failure boolean not null default false,

  -- Rest-Time bis zum NÄCHSTEN Set (in Sekunden, optional)
  rest_seconds int,

  notes text,
  completed_at timestamptz not null default now()
);

create index workout_sets_session_idx on workout_sets(session_id);
create index workout_sets_user_exercise_idx on workout_sets(exercise_id, completed_at desc);


-- =============================================================================
-- BODY METRICS (Withings + manuell)
-- =============================================================================

create type metric_source as enum ('withings', 'manual', 'samsung_health', 'health_connect');

create table body_metrics (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at timestamptz not null,

  weight_kg numeric,
  body_fat_pct numeric,
  muscle_mass_kg numeric,
  bone_mass_kg numeric,
  water_pct numeric,
  visceral_fat int,
  hrv_ms numeric,                           -- Heart Rate Variability
  resting_hr int,
  vo2_max numeric,
  blood_pressure_systolic int,
  blood_pressure_diastolic int,
  body_temp_c numeric,

  source metric_source not null,
  source_id text,                           -- external ID
  raw jsonb,

  created_at timestamptz not null default now(),
  unique (user_id, measured_at, source)
);

create index body_metrics_user_date_idx on body_metrics(user_id, measured_at desc);


-- =============================================================================
-- ACTIVITIES (Strava + Health Connect + Manual)
-- =============================================================================

create type activity_source as enum ('strava', 'health_connect', 'samsung_health', 'manual', 'gpx_import');
create type activity_type as enum (
  'run', 'walk', 'hike', 'mtb', 'road_bike', 'gravel_bike',
  'swim', 'sup', 'climbing', 'rowing', 'cardio_indoor', 'other'
);

create table activities (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  duration_seconds int not null,
  distance_km numeric,
  elevation_gain_m numeric,
  calories_kcal numeric,
  hr_avg int,
  hr_max int,
  zone_2_minutes int,                       -- für Mike's Cardio-Tracking
  type activity_type not null,
  name text,
  notes text,
  source activity_source not null,
  source_id text,                           -- external ID, für Dedup
  raw jsonb,
  gpx_path text,                            -- Supabase Storage path (optional)
  created_at timestamptz not null default now(),
  unique (user_id, source, source_id)
);

create index activities_user_date_idx on activities(user_id, started_at desc);


-- =============================================================================
-- EXTERNE INTEGRATIONS — TOKEN STORAGE
-- =============================================================================

create type integration_provider as enum ('withings', 'strava', 'elevenlabs');

create table integration_tokens (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider integration_provider not null,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  external_user_id text,
  raw jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);


-- =============================================================================
-- AI CHAT & TOOL CALLS
-- =============================================================================

create type chat_role as enum ('user', 'assistant', 'system', 'tool');

create table chat_threads (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chat_threads_user_idx on chat_threads(user_id, updated_at desc);

create table chat_messages (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid not null references chat_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role chat_role not null,
  content text not null,
  tool_calls jsonb,                         -- AI SDK tool calls
  tool_call_id text,                        -- bei role='tool'
  model text,                               -- welches Modell antwortete
  tokens_in int,
  tokens_out int,
  created_at timestamptz not null default now()
);

create index chat_messages_thread_idx on chat_messages(thread_id, created_at);


-- Audit-Log für AI-Tool-Calls (was hat AI mit User-Daten gemacht)
create table ai_tool_calls (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references chat_threads(id),
  message_id uuid references chat_messages(id),
  tool_name text not null,
  arguments jsonb not null,
  result jsonb,
  error text,
  duration_ms int,
  created_at timestamptz not null default now()
);

create index ai_tool_calls_user_idx on ai_tool_calls(user_id, created_at desc);


-- =============================================================================
-- AI USAGE / COST TRACKING
-- =============================================================================
-- Tracking pro AI-Aufruf für: Cost-Awareness, Public-Demo-Page ("schau was AI kostet"),
-- Optimization (welche Pipeline ist teuer?), Rate-Limiting.

create table ai_usage_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  -- Was hat den Call ausgelöst:
  -- 'recipe_extraction' | 'recipe_synthesis' | 'coach_chat' | 'photo_calorie'
  -- 'meal_plan_generation' | 'recipe_variation' | 'daily_standup' | 'embedding'
  feature text not null,
  -- Verwendetes Model: 'anthropic/claude-opus-4.7', 'google/gemini-3.1-pro', 'elevenlabs/scribe', ...
  model text not null,
  input_tokens int,
  output_tokens int,
  -- Bei STT: Audio-Sekunden statt Tokens
  audio_seconds numeric,
  -- Bei Vision: Image-Tiles
  image_tiles int,
  -- USD basierend auf Provider-Preisen (am Aufruf-Zeitpunkt cached)
  cost_usd numeric not null default 0,
  -- Optional: links zur Quelle (z.B. recipe_extraction_jobs.id)
  related_entity_type text,
  related_entity_id uuid,
  duration_ms int,
  created_at timestamptz not null default now()
);

create index ai_usage_logs_user_date_idx on ai_usage_logs(user_id, created_at desc);
create index ai_usage_logs_feature_idx on ai_usage_logs(feature, created_at desc);


-- =============================================================================
-- GOALS / PHASES — Cut, Bulk, Maintenance
-- =============================================================================
-- Aktuelle Phase eines Users mit Macro-Targets + Auto-Adjust Logic.
-- Wenn Gewichts-Trend abweicht von erwarteter Rate: Coach passt kcal an
-- (vorgeschlagen/automatisch je nach User-Setting).

create type goal_phase_type as enum ('cut', 'bulk', 'maintenance', 'recomp');
create type goal_phase_status as enum ('active', 'paused', 'completed', 'aborted');

create table user_goals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,

  phase_type goal_phase_type not null,
  status goal_phase_status not null default 'active',

  -- Zeit-Rahmen
  started_at date not null default current_date,
  target_end_at date,

  -- Gewichts-Ziel
  start_weight_kg numeric not null,
  target_weight_kg numeric,
  -- erwartete Rate, z.B. -0.5 kg/Woche für Cut, +0.25 kg/Woche für Lean Bulk
  weekly_rate_kg numeric,

  -- Macro-Targets während dieser Phase
  -- Können von macro_targets Tabelle separat sein — diese Goal-spezifischen Werte überschreiben
  daily_kcal_target int,
  daily_protein_g_target numeric,
  daily_carbs_g_target numeric,
  daily_fat_g_target numeric,

  -- Auto-Adjust: Coach passt kcal an wenn Trend abweicht
  -- 'manual' = nur Vorschlag, User bestätigt
  -- 'semi_auto' = Coach schlägt vor, User kann revoken
  -- 'auto' = direkte Anpassung
  adjustment_mode text not null default 'semi_auto'
    check (adjustment_mode in ('manual', 'semi_auto', 'auto')),

  -- Diagnostics: Log der Anpassungen
  -- [{at, reason, previous_kcal, new_kcal, weekly_trend_kg}]
  adjustment_log jsonb not null default '[]'::jsonb,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nur ein aktives Goal pro User
create unique index user_goals_one_active_idx on user_goals(user_id) where status = 'active';
create index user_goals_user_idx on user_goals(user_id, started_at desc);

-- Goal-Erweiterung: Muscle-Priorities + Training-Goals können sich mit der Phase ändern.
-- Beispiel: "Cut bis 80kg" mit Priorität ['shoulders'], danach "+5kg lean bulk" mit ['back', 'legs'].
-- Diese sind redundant zu training_preferences, aber Goal-spezifisch (Phase-bezogen).
alter table user_goals add column if not exists muscle_priorities text[] not null default '{}';
alter table user_goals add column if not exists secondary_objective text;
  -- Freitext: 'Hormone optimieren', 'Marathon-Vorbereitung', 'Sommerform'


-- =============================================================================
-- MEAL PLANS — Wochenplan / Mehrtagesplan
-- =============================================================================
-- User oder AI-Coach generiert einen Plan über N Tage. Pro Tag pro Mealtype
-- ein Recipe oder ein freier Eintrag. Plan kann Macro-Constraints prüfen,
-- Pantry priorisieren, Recent-Cooks vermeiden.

create table meal_plans (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,

  name text not null,                  -- "Woche 18", "Cut Week 3"
  start_date date not null,
  end_date date not null check (end_date >= start_date),

  -- Constraint-Snapshot zum Zeitpunkt der Generierung
  -- { kcal_per_day, protein_g_per_day, max_repeat_in_window, ... }
  generation_constraints jsonb,

  -- Wer hat's gebaut: 'user' = manuell, 'ai' = AI-Coach
  created_by_kind text not null default 'user' check (created_by_kind in ('user', 'ai')),

  -- Status: für AI-generierte Pläne kann der User "approve" / "edit" / "dismiss"
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meal_plans_user_idx on meal_plans(user_id, start_date desc);
create index meal_plans_active_idx on meal_plans(user_id, status) where status = 'active';

create table meal_plan_entries (
  id uuid primary key default uuid_generate_v4(),
  meal_plan_id uuid not null references meal_plans(id) on delete cascade,
  for_date date not null,
  meal_type meal_type not null,
  -- Entweder: konkretes Recipe…
  recipe_id uuid references recipes(id) on delete set null,
  -- …oder Freitext (z.B. "Zmittag im Restaurant", "Reste vom Vortag")
  free_text text,
  servings_planned numeric not null default 1,

  -- Snapshot der erwarteten Nährwerte (für Plan-Aggregation ohne Recipe-Lookup)
  expected_kcal numeric,
  expected_protein_g numeric,
  expected_carbs_g numeric,
  expected_fat_g numeric,

  -- Wenn User den Plan-Eintrag tatsächlich gegessen hat → Link zu recipe_cook
  -- (nur wenn recipe_id gesetzt ist)
  actual_cook_id uuid references recipe_cooks(id) on delete set null,

  position int not null default 0,    -- für mehrere Snacks am Tag
  notes text,
  created_at timestamptz not null default now(),

  check (recipe_id is not null or free_text is not null)
);

create index meal_plan_entries_plan_idx on meal_plan_entries(meal_plan_id, for_date, meal_type);
create index meal_plan_entries_date_idx on meal_plan_entries(for_date);


-- =============================================================================
-- DAILY STANDUPS — proaktive Morgen-Insights vom AI-Coach
-- =============================================================================
-- Einmal pro Tag (oder via Trigger bei erstem App-Open) generiert der Coach
-- einen Morgen-Brief. Persistiert damit User auch später nochmal nachlesen kann.

create table daily_standups (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  for_date date not null,

  -- Generierter Inhalt: kurzer Brief mit gestern Recap, heute Vorschau, Tipp
  -- {greeting, yesterday_recap, today_outlook, tip, suggested_actions}
  content jsonb not null,

  -- Welche Daten der Coach gesehen hat (für Re-Generation falls nötig)
  context_snapshot jsonb,

  -- User-Reaktion: 'unread' | 'read' | 'dismissed' | 'acted_on'
  user_action text not null default 'unread',
  read_at timestamptz,

  created_at timestamptz not null default now(),

  unique(user_id, for_date)
);

create index daily_standups_user_date_idx on daily_standups(user_id, for_date desc);


-- =============================================================================
-- BODY PHOTOS — wöchentlicher visueller Check-in
-- =============================================================================
-- User wird einmal pro Woche erinnert (Sonntag morgens), Front/Side/Back-Photos
-- zu machen. AI-Coach analysiert Set: Imbalances, Posture, Conditioning-Trend.
-- Set wird mit Vorwoche verglichen → "Schulter-Asymmetrie etwas verbessert,
-- Beine wachsen langsamer als Rest → Volume-Anpassung empfohlen".

create table body_photos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  taken_at timestamptz not null default now(),

  -- Storage-Paths in Supabase Storage (Bucket: 'body-photos', RLS-protected)
  -- { front: 'path1.jpg', side: 'path2.jpg', back: 'path3.jpg' }
  photo_paths jsonb not null,

  -- Snapshot-Werte vom Aufnahmezeitpunkt
  weight_kg numeric,
  body_fat_pct numeric,
  notes text,

  -- AI-Analyse-Ergebnis (kommt async via posture-analysis.ts)
  -- Schema siehe BodyPhotoAnalysisSchema in posture-analysis.ts
  ai_analysis jsonb,
  ai_analyzed_at timestamptz,

  created_at timestamptz not null default now()
);

create index body_photos_user_date_idx on body_photos(user_id, taken_at desc);


-- =============================================================================
-- LAB RESULTS — Bluttest-Upload + AI-Interpretation
-- =============================================================================
-- User lädt Bluttest hoch (PDF/Foto), AI extrahiert Werte, vergleicht mit
-- Referenzbereichen UND aktueller Forschung (nicht DGE/USDA), schlägt
-- Supplements / Lifestyle / Follow-up-Tests vor.

create type lab_panel_type as enum (
  'basic',         -- großes Blutbild, Differenzialblutbild
  'metabolic',     -- Glucose, HbA1c, Lipide, Leber-, Nieren-Werte
  'hormonal',      -- Testosteron (frei + total), Estradiol, Cortisol, SHBG, LH/FSH
  'thyroid',       -- TSH, fT3, fT4, Anti-TPO, Anti-TG
  'micronutrients',-- Vitamin D3, B12 (Holo-TC besser), Magnesium, Zink, Eisen, Ferritin
  'inflammation',  -- CRP, hs-CRP, Homocystein
  'custom'
);

create table lab_results (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  taken_at date not null,
  panel_type lab_panel_type not null,

  -- Original-Datei (PDF / Foto vom Laborbericht)
  source_file_path text,
  source_lab_name text,                  -- z.B. 'Synlab', 'Sonic'

  -- Strukturierte Werte: { test_name: { value, unit, reference_low, reference_high, flag? } }
  -- z.B. { vitamin_d3: { value: 22, unit: 'ng/ml', reference_low: 30, reference_high: 100, flag: 'low' } }
  raw_values jsonb not null,

  -- AI-Interpretation
  -- Schema: { summary, concerning_values, suggested_supplements, suggested_lifestyle,
  --           suggested_followup_tests, evidence_sources }
  ai_interpretation jsonb,
  ai_interpreted_at timestamptz,
  -- Welche Studien / Quellen hat AI zitiert
  evidence_sources jsonb,

  notes text,
  created_at timestamptz not null default now()
);

create index lab_results_user_date_idx on lab_results(user_id, taken_at desc);


-- =============================================================================
-- SUPPLEMENTS — User's aktive Supplement-Routine
-- =============================================================================
-- Aktuelle Stack + Historie. Coach kann basierend auf Lab-Results / Symptoms
-- Anpassungen vorschlagen. Keine Auto-Buy, nur Empfehlungen + Tracking.

create table user_supplements (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Kanonischer Name: 'omega-3-epa-dha', 'vitamin-d3', 'magnesium-glycinate',
  -- 'creatine-monohydrate', 'zinc-bisglycinate', 'k2-mk7', 'esn-eslids-deck'
  name text not null,
  display_name text not null,
  brand text,                            -- z.B. 'ESN', 'Sundt', 'Pure Encapsulations'

  -- Dosierung
  dosage_amount numeric not null,
  dosage_unit text not null,             -- 'mg', 'ug', 'IU', 'g', 'capsules'
  frequency text not null,               -- 'daily', '2x_daily', 'with_meal', 'morning', 'evening', 'as_needed'

  -- Begründung
  reason text,                           -- z.B. 'low D3 in Bluttest 04/2026'
  source_recommendation_id uuid references lab_results(id),

  -- Status
  started_at date not null default current_date,
  ended_at date,                         -- null = aktiv

  -- Studien-Referenzen (welche Quelle motiviert die Dosierung)
  evidence_links text[],

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_supplements_active_idx on user_supplements(user_id) where ended_at is null;
create index user_supplements_user_idx on user_supplements(user_id, started_at desc);

-- Compliance-Tracking — optional, für User die genau wissen wollen ob sie
-- regelmässig nehmen
create table supplement_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  supplement_id uuid not null references user_supplements(id) on delete cascade,
  taken_at timestamptz not null default now(),
  dosage_amount numeric,                 -- override falls anders als Standard
  notes text
);

create index supplement_logs_user_date_idx on supplement_logs(user_id, taken_at desc);


-- =============================================================================
-- TRAINING PREFERENCES — konfigurierbar pro User
-- =============================================================================
-- Damit andere Forks der App andere Trainings-Styles nutzen können.
-- Denny: Iron Mike (fullbody_x2, 6 reps, RIR 0-1, ~30min Sessions)
-- Andere mögen: PPL_x6, 8-12 reps, 3 sets, 60-90min Sessions

create table training_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Wieviele Sessions pro Woche
  strength_sessions_per_week int not null default 2,
  cardio_sessions_per_week int not null default 2,

  -- Split-Style
  -- 'fullbody_x2' (Mike), 'fullbody_x3', 'upper_lower', 'push_pull_legs',
  -- 'bro_split', 'arnold_split', 'custom'
  split_style text not null default 'fullbody_x2',

  -- Volumen-Stil
  -- 'low_volume_high_intensity' (Mike: 1-2 working sets to failure)
  -- 'medium' (3 sets 6-10 reps RIR 1-3)
  -- 'high_volume_classic' (4-5 sets 8-12 reps)
  volume_style text not null default 'low_volume_high_intensity',

  -- Rep-Range Präferenz
  rep_range_min int not null default 5,
  rep_range_max int not null default 7,

  -- RIR Präferenz (Reps in Reserve)
  preferred_rir_min int not null default 0,
  preferred_rir_max int not null default 1,

  -- Wieviele Working-Sets pro Übung (Standard, kann pro Übung overridden werden)
  working_sets_per_exercise int not null default 2,
  warmup_sets_first_exercise int not null default 2,
  warmup_sets_subsequent int not null default 1,

  -- Ziel-Sessiondauer (Minuten) — Plan-Generator versucht in dem Range zu bleiben
  session_duration_target_min int not null default 30,
  session_duration_target_max int not null default 45,

  -- Aktuelle Trainings-Goals (orthogonal zur Phase wie Cut/Bulk)
  -- z.B. ['fat_loss', 'strength', 'hypertrophy', 'endurance', 'mobility']
  training_goals text[] not null default array['hypertrophy', 'strength']::text[],

  -- Muskel-Prioritäten (vom AI-Posture-Analyst gesetzt oder vom User)
  -- z.B. ['shoulders', 'back', 'glutes']
  muscle_priorities text[] not null default '{}',
  -- Coach passt Volumen für diese Gruppen nach oben an

  -- Cardio-Stil
  cardio_zone_focus text not null default 'zone_2'
    check (cardio_zone_focus in ('zone_2', 'zone_5_hiit', 'mixed', 'sport_specific')),

  updated_at timestamptz not null default now()
);


-- =============================================================================


-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Households
alter table households enable row level security;
create policy "members can read own household"
  on households for select using (id = current_household_id());

alter table household_members enable row level security;
create policy "users can read own membership"
  on household_members for select using (user_id = auth.uid() or household_id = current_household_id());


-- Recipes (household-scoped, alle Mitglieder können R/W)
alter table recipes enable row level security;
create policy "household members can select recipes"
  on recipes for select using (household_id = current_household_id());
create policy "household members can insert recipes"
  on recipes for insert with check (household_id = current_household_id() and created_by = auth.uid());
create policy "household members can update recipes"
  on recipes for update using (household_id = current_household_id());
create policy "only admins can delete recipes"
  on recipes for delete using (household_id = current_household_id() and current_member_role() = 'admin');

alter table recipe_ingredients enable row level security;
create policy "via recipe access"
  on recipe_ingredients for all using (
    exists (select 1 from recipes r where r.id = recipe_id and r.household_id = current_household_id())
  );

alter table recipe_steps enable row level security;
create policy "via recipe access"
  on recipe_steps for all using (
    exists (select 1 from recipes r where r.id = recipe_id and r.household_id = current_household_id())
  );

-- Recipe Extraction Jobs: User der den Job erstellt hat sieht ihn (per RLS).
-- Wife mit recipe_only kann auch importieren.
alter table recipe_extraction_jobs enable row level security;
create policy "owner can read own extraction jobs"
  on recipe_extraction_jobs for select using (user_id = auth.uid());
create policy "owner can insert own extraction jobs"
  on recipe_extraction_jobs for insert with check (
    user_id = auth.uid() and household_id = current_household_id()
  );
create policy "owner can update own extraction jobs"
  on recipe_extraction_jobs for update using (user_id = auth.uid());

-- Recipe Equipment: via Recipe access (alle Household-Mitglieder, inkl. recipe_only)
alter table recipe_equipment enable row level security;
create policy "via recipe access"
  on recipe_equipment for all using (
    exists (select 1 from recipes r where r.id = recipe_id and r.household_id = current_household_id())
  );

-- Pantry: Household-scoped (alle Mitglieder, inkl. recipe_only)
alter table pantry_items enable row level security;
create policy "household members can read pantry"
  on pantry_items for select using (household_id = current_household_id());
create policy "household members can insert pantry"
  on pantry_items for insert with check (
    household_id = current_household_id() and added_by = auth.uid()
  );
create policy "household members can update pantry"
  on pantry_items for update using (household_id = current_household_id());
create policy "household members can delete pantry"
  on pantry_items for delete using (household_id = current_household_id());

-- Recipe Cooks: User der gekocht hat sieht eigene; recipe_only-Rolle kann eigene logs schreiben
alter table recipe_cooks enable row level security;
create policy "owner reads own cooks"
  on recipe_cooks for select using (user_id = auth.uid());
create policy "owner inserts own cooks"
  on recipe_cooks for insert with check (
    user_id = auth.uid() and household_id = current_household_id()
  );
create policy "owner updates own cooks"
  on recipe_cooks for update using (user_id = auth.uid());
create policy "owner deletes own cooks"
  on recipe_cooks for delete using (user_id = auth.uid());


-- Strict User-Scoped Tables (recipe_only role hat KEINEN Zugriff)
-- Nur Owner liest/schreibt eigene Daten.

alter table macro_targets enable row level security;
create policy "owner only" on macro_targets for all using (user_id = auth.uid());

alter table nutrition_logs enable row level security;
create policy "owner only" on nutrition_logs for all using (user_id = auth.uid());

alter table user_equipment enable row level security;
create policy "owner only" on user_equipment for all using (user_id = auth.uid());

alter table training_plans enable row level security;
create policy "owner only" on training_plans for all using (user_id = auth.uid());

alter table training_plan_days enable row level security;
create policy "via plan ownership"
  on training_plan_days for all using (
    exists (select 1 from training_plans p where p.id = plan_id and p.user_id = auth.uid())
  );

alter table training_plan_exercises enable row level security;
create policy "via plan day ownership"
  on training_plan_exercises for all using (
    exists (
      select 1 from training_plan_days d
      join training_plans p on p.id = d.plan_id
      where d.id = plan_day_id and p.user_id = auth.uid()
    )
  );

alter table exercise_substitutions enable row level security;
create policy "owner only" on exercise_substitutions for all using (user_id = auth.uid());

alter table workout_sessions enable row level security;
create policy "owner only" on workout_sessions for all using (user_id = auth.uid());

alter table workout_sets enable row level security;
create policy "via session ownership"
  on workout_sets for all using (
    exists (select 1 from workout_sessions s where s.id = session_id and s.user_id = auth.uid())
  );

alter table body_metrics enable row level security;
create policy "owner only" on body_metrics for all using (user_id = auth.uid());

alter table activities enable row level security;
create policy "owner only" on activities for all using (user_id = auth.uid());

alter table integration_tokens enable row level security;
create policy "owner only" on integration_tokens for all using (user_id = auth.uid());

alter table chat_threads enable row level security;
create policy "owner only" on chat_threads for all using (user_id = auth.uid());

alter table chat_messages enable row level security;
create policy "owner only" on chat_messages for all using (user_id = auth.uid());

alter table ai_tool_calls enable row level security;
create policy "owner only read"
  on ai_tool_calls for select using (user_id = auth.uid());

-- AI-Cost: User sieht eigene Costs. Server-Side-Aggregat für Demo-Page kann separate View bauen.
alter table ai_usage_logs enable row level security;
create policy "owner reads own ai_usage"
  on ai_usage_logs for select using (user_id = auth.uid());
create policy "system inserts ai_usage"
  on ai_usage_logs for insert with check (true);
  -- (server-side calls bypass RLS via service role)

-- Goals: nur Owner
alter table user_goals enable row level security;
create policy "owner only" on user_goals for all using (user_id = auth.uid());

-- Meal-Plans: Owner liest+schreibt eigene; auch household-shared (Frau sieht Pläne)
-- Aber: nur Plan-Creator darf editieren. recipe_only-Rolle kann lesen, nicht schreiben.
alter table meal_plans enable row level security;
create policy "household reads meal plans"
  on meal_plans for select using (household_id = current_household_id());
create policy "owner inserts meal plans"
  on meal_plans for insert with check (
    user_id = auth.uid() and household_id = current_household_id()
  );
create policy "owner updates own meal plans"
  on meal_plans for update using (user_id = auth.uid());
create policy "owner deletes own meal plans"
  on meal_plans for delete using (user_id = auth.uid());

alter table meal_plan_entries enable row level security;
create policy "via plan access"
  on meal_plan_entries for all using (
    exists (select 1 from meal_plans p
            where p.id = meal_plan_id and p.household_id = current_household_id())
  );

-- Daily Standups: nur Owner
alter table daily_standups enable row level security;
create policy "owner only" on daily_standups for all using (user_id = auth.uid());

-- Body Photos: STRIKT user-scoped (sensitiv!). recipe_only Frau hat KEINEN Zugriff.
alter table body_photos enable row level security;
create policy "owner only photos" on body_photos for all using (user_id = auth.uid());

-- Lab Results: STRIKT user-scoped (medizinisch sensitiv).
alter table lab_results enable row level security;
create policy "owner only labs" on lab_results for all using (user_id = auth.uid());

-- Supplements: STRIKT user-scoped.
alter table user_supplements enable row level security;
create policy "owner only supplements" on user_supplements for all using (user_id = auth.uid());

alter table supplement_logs enable row level security;
create policy "owner only supplement logs" on supplement_logs for all using (user_id = auth.uid());

-- Training Preferences: nur Owner.
alter table training_preferences enable row level security;
create policy "owner only training prefs" on training_preferences for all using (user_id = auth.uid());


-- Shared / catalogue Tabellen — alle dürfen lesen
alter table exercises enable row level security;
create policy "everyone can read exercises"
  on exercises for select using (true);

alter table food_items_cache enable row level security;
create policy "everyone can read cache"
  on food_items_cache for select using (true);
create policy "authenticated can insert cache"
  on food_items_cache for insert with check (auth.role() = 'authenticated');


-- =============================================================================
-- HELPER FUNCTIONS / TRIGGERS
-- =============================================================================

-- Auto-update updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger recipes_updated_at before update on recipes
  for each row execute function set_updated_at();
create trigger training_plans_updated_at before update on training_plans
  for each row execute function set_updated_at();
create trigger chat_threads_updated_at before update on chat_threads
  for each row execute function set_updated_at();
create trigger macro_targets_updated_at before update on macro_targets
  for each row execute function set_updated_at();
create trigger integration_tokens_updated_at before update on integration_tokens
  for each row execute function set_updated_at();


-- =============================================================================
-- INITIAL HOUSEHOLD SETUP
-- =============================================================================
-- Diese Statements MANUELL ausführen nachdem User in Supabase Auth angelegt sind.
-- Beispiel (UUIDs durch echte ersetzen):
--
-- insert into households (id, name) values
--   ('00000000-0000-0000-0000-000000000001', 'Weber Family');
--
-- insert into household_members (household_id, user_id, role) values
--   ('00000000-0000-0000-0000-000000000001', '<denny-uuid>', 'admin'),
--   ('00000000-0000-0000-0000-000000000001', '<frau-uuid>',  'recipe_only');
