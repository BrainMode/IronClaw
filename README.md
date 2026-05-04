# WDC Fitness

Privat-Fitness-App für Denny + Frau. Web (Vercel) + Android (Capacitor).
Offline-first, AI-powered, Schweiz-Kontext (Migros-Anbindung, Stans).

> **Für Claude Code:** Lies zuerst `CLAUDE.md`. Dort steht alles.

---

## Erst-Setup (einmalig, ~2h)

### 1. Konten anlegen / API-Keys besorgen

| Service | Was holen | Wo |
|---|---|---|
| Supabase | Project + URL + anon-Key + service-role-Key | https://supabase.com → New project (Region eu-central-1, Frankfurt) |
| Vercel | Team-Account (Hobby reicht) | https://vercel.com |
| OpenRouter | API-Key | https://openrouter.ai/keys |
| Firecrawl | API-Key | https://www.firecrawl.dev (hast du schon) |
| ElevenLabs | API-Key | https://elevenlabs.io |
| Withings Developer | Client-ID + Secret + Redirect-URI | https://developer.withings.com |
| Strava API | Client-ID + Secret | https://www.strava.com/settings/api |
| PowerSync | Project + Token | https://powersync.com (Free Tier reicht) |

### 2. Repository klonen + Dependencies installieren

```bash
git clone <repo-url> wdc-fitness
cd wdc-fitness
npm install
```

### 3. Env konfigurieren

```bash
cp .env.example .env.local
# Werte eintragen
```

### 4. Supabase Schema applien

```bash
# Option A: Supabase CLI
supabase db push --db-url "postgresql://postgres:..."

# Option B: SQL Editor im Supabase Dashboard
# → supabase/schema.sql Inhalt einfügen + ausführen
# → supabase/seed.sql danach ausführen (Übungs-Katalog)
```

### 5. User anlegen

Im Supabase Auth Dashboard:
- Denny: `kontakt@dennyweber.ch` (Rolle: `admin`)
- Frau: ihre E-Mail (Rolle: `recipe_only`)

Dann manuell in der `household_members` Tabelle die Rollen setzen (siehe `supabase/seed.sql` für Beispiel-Statement, das du nach Auth-Signup ausführst).

**Email-Signup zumachen** in Supabase Auth → Settings → "Allow new users to sign up": **OFF**.

### 6. Migros MCP für Claude Code aktivieren

```bash
claude mcp add migros -- npx -y migros-mcp
```

Damit kann Claude Code bei der Entwicklung direkt Migros-Daten testen. Im Production-Code rufen wir den MCP-Server programmatisch via `src/lib/integrations/migros-mcp/client.ts` (siehe Datei).

### 7. PowerSync verkabeln

PowerSync-Project mit Supabase verbinden:
1. PowerSync-Dashboard → New Project → Postgres-Connection (Supabase-URL + Service-Role-Key)
2. Sync-Rules aus `powersync/sync-rules.yaml` hochladen
3. Token generieren → in `.env.local` als `POWERSYNC_URL` und `POWERSYNC_TOKEN`

### 8. Capacitor Android Setup

```bash
npm run build
npx cap add android
npx cap sync android
npx cap open android  # öffnet Android Studio
```

Im Android Studio: Build → Build APK(s). Erste Build-Zeit ~5–10min.

---

## Tägliche Entwicklung

```bash
npm run dev          # Next.js dev server (Port 3000)
npm run db:studio    # Drizzle Studio (DB-Browser)
npm run test         # Vitest
npm run typecheck    # tsc --noEmit
npm run lint         # Biome check
npm run format       # Biome format
```

### Mit Claude Code arbeiten

```bash
# Im Repo-Root
claude

# Oder als Subagent für spezifischen Task
claude code "Implementiere die Recipe-Import-Pipeline für YouTube-Links"
```

Claude Code liest automatisch `CLAUDE.md` und versteht den Kontext.

---

## Deploy

### Web (Vercel)

```bash
git push origin main
# Vercel deployed automatisch
```

Env-Variablen in Vercel-Dashboard pflegen (Production + Preview separat).

### Android

Manuell. Signed APK bauen, sideload auf Geräte. Kein Play Store (nur 2 User).

```bash
# Production build
npm run build
npx cap sync android
cd android && ./gradlew assembleRelease
# APK liegt in android/app/build/outputs/apk/release/
```

Auf Telefon: USB-Debugging an, `adb install <pfad-zur-apk>`. Oder per Datei rüberkopieren + tippen.

---

## Architektur-Doku

- `CLAUDE.md` — Projekt-Briefing (für Claude Code, aber auch für dich)
- `DECISIONS.md` — Architektur-Entscheidungs-Log (warum so und nicht anders)
- `docs/ARCHITECTURE.md` — System-Übersicht
- `docs/RECIPE_IMPORT.md` — Multi-Source Recipe-Import-Pipeline mit Provenance
- `docs/HOME_DASHBOARD.md` — Home-Page-Card-System
- `docs/TRAINING_LOGIC.md` — Iron Mike Methodik kodifiziert
- `docs/AI_AGENT_DESIGN.md` — Tool-Calling-Pattern für AI-Coach

---

## Demo-Mode (für Public-Showcase)

Falls du das Repo public auf GitHub legst und Leute durchklicken sollen ohne eigenes Setup:

1. Dev-Server starten mit `NEXT_PUBLIC_DEMO_MODE=true npm run dev`
2. Setzt einen anonymen Demo-User mit Sample-Data (im `seed-demo.sql`)
3. Alle Schreibvorgänge gehen in eine isolierte Demo-Tabelle, die täglich resettet wird
4. AI-Calls werden auf $1/Tag pro IP gerate-limited (gegen Missbrauch wenn das Repo durch HN geht)

Setup-Hinweis: in Supabase eine zweite "demo"-Schema oder einen separaten Demo-User-Account einrichten.

---

## Known Issues / Limitierungen

- **AllTrails:** Keine API. Wir lesen Aktivitäten via **Strava-Bridge** (AllTrails Pro kann zu Strava syncen — falls du AllTrails behältst). Sonst: GPX-Import manuell.
- **Samsung Health:** Wir gehen über **Health Connect** (Android-System). Daten kommen indirekt rein, sobald Samsung Health zu HC schreibt. Reine PWA (ohne Capacitor) hat KEINEN Zugriff.
- **Migros MCP** ist inoffiziell. Kann brechen wenn Migros API-Endpoints ändert. Fallback: Open Food Facts.
- **Foto-Kalorien-Schätzung** ist ±20–30% genau. UI markiert das als "geschätzt".

---

## Lizenz

MIT — siehe [LICENSE](./LICENSE).

> Private Anwendung von WDC GmbH (Denny Weber). Public auf GitHub als Showcase
> dafür, was man heutzutage mit AI als Privatperson bauen kann. Kein offizieller
> Support — wenn du das forken willst: viel Spaß, ich freue mich über Stars und
> PRs aber Garantien gibts keine.
