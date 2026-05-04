# WDC Fitness — Project Briefing für Claude Code

> **Read this file first.** Es enthält alle Architektur-Entscheidungen, Konventionen und das Domain-Wissen, das du brauchst, um in diesem Projekt sinnvoll zu arbeiten. Wenn etwas unklar ist, frage Denny — keine ungebetenen Annahmen.

---

## Was ist das?

Eine **personalisierte Fitness- & Ernährungs-App** für Denny Weber + seine Frau (max. 2 User, **keine Multi-Tenant-Skalierung**). Web + Android (PWA mit Capacitor-Wrapper).

**Was die App können muss:**
1. **Rezepte** aus beliebigen Quellen importieren (Foto, YouTube, Instagram, Facebook, Webseiten), Nährwerte speichern, auf Portionen skalieren, Migros-Verfügbarkeit checken
2. **Kalorien-Tracking** via Barcode + Foto-Schätzung (Restaurant-Teller etc.), gegen User-Makro-Ziele
3. **Training** — 2x Ganzkörper + 2x Cardio pro Woche (siehe `docs/TRAINING_LOGIC.md`), KI-gesteuerte Übungs-Auswahl, RIR-basierte Progression mit 0.25kg-Scheiben (= 0.5kg/Stange-Schritte), automatischer Deload
4. **Health-Daten** — Withings (Gewicht, Körperfett, HRV) + Strava (Cardio-Activities) + Health Connect via Capacitor (Samsung Health, Schritte)
5. **AI-Chat in der App** mit **Tool-Calling-Zugriff** auf alle User-Daten
6. **Offline-First** — komplette App muss ohne Empfang funktionieren (Gym-Keller!), syncs später

---

## Tech Stack

| Layer | Technologie | Warum |
|---|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind v4, shadcn/ui | Vercel deploy, PWA-fähig, modern, gut für Capacitor |
| Mobile-Wrapper | Capacitor 7 (Android only) | Health Connect, native Kamera (MLKit Barcode), Background Sync, Push |
| Backend | Supabase (Postgres + Auth + Storage + Realtime) | Hosted Postgres, RLS, Auth, alles aus einer Hand |
| ORM | Drizzle | TypeSafe, kompatibel mit Supabase + PowerSync |
| Offline-Sync | **PowerSync** (Postgres ↔ SQLite) | Free Tier deckt 2 User, eliminiert Wochen Custom-Sync-Code |
| AI Gateway | OpenRouter via Vercel AI SDK | Single API, model-flexibel, Streaming |
| AI Default-Modell | `anthropic/claude-opus-4.7` | Bestes Vision (3.75 MP), bestes Tool-Calling (MCP-Atlas 77.3%), gut für Coach-Logik |
| AI Cheap-Fallback | `google/gemini-3.1-pro` | 2.5x günstiger, bei Massen-Extraction (Webseiten) ausreichend |
| Web-Scraping | Firecrawl | User hat API-Key, top für Rezept-Extraktion aus beliebigen Sites |
| Audio→Text | ElevenLabs Scribe | Für YouTube/Instagram-Video-Audio (wenn keine Captions verfügbar) |
| Nährwert-DB | Open Food Facts | Gratis, Schweiz-Produkte vorhanden, Barcode-Lookup |
| Migros-Daten | `lewpgs/migros-mcp` MCP-Server | Suche, Verfügbarkeit (Filiale Stans!), Aktionen, Nährwerte |
| Withings | OAuth via offizielle API | Sauber dokumentiert |
| Strava | OAuth via offizielle API | Free-Tier reicht (nur Activities lesen, keine Routenplanung) |

**Bewusst NICHT verwendet:**
- React Native / Expo → würde Ökosystem komplizieren; PWA + Capacitor ist leichtgewichtiger
- Eigene Auth → Supabase Auth reicht für 2 User
- Custom Sync-Layer → PowerSync übernimmt das
- AllTrails → keine öffentliche API, aber AllTrails kann Activities automatisch zu Strava exportieren (Setting in der App). Denny nutzt das: AllTrails → Strava-Bridge → wir lesen via Strava OAuth. Da Activities auch über Health Connect reinkommen können (Samsung Watch), gibt es Deduplizierung in `src/lib/activities/dedupe.ts` (Match auf Start-Zeit ±5min, Dauer/Distanz ±10%, kompatible Typen).

