# Architecture Decisions Log

Format: ADR (Architecture Decision Record), kurz gehalten.
Reihenfolge chronologisch.

---

## ADR-001: PWA + Capacitor statt React Native

**Datum:** 2026-05
**Status:** Accepted

**Kontext:** App muss Web + Android laufen. Native Health Connect / Samsung Health-Anbindung ist auf Android Pflicht. Reine PWA aus Browser kann nicht auf Health Connect zugreifen.

**Entscheidung:** Single Codebase als Next.js + PWA, mit Capacitor 7 als Wrapper für Android.

**Alternativen erwogen:**
- React Native / Expo — separater Mobile-Code, mehr Maintenance, weniger Code-Sharing
- Reine PWA — kein Health Connect Zugriff
- Flutter — komplette Stack-Migration, lohnt nicht für 2 User

**Trade-offs:**
- ✅ Single Codebase
- ✅ Vercel-Deploy für Web ist trivial
- ✅ Capacitor erlaubt native Plugins genau dort wo nötig
- ⚠️ APK muss manuell signed/sideloaded werden (kein Play Store)
- ⚠️ Capacitor-Layer ist 1 Tag extra Setup, dafür unblockt Health Connect

---

## ADR-002: Supabase als All-in-One Backend

**Datum:** 2026-05
**Status:** Accepted

**Entscheidung:** Postgres + Auth + Storage + Realtime alles über Supabase.

**Begründung:** Hosted, RLS für 2 User trivial, kostenlos in der Skalierung. Kein DevOps-Overhead.

**Trade-offs:**
- ✅ Schnellster Weg zum funktionierenden Backend
- ✅ RLS macht Multi-User-Trennung sicher
- ⚠️ Vendor Lock-in (akzeptabel — Postgres-Schema ist portable)

---

## ADR-003: PowerSync für Offline-Sync

**Datum:** 2026-05
**Status:** Accepted

**Kontext:** App muss offline funktionieren (Gym-Keller, Restaurants ohne Empfang, Wanderungen). Sync zurück in die Cloud beim Reconnect.

**Entscheidung:** PowerSync als Sync-Layer zwischen Supabase Postgres und lokaler SQLite.

**Alternativen erwogen:**
- Custom IndexedDB + Mutation Queue — Wochen Aufwand, fehleranfällig
- WatermelonDB + eigener Sync — viel Custom Code
- ElectricSQL — ähnlich PowerSync, kleinere Community
- Tinybase / RxDB — weniger reife Postgres-Integration

**Trade-offs:**
- ✅ Free Tier deckt 2 User locker
- ✅ Funktioniert mit Supabase out-of-the-box
- ✅ SQLite client-seitig (Browser via OPFS, Capacitor native)
- ⚠️ Service Dependency
- ⚠️ Sync Rules YAML muss gepflegt werden

---

## ADR-004: OpenRouter als AI-Gateway, Opus 4.7 als Default

**Datum:** 2026-05
**Status:** Accepted

**Entscheidung:** Alle LLM-Calls gehen über OpenRouter. Default-Modell: `anthropic/claude-opus-4.7`.

**Begründung:**
- Opus 4.7 hat 3x bessere Vision-Auflösung (2.576px) → kritisch für Foto-OCR
- Bestes Tool-Calling (MCP-Atlas 77.3%) → wichtig für AI-Coach
- OpenRouter erlaubt Modell-Switch ohne Code-Änderung (z.B. Gemini 3.1 Pro für günstige Bulk-Tasks)
- Single-API-Key reduziert Komplexität

**Cost-Strategie:**
- Vision (Foto → Rezept, Foto → Kcal): Opus 4.7 (Qualität wichtig)
- Web-Page → Strukturiertes Rezept: Gemini 3.1 Pro (günstiger, Volumen)
- Coach-Chat: Opus 4.7 (Tool-Calling-Qualität)
- Schnelle Status-Antworten: Sonnet 4.6 (Kosten)

---

## ADR-005: Tool-Calling für AI-Datenzugriff statt RAG

**Datum:** 2026-05
**Status:** Accepted

**Entscheidung:** AI-Coach greift via Tool-Calling auf User-Daten zu, NICHT via Vector-DB / Embedding-Search.

**Begründung:** User-Daten sind strukturiert (workout_sets, nutrition_logs, body_metrics). SQL-Queries sind präziser als Embedding-Similarity. Bei 2 Usern lohnt kein RAG-Setup.

