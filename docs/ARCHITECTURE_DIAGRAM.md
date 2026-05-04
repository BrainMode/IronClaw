# System Architecture Overview

> Hoch-Level-Diagramm der WDC-Fitness-App-Architektur. Für YouTube-Demo +
> Public-Showcase. Detaillierte Module: siehe `docs/RECIPE_IMPORT.md`,
> `docs/AI_AGENT_DESIGN.md`, etc.

## High-Level Diagram

```
                                ┌──────────────────────────────────────────┐
                                │         Frontend Apps                     │
                                │  ┌────────────┐    ┌──────────────────┐  │
                                │  │ Next.js    │    │ Capacitor 7      │  │
                                │  │ (Vercel)   │    │ (Android Wrapper)│  │
                                │  │ React 19   │    │ Health Connect   │  │
                                │  │ shadcn/ui  │    │ Camera, Push     │  │
                                │  └─────┬──────┘    └────────┬─────────┘  │
                                │        │                    │            │
                                │     ┌──┴────────────────────┴──┐         │
                                │     │   PowerSync (offline DB) │         │
                                │     │   SQLite ↔ Postgres       │         │
                                │     └──┬──────────────────────────────────┘
                                │        │
                                └────────┼─────────────────────────────────┘
                                         │ Realtime + REST
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                           Supabase (Frankfurt)                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  Postgres + RLS                                                          │   │
│  │  - households, household_members (admin / recipe_only)                  │   │
│  │  - recipes, recipe_ingredients, recipe_steps (provenance jsonb)         │   │
│  │  - recipe_extraction_jobs, recipe_equipment                             │   │
│  │  - pantry_items, recipe_cooks, meal_plans, meal_plan_entries            │   │
│  │  - workout_sessions, workout_sets, exercises                            │   │
│  │  - body_metrics, activities, nutrition_logs, macro_targets              │   │
│  │  - user_goals (cut/bulk + auto-adjust log)                              │   │
│  │  - daily_standups, ai_usage_logs, chat_threads, chat_messages           │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│  Auth (2 User), Storage (Recipe-Photos, Body-Photos), Realtime, Edge Functions │
└────────────────────────────────────────────────────────────────────────────────┘
                                         ▲
                                         │
                           Server-Side Backend (Next.js API + Workers)
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        │                                │                                │
   ┌────▼─────┐                  ┌───────▼────────┐                ┌──────▼─────┐
   │ AI Layer │                  │ Data Pipelines │                │ Background │
   │          │                  │                │                │  Workers   │
   │ Vercel   │                  │ Recipe-Import  │                │            │
   │ AI SDK   │                  │ - yt-dlp       │                │ Daily      │
   │          │                  │ - Firecrawl    │                │ Standup    │
   │ Tools    │                  │ - JSON-LD      │                │ Cron       │
   │ (~25)    │                  │ - ElevenLabs   │                │            │
   │          │                  │                │                │ Goal Auto  │
   └────┬─────┘                  └───────┬────────┘                │ Adjust     │
        │                                │                         └──────┬─────┘
        ▼                                ▼                                │
   ┌────────────────┐              ┌──────────────┐                       │
   │  OpenRouter    │              │  Migros MCP  │                       │
   │                │              │  (lewpgs/    │                       │
   │  Opus 4.7      │              │   migros-mcp)│                       │
   │  Sonnet 4.6    │              │              │                       │
   │  Gemini 3.1Pro │              │  Open Food   │                       │
   │  ElevenLabs    │              │  Facts       │                       │
   └────────────────┘              └──────────────┘                       │
                                                                          │
                           ┌──────────────────────────────────────────────┘
                           │
                           ▼
                  ┌─────────────────────────────────────────┐
                  │        Health-Daten Connectors           │
                  │  - Withings OAuth (Gewicht, HRV, Sleep) │
                  │  - Strava OAuth (Activities)             │
                  │  - Health Connect (Samsung Watch)        │
                  │  - AllTrails → Strava Bridge             │
                  │                                          │
                  │  Activity-Dedupe (±5min, ±10%)           │
                  └─────────────────────────────────────────┘
```

