"use server";

import { createClient } from "@/lib/supabase/server";
import { type EquipmentType, generatePlanForLocation } from "@/lib/training/plan-generator";
import { getTrainingPreferences } from "@/lib/training/queries";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export interface LocationInput {
  /** Existing location id (update) or null (create new) */
  id?: string | null;
  key: string;
  display_name: string;
  equipment: EquipmentType[];
}

/**
 * Saves a list of locations (idempotent upsert) for the current user.
 * Locations not in the input get deleted (cascades to user_equipment).
 */
export async function saveLocations(
  locations: LocationInput[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  // Existing locations
  const { data: existing } = await supabase.from("equipment_locations").select("id, key");
  const existingKeys = new Set((existing ?? []).map((l) => l.key));
  const inputKeys = new Set(locations.map((l) => l.key));

  // Delete locations no longer in input (cascades to user_equipment)
  const toDelete = (existing ?? []).filter((l) => !inputKeys.has(l.key));
  if (toDelete.length > 0) {
    await supabase
      .from("equipment_locations")
      .delete()
      .in(
        "id",
        toDelete.map((l) => l.id),
      );
  }

  // Upsert each location + its equipment
  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    if (!loc) continue;

    let locationId = loc.id ?? null;
    if (!locationId || !existingKeys.has(loc.key)) {
      const { data: inserted, error: insErr } = await supabase
        .from("equipment_locations")
        .upsert(
          {
            user_id: user.id,
            key: loc.key,
            display_name: loc.display_name,
            position: i,
          },
          { onConflict: "user_id,key" },
        )
        .select("id")
        .single();
      if (insErr || !inserted) {
        return { ok: false, error: insErr?.message ?? "Location-Insert failed" };
      }
      locationId = inserted.id;
    } else {
      await supabase
        .from("equipment_locations")
        .update({ display_name: loc.display_name, position: i })
        .eq("id", locationId);
    }

    // Wipe + reinsert equipment for this location
    await supabase.from("user_equipment").delete().eq("location_id", locationId);
    if (loc.equipment.length > 0) {
      const rows = loc.equipment.map((e) => ({
        user_id: user.id,
        equipment: e,
        available: true,
        location_id: locationId,
      }));
      const { error } = await supabase.from("user_equipment").insert(rows);
      if (error) return { ok: false, error: error.message };
    }
  }

  revalidatePath("/training");
  return { ok: true };
}

/**
 * Generates plans for all configured locations.
 * Each location gets its own active plan (Iron Mike for gym, Home Quick 30 for home/travel).
 */
export async function generateAllPlans(): Promise<
  { ok: true; created: number } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const { data: locs } = await supabase.from("equipment_locations").select("id, key, display_name");
  if (!locs || locs.length === 0) {
    return { ok: false, error: "Keine Locations definiert." };
  }

  const prefs = await getTrainingPreferences();

  let created = 0;
  for (const loc of locs) {
    // Equipment for this location
    const { data: eqRows } = await supabase
      .from("user_equipment")
      .select("equipment")
      .eq("location_id", loc.id)
      .eq("available", true);
    const equipment = (eqRows ?? []).map((e) => e.equipment as EquipmentType);
    if (equipment.length === 0) continue;

    const template = generatePlanForLocation(loc.key, equipment, prefs ?? {});
    if (template.days.every((d) => d.exercises.length === 0)) continue;

    // Deactivate existing plan for this location
    await supabase
      .from("training_plans")
      .update({ is_active: false })
      .eq("user_id", user.id)
      .eq("location_id", loc.id)
      .eq("is_active", true);

    const { data: plan, error: planErr } = await supabase
      .from("training_plans")
      .insert({
        user_id: user.id,
        name: `${template.name} — ${loc.display_name}`,
        description: template.description,
        is_active: true,
        location_id: loc.id,
      })
      .select("id")
      .single();
    if (planErr || !plan) continue;

    const allSlugs = template.days.flatMap((d) => d.exercises.map((e) => e.exerciseSlug));
    const { data: exercises } = await supabase
      .from("exercises")
      .select("id, slug")
      .in("slug", allSlugs);
    const slugToId = new Map((exercises ?? []).map((e) => [e.slug, e.id]));

    for (const day of template.days) {
      const { data: dayRow } = await supabase
        .from("training_plan_days")
        .insert({
          plan_id: plan.id,
          position: day.position,
          name: day.name,
        })
        .select("id")
        .single();
      if (!dayRow || day.exercises.length === 0) continue;

      const exerciseRows = day.exercises
        .map((ex, idx) => {
          const exerciseId = slugToId.get(ex.exerciseSlug);
          if (!exerciseId) return null;
          return {
            plan_day_id: dayRow.id,
            exercise_id: exerciseId,
            position: idx + 1,
            target_sets: ex.targetSets,
            target_reps: ex.targetReps,
            target_rir: ex.targetRir,
            warmup_sets: ex.warmupSets,
            notes: ex.notes ?? null,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (exerciseRows.length > 0) {
        await supabase.from("training_plan_exercises").insert(exerciseRows);
      }
    }
    created += 1;
  }

  revalidatePath("/training");
  return { ok: true, created };
}

export async function startNextSessionForLocation(locationId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht eingeloggt.");

  const { data: plan } = await supabase
    .from("training_plans")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .eq("location_id", locationId)
    .maybeSingle();
  if (!plan) throw new Error("Kein aktiver Plan für diese Location.");

  const { data: days } = await supabase
    .from("training_plan_days")
    .select("id, position")
    .eq("plan_id", plan.id)
    .order("position");
  if (!days || days.length === 0) throw new Error("Plan hat keine Tage.");

  // Find last session for this specific location
  const { data: lastSession } = await supabase
    .from("workout_sessions")
    .select("plan_day_id")
    .eq("user_id", user.id)
    .eq("location_id", locationId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextDay = days[0];
  if (lastSession?.plan_day_id) {
    const idx = days.findIndex((d) => d.id === lastSession.plan_day_id);
    nextDay = days[(idx + 1) % days.length] ?? days[0];
  }
  if (!nextDay) throw new Error("Konnte nächsten Tag nicht ermitteln.");

  const { data: session, error } = await supabase
    .from("workout_sessions")
    .insert({
      user_id: user.id,
      plan_day_id: nextDay.id,
      location_id: locationId,
    })
    .select("id")
    .single();
  if (error || !session) throw new Error(error?.message ?? "Session-Insert failed");

  redirect(`/training/session/${session.id}`);
}

export async function logSet(input: {
  sessionId: string;
  exerciseId: string;
  position: number;
  setType: "warmup" | "working" | "dropset" | "amrap";
  weightKg: number;
  reps: number;
  rir: number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("workout_sets").insert({
    session_id: input.sessionId,
    exercise_id: input.exerciseId,
    position: input.position,
    set_type: input.setType,
    weight_kg: input.weightKg,
    reps: input.reps,
    rir: input.rir,
    reached_failure: input.rir === 0,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/training/session/${input.sessionId}`);
  return { ok: true };
}

export async function endSession(sessionId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("workout_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", sessionId);
  redirect("/training/history");
}
