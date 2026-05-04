import { readFile } from "node:fs/promises";
import path from "node:path";
import { MODELS, ai } from "@/lib/ai/client";
import { createClient } from "@/lib/supabase/server";
import { type Message, convertToCoreMessages, streamText, tool } from "ai";
import { z } from "zod";

export const maxDuration = 60;

const setTrainingPreferencesSchema = z.object({
  style: z
    .enum(["iron_mike", "classic", "strength"])
    .describe(
      "iron_mike = 1-2 Sets bis Versagen, 5-7 Reps, RIR=0; classic = 3 Sets, 8-12 Reps, RIR 1-3; strength = 3-5 Sets, 3-5 Reps",
    ),
  strength_sessions_per_week: z.number().int().min(1).max(7),
  cardio_sessions_per_week: z.number().int().min(0).max(7).default(2),
  session_duration_target_min: z.number().int().min(15).max(120).default(30),
  session_duration_target_max: z.number().int().min(15).max(180).default(60),
  rep_range_min: z.number().int().min(1).max(20),
  rep_range_max: z.number().int().min(1).max(30),
  preferred_rir_min: z.number().int().min(0).max(5),
  preferred_rir_max: z.number().int().min(0).max(5),
  working_sets_per_exercise: z.number().int().min(1).max(5).default(2),
  training_goals: z.array(
    z.enum(["fat_loss", "strength", "hypertrophy", "endurance", "mobility", "longevity"]),
  ),
  muscle_priorities: z.array(z.string()).max(4).default([]),
  cardio_zone_focus: z.enum(["zone_2", "zone_5_hiit", "mixed", "sport_specific"]).default("zone_2"),
  notes: z
    .string()
    .optional()
    .describe(
      "Freitext für Verletzungen / Kontraindikationen / besondere Wünsche, die nicht in andere Felder passen",
    ),
});

let cachedSystemPrompt: string | null = null;
async function getSystemPrompt() {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  const promptPath = path.join(process.cwd(), "src/lib/ai/prompts/training-anamnese.md");
  cachedSystemPrompt = await readFile(promptPath, "utf8");
  return cachedSystemPrompt;
}

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: Message[] };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const systemPrompt = await getSystemPrompt();

  const result = streamText({
    model: ai(MODELS.primary),
    system: systemPrompt,
    messages: convertToCoreMessages(messages),
    maxSteps: 8,
    tools: {
      set_training_preferences: tool({
        description:
          "Speichere die ermittelten Trainings-Präferenzen des Users in der DB. Aufruf erst wenn alle Pflichtfelder klar sind.",
        parameters: setTrainingPreferencesSchema,
        execute: async (args) => {
          const { error } = await supabase.from("training_preferences").upsert(
            {
              user_id: user.id,
              strength_sessions_per_week: args.strength_sessions_per_week,
              cardio_sessions_per_week: args.cardio_sessions_per_week,
              split_style: pickSplitStyle(args.style, args.strength_sessions_per_week),
              volume_style: pickVolumeStyle(args.style),
              rep_range_min: args.rep_range_min,
              rep_range_max: args.rep_range_max,
              preferred_rir_min: args.preferred_rir_min,
              preferred_rir_max: args.preferred_rir_max,
              working_sets_per_exercise: args.working_sets_per_exercise,
              warmup_sets_first_exercise: 2,
              warmup_sets_subsequent: 1,
              session_duration_target_min: args.session_duration_target_min,
              session_duration_target_max: args.session_duration_target_max,
              training_goals: args.training_goals,
              muscle_priorities: args.muscle_priorities,
              cardio_zone_focus: args.cardio_zone_focus,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );
          if (error) return { ok: false, error: error.message };
          return {
            ok: true,
            saved: { style: args.style, sessions: args.strength_sessions_per_week },
          };
        },
      }),
      complete_anamnese: tool({
        description:
          "Markiere die Anamnese als abgeschlossen — wird aufgerufen NACHDEM set_training_preferences ein {ok: true} zurückgegeben hat.",
        parameters: z.object({
          summary: z.string().describe("2-3 Zeilen Zusammenfassung des User-Profils"),
        }),
        execute: async (args) => {
          return { ok: true, summary: args.summary, next_step: "/training/setup" };
        },
      }),
    },
  });

  return result.toDataStreamResponse();
}

function pickSplitStyle(
  style: "iron_mike" | "classic" | "strength",
  sessionsPerWeek: number,
): string {
  if (style === "iron_mike") {
    return sessionsPerWeek >= 4 ? "torso_limbs" : "fullbody_x2";
  }
  if (sessionsPerWeek >= 6) return "bro_split";
  if (sessionsPerWeek >= 4) return "upper_lower";
  return "fullbody_x2";
}

function pickVolumeStyle(style: "iron_mike" | "classic" | "strength"): string {
  if (style === "iron_mike") return "low_volume_high_intensity";
  if (style === "strength") return "low_volume_high_intensity";
  return "high_volume_classic";
}
