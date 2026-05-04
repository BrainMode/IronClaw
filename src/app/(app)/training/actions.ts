"use server";

import { createClient } from "@/lib/supabase/server";
import { type EquipmentType, generateFullbodyX2 } from "@/lib/training/plan-generator";
import { getTrainingPreferences } from "@/lib/training/queries";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function saveEquipment(
  equipment: EquipmentType[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  // Wipe and reinsert (max 18 rows, simpler than diff)
  await supabase.from("user_equipment").delete().eq("user_id", user.id);
  if (equipment.length > 0) {
    const rows = equipment.map((e) => ({
      user_id: user.id,
      equipment: e,
      available: true,
    }));
    const { error } = await supabase.from("user_equipment").insert(rows);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/training");
  return { ok: true };
}

export async function generatePlan(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const { data: equipment } = await supabase
    .from("user_equipment")
    .select("equipment")
    .eq("available", true);
  const eqList = (equipment ?? []).map((e) => e.equipment as EquipmentType);

  const prefs = await getTrainingPreferences();
  const template = generateFullbodyX2(eqList, prefs ?? {});

  if (template.days.every((d) => d.exercises.length === 0)) {
    return {
      ok: false,
      error:
        "Keine Übungen mit dem ausgewählten Equipment generierbar. Bitte mehr Equipment auswählen.",
    };
  }

  // Deactivate any existing active plan
  await supabase
    .from("training_plans")
    .update({ is_active: false })
    .eq("user_id", user.id)
    .eq("is_active", true);

  // Create plan
  const { data: plan, error: planError } = await supabase
    .from("training_plans")
    .insert({
      user_id: user.id,
      name: template.name,
      description: template.description,
      is_active: true,
    })
    .select("id")
    .single();
  if (planError || !plan) return { ok: false, error: planError?.message ?? "Plan-Insert failed" };

  // Resolve exercise slugs → IDs in one query
  const allSlugs = template.days.flatMap((d) => d.exercises.map((e) => e.exerciseSlug));
  const { data: exercises } = await supabase
    .from("exercises")
    .select("id, slug")
    .in("slug", allSlugs);
  const slugToId = new Map((exercises ?? []).map((e) => [e.slug, e.id]));

  // Insert days + exercises
  for (const day of template.days) {
    const { data: dayRow, error: dayError } = await supabase
      .from("training_plan_days")
      .insert({
        plan_id: plan.id,
        position: day.position,
        name: day.name,
      })
      .select("id")
      .single();
    if (dayError || !dayRow) {
      return { ok: false, error: dayError?.message ?? "Day-Insert failed" };
    }

    if (day.exercises.length === 0) continue;

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
      const { error } = await supabase.from("training_plan_exercises").insert(exerciseRows);
      if (error) return { ok: false, error: error.message };
    }
  }

  revalidatePath("/training");
  return { ok: true };
}

export async function startSession(planDayId: string): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht eingeloggt.");

  const { data, error } = await supabase
    .from("workout_sessions")
    .insert({
      user_id: user.id,
      plan_day_id: planDayId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Session-Insert failed");
  return data.id;
}

export async function startNextSession(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht eingeloggt.");

  // Find active plan
  const { data: plan } = await supabase
    .from("training_plans")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!plan) throw new Error("Kein aktiver Plan — bitte erst Setup durchlaufen.");

  // Look up plan days in order
  const { data: days } = await supabase
    .from("training_plan_days")
    .select("id, position")
    .eq("plan_id", plan.id)
    .order("position");
  if (!days || days.length === 0) throw new Error("Plan hat keine Tage.");

  // Pick next day based on last session: alternate
  const { data: lastSession } = await supabase
    .from("workout_sessions")
    .select("plan_day_id")
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextDay = days[0];
  if (lastSession?.plan_day_id) {
    const idx = days.findIndex((d) => d.id === lastSession.plan_day_id);
    nextDay = days[(idx + 1) % days.length] ?? days[0];
  }
  if (!nextDay) throw new Error("Konnte nächsten Tag nicht ermitteln.");

  const sessionId = await startSession(nextDay.id);
  redirect(`/training/session/${sessionId}`);
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
