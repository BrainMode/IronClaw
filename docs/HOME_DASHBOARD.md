# Home Dashboard — Spec

> Was sieht User wenn er die App öffnet? Diese Doc beschreibt das Glance-Card-System
> für die Home-Page. Zielgruppe: Claude Code beim UI-Bau.

## Design-Prinzip

Einer Karte gleich was wirklich relevant ist *jetzt*. Kein Cluttering mit allen Daten —
Detail-Ansichten haben eigene Pages. Home ist Start-Punkt + 80%-Use-Case-Antwort.

Mobile-first: 1 Spalte, Cards stapeln sich. Web: 2-Spalten-Grid bei breitem Viewport.

## Card-Liste (in dieser Reihenfolge)

### 1. Daily-Standup-Card
Wenn `daily_standups` für heute existiert: zeige Greeting + Recap + Outlook + Tip + Suggested-Actions als Buttons.
Wenn noch nicht generiert: "Standup wird vorbereitet…" + manueller "Jetzt erstellen"-Button.
Card ist dismissable (User-Aktion `read` oder `dismissed`).

### 2. Heute-Plan-Card
Falls aktiver `meal_plan` für heute:
- Mealtype-Liste (Frühstück / Mittag / Abend / Snack)
- Pro Mealtype: Recipe-Title + Macros + "Habe gegessen"-Button (→ `log_cooked_recipe`)
- Card-Footer: Tagesbudget vs. geplant (z.B. "1850 / 2400 kcal geplant — passt")

Falls kein aktiver Plan:
- "Du hast keinen Plan für heute. Möchtest du einen erstellen?"
- Button → triggert AI-Coach-Flow `create_meal_plan`

### 3. Heute-Workout-Card
Falls heute Trainings-Tag:
- Template-Name (z.B. "Full-Body A")
- Übungsliste (5-7 Items): Name + letztes Gewicht/Reps × Ziel
- Big-Button: "Workout starten"

Falls Cardio-Tag:
- "Heute 30min Zone-2 Cardio (Mike's Plan)"
- Button: "Aktivität importieren" (für Watch / AllTrails-Bridge)

Falls Rest-Day:
- "Rest-Day. Schoner deine Recovery — gestern HRV: 38 (-3% vom Baseline)"

### 4. Goal-Progress-Card
Wenn aktives Goal vorhanden:
- Progress-Bar: Start-Gewicht → aktuelles → Ziel
- Trend: "Letzte 14 Tage: -0.4 kg/Woche (Ziel: -0.5)"
- Status-Badge: on-track / too-fast / too-slow / stalled
- Wenn Adjustment empfohlen: gelbe Hinweis-Box "+200 kcal/Tag empfohlen → Annehmen / Verwerfen"

### 5. Quick-Log-Card (immer sichtbar)
Vier Quick-Action-Buttons:
- 📷 **Foto-Mahlzeit** → öffnet Kamera → Vision-LLM-Flow
- 🛒 **Pantry-Update** → "Was hast du eingekauft?"
- 💪 **Set loggen** → Quick-Form (Übung × Gewicht × Reps × RIR)
- 💬 **Coach fragen** → öffnet AI-Chat

### 6. Pantry-Hinweise-Card (wenn relevant)
- "Lachs läuft morgen ab — hier sind 3 Recipes"
- Kompakte Liste der Vorschläge mit "Heute kochen"-Button

### 7. AI-Cost-Card (nur in Demo-/Dev-Mode)
- "Diesen Monat: $2.40 für AI (12 Recipe-Imports, 45 Coach-Messages)"
- Klein, unauffällig — Easter-Egg für KI-Berater-Demo

## Optional Cards (basierend auf Daten/Setup)

### Outdoor-Wetter-Card
Wenn User regelmäßig MTB/SUP/Climbing-Activities macht UND Wetter heute gut:
- "Wetter ideal für MTB (22°C, sonnig) — letzte Tour vor 12 Tagen?"
- Button: "Soll ich dein Cardio durch eine Tour ersetzen?" → AI-Coach

### Streak-Card
- "12 Tage in Folge Macro-Ziel getroffen"
- Nur wenn Streak ≥ 5 Tage (sonst eher demotivierend)

## Technische Hinweise

- **Caching:** Home-Page Server-rendered mit ISR (30s revalidate). Reduce DB-Queries.
- **Real-time:** Subscribe via Supabase Realtime auf `daily_standups`, `recipe_extraction_jobs` (für laufende Imports).
- **Empty-States:** wenn noch kein Plan / kein Goal / etc. — Card zeigt "Setup starten"-Button.
- **Pull-to-refresh** auf Mobile: re-fetch alle Cards.
- **Skeleton-Loaders** während initialem Fetch.

## Implementation-Reihenfolge

1. Daily-Standup-Card (höchste Differenzierung)
2. Quick-Log-Card (häufigste User-Aktion)
3. Heute-Plan-Card + Heute-Workout-Card (Plan-Driver)
4. Goal-Progress-Card
5. Pantry-Hinweise + Outdoor-Wetter (kontextuell)
6. Streak + AI-Cost (Polish)
