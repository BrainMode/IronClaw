# AI Agent Design

Wie der AI-Coach in der App auf User-Daten zugreift und Entscheidungen trifft.

## Konzept: Tool-Calling, kein RAG

User-Daten in dieser App sind **strukturiert** (Workout-Sets, Nutrition-Logs, Body-Metrics). Eine SQL-Query mit Filter ist präziser als Embedding-Search. Bei 2 Usern lohnt kein Vector-DB-Setup.

**Pattern:**
```
User-Frage
    ↓
LLM entscheidet, welche Tools nötig sind
    ↓
Tool-Calls (server-side, mit User-RLS-Kontext)
    ↓
Strukturiertes JSON zurück ans LLM
    ↓
LLM verarbeitet und antwortet
```

## Tool-Inventar

Definiert in `src/lib/ai/tools.ts`. Die wichtigsten Kategorien:

### READ (Datenabfrage)
- `get_workout_history` — Sets pro Übung, mit Zeit-Filter
- `get_nutrition_summary` — Aggregiert kcal/Makros, vergleicht mit Targets
- `get_body_metrics` — Withings: Gewicht, Körperfett, HRV, Schlaf
- `get_activities` — Strava + Health Connect Activities, inkl. Zone-2-Min

### SUGGEST (Agent-Entscheidung)
- `suggest_exercise_replacement` — Bei Schmerz/Equipment-Mangel: passende Alternative
- `decide_deload` — autonome Deload-Empfehlung basierend auf Reps + HRV

### WRITE (Mutation, im User-Auftrag)
- `log_workout_set` — wenn User per Chat einen Satz mitteilt
- `log_nutrition` — Mahlzeit per Chat loggen

### SEARCH
- `find_recipe` — im eigenen Rezept-Katalog
- `search_migros` — Migros-Produkt-Suche via MCP-Backend

## Streaming und UI

**Streaming via Vercel AI SDK:**
```typescript
// /api/ai/chat/route.ts
import { streamText } from 'ai';
import { ai, MODELS } from '@/lib/ai/client';
import { COACH_TOOLS } from '@/lib/ai/tools';
import coachPrompt from '@/lib/ai/prompts/coach-system.md?raw';

export async function POST(req: Request) {
  const { messages } = await req.json();
  const { user } = await getAuthenticatedUser(req);

  const result = streamText({
    model: ai(MODELS.primary),
    system: coachPrompt,
    messages,
    tools: COACH_TOOLS,
    maxSteps: 5, // erlaubt mehrere Tool-Calls in einer Runde
    experimental_telemetry: { isEnabled: true },
  });

  return result.toDataStreamResponse();
}
```

**Client:**
```typescript
'use client';
import { useChat } from 'ai/react';

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/ai/chat',
  });
  // ...
}
```

## Tool-Implementations

Jedes Tool hat einen separaten Implementation-File:

```
src/lib/ai/tools/
├── get-workout-history.ts
├── get-nutrition-summary.ts
├── get-body-metrics.ts
├── get-activities.ts
├── suggest-exercise-replacement.ts  # ruft sub-LLM mit substitution-prompt
├── decide-deload.ts                 # nutzt deload.ts logic + LLM für Begründung
├── log-workout-set.ts
├── log-nutrition.ts                 # kann photo→vision pipeline triggern
├── find-recipe.ts
└── search-migros.ts                 # ruft migros-mcp client
```

**Pattern für Tool-Implementation:**
```typescript
// get-workout-history.ts
export async function getWorkoutHistory(args: GetWorkoutHistoryArgs, ctx: ToolContext) {
  const startTime = Date.now();
  try {
    const sets = await db.query.workoutSets.findMany({
      where: and(
        eq(workoutSessions.userId, ctx.userId),
        gte(workoutSets.completedAt, daysAgo(args.days_back ?? 30)),
        args.exercise_slug
          ? inArray(workoutSets.exerciseId, exerciseIdsForSlug(args.exercise_slug))
          : undefined,
      ),
      limit: args.limit ?? 50,
      with: { exercise: true },
    });

    const result = formatForLLM(sets); // saubere Zusammenfassung statt rohe DB-Records

    await logToolCall(ctx, 'get_workout_history', args, result, Date.now() - startTime);

    return result;
  } catch (error) {
    await logToolCall(ctx, 'get_workout_history', args, null, Date.now() - startTime, String(error));
    throw error;
  }
}
```

## Sub-LLM Pattern (für komplexe Tool-Logik)

Für `suggest_exercise_replacement` und `decide_deload`: das Tool ruft INTERN ein zweites LLM mit dem spezialisierten Prompt:

```typescript
// suggest-exercise-replacement.ts
export async function suggestReplacement(args, ctx) {
  // 1. Daten holen
  const originalExercise = await db.query.exercises.findFirst({...});
  const userEquipment = await db.query.userEquipment.findMany({...});
  const allExercises = await db.query.exercises.findMany();

  // 2. Sub-LLM call mit substitution-prompt
  const result = await generateObject({
    model: ai(MODELS.primary),
    system: substitutionPrompt,
    prompt: JSON.stringify({ original: originalExercise, reason: args.reason, ... }),
    schema: substitutionResultSchema,
  });

  // 3. Optional: persistieren wenn is_permanent
  if (args.is_permanent && result.primary_replacement) {
    await db.insert(exerciseSubstitutions).values({...});
  }

  return result;
}
```

## Audit & Debugging

- **Jeder Tool-Call** wird in `ai_tool_calls` (siehe schema.sql) geloggt: arguments, result, duration_ms, error
- Für Debugging UI: settings/page.tsx hat einen "AI-Audit" Tab, zeigt letzte 50 Tool-Calls

## Cost-Management

- **Default = Opus 4.7** (qualitativ am besten)
- Wenn Token-Verbrauch ein Problem wird:
  - Kurze Smalltalk-Anfragen ohne Daten-Tools → Sonnet 4.6
  - Web-Recipe-Extraktion → Gemini 3.1 Pro (siehe `pickModel("web_recipe_extraction")`)
- Cost-Monitoring: OpenRouter Dashboard zeigt $/User. Kein Hard-Limit nötig bei 2 Usern.

## Sicherheit

- Tools laufen IN API-Routes mit Server-Side Supabase-Client (mit RLS-Kontext des Users)
- LLM kann **nur** Tools aufrufen, die wir definiert haben — keine arbitrary SQL
- LLM kann KEINE Daten anderer User sehen, weil RLS auf jedem Query liegt
- Audit-Log macht alles nachvollziehbar