---

## User-Modell & RLS

**Zwei User, ein Haushalt.** `users` (Supabase Auth) gehören zu einem `household`. Jedes Household-Mitglied hat eine **Rolle**:

- `admin` — Denny: voller Zugriff auf alles
- `recipe_only` — Frau: kann nur Rezepte sehen + neue hinzufügen, keine anderen Daten

**RLS-Implementierung** (siehe `supabase/schema.sql`):
- Recipes: alle Household-Mitglieder dürfen SELECT/INSERT/UPDATE
- Alles andere (nutrition_logs, workout_*, body_metrics, activities, chat_messages, macro_targets): nur `auth.uid() = user_id`
- AI-Chat & alle persönlichen Logs sind **strikt user-scoped**, nicht household-scoped

---

## Trainings-Logik (Iron Mike Methodik)

**Kritisch — bevor du was am Training-Modul anpasst, lies `docs/TRAINING_LOGIC.md`.** Kurzfassung:

- **Split:** Bei 2 Sessions/Woche → Ganzkörper (jede Muskelgruppe 2x/Woche). Bei mehr Sessions: Upper/Lower split, oder Torso/Limbs.
- **Pro Muskel pro Session:** 1–2 Arbeitssätze bis zum Muskelversagen. Mehr ist gemäss Mike kontraproduktiv (Erholung leidet, Hypertrophie-Vorteil minimal).
- **Reps-Ziel:** 5–7 Reps. Default-Ziel: **6 Reps mit RIR=0**.
- **Mechanische Spannung** entsteht in den letzten 5–6 Reps vor Muskelversagen. Höhere Reps = nur Ermüdung, kein Mehrwert.
- **Aufwärmen:** 2 Aufwärmsätze für die erste Übung des Tages, danach 1 pro Übung. Aufwärmen mit ~20–25% des Arbeitsgewichts, 12–15 Reps.
- **Cardio:** 2x/Woche, 30 Min, **Zone 2** (60–70% HRmax). HRmax = 220 − Alter (Männer). Zone 2 muss gemütlich sein.

**Progression-Algorithmus** ist in `src/lib/training/progression.ts` implementiert. Verwendet **estimated 1RM** über Brzycki-Formel, korrigiert für RIR. Rundet immer auf nächst-niedrigeren 0.5kg-Schritt (= 2× 0.25kg-Scheiben pro Seite).

**Deload-Trigger** (`src/lib/training/deload.ts`): wenn 2 aufeinanderfolgende Sessions die Reps-Targets verfehlen → vorschlagen, Gewicht auf 80% zu reduzieren. AI-Coach trifft die finale Entscheidung kontextuell (HRV von Withings, Schlaf, Stress-Indikatoren wenn vorhanden).

**Übungs-Substitution:** User kann sagen "Diese Übung tut weh" oder "Equipment fehlt" → AI schlägt Alternative vor, die denselben Muskel mit ähnlichem Hebelprofil trifft. Substitutionen werden persistiert (`exercise_substitutions` Tabelle), damit sie bei zukünftigen Plänen berücksichtigt werden.

---

## AI-Modul Konventionen

### Modell-Auswahl

```typescript
// src/lib/ai/models.ts
export const MODELS = {
  // High-quality reasoning, vision, coach decisions, tool-calling
  primary: 'anthropic/claude-opus-4.7',

  // Bulk text extraction from web pages (Firecrawl output → structured recipe)
  bulk: 'google/gemini-3.1-pro',

  // Audio transcription
  stt: 'elevenlabs/scribe-v1', // via ElevenLabs API direct, not OpenRouter

  // Schnelle, kurze Antworten in Chat (z.B. "Wie viele Reps habe ich heute?")
  fast: 'anthropic/claude-sonnet-4.6',
} as const;
```

