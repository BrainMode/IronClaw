"use server";

import type { ExtractedRecipe } from "@/lib/recipes/schema";
import type { DetectedSourceType } from "@/lib/recipes/sources/detector";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/** Map detector type to recipe_source_type ENUM */
function mapSourceType(d: DetectedSourceType): string {
  if (d.startsWith("youtube")) return "youtube";
  if (d.startsWith("instagram")) return "instagram";
  if (d.startsWith("facebook")) return "facebook";
  if (d === "tiktok") return "tiktok";
  if (d === "image_upload") return "photo";
  if (d === "manual_text") return "manual";
  return "web_url";
}

export interface SaveRecipeInput {
  recipe: ExtractedRecipe;
  detectedType: DetectedSourceType;
  sourceUrl?: string;
  sourceRawContent?: unknown;
}

export async function saveRecipe(
  input: SaveRecipeInput,
): Promise<{ ok: true; recipeId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  // Find user's household
  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return { ok: false, error: "Kein Household gefunden." };
  }

  // 1. Insert recipe
  const { data: recipe, error: rerror } = await supabase
    .from("recipes")
    .insert({
      household_id: membership.household_id,
      created_by: user.id,
      title: input.recipe.title,
      description: input.recipe.description ?? null,
      servings_default: input.recipe.servings,
      prep_time_minutes: input.recipe.prep_time_minutes ?? null,
      cook_time_minutes: input.recipe.cook_time_minutes ?? null,
      source_type: mapSourceType(input.detectedType),
      source_url: input.sourceUrl ?? null,
      source_raw_content: input.sourceRawContent ?? null,
      ai_tags: input.recipe.ai_tags,
      computed_tags: [],
      user_tags: [],
    })
    .select("id")
    .single();
  if (rerror || !recipe) {
    return { ok: false, error: rerror?.message ?? "Recipe-Insert failed" };
  }

  // 2. Insert ingredients with provenance
  const ingredientRows = input.recipe.ingredients.map((ing, idx) => ({
    recipe_id: recipe.id,
    position: idx + 1,
    name: ing.name,
    amount: ing.amount,
    unit: ing.unit,
    notes: ing.notes ?? null,
    provenance: ing.provenance,
  }));
  if (ingredientRows.length > 0) {
    const { error } = await supabase.from("recipe_ingredients").insert(ingredientRows);
    if (error) return { ok: false, error: error.message };
  }

  // 3. Insert steps with provenance
  const stepRows = input.recipe.steps.map((step, idx) => ({
    recipe_id: recipe.id,
    position: idx + 1,
    instruction: step.instruction,
    duration_minutes: step.duration_minutes ?? null,
    provenance: step.provenance,
  }));
  if (stepRows.length > 0) {
    const { error } = await supabase.from("recipe_steps").insert(stepRows);
    if (error) return { ok: false, error: error.message };
  }

  // 4. Insert equipment (if any from extraction)
  if (input.recipe.equipment && input.recipe.equipment.length > 0) {
    const equipmentRows = input.recipe.equipment.map((eq) => ({
      recipe_id: recipe.id,
      equipment_key: eq.equipment_key,
      display_name: eq.display_name,
      importance: eq.importance,
      notes: eq.notes ?? null,
    }));
    await supabase.from("recipe_equipment").insert(equipmentRows);
  }

  revalidatePath("/recipes");
  return { ok: true, recipeId: recipe.id };
}

export async function saveRecipeAndRedirect(input: SaveRecipeInput): Promise<void> {
  const result = await saveRecipe(input);
  if (result.ok) {
    redirect(`/recipes/${result.recipeId}`);
  }
  throw new Error(result.error);
}

export async function deleteRecipe(
  recipeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("recipes").delete().eq("id", recipeId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/recipes");
  return { ok: true };
}
