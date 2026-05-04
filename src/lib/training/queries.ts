/**
 * Training-Modul DB-Queries via Supabase Server Client.
 *
 * Alle Queries laufen unter dem Auth-Kontext des aufrufenden Users (RLS aktiv).
 * Kein service-role-Key — wir trauen RLS.
 */

import { createClient } from "@/lib/supabase/server";

export interface TrainingPreferences {
  strengthSessionsPerWeek: number;
  cardioSessionsPerWeek: number;
  splitStyle: string;
  volumeStyle: string;
  repRangeMin: number;
  repRangeMax: number;
  preferredRirMin: number;
  preferredRirMax: number;
  workingSetsPerExercise: number;
  warmupSetsFirstExercise: number;
  warmupSetsSubsequent: number;
  sessionDurationTargetMin: number;
  sessionDurationTargetMax: number;
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getTrainingPreferences(): Promise<TrainingPreferences | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("training_preferences")
    .select(
      "strength_sessions_per_week, cardio_sessions_per_week, split_style, volume_style, rep_range_min, rep_range_max, preferred_rir_min, preferred_rir_max, working_sets_per_exercise, warmup_sets_first_exercise, warmup_sets_subsequent, session_duration_target_min, session_duration_target_max",
    )
    .maybeSingle();
  if (!data) return null;
  return {
    strengthSessionsPerWeek: data.strength_sessions_per_week,
    cardioSessionsPerWeek: data.cardio_sessions_per_week,
    splitStyle: data.split_style,
    volumeStyle: data.volume_style,
    repRangeMin: data.rep_range_min,
    repRangeMax: data.rep_range_max,
    preferredRirMin: data.preferred_rir_min,
    preferredRirMax: data.preferred_rir_max,
    workingSetsPerExercise: data.working_sets_per_exercise,
    warmupSetsFirstExercise: data.warmup_sets_first_exercise,
    warmupSetsSubsequent: data.warmup_sets_subsequent,
    sessionDurationTargetMin: data.session_duration_target_min,
    sessionDurationTargetMax: data.session_duration_target_max,
  };
}

export async function getUserEquipment(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("user_equipment").select("equipment").eq("available", true);
  return (data ?? []).map((e) => e.equipment as string);
}

// =============================================================================
// LOCATIONS
// =============================================================================

export interface EquipmentLocation {
  id: string;
  key: string;
  display_name: string;
  position: number;
  equipment: string[];
}

export async function getLocations(): Promise<EquipmentLocation[]> {
  const supabase = await createClient();
  const { data: locs } = await supabase
    .from("equipment_locations")
    .select("id, key, display_name, position")
    .order("position");
  if (!locs || locs.length === 0) return [];

  const { data: eq } = await supabase
    .from("user_equipment")
    .select("location_id, equipment")
    .eq("available", true)
    .in(
      "location_id",
      locs.map((l) => l.id),
    );

  const eqByLoc = new Map<string, string[]>();
  for (const row of eq ?? []) {
    const list = eqByLoc.get(row.location_id) ?? [];
    list.push(row.equipment);
    eqByLoc.set(row.location_id, list);
  }

  return locs.map((l) => ({
    id: l.id,
    key: l.key,
    display_name: l.display_name,
    position: l.position,
    equipment: eqByLoc.get(l.id) ?? [],
  }));
}

export async function getLocationById(id: string): Promise<EquipmentLocation | null> {
  const supabase = await createClient();
  const { data: loc } = await supabase
    .from("equipment_locations")
    .select("id, key, display_name, position")
    .eq("id", id)
    .maybeSingle();
  if (!loc) return null;
  const { data: eq } = await supabase
    .from("user_equipment")
    .select("equipment")
    .eq("available", true)
    .eq("location_id", id);
  return {
    id: loc.id,
    key: loc.key,
    display_name: loc.display_name,
    position: loc.position,
    equipment: (eq ?? []).map((e) => e.equipment),
  };
}

export interface ExerciseRow {
  id: string;
  slug: string;
  name_de: string;
  primary_muscle: string;
  equipment: string[];
  notes_de: string | null;
}

export interface PlanExerciseRow {
  id: string;
  position: number;
  target_sets: number;
  target_reps: number;
  target_rir: number;
  warmup_sets: number;
  exercise: ExerciseRow | null;
}

export interface PlanDayRow {
  id: string;
  position: number;
  name: string;
  exercises: PlanExerciseRow[];
}

export interface ActivePlan {
  plan: { id: string; name: string; description: string | null; location_id: string | null };
  days: PlanDayRow[];
}

export async function getAllActivePlans(): Promise<
  {
    location: EquipmentLocation;
    plan: ActivePlan | null;
  }[]
> {
  const locs = await getLocations();
  const result = [];
  for (const loc of locs) {
    const plan = await getActivePlan(loc.id);
    result.push({ location: loc, plan });
  }
  return result;
}