**Default ist `primary` (Opus 4.7).** Nur dann downgraden, wenn (a) der Task simpel & high-volume ist, oder (b) Kosten-Logging zeigt dass ein Endpoint zu teuer wird.

### Prompts

System-Prompts liegen als Markdown-Dateien in `src/lib/ai/prompts/`. Werden zur Build-Zeit als String importiert (siehe `src/lib/ai/prompts/index.ts`). Niemals Prompts als String-Literals im Code embedden — IMMER aus den .md-Files laden, damit Denny sie editieren kann ohne Code-Änderung.

### Tool-Calling für AI-Chat

Der **AI-Coach** in der App muss Zugriff auf User-Daten haben. Das geht über **Tool-Calling**, NICHT über RAG. Tools sind in `src/lib/ai/tools.ts` definiert. Beispiele:

- `get_workout_history({ exercise_id?, days_back? })` — letzte Sessions
- `get_nutrition_summary({ date_range })` — Kalorien/Makros aggregiert
- `get_body_metrics({ date_range })` — Withings-Daten
- `get_activities({ date_range })` — Strava + Health Connect
- `suggest_exercise_replacement({ exercise_id, reason })` — Alternative finden
- `decide_deload({ exercise_id })` — agent entscheidet basierend auf Daten
- `log_workout_set({ ... })` — set per chat loggen
- `find_recipe({ query })` — Rezept aus DB
- `search_migros({ query })` — Migros MCP weiterreichen

Jeder Tool-Call wird in `ai_tool_calls` Tabelle geloggt (Audit + Debug).

**Wichtig:** Tools laufen **server-side** in Next.js API-Routes, NICHT im Client. Damit liegt RLS-Kontext (`auth.uid()`) automatisch korrekt. Niemals einen Service-Role-Key im Client.

---

## Datenfluss: Rezept-Import (Multi-Source Synthesis)

**Wichtig:** Bevor du an irgendwas unter `src/lib/recipes/` arbeitest, lies `docs/RECIPE_IMPORT.md`. Das ist das ausführliche Design-Dokument mit allen Edge-Cases pro Plattform, Provenance-Tracking, JSON-LD-Shortcut, Worker-Architektur, Cost-Management.

Kurzfassung der Pipeline:

```
User wirft was rein (URL, Plain-Text, oder Bild)
        ↓
1. detectSource()  — was für eine Quelle ist das?
   (sources/detector.ts)
        ↓
2. Source-spezifischer Multi-Pass-Fetch — alle möglichen Orte parallel:
   YouTube  → description + pinned comment + linked page (JSON-LD!) + captions + audio
   IG/Reel  → caption + carousel-OCR + bio-link + reel audio
   Web URL  → JSON-LD first (80% der Recipe-Blogs!) → microdata → Firecrawl markdown
   TikTok   → caption + audio
   Foto     → Vision-LLM
        ↓
3. ExtractionBundle = { sources: RawSourceContent[], fetch_log, ... }
        ↓
4. Synthesis — kann zwei Pfade gehen:
   SHORTCUT  → bei JSON-LD-only: kein LLM, direktes Mapping (siehe synthesis.ts trySynthesisShortcut)
   NORMAL    → LLM bekommt ALLE Sources gleichzeitig, entscheidet welche (oder Kombi)
               das echte Rezept hat. Per-Field Provenance + Konflikt-Markierung.
        ↓
5. ExtractionResult (mit Provenance) → DB
   - recipes + recipe_ingredients (jsonb provenance) + recipe_steps (jsonb provenance)
   - recipe_extraction_jobs Row trackt Progress live → UI subscribt via Realtime
        ↓
6. Async Background:
   - Migros-MCP-Lookup pro Zutat
   - Open Food Facts Fallback
   - Nährwerte aggregieren
```

**Schlüssel-Konzepte:**

