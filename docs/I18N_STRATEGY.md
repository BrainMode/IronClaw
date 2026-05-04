# i18n-Strategie

> **Status:** Designed-for, nicht implementiert. Wenn das Repo public geht und
> internationale Forks willst, ist das die Roadmap. Aktuelle App ist DE-only.

## Designprinzip

**Trenne strikt zwischen drei Klassen von Strings:**

1. **UI-Strings** (Buttons, Labels, Headings) — übersetzbar via Übersetzungsfile
2. **AI-System-Prompts** — für jede Sprache eigene Variante (nicht maschinell übersetzbar, weil Tonalität + Domain-Spezifika)
3. **AI-Output-Sprache** — wird vom System-Prompt bestimmt, ist `locale`-getrieben

User-Daten (Recipe-Titel, Notizen, Custom-Tags) sind **immer in der Sprache, in der sie eingegeben wurden** — nicht übersetzen. `recipes.source_language` Spalte ist schon dafür da.

## Stack-Wahl

**`next-intl`** statt `next-i18next`:
- Aktuell aktivste Maintenance
- App-Router-kompatibel (Next.js 15)
- TypeScript-fähig (kompiliert Übersetzungen zu typed objects)
- Server Components + Client Components beide unterstützt

```bash
npm install next-intl
```

## Datei-Struktur (vorgesehen)

```
src/
├── i18n/
│   ├── locales/
│   │   ├── de.json          # primär (DE-CH)
│   │   ├── en.json          # zweite Sprache
│   │   └── it.json          # später
│   ├── routing.ts           # next-intl routing config
│   └── request.ts           # next-intl request config
├── lib/
│   ├── ai/
│   │   └── prompts/
│   │       ├── coach-system.de.md
│   │       ├── coach-system.en.md
│   │       ├── recipe-extraction.de.md
│   │       ├── recipe-extraction.en.md
│   │       └── …
```

## Naming-Convention für Translation-Keys

```json
{
  "common": { "save": "Speichern", "cancel": "Abbrechen" },
  "recipes": {
    "import": { "title": "Rezept importieren", "url_placeholder": "URL einfügen" },
    "tags": {
      "high-protein": "Proteinreich",
      "healthy-fast-food": "Schnell & gesund"
    }
  },
  "training": {
    "deload": { "suggested": "Deload empfohlen" }
  }
}
```

Kanonische Keys (wie `high-protein`, equipment_keys, supplement_keys) bleiben konstant — nur die Display-Names werden übersetzt.

## Was BEWUSST sprachunabhängig bleibt

- Kanonische Tag-Keys (`high-protein`, `bbq`, `cheat-meal`)
- Equipment-Keys (`weber-grill`, `sous-vide`)
- Supplement-Keys (`omega-3-epa-dha`)
- Source-Types (`youtube_video`, `instagram_reel`)
- DB-Enums

User sieht nie diese Keys, nur die mapped Display-Names.

## AI-Prompts

Drei Optionen, wir nehmen Option C:

- **Option A:** ein Prompt für alle, "respond in {locale}" — ❌ Tonalität leidet
- **Option B:** ein Prompt + dynamische Übersetzung — ❌ Übersetzungsverlust
- **Option C:** Prompts pro Sprache hand-geschrieben — ✓ Qualität bleibt

`coach-system.de.md` hat Du-Form, schweizerdeutsch-kompatibles Hochdeutsch, "Mike-Mentality"-Tonalität.
`coach-system.en.md` würde anders klingen — direkter, "no-bullshit", ggf. "you/your".

Die Domain-Anweisungen (welche Tools, welche Constraints) sind identisch zwischen den Versionen — nur Tonalität + Beispiele unterschiedlich.

## Recipe-Tagging Multi-lingual

Aktuell: ai_tags sind kanonische Strings (`italienisch`, `bbq`). Display-Übersetzung passiert in der UI.

Refactor wenn nötig:
- Tag-Catalog mit `key + i18n_keys` strukturieren:
  ```ts
  { key: 'italian', display: { de: 'italienisch', en: 'italian', it: 'italiano' } }
  ```
- Aktuelle ai_tags müssten dann auf kanonische `key`s migriert werden (`italienisch` → `italian`).

## Datums-/Maßeinheiten

- Datum/Zeit: `Intl.DateTimeFormat` mit user-locale
- Gewichte: kg vs. lbs — User-Setting in `users.preferences`
- Volumen: ml vs fl_oz
- Temperatur: °C vs. °F

`src/lib/units.ts` als zentrales Conversion-Modul vorhalten.

## Schritt-für-Schritt-Migration (wenn nötig)

1. `next-intl` installieren + konfigurieren
2. Top-Level UI-Strings in DE-File extrahieren (`de.json`)
3. App.tsx mit `NextIntlClientProvider` wrappen
4. EN-Übersetzung von DE-File abgeleitet
5. `coach-system.en.md` schreiben (manuell, nicht maschinell)
6. `recipe-extraction.en.md` schreiben
7. Tag-Catalog auf canonical-key + i18n migrieren
8. Routing: `/de/...` und `/en/...` URL-Prefix

Aufwand für DE+EN: ~2-3 Tage. Für jede zusätzliche Sprache: ~1 Tag.

## Was JETZT schon gemacht werden sollte

Auch wenn wir nicht implementieren:
- ✅ Kanonische Keys statt deutsche Strings für: tags, equipment, supplements, source_types, exercise_slugs
- ✅ `source_language` Spalte in `recipes`
- ✅ AI-Prompts in eigenen `.md`-Files (nicht hardcoded) — können später als `.de.md` umbenannt werden
- ✅ `users.locale` Spalte vorbereiten (default `de-CH`)
- ✅ Datums-Formatierung über zentrale Util (nicht direkt `toLocaleDateString`)