## Recipe-Import Pipeline (Zoom)

```
User pastet URL/Foto
       │
       ▼
┌──────────────────┐
│ detectSource()   │ → klassifiziert: youtube_video, instagram_reel, web_url, image, …
└────────┬─────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│ Source-spezifischer Multi-Pass-Fetch         │
│ (parallel)                                    │
│                                              │
│ YouTube:  desc + pinned + linked + caption   │
│           + audio (selectiv via chapters)    │
│                                              │
│ Instagram: caption + carousel-OCR            │
│            + bio-link → Linktree-Resolution  │
│                                              │
│ Web:     JSON-LD ⭐ (80% der Blogs!)         │
│          → microdata → Firecrawl markdown    │
│                                              │
│ Image:   Vision-LLM direkt                   │
└────────┬─────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  ExtractionBundle                     │  Sources: [{type, content, metadata}, ...]
│  + has_jsonld_recipe?                 │  fetch_log: für UI-Streaming-Progress
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│ Synthesis                                     │
│                                              │
│  SHORTCUT: wenn nur JSON-LD → kein LLM       │
│  NORMAL:  LLM bekommt alle Sources            │
│           → Vertrauens-Hierarchie              │
│           → Konflikt-Markierung                 │
│           → Per-Field Provenance               │
└────────┬─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│  ExtractionResult                            │
│  → Recipe + Ingredients + Steps + Equipment  │
│  → ai_tags von LLM                           │
│  → Provenance pro Feld                       │
└────────┬────────────────────────────────────┘
         │
         ▼
   Insert in DB (recipes, recipe_ingredients, recipe_steps, recipe_equipment)
         │
         ▼ (async background)
   Migros-Lookup pro Zutat → kcal_per_serving etc.
         │
         ▼
   computeRecipeTags()  → setze computed_tags (high-protein, healthy-fast-food, …)
```

## AI-Tool-Layer

Der AI-Coach hat ~25 Tools, gruppiert:

- **Read:** `get_workout_history`, `get_nutrition_summary`, `get_body_metrics`, `get_activities`, `get_pantry`, `get_meal_plan`, `get_recent_cooks`
- **Suggest:** `suggest_exercise_replacement`, `decide_deload`, `suggest_recipe_variation`
- **Write:** `log_workout_set`, `log_nutrition`, `log_cooked_recipe`, `update_pantry`, `update_meal_plan_entry`
- **Recipes:** `find_recipe`, `find_recipes_for_pantry`, `build_shopping_list`
- **Goals:** `set_goal`, `assess_goal_progress`
- **Plans:** `create_meal_plan`
- **Vision:** `estimate_meal_from_photo`
- **Proactive:** `generate_daily_standup`
- **External:** `search_migros`

Alle laufen Server-Side in Next.js API-Routes mit User-RLS-Kontext. Jeder Aufruf wird in `ai_tool_calls` + `ai_usage_logs` (für Cost-Tracking) geloggt.

## Why this Stack — Kurzbegründung

| Wahl | Alternative | Warum |
|---|---|---|
| Supabase | Firebase | Postgres + RLS sind transparenter, Migration aus DB einfach |
| PowerSync | Watermelon, Replicache | Unterstützt Postgres direkt, keine Sync-Logik selbst |
| Capacitor | React Native | Health Connect + Push reicht, PWA-Codebase bleibt 100% |
| OpenRouter | Anthropic direkt | Multi-Provider in einem Account → A/B-Test, Fallback |
| yt-dlp | YouTube Data API | Keine Quota, ein Tool für YT/IG/TikTok |
| Drizzle | Prisma | Leichter, Edge-kompatibel, weniger Magic |
| Biome | ESLint + Prettier | 10× schneller, ein Tool, ein Config-File |