- **Provenance pro Feld** — jede Zutat / jeder Step kennt seine Quelle. UI zeigt das als Badges. Bei Fehlern weiss User wo Unsicherheit liegt.
- **Vertrauens-Hierarchie** — JSON-LD > linked_page > description/pinned_comment > firecrawl_markdown > image_ocr > transcript. Synthesizer-Prompt kennt die Hierarchie.
- **JSON-LD-Shortcut** — wenn Web-URL strukturiertes Recipe-JSON-LD hatte und nichts widerspricht: kein LLM-Call. Spart Tokens und ist genauer.
- **Multi-Source-Synthesis** — bei YouTube wird Beschreibung + Pinned Comment + verlinkte Seite + Audio-Transcript gleichzeitig analysiert. LLM entscheidet welche zu trauen ist. Konflikte werden geflaggt, nicht stillschweigend aufgelöst.
- **Async Job-System** — `recipe_extraction_jobs` Tabelle, UI subscribt auf Status-Updates für Live-Progress ("Beschreibung gelesen ✓ — Audio läuft …").
- **Idempotenz** — gleicher Input innerhalb 30 Tagen → cached result.

**Tools:**
- `youtube-dl-exec` (npm-Wrapper für yt-dlp) — alle Video-Plattformen, Description + Comments + Captions + Audio in einem Tool
- `@mendable/firecrawl-js` — Web-Scraping mit JS-Rendering wenn JSON-LD nicht reicht
- `elevenlabs` Scribe — Audio-Transkription
- Eigener JSON-LD Parser (`recipes/jsonld.ts`) — kein LLM-Call

Schema für extrahierte Rezepte: `src/lib/recipes/schema.ts` (Zod, mit Provenance).

### Post-Import: Tagging, Equipment, Pantry, Cook-Log

Nach Recipe-Save läuft eine zweite Pipeline-Stufe (siehe `docs/RECIPE_IMPORT.md` Abschnitt "Post-Import Pipeline"):

- **Equipment** — vom LLM beim Import erkannt, kanonisiert via `recipes/equipment.ts` (Catalog mit Aliases). User filtert "zeige Recipes für mein Setup".
- **Auto-Tags** dreigeteilt: `ai_tags` (vom LLM: italienisch/vegan/bbq), `computed_tags` (vom Server nach Nutrition: high-protein/low-carb/healthy-fast-food/quick) — siehe `recipes/tagging.ts`. Schwellen: high-protein ≥30g, low-carb ≤25g, healthy-fast-food (≤30min + ≥20g Protein + ≤600kcal).
- **Pantry-Match** (`recipes/pantry-match.ts`) — `findCookableRecipes()` scored Recipes gegen Pantry-Items, behandelt Stapel (Salz/Pfeffer/Öl) als "immer da". Liefert near-miss "Wenn du noch X kaufst…".
- **Cook-Log** (`recipes/cook-log.ts`) — User tappt "Heute gekocht": Snapshot-Nutrition in `recipe_cooks`, automatisch Eintrag in `nutrition_logs`, Pantry-Decrement (`computePantryDecrement()` pure function, skaliert Mengen via servings_eaten/servings_default).

Neue AI-Coach-Tools: `find_recipes_for_pantry`, `get_pantry`, `update_pantry`, `log_cooked_recipe`, `get_recent_cooks`, `build_shopping_list` (siehe `ai/tools.ts`).

### Goals, Meal-Plans, Daily Standup, Photo-Calorie

- **Goals/Phases** (`src/lib/goals/assessment.ts`) — Cut/Bulk/Maintenance/Recomp mit `assessGoalProgress()` für automatisches kcal-Adjustment basierend auf Linear-Regression über die letzten 14 Tage Gewichtstrend. Tabelle `user_goals`, ein aktives Goal pro User, mit `adjustment_log` jsonb. Cooldown 7 Tage zwischen Adjustments. AI-Tools: `set_goal`, `assess_goal_progress`.
- **Meal-Plans** (`src/lib/planning/meal-plan.ts`) — Wochenplan-Generator mit Macro-Constraints + Pantry-Priorität + Anti-Repetition. Tabellen `meal_plans` + `meal_plan_entries` (linked zu `recipes`). `meal_plan_entries.actual_cook_id` verknüpft mit `recipe_cooks` wenn Plan-Eintrag wirklich gegessen. AI-Tools: `create_meal_plan`, `get_meal_plan`, `update_meal_plan_entry`.
- **Daily Standup** (`src/lib/coach/daily-standup.ts`) — Cron-getriggerter Morgen-Brief: gestern Recap + heute Outlook + Tipp + Action-Buttons. Strukturiert via `standupContentSchema`. Speichert in `daily_standups`. Verwendet Sonnet 4.6 (kürzer + billiger als Opus für Standup). AI-Tool: `generate_daily_standup`.
- **Photo-Calorie** (`src/lib/nutrition/photo-calorie.ts`) — Vision-LLM auf Foto direkt zu kcal/Macros mit Confidence + Range. AI-Tool: `estimate_meal_from_photo`.
- **AI-Cost-Tracking** (`ai_usage_logs` Tabelle) — pro AI-Aufruf: Modell, Tokens, Audio-Sekunden, USD. Für Demo-Page sichtbar.

