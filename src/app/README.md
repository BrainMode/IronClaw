# src/app/

Hier entsteht die komplette Next.js App-Router-Struktur (Routen + API).

**Status:** noch leer — Claude Code baut das aus.

**Struktur-Plan** (siehe `docs/ARCHITECTURE.md`):

```
src/app/
├── layout.tsx                # Root Layout (Theme, Toaster)
├── globals.css               # Tailwind v4 + shadcn Tokens
├── page.tsx                  # Landing → redirect zu /login oder /
├── (auth)/
│   ├── login/page.tsx
│   └── reset-password/page.tsx
├── (app)/
│   ├── layout.tsx            # Auth-Check + Sidebar/Bottom-Nav
│   ├── page.tsx              # Dashboard
│   ├── recipes/...
│   ├── nutrition/...         # admin only
│   ├── training/...          # admin only
│   ├── body/...              # admin only
│   ├── activities/...        # admin only
│   ├── chat/...              # admin only
│   └── settings/page.tsx
└── api/
    ├── ai/
    │   ├── chat/route.ts
    │   ├── recipe-extract/route.ts
    │   └── nutrition-photo/route.ts
    ├── recipes/import/route.ts
    ├── integrations/
    │   ├── withings/{connect,callback,sync}/route.ts
    │   └── strava/{connect,callback}/route.ts
    ├── webhooks/strava/route.ts
    └── sync/auth/route.ts
```

**Erste Schritte für Claude Code:**

1. `app/layout.tsx` mit Tailwind/shadcn Setup
2. `app/globals.css` mit Theme-Tokens (`@theme` Block)
3. Supabase Server-Side Auth via `@supabase/ssr`
4. Login-Page → admin/recipe_only redirect-Logik
5. Dashboard-Skelett, dann Module einzeln durchziehen
