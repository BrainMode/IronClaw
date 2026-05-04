# Architektur

## System-Überblick

```
┌────────────────────────┐         ┌────────────────────────┐
│  Browser (PWA)         │         │  Android (Capacitor)   │
│  Next.js Frontend      │         │  Next.js Static Export │
│  + PowerSync SQLite    │         │  + PowerSync SQLite    │
│  (IndexedDB-backed)    │         │  + Health Connect      │
│                        │         │  + Native Camera       │
└─────────┬──────────────┘         └─────────┬──────────────┘
          │                                  │
          │            HTTPS / Realtime      │
          │                                  │
          ▼                                  ▼
   ┌─────────────────────────────────────────┐
   │ Vercel (Next.js API Routes)             │
   │ - /api/ai/* (streaming chat, extract)   │
   │ - /api/integrations/withings/*          │
   │ - /api/integrations/strava/*            │
   │ - /api/recipes/import                   │
   │ - /api/sync/* (PowerSync auth)          │
   │ - /api/webhooks/strava                  │
   └─────┬──────────┬─────────┬──────────────┘
         │          │         │
         ▼          ▼         ▼
   ┌─────────┐  ┌────────┐ ┌────────────────────┐
   │Supabase │  │Power-  │ │ External APIs      │
   │Postgres │◄─►Sync   │ │ - OpenRouter       │
   │+ Auth   │  │Service │ │ - Firecrawl        │
   │+ Storage│  └────────┘ │ - ElevenLabs       │
   │+ RLS    │             │ - Withings         │
   └─────────┘             │ - Strava           │
                           │ - Migros (MCP)     │
                           │ - Open Food Facts  │
                           └────────────────────┘
```

## Daten-Topologie

### Public/Shared
- `exercises` — globaler Übungs-Katalog (read-only client-seitig)
- `food_items_cache` — globaler Cache von Barcode-Lookups

### Household-shared
- `recipes`, `recipe_ingredients`, `recipe_steps` — Rezepte sind zwischen den 2 Usern geteilt
- `households`, `household_members` — Membership-Mapping

### User-private (strikt RLS)
- Alles andere: nutrition_logs, workout_*, body_metrics, activities, chat_*, integration_tokens, etc.

## Frontend-Routen (Next.js App Router)

```
src/app/
├── (auth)/
│   ├── login/                # E-Mail + Passwort, kein Sign-up
│   └── reset-password/
├── (app)/                    # geschützt, layout enthält Auth-Check
│   ├── layout.tsx            # Sidebar / Bottom-Nav, je nach Rolle
│   ├── page.tsx              # Dashboard (Stats + heutige Tasks)
│   ├── recipes/
│   │   ├── page.tsx          # Liste + Search
│   │   ├── [id]/page.tsx     # Detail + Skalierung
│   │   ├── import/page.tsx   # URL/Photo/Video Import-UI
│   │   └── new/page.tsx      # Manuell anlegen
│   ├── nutrition/            # NUR für admin-Rolle
│   │   ├── page.tsx          # Heute-Übersicht
│   │   ├── log/page.tsx      # Quick-Log (Barcode/Photo/Manual)
│   │   └── history/page.tsx
│   ├── training/             # NUR admin
│   │   ├── page.tsx          # Aktuelle Plan-Übersicht
│   │   ├── plan/page.tsx     # Plan editieren
│   │   ├── session/page.tsx  # Aktive Session-Logging
│   │   └── history/page.tsx
│   ├── body/                 # NUR admin
│   │   └── page.tsx          # Withings-Daten + Trends
│   ├── activities/           # NUR admin
│   │   └── page.tsx          # Strava-Activities
│   ├── chat/                 # NUR admin
│   │   └── page.tsx          # AI-Coach
│   └── settings/
│       └── page.tsx
└── api/
    ├── ai/
    │   ├── chat/route.ts             # streamText mit COACH_TOOLS
    │   ├── recipe-extract/route.ts   # Single-shot, kein Streaming
    │   └── nutrition-photo/route.ts  # Single-shot Vision
    ├── recipes/import/route.ts
    ├── integrations/
    │   ├── withings/{connect,callback,sync}/route.ts
    │   └── strava/{connect,callback}/route.ts
    ├── webhooks/strava/route.ts
    └── sync/auth/route.ts            # PowerSync JWT-Token
```

## Auth-Flow

1. Supabase Auth E-Mail+Passwort, **kein Sign-up offen**.
2. User legt sich in Supabase Auth Dashboard an, dann manuell in `household_members` eintragen.
3. Nach Login: Server-Side via `@supabase/ssr` cookie-based auth.
4. RLS-Policies in Postgres erzwingen Trennung — Server-Code muss nichts manuell prüfen.

## Sync-Strategie

- **Online-Mode:** Schreibvorgänge gehen DIREKT an Supabase (über Server Actions oder API).
- **Offline-Mode:** PowerSync schreibt lokal in SQLite. Beim Reconnect: Push zum Server.
- **Realtime Updates:** Bei Änderungen am Server (z.B. Sync von Withings) → PowerSync pushed Changes runter.

**Konflikt-Strategie:** Last-Write-Wins. Bei 2 Usern und meist einzelnen Features (Denny trainiert nicht gleichzeitig zur selben Übung) ist das akzeptabel.

## AI-Architektur

Siehe `docs/AI_AGENT_DESIGN.md`.

## Performance-Notizen

- **Bundle-Size:** Capacitor-Build ist statisch, deshalb Next.js export-Modus → keine SSR im APK
- **Bilder:** Supabase Storage mit Image-Transform (resize on the fly)
- **AI-Streaming:** Server-Sent Events / Vercel AI SDK
- **Kalt-Start:** Vercel Serverless Functions → erste Request kann 1-2s dauern. Bei Bedarf "Vercel Edge Functions" für API-Routes.

## Sicherheit

- Service-Role-Key NIEMALS im Client. Nur in API-Routes.
- PowerSync-JWT pro User, kurze Laufzeit (1h), Refresh über Server.
- RLS auf ALLEN Tabellen (kein "by default permissive").
- Capacitor-App: Tokens in encrypted-storage / native Keychain.