### Home-Dashboard

Spec in `docs/HOME_DASHBOARD.md`. Card-System mit Daily-Standup-Card (oben), Heute-Plan + Heute-Workout, Goal-Progress, Quick-Log-Buttons, Pantry-Hinweise, optional Wetter + Streak + AI-Cost.

### Body-Photos, Bluttests, Supplements, Konfigurierbares Training

Erweitert nach Denny-Feedback (Mai 2026):

- **Goal-Assessment auf Wochenmittel** (`src/lib/goals/assessment.ts`) — refactored: tägliche Messungen werden zu wöchentlichen Trim-Mean-Mittelwerten aggregiert (höchsten + niedrigsten je Woche entfernt → robust gegen Salz/Wasser/Stress-Noise). Linear-Regression dann auf Wochenmitteln. Mindestens 3 Wochen mit je ≥3 Messungen nötig. Adjustment max 1× pro Woche. Anomalie-Detection bei Wochen-zu-Wochen-Sprung > 2kg → flag `needs_ai_interpretation`, Coach interpretiert mit Kontext (Reise/Krankheit/Cheat).
- **Wöchentlicher Body-Photo-Check-in** (`src/lib/coach/posture-analysis.ts`) — Tabelle `body_photos`, Vision-LLM-Analyse mit strukturiertem Output: muscle_assessments pro Gruppe, posture_observations, imbalances, recommended_priorities, volume_adjustments. KEINE absoluten BF%-Schätzungen — nur relative Trends + visuelle Indikatoren. Coach kann Output in `training_preferences.muscle_priorities` übernehmen. AI-Tools: `analyze_body_photos`, `update_muscle_priorities`, `request_weekly_checkin`.
- **Bluttest-Integration** (`src/lib/health/lab-interpretation.ts`) — Tabelle `lab_results` mit panel_type (basic/hormonal/thyroid/micronutrients/inflammation/custom). Two-Pass: Vision-LLM extrahiert Werte → zweiter Pass interpretiert mit System-Prompt 'evidence-based, NOT DGE'. Output: concerning_values, supplement_suggestions mit Studien-Quellen, lifestyle_suggestions, followup_tests. AI-Tools: `interpret_lab_result`, `suggest_blood_test_panel`.
- **Supplement-Tracking** (`src/lib/health/supplements.ts`) — Tabelle `user_supplements` + `supplement_logs`. SUPPLEMENT_CATALOG mit kanonischen Keys (omega-3-epa-dha, vitamin-d3, k2-mk7, magnesium-glycinate, creatine-monohydrate, esn-eslids-deck, etc.) inkl. typical_dosage Range, evidence_strength, evidence_sources. DENNY_DEFAULT_STACK als Seed. AI-Tools: `update_supplements`, `get_current_supplements`.
- **Konfigurierbares Training** — Tabelle `training_preferences` (split_style, volume_style, rep_range, RIR, session_duration, training_goals, muscle_priorities, cardio_zone_focus). Denny-Default: fullbody_x2 + low_volume_high_intensity + 5-7 reps + RIR 0-1. Forks können andere Stile setzen (PPL, Bro-Split, klassische 8-12 reps). AI-Tool: `update_training_preferences`.
- **Coach evidence-based**: `prompts/coach-system.md` erweitert um Quellen-Hierarchie (PubMed > Examine.com > Stronger by Science > RP > McDonald — NICHT DGE/USDA), Body-Composition-Awareness (BF% > 25% → Hormon-Hinweis, Optimum 12-18% Mann), Bluttest-Vorschläge bei Symptomen mit konkreten Werten (25-OH-D, Holo-TC, Ferritin, hsCRP, Total-T + freies T + SHBG).
- **i18n-Vorbereitung** (`docs/I18N_STRATEGY.md`) — strikte Trennung UI-Strings / AI-Prompts / User-Daten. Tabelle `user_preferences` mit `locale`, weight_unit, etc. Aktuell DE-only, aber Architektur erweiterbar via next-intl (Beschreibung der Migration im Doc).