**Konsequenz:** `src/lib/ai/tools.ts` definiert ~10 Tools (get_workout_history, get_nutrition_summary, ...). Tools laufen server-side mit User-RLS-Kontext.

---

## ADR-006: Iron-Mike-Methodik als Default-Trainingslogik

**Datum:** 2026-05
**Status:** Accepted

**Kontext:** User folgt Iron Mike's Trainingsphilosophie (siehe Podcast-Transkript): 1–2 Arbeitssätze ins Muskelversagen, 5–7 Reps, GK 2x/Woche, Cardio 2x/Woche Zone 2.

**Entscheidung:** App-Defaults und Progression-Algorithmus folgen dieser Methodik. RIR-Logik mit 0.25kg-Scheiben (= 0.5kg-Schritte auf der Stange).

**Konsequenz:** Siehe `docs/TRAINING_LOGIC.md` und `src/lib/training/progression.ts`.

---

## ADR-007: Wife = recipe_only role, kein voller User

**Datum:** 2026-05
**Status:** Accepted

**Entscheidung:** Frau bekommt eigenen Login, aber Rolle `recipe_only`. Kann Rezepte sehen + hinzufügen, kein Zugriff auf Training, Ernährung, Body-Metrics, AI-Chat von Denny.

**Begründung:** Use Case ist Rezepte teilen. Tracking ist persönlich.

**Konsequenz:** RLS-Policies in `supabase/schema.sql` differenzieren nach Rolle.

---

## ADR-008: Strava als Activity-Bridge (Free Tier)

**Datum:** 2026-05
**Status:** Accepted

**Kontext:** AllTrails hat keine API. Strava Premium hat Trail-Routenplanung, aber für reines Activity-Reading reicht **Strava Free**.

**Entscheidung:**
- Strava OAuth → Activities lesen (Free reicht)
- AllTrails-Sync zu Strava (falls AllTrails Pro behalten wird) ODER manueller GPX-Import
- MTB-Routenplanung **ausserhalb der App** in Trailforks (Heimregion gratis)

**Verworfen:** Strava Premium für die App nötig zu machen. Funktion liegt nicht in der App, sondern bei der Aktivitätsplanung.

---

## ADR-009: ElevenLabs Scribe für Video-Audio-Transkription

**Datum:** 2026-05
**Status:** Accepted

**Kontext:** Rezepte werden auch aus Video-Quellen importiert (YouTube, Instagram, TikTok-Reels). YouTube hat oft Captions, andere nicht.

**Entscheidung:**
1. Erster Versuch: YouTube-Captions via `youtube-transcript-api`
2. Fallback: Audio runterladen (yt-dlp), durch ElevenLabs Scribe schicken
3. Resultierender Transcript → LLM-Extraction → strukturiertes Rezept

**Alternativen erwogen:**
- OpenAI Whisper via OpenRouter — funktional ähnlich, ElevenLabs hat User schon API-Key
- Gemini Audio direct — nett, aber weniger STT-spezialisiert

---

## ADR-010: Drizzle ORM, kein Supabase JS-Client für DB-Queries

**Datum:** 2026-05
**Status:** Accepted

**Entscheidung:** Drizzle für alle DB-Queries (server-side). Supabase JS-Client nur für Auth + Storage + Realtime.

**Begründung:** Drizzle ist typesafe gegen Schema, hat besseres Migration-Management, und kompatibel mit PowerSync's lokaler SQLite (gleiches Schema).

---

## ADR-011: Biome statt ESLint+Prettier

**Datum:** 2026-05
**Status:** Accepted

**Entscheidung:** Biome für Lint + Format.

**Begründung:** 10x schneller als ESLint+Prettier, ein Config-File, keine Plugin-Hölle. Bei einem Solo-Projekt kein Grund für ESLint-Ökosystem-Vorteile.

---

## Offene Fragen / Spätere Entscheidungen

- **Push-Notifications:** Capacitor Push via Firebase, oder native lokale Notifications? Erst entscheiden wenn Reminder-Feature gebaut wird.
- **iOS-Support:** Aktuell explizit nur Android. Bei Bedarf Capacitor iOS dazu — aber Apple-Developer-Account = 99€/Jahr, lohnt nicht für 2 User.
- **Backup-Strategie:** Supabase macht automatische Backups (täglich, 7d retention auf Free). Reicht für jetzt. Bei Bedarf eigenes pg_dump-Cron.
