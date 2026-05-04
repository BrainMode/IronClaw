/**
 * Drizzle ORM Schema.
 *
 * Spiegelt das Postgres-Schema aus supabase/schema.sql wider, damit wir
 * typesafe Queries schreiben können. Nicht alle Felder enthalten —
 * Claude Code wird das nach Bedarf erweitern.
 *
 * Wichtig: Drizzle generiert KEIN Auth-Schema. auth.users wird referenziert
 * aber nicht gemanagt von Drizzle (Supabase verwaltet das selbst).
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// =============================================================================
// ENUMS
// =============================================================================

export const memberRole = pgEnum("member_role", ["admin", "recipe_only"]);

export const recipeSourceType = pgEnum("recipe_source_type", [
  "manual",
  "photo",
  "web_url",
  "youtube",
  "instagram",
  "tiktok",
  "facebook",
  "other_video",
]);

export const mealType = pgEnum("meal_type", ["breakfast", "lunch", "dinner", "snack", "other"]);

export const nutritionSource = pgEnum("nutrition_source", [
  "barcode",
  "recipe",
  "photo_estimate",
  "manual",
  "restaurant_estimate",
]);

export const setType = pgEnum("set_type", ["warmup", "working", "dropset", "amrap"]);

export const muscleGroup = pgEnum("muscle_group", [
  "chest",
  "back_lats",
  "back_upper",
  "shoulders_front",
  "shoulders_side",
  "shoulders_rear",
  "biceps",
  "triceps",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
  "cardio",
]);

export const equipmentType = pgEnum("equipment_type", [
  "barbell",
  "dumbbell",
  "cable",
  "machine",
  "bodyweight",
  "kettlebell",
  "resistance_band",
  "smith_machine",
  "leg_press",
  "pull_up_bar",
  "dip_bars",
  "bench",
  "squat_rack",
  "rower",
  "bike",
  "treadmill",
  "elliptical",
  "none",
]);

export const substitutionReason = pgEnum("substitution_reason", [
  "pain",
  "no_equipment",
  "preference",
  "temporary",
]);

export const metricSource = pgEnum("metric_source", [
  "withings",
  "manual",
  "samsung_health",
  "health_connect",
]);

export const activitySource = pgEnum("activity_source", [
  "strava",
  "health_connect",
  "samsung_health",
  "manual",
  "gpx_import",
]);

export const activityType = pgEnum("activity_type", [
  "run",
  "walk",
  "hike",
  "mtb",
  "road_bike",
  "gravel_bike",
  "swim",
  "sup",
  "climbing",
  "rowing",
  "cardio_indoor",
  "other",
]);

export const integrationProvider = pgEnum("integration_provider", [
  "withings",
  "strava",
  "elevenlabs",
]);

export const chatRole = pgEnum("chat_role", ["user", "assistant", "system", "tool"]);

export const extractionJobStatus = pgEnum("extraction_job_status", [
  "pending",
  "detecting",
  "fetching",
  "transcribing",
  "synthesizing",
  "awaiting_user",
  "done",
  "failed",
]);

export const goalPhaseType = pgEnum("goal_phase_type", ["cut", "bulk", "maintenance", "recomp"]);

export const goalPhaseStatus = pgEnum("goal_phase_status", [
  "active",
  "paused",
  "completed",
  "aborted",
]);

export const labPanelType = pgEnum("lab_panel_type", [
  "basic",
  "metabolic",
  "hormonal",
  "thyroid",
  "micronutrients",
  "inflammation",
  "custom",
]);

// =============================================================================
// HELPERS
// =============================================================================

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
};

const updatedTimestamps = {
  ...timestamps,
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
};

// =============================================================================
// HOUSEHOLDS
// =============================================================================

export const households = pgTable("households", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  name: text("name").notNull(),
  ...timestamps,
});

export const householdMembers = pgTable(
  "household_members",
  {
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(), // references auth.users(id)
    role: memberRole("role").notNull().default("admin"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId] })],
);

// =============================================================================
// RECIPES
// =============================================================================

export const recipes = pgTable("recipes", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  servingsDefault: integer("servings_default").notNull().default(2),
  prepTimeMinutes: integer("prep_time_minutes"),
  cookTimeMinutes: integer("cook_time_minutes"),
  sourceType: recipeSourceType("source_type").notNull(),
  sourceUrl: text("source_url"),
  sourceImagePath: text("source_image_path"),
  sourceRawContent: jsonb("source_raw_content"),
  kcalPerServing: numeric("kcal_per_serving"),
  proteinGPerServing: numeric("protein_g_per_serving"),
  carbsGPerServing: numeric("carbs_g_per_serving"),
  fatGPerServing: numeric("fat_g_per_serving"),
  fiberGPerServing: numeric("fiber_g_per_serving"),
  nutritionCompleteness: numeric("nutrition_completeness"),
  nutritionComputedAt: timestamp("nutrition_computed_at", { withTimezone: true }),
  aiTags: text("ai_tags").array().notNull().default(sql`'{}'::text[]`),
  computedTags: text("computed_tags").array().notNull().default(sql`'{}'::text[]`),
  userTags: text("user_tags").array().notNull().default(sql`'{}'::text[]`),
  // tags ist generated column in DB, hier als read-only abgebildet
  tags: text("tags").array(),
  notes: text("notes"),
  isFavorite: boolean("is_favorite").notNull().default(false),
  timesCooked: integer("times_cooked").notNull().default(0),
  lastCookedAt: timestamp("last_cooked_at", { withTimezone: true }),
  ...updatedTimestamps,
});

export const recipeIngredients = pgTable("recipe_ingredients", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  recipeId: uuid("recipe_id")
    .notNull()
    .references(() => recipes.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  name: text("name").notNull(),
  amount: numeric("amount"),
  unit: text("unit"),
  provenance: jsonb("provenance"),
  migrosProductId: text("migros_product_id"),
  migrosProductName: text("migros_product_name"),
  migrosPriceChf: numeric("migros_price_chf"),
  migrosAvailableAtStans: boolean("migros_available_at_stans"),
  migrosLastCheckedAt: timestamp("migros_last_checked_at", { withTimezone: true }),
  offProductCode: text("off_product_code"),
  kcalPer100g: numeric("kcal_per_100g"),
  proteinGPer100g: numeric("protein_g_per_100g"),
  carbsGPer100g: numeric("carbs_g_per_100g"),
  fatGPer100g: numeric("fat_g_per_100g"),
  notes: text("notes"),
  ...timestamps,
});

export const recipeSteps = pgTable("recipe_steps", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  recipeId: uuid("recipe_id")
    .notNull()
    .references(() => recipes.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  instruction: text("instruction").notNull(),
  durationMinutes: integer("duration_minutes"),
  provenance: jsonb("provenance"),
  ...timestamps,
});

// =============================================================================
// EXERCISES & TRAINING
// =============================================================================

export const exercises = pgTable("exercises", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  slug: text("slug").notNull().unique(),
  nameDe: text("name_de").notNull(),
  nameEn: text("name_en").notNull(),
  primaryMuscle: muscleGroup("primary_muscle").notNull(),
  secondaryMuscles: muscleGroup("secondary_muscles").array(),
  equipment: equipmentType("equipment").array().notNull(),
  movementPattern: text("movement_pattern"),
  isCompound: boolean("is_compound").notNull().default(false),
  isUnilateral: boolean("is_unilateral").notNull().default(false),
  notesDe: text("notes_de"),
  ...timestamps,
});

export const trainingPlans = pgTable("training_plans", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  userId: uuid("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  ...updatedTimestamps,
});

export const workoutSessions = pgTable("workout_sessions", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  userId: uuid("user_id").notNull(),
  planDayId: uuid("plan_day_id"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().default(sql`now()`),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  perceivedEffort: integer("perceived_effort"),
  notes: text("notes"),
  aiSummary: text("ai_summary"),
  aiDeloadRecommendation: jsonb("ai_deload_recommendation"),
  ...timestamps,
});

export const workoutSets = pgTable("workout_sets", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => workoutSessions.id, { onDelete: "cascade" }),
  exerciseId: uuid("exercise_id")
    .notNull()
    .references(() => exercises.id),
  position: integer("position").notNull(),
  setType: setType("set_type").notNull().default("working"),
  weightKg: numeric("weight_kg").notNull(),
  reps: integer("reps").notNull(),
  rir: integer("rir"),
  reachedFailure: boolean("reached_failure").notNull().default(false),
  restSeconds: integer("rest_seconds"),
  notes: text("notes"),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// =============================================================================
// NUTRITION
// =============================================================================

export const macroTargets = pgTable("macro_targets", {
  userId: uuid("user_id").primaryKey(),
  kcalTarget: integer("kcal_target").notNull(),
  proteinGTarget: integer("protein_g_target").notNull(),
  carbsGTarget: integer("carbs_g_target").notNull(),
  fatGTarget: integer("fat_g_target").notNull(),
  fiberGTarget: integer("fiber_g_target"),
  trainingDayKcalOffset: integer("training_day_kcal_offset").default(0),
  trainingDayProteinOffset: integer("training_day_protein_offset").default(0),
  trainingDayCarbsOffset: integer("training_day_carbs_offset").default(0),
  trainingDayFatOffset: integer("training_day_fat_offset").default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const nutritionLogs = pgTable("nutrition_logs", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  userId: uuid("user_id").notNull(),
  loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().default(sql`now()`),
  mealType: mealType("meal_type").notNull().default("other"),
  description: text("description").notNull(),
  recipeId: uuid("recipe_id"),
  recipeServings: numeric("recipe_servings"),
  kcal: numeric("kcal"),
  proteinG: numeric("protein_g"),
  carbsG: numeric("carbs_g"),
  fatG: numeric("fat_g"),
  fiberG: numeric("fiber_g"),
  source: nutritionSource("source").notNull(),
  sourceImagePath: text("source_image_path"),
  sourceBarcode: text("source_barcode"),
  confidenceScore: numeric("confidence_score"),
  aiRawResponse: jsonb("ai_raw_response"),
  notes: text("notes"),
  ...timestamps,
});

// =============================================================================
// BODY METRICS & ACTIVITIES
// =============================================================================

export const bodyMetrics = pgTable(
  "body_metrics",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    userId: uuid("user_id").notNull(),
    measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
    weightKg: numeric("weight_kg"),
    bodyFatPct: numeric("body_fat_pct"),
    muscleMassKg: numeric("muscle_mass_kg"),
    boneMassKg: numeric("bone_mass_kg"),
    waterPct: numeric("water_pct"),
    visceralFat: integer("visceral_fat"),
    hrvMs: numeric("hrv_ms"),
    restingHr: integer("resting_hr"),
    vo2Max: numeric("vo2_max"),
    bloodPressureSystolic: integer("blood_pressure_systolic"),
    bloodPressureDiastolic: integer("blood_pressure_diastolic"),
    bodyTempC: numeric("body_temp_c"),
    source: metricSource("source").notNull(),
    sourceId: text("source_id"),
    raw: jsonb("raw"),
    ...timestamps,
  },
  (t) => [unique().on(t.userId, t.measuredAt, t.source)],
);

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    userId: uuid("user_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    distanceKm: numeric("distance_km"),
    elevationGainM: numeric("elevation_gain_m"),
    caloriesKcal: numeric("calories_kcal"),
    hrAvg: integer("hr_avg"),
    hrMax: integer("hr_max"),
    zone2Minutes: integer("zone_2_minutes"),
    type: activityType("type").notNull(),
    name: text("name"),
    notes: text("notes"),
    source: activitySource("source").notNull(),
    sourceId: text("source_id"),
    raw: jsonb("raw"),
    gpxPath: text("gpx_path"),
    ...timestamps,
  },
  (t) => [unique().on(t.userId, t.source, t.sourceId)],
);

// =============================================================================
// AI / CHAT
// =============================================================================

export const chatThreads = pgTable("chat_threads", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  userId: uuid("user_id").notNull(),
  title: text("title"),
  ...updatedTimestamps,
});

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => chatThreads.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(),
  role: chatRole("role").notNull(),
  content: text("content").notNull(),
  toolCalls: jsonb("tool_calls"),
  toolCallId: text("tool_call_id"),
  model: text("model"),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  ...timestamps,
});

export const aiToolCalls = pgTable("ai_tool_calls", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  userId: uuid("user_id").notNull(),
  threadId: uuid("thread_id"),
  messageId: uuid("message_id"),
  toolName: text("tool_name").notNull(),
  arguments: jsonb("arguments").notNull(),
  result: jsonb("result"),
  error: text("error"),
  durationMs: integer("duration_ms"),
  ...timestamps,
});

// =============================================================================
// INTEGRATION TOKENS
// =============================================================================

export const integrationTokens = pgTable(
  "integration_tokens",
  {
    userId: uuid("user_id").notNull(),
    provider: integrationProvider("provider").notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scope: text("scope"),
    externalUserId: text("external_user_id"),
    raw: jsonb("raw"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.provider] })],
);

// =============================================================================
// USER PREFERENCES
// =============================================================================

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id").primaryKey(),
  locale: text("locale").notNull().default("de-CH"),
  weightUnit: text("weight_unit").notNull().default("kg"),
  heightUnit: text("height_unit").notNull().default("cm"),
  temperatureUnit: text("temperature_unit").notNull().default("C"),
  dailyStandupEnabled: boolean("daily_standup_enabled").notNull().default(true),
  weeklyCheckinReminder: boolean("weekly_checkin_reminder").notNull().default(true),
  pushWorkoutReminder: boolean("push_workout_reminder").notNull().default(true),
  coachStyle: text("coach_style").notNull().default("direct"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// =============================================================================
// RECIPE EXTRACTION JOBS
// =============================================================================

export const recipeExtractionJobs = pgTable("recipe_extraction_jobs", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  userId: uuid("user_id").notNull(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  inputPayload: jsonb("input_payload").notNull(),
  inputHash: text("input_hash").notNull(),
  detectedSourceType: text("detected_source_type"),
  status: extractionJobStatus("status").notNull().default("pending"),
  progress: jsonb("progress").default(sql`'[]'::jsonb`),
  sources: jsonb("sources"),
  result: jsonb("result"),
  errorText: text("error_text"),
  createdRecipeId: uuid("created_recipe_id").references(() => recipes.id),
  ...updatedTimestamps,
});

// =============================================================================
// RECIPE EQUIPMENT
// =============================================================================

export const recipeEquipment = pgTable(
  "recipe_equipment",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    equipmentKey: text("equipment_key").notNull(),
    displayName: text("display_name").notNull(),
    importance: text("importance").notNull().default("required"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [unique().on(t.recipeId, t.equipmentKey)],
);

// =============================================================================
// PANTRY
// =============================================================================

export const pantryItems = pgTable("pantry_items", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  addedBy: uuid("added_by").notNull(),
  ingredientName: text("ingredient_name").notNull(),
  amount: numeric("amount"),
  unit: text("unit"),
  notes: text("notes"),
  autoDecrement: boolean("auto_decrement").notNull().default(true),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// =============================================================================
// RECIPE COOKS
// =============================================================================

export const recipeCooks = pgTable("recipe_cooks", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  recipeId: uuid("recipe_id")
    .notNull()
    .references(() => recipes.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  cookedAt: timestamp("cooked_at", { withTimezone: true }).notNull().default(sql`now()`),
  mealType: mealType("meal_type").notNull(),
  servingsEaten: numeric("servings_eaten").notNull().default("1"),
  kcalConsumed: numeric("kcal_consumed"),
  proteinGConsumed: numeric("protein_g_consumed"),
  carbsGConsumed: numeric("carbs_g_consumed"),
  fatGConsumed: numeric("fat_g_consumed"),
  pantryDecremented: boolean("pantry_decremented").notNull().default(false),
  rating: integer("rating"),
  notes: text("notes"),
  ...timestamps,
});

// =============================================================================
// USER EQUIPMENT
// =============================================================================

export const userEquipment = pgTable(
  "user_equipment",
  {
    userId: uuid("user_id").notNull(),
    equipment: equipmentType("equipment").notNull(),
    available: boolean("available").notNull().default(true),
    notes: text("notes"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.equipment] })],
);

// =============================================================================
// TRAINING PLAN DAYS / EXERCISES
// =============================================================================

export const trainingPlanDays = pgTable("training_plan_days", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  planId: uuid("plan_id")
    .notNull()
    .references(() => trainingPlans.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  name: text("name").notNull(),
  notes: text("notes"),
  ...timestamps,
});

export const trainingPlanExercises = pgTable("training_plan_exercises", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  planDayId: uuid("plan_day_id")
    .notNull()
    .references(() => trainingPlanDays.id, { onDelete: "cascade" }),
  exerciseId: uuid("exercise_id")
    .notNull()
    .references(() => exercises.id),
  position: integer("position").notNull(),
  targetSets: integer("target_sets").notNull().default(2),
  targetReps: integer("target_reps").notNull().default(6),
  targetRir: integer("target_rir").notNull().default(0),
  warmupSets: integer("warmup_sets").notNull().default(1),
  notes: text("notes"),
  ...timestamps,
});

export const exerciseSubstitutions = pgTable("exercise_substitutions", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  userId: uuid("user_id").notNull(),
  originalExerciseId: uuid("original_exercise_id")
    .notNull()
    .references(() => exercises.id),
  replacementExerciseId: uuid("replacement_exercise_id")
    .notNull()
    .references(() => exercises.id),
  reason: substitutionReason("reason").notNull(),
  isPermanent: boolean("is_permanent").notNull().default(true),
  notes: text("notes"),
  ...timestamps,
});

// =============================================================================
// FOOD ITEMS CACHE (Barcode lookups)
// =============================================================================

export const foodItemsCache = pgTable("food_items_cache", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  barcode: text("barcode").unique(),
  name: text("name").notNull(),
  brand: text("brand"),
  kcalPer100g: numeric("kcal_per_100g"),
  proteinGPer100g: numeric("protein_g_per_100g"),
  carbsGPer100g: numeric("carbs_g_per_100g"),
  fatGPer100g: numeric("fat_g_per_100g"),
  fiberGPer100g: numeric("fiber_g_per_100g"),
  source: text("source").notNull(),
  sourceData: jsonb("source_data"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// =============================================================================
// AI USAGE LOGS (cost tracking)
// =============================================================================

export const aiUsageLogs = pgTable("ai_usage_logs", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  userId: uuid("user_id"),
  feature: text("feature").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  audioSeconds: numeric("audio_seconds"),
  imageTiles: integer("image_tiles"),
  costUsd: numeric("cost_usd").notNull().default("0"),
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: uuid("related_entity_id"),
  durationMs: integer("duration_ms"),
  ...timestamps,
});

// =============================================================================
// USER GOALS / PHASES
// =============================================================================

export const userGoals = pgTable("user_goals", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  userId: uuid("user_id").notNull(),
  phaseType: goalPhaseType("phase_type").notNull(),
  status: goalPhaseStatus("status").notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
    .notNull()
    .default(sql`current_date`),
  targetEndAt: timestamp("target_end_at", { withTimezone: true, mode: "date" }),
  startWeightKg: numeric("start_weight_kg").notNull(),
  targetWeightKg: numeric("target_weight_kg"),
  weeklyRateKg: numeric("weekly_rate_kg"),
  dailyKcalTarget: integer("daily_kcal_target"),
  dailyProteinGTarget: numeric("daily_protein_g_target"),
  dailyCarbsGTarget: numeric("daily_carbs_g_target"),
  dailyFatGTarget: numeric("daily_fat_g_target"),
  adjustmentMode: text("adjustment_mode").notNull().default("semi_auto"),
  adjustmentLog: jsonb("adjustment_log").notNull().default(sql`'[]'::jsonb`),
  musclePriorities: text("muscle_priorities").array().notNull().default(sql`'{}'::text[]`),
  secondaryObjective: text("secondary_objective"),
  notes: text("notes"),
  ...updatedTimestamps,
});

// =============================================================================
// MEAL PLANS
// =============================================================================

export const mealPlans = pgTable("meal_plans", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  userId: uuid("user_id").notNull(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  startDate: timestamp("start_date", { withTimezone: true, mode: "date" }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true, mode: "date" }).notNull(),
  generationConstraints: jsonb("generation_constraints"),
  createdByKind: text("created_by_kind").notNull().default("user"),
  status: text("status").notNull().default("draft"),
  notes: text("notes"),
  ...updatedTimestamps,
});

export const mealPlanEntries = pgTable("meal_plan_entries", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  mealPlanId: uuid("meal_plan_id")
    .notNull()
    .references(() => mealPlans.id, { onDelete: "cascade" }),
  forDate: timestamp("for_date", { withTimezone: true, mode: "date" }).notNull(),
  mealType: mealType("meal_type").notNull(),
  recipeId: uuid("recipe_id").references(() => recipes.id, {
    onDelete: "set null",
  }),
  freeText: text("free_text"),
  servingsPlanned: numeric("servings_planned").notNull().default("1"),
  expectedKcal: numeric("expected_kcal"),
  expectedProteinG: numeric("expected_protein_g"),
  expectedCarbsG: numeric("expected_carbs_g"),
  expectedFatG: numeric("expected_fat_g"),
  actualCookId: uuid("actual_cook_id").references(() => recipeCooks.id, {
    onDelete: "set null",
  }),
  position: integer("position").notNull().default(0),
  notes: text("notes"),
  ...timestamps,
});

// =============================================================================
// DAILY STANDUPS
// =============================================================================

export const dailyStandups = pgTable(
  "daily_standups",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    userId: uuid("user_id").notNull(),
    forDate: timestamp("for_date", { withTimezone: true, mode: "date" }).notNull(),
    content: jsonb("content").notNull(),
    contextSnapshot: jsonb("context_snapshot"),
    userAction: text("user_action").notNull().default("unread"),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [unique().on(t.userId, t.forDate)],
);

// =============================================================================
// BODY PHOTOS
// =============================================================================

export const bodyPhotos = pgTable("body_photos", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  userId: uuid("user_id").notNull(),
  takenAt: timestamp("taken_at", { withTimezone: true }).notNull().default(sql`now()`),
  photoPaths: jsonb("photo_paths").notNull(),
  weightKg: numeric("weight_kg"),
  bodyFatPct: numeric("body_fat_pct"),
  notes: text("notes"),
  aiAnalysis: jsonb("ai_analysis"),
  aiAnalyzedAt: timestamp("ai_analyzed_at", { withTimezone: true }),
  ...timestamps,
});

// =============================================================================
// LAB RESULTS
// =============================================================================

export const labResults = pgTable("lab_results", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  userId: uuid("user_id").notNull(),
  takenAt: timestamp("taken_at", { withTimezone: true, mode: "date" }).notNull(),
  panelType: labPanelType("panel_type").notNull(),
  sourceFilePath: text("source_file_path"),
  sourceLabName: text("source_lab_name"),
  rawValues: jsonb("raw_values").notNull(),
  aiInterpretation: jsonb("ai_interpretation"),
  aiInterpretedAt: timestamp("ai_interpreted_at", { withTimezone: true }),
  evidenceSources: jsonb("evidence_sources"),
  notes: text("notes"),
  ...timestamps,
});

// =============================================================================
// SUPPLEMENTS
// =============================================================================

export const userSupplements = pgTable("user_supplements", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  userId: uuid("user_id").notNull(),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  brand: text("brand"),
  dosageAmount: numeric("dosage_amount").notNull(),
  dosageUnit: text("dosage_unit").notNull(),
  frequency: text("frequency").notNull(),
  reason: text("reason"),
  sourceRecommendationId: uuid("source_recommendation_id").references(() => labResults.id),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
    .notNull()
    .default(sql`current_date`),
  endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
  evidenceLinks: text("evidence_links").array(),
  notes: text("notes"),
  ...updatedTimestamps,
});

export const supplementLogs = pgTable("supplement_logs", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  userId: uuid("user_id").notNull(),
  supplementId: uuid("supplement_id")
    .notNull()
    .references(() => userSupplements.id, { onDelete: "cascade" }),
  takenAt: timestamp("taken_at", { withTimezone: true }).notNull().default(sql`now()`),
  dosageAmount: numeric("dosage_amount"),
  notes: text("notes"),
});

// =============================================================================
// TRAINING PREFERENCES
// =============================================================================

export const trainingPreferences = pgTable("training_preferences", {
  userId: uuid("user_id").primaryKey(),
  strengthSessionsPerWeek: integer("strength_sessions_per_week").notNull().default(2),
  cardioSessionsPerWeek: integer("cardio_sessions_per_week").notNull().default(2),
  splitStyle: text("split_style").notNull().default("fullbody_x2"),
  volumeStyle: text("volume_style").notNull().default("low_volume_high_intensity"),
  repRangeMin: integer("rep_range_min").notNull().default(5),
  repRangeMax: integer("rep_range_max").notNull().default(7),
  preferredRirMin: integer("preferred_rir_min").notNull().default(0),
  preferredRirMax: integer("preferred_rir_max").notNull().default(1),
  workingSetsPerExercise: integer("working_sets_per_exercise").notNull().default(2),
  warmupSetsFirstExercise: integer("warmup_sets_first_exercise").notNull().default(2),
  warmupSetsSubsequent: integer("warmup_sets_subsequent").notNull().default(1),
  sessionDurationTargetMin: integer("session_duration_target_min").notNull().default(30),
  sessionDurationTargetMax: integer("session_duration_target_max").notNull().default(45),
  trainingGoals: text("training_goals")
    .array()
    .notNull()
    .default(sql`array['hypertrophy', 'strength']::text[]`),
  musclePriorities: text("muscle_priorities").array().notNull().default(sql`'{}'::text[]`),
  cardioZoneFocus: text("cardio_zone_focus").notNull().default("zone_2"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});