Neue AI-Tools: `analyze_body_photos`, `update_muscle_priorities`, `request_weekly_checkin`, `interpret_lab_result`, `suggest_blood_test_panel`, `update_supplements`, `get_current_supplements`, `update_training_preferences`.

---

## Datenfluss: Foto-Kalorien-Schätzung

```
User: Foto vom Restaurant-Teller + Beschreibung "Tagliata mit Rucola und Parmesan"
        ↓
Upload to Supabase Storage (compressed)
        ↓
Vision-LLM (Opus 4.7):
  System: prompts/nutrition-from-photo.md
  Input: Bild + User-Beschreibung
  Output (Zod): { items: [{ name, est_grams, kcal, protein_g, carbs_g, fat_g, confidence }] }
        ↓
User confirms / edits
        ↓
nutrition_logs (mit source='photo_estimate', confidence_score gespeichert)
```

Wichtig: confidence_score wird im UI als "geschätzt" markiert (±20–30% Realität). User kann editieren.

---

## Datenfluss: Workout-Session

```
User startet Session → Plan wird aus DB geladen + RIR-Progression-Algo schlägt Gewichte vor
        ↓
Pro Satz: User loggt (weight, reps, RIR)
        ↓
NACH jedem Set: progression.ts berechnet Vorschlag für nächste Session
        ↓
NACH der Session: AI-Coach läuft im Hintergrund:
  - Schaut auf alle Sätze + RIR-Verteilung
  - Entscheidet ob Deload nächste Woche
  - Postet Zusammenfassung in Chat (optional, opt-in)
```

---

## Offline-First mit PowerSync

**PowerSync syncht zwischen Supabase Postgres und einer lokalen SQLite-DB im Client** (Browser → IndexedDB-backed SQLite, Capacitor → native SQLite).

**Was offline laufen muss:**
- Workout-Logging (höchste Priorität — Gym ohne WiFi)
- Kcal-Logging (Restaurants, unterwegs)
- Rezepte ansehen + Portionen skalieren

**Was online braucht:**
- Rezept-Import (LLMs, Firecrawl, ElevenLabs)
- AI-Chat
- Migros-Lookups
- Withings/Strava-Sync

**PowerSync Setup** in `powersync/sync-rules.yaml`. Sync-Regeln: Recipes nach Household, alles andere nach User. Mutations werden lokal optimistisch geschrieben, beim Reconnect zur Cloud gepushed mit Last-Write-Wins (für 2 User akzeptabel).

---

## Capacitor / Android Plugins

In `android/` liegt das Capacitor-Projekt. **Nicht direkt Java/Kotlin schreiben**, sondern:

- `@capacitor/camera` — Foto für Rezept/Mahlzeit
- `@capacitor-community/barcode-scanner` (oder `@capacitor-mlkit/barcode-scanning` neuer) — Barcode
- `@kduma-autoid/capacitor-health-connect` — Health Connect (Samsung Health, Schritte, etc.)
- `@capacitor/push-notifications` — Workout-Reminders
- `@capacitor/preferences` — kleine Settings (sensitive Tokens nicht hier!)
- Encrypted Storage für Tokens: `@capacitor-community/secure-storage` oder native Keychain

**Build:** `npm run build && npx cap sync android && npx cap open android` → Android Studio. Signed APK über Gradle.