export async function getActivePlan(locationId?: string | null): Promise<ActivePlan | null> {
  const supabase = await createClient();
  let query = supabase
    .from("training_plans")
    .select("id, name, description, is_active, location_id")
    .eq("is_active", true);
  if (locationId) {
    query = query.eq("location_id", locationId);
  }
  const { data: plan } = await query.order("created_at", { ascending: false }).maybeSingle();
  if (!plan) return null;

  const { data: rawDays } = await supabase
    .from("training_plan_days")
    .select(
      "id, position, name, training_plan_exercises(id, position, target_sets, target_reps, target_rir, warmup_sets, exercises(id, slug, name_de, primary_muscle, equipment, notes_de))",
    )
    .eq("plan_id", plan.id)
    .order("position");

  const days: PlanDayRow[] = (rawDays ?? []).map(
    (d: {
      id: string;
      position: number;
      name: string;
      training_plan_exercises:
        | {
            id: string;
            position: number;
            target_sets: number;
            target_reps: number;
            target_rir: number;
            warmup_sets: number;
            exercises: ExerciseRow | ExerciseRow[] | null;
          }[]
        | null;
    }) => ({
      id: d.id,
      position: d.position,
      name: d.name,
      exercises: (d.training_plan_exercises ?? []).map((pe) => ({
        id: pe.id,
        position: pe.position,
        target_sets: pe.target_sets,
        target_reps: pe.target_reps,
        target_rir: pe.target_rir,
        warmup_sets: pe.warmup_sets,
        exercise: Array.isArray(pe.exercises) ? (pe.exercises[0] ?? null) : pe.exercises,
      })),
    }),
  );

  return {
    plan: {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      location_id: plan.location_id ?? null,
    },
    days,
  };
}

export async function getLastSessionForExercise(exerciseId: string) {
  const supabase = await createClient();
  const { data: sets } = await supabase
    .from("workout_sets")
    .select("id, weight_kg, reps, rir, completed_at, set_type, session_id")
    .eq("exercise_id", exerciseId)
    .eq("set_type", "working")
    .order("completed_at", { ascending: false })
    .limit(10);
  if (!sets || sets.length === 0) return null;
  return sets;
}

export interface SessionSummary {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  perceived_effort: number | null;
  day_name: string | null;
}

export async function getRecentSessions(limit = 20): Promise<SessionSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workout_sessions")
    .select(
      "id, started_at, ended_at, duration_minutes, perceived_effort, training_plan_days(name)",
    )
    .order("started_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map(
    (s: {
      id: string;
      started_at: string;
      ended_at: string | null;
      duration_minutes: number | null;
      perceived_effort: number | null;
      training_plan_days: { name: string } | { name: string }[] | null;
    }) => ({
      id: s.id,
      started_at: s.started_at,
      ended_at: s.ended_at,
      duration_minutes: s.duration_minutes,
      perceived_effort: s.perceived_effort,
      day_name: Array.isArray(s.training_plan_days)
        ? (s.training_plan_days[0]?.name ?? null)
        : (s.training_plan_days?.name ?? null),
    }),
  );
}

export interface SessionWithSets {
  session: {
    id: string;
    started_at: string;
    ended_at: string | null;
    plan_day_id: string | null;
    day_name: string | null;
    plan_exercises: PlanExerciseRow[];
  };
  sets: WorkoutSetRow[];
}

export interface WorkoutSetRow {
  id: string;
  exercise_id: string;
  position: number;
  set_type: string;
  weight_kg: string;
  reps: number;
  rir: number | null;
  completed_at: string;
  notes: string | null;
}

export async function getSessionWithSets(sessionId: string): Promise<SessionWithSets | null> {
  const supabase = await createClient();
  const { data: rawSession } = await supabase
    .from("workout_sessions")
    .select(
      "id, started_at, ended_at, plan_day_id, training_plan_days(name, training_plan_exercises(position, target_sets, target_reps, target_rir, warmup_sets, exercises(id, slug, name_de, primary_muscle, equipment, notes_de)))",
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (!rawSession) return null;

  type RawDay = {
    name: string;
    training_plan_exercises:
      | {
          position: number;
          target_sets: number;
          target_reps: number;
          target_rir: number;
          warmup_sets: number;
          exercises: ExerciseRow | ExerciseRow[] | null;
        }[]
      | null;
  };

  const dayRaw: RawDay | null = Array.isArray(rawSession.training_plan_days)
    ? (rawSession.training_plan_days[0] ?? null)
    : rawSession.training_plan_days;

  const planExercises: PlanExerciseRow[] = (dayRaw?.training_plan_exercises ?? []).map(
    (pe, idx) => ({
      id: `${idx}`,
      position: pe.position,
      target_sets: pe.target_sets,
      target_reps: pe.target_reps,
      target_rir: pe.target_rir,
      warmup_sets: pe.warmup_sets,
      exercise: Array.isArray(pe.exercises) ? (pe.exercises[0] ?? null) : pe.exercises,
    }),
  );

  const { data: sets } = await supabase
    .from("workout_sets")
    .select("id, exercise_id, position, set_type, weight_kg, reps, rir, completed_at, notes")
    .eq("session_id", sessionId)
    .order("completed_at", { ascending: true });

  return {
    session: {
      id: rawSession.id,
      started_at: rawSession.started_at,
      ended_at: rawSession.ended_at,
      plan_day_id: rawSession.plan_day_id,
      day_name: dayRaw?.name ?? null,
      plan_exercises: planExercises,
    },
    sets: (sets ?? []) as WorkoutSetRow[],
  };
}