---

## Konventionen (Code-Style)

- **TypeScript strict** — keine `any`, keine `@ts-ignore` ohne Kommentar warum
- **Zod** für jede externe Datengrenze (LLM-Output, API-Responses, Form-Inputs)
- **react-hook-form + Zod** für Forms
- **Server Components** wo möglich, `'use client'` nur wo nötig (interaktive State)
- **API-Routes** unter `src/app/api/` als Route Handlers
- **Drizzle** statt rohem SQL ausser in Migrations
- **Tests:** Vitest. Mindestens für `progression.ts`, `deload.ts`, alle Tool-Definitionen
- **Linting:** Biome statt ESLint+Prettier (schneller, weniger Config)
- **Git:** Conventional Commits (`feat:`, `fix:`, `chore:`, ...)
- **Sprache:** UI-Text auf Deutsch (deutsch-schweizerischer Kontext, aber kein Schwiizerdüütsch). Code/Identifier auf Englisch.

---

## Was du NICHT tun sollst

- Keine Mock-Daten/Fake-User-Generierung — die App ist für 2 reale Personen
- Keine "Multi-Tenant"-Abstraktionen — kein Bedarf
- Keine Newsletter, Marketing, Onboarding-Funnel-Logik — privat
- Kein Server-State-Caching für AI-Antworten ausser `ai_tool_calls`-Audit (Coach-Antworten sind kontextspezifisch, nicht cachebar)
- Keine Authentication-Flows mit Email-Magic-Link für die "öffentliche" Version — Denny + Frau setzen einmalig Passwörter, das war's
- Niemals Workout-Daten, Body-Metrics, oder Chat zwischen Usern teilen — STRIKT user-scoped (nur Rezepte sind shared)

---

## Geheime Werte / Env

`.env.example` zeigt alles. Echte Werte in Vercel und lokal in `.env.local` (nicht committed). Capacitor-Builds: Build-Time-Env via Vite.

**API-Keys, die Denny hat:**
- OPENROUTER_API_KEY
- FIRECRAWL_API_KEY
- ELEVENLABS_API_KEY
- WITHINGS_CLIENT_ID/SECRET (registrieren bei dev.withings.com)
- STRAVA_CLIENT_ID/SECRET (registrieren bei strava.com/settings/api)
- SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (nur server-side!)
- POWERSYNC_URL, POWERSYNC_TOKEN

---

## Project Status / Wo wir stehen

Initialer Bootstrap. Noch nichts gebaut ausser:
- DB-Schema (`supabase/schema.sql`) — apply zu Supabase
- Architektur-Docs (`docs/`)
- RIR-Progression-Algorithmus (`src/lib/training/progression.ts`) mit Tests
- AI-Prompts (`src/lib/ai/prompts/*.md`)
- Tool-Definitionen (`src/lib/ai/tools.ts`)

**Nächste Schritte (in Reihenfolge):**
1. Supabase-Projekt anlegen, Schema applien, RLS testen
2. Next.js + Capacitor + PowerSync verkabeln
3. Auth-Flow für 2 User (signup geschlossen, nur Email-Whitelist)
4. Recipes-Modul (Import-Pipeline → Display → Migros-Lookup)
5. Nutrition-Modul (Barcode + Photo + Manual)
6. Training-Modul (Plan-Setup-Wizard → Logging → Progression)
7. Integrations (Withings → Strava → Health Connect)
8. AI-Chat mit Tool-Calling
9. Android-Build polieren
10. PWA-Optimierung (Service Worker, Manifest, Install-Prompt)

---

## Frag bei Unsicherheit

Wenn etwas nicht klar ist, frag Denny auf Deutsch, knapp, ohne Hedging. Beispiele:
- "Sollen substitutiert Übungen permanent ersetzen oder nur für eine Session?"
- "Wenn ein Rezept-Import fehlschlägt — soll der Roh-Inhalt gespeichert werden für späteren Retry?"
- "Soll Frau Rezepte auch löschen können oder nur hinzufügen/editieren?"

Bessere Frage als falsche Annahme.
