# Recipe Import — Design Document

> **Wichtig für Claude Code:** Dieses Dokument beschreibt die komplette Logik der Rezept-Import-Pipeline. Bevor du an irgendeinem File unter `src/lib/recipes/` arbeitest, lies das durch. Es ist absichtlich ausführlich — Edge-Cases im Recipe-Import sind die Hölle und wir wollen nicht alle 2 Wochen einen "warum hat er die Zutaten nicht gefunden"-Bug fixen.

## Mentaler Modus

Statt "App extrahiert Rezept aus URL" denkt die Pipeline wie ein Mensch der ein Rezept finden will:

1. **Was für eine Quelle ist das überhaupt?** YouTube-Video, Instagram-Reel, Recipe-Blog, Foto, …
2. **Wo wahrscheinlich wirklich das Rezept liegt** — meistens nicht der eine offensichtliche Ort, sondern eine Kombi (Caption + Pinned Comment + Bio-Link + Audio-Transcript)
3. **Welche Quelle vertrauenswürdiger ist** als die andere — strukturiertes JSON-LD schlägt Audio-Transcript-Schätzung
4. **Wenn Quellen sich widersprechen** — kennzeichnen, nicht raten

Output ist nicht nur das Rezept, sondern auch **Provenance pro Feld**. User soll sehen "Mengen kommen aus dem Pinned Comment", damit sie bei Fehlern wissen wo sie nachjustieren müssen.

---

## Source-Detection (Phase 1)

URL-Parser klassifiziert Input in einen von ~10 Source-Typen. Pro Typ existiert ein dedizierter Fetcher. Beispiele:

| Input | Detected Type | Fetcher |
|---|---|---|
| `https://youtube.com/watch?v=...` | `youtube_video` | `sources/youtube.ts` |
| `https://youtube.com/shorts/...` | `youtube_shorts` | `sources/youtube.ts` (mit shorts-flag) |
| `https://youtu.be/...` | `youtube_video` | normalisiert |
| `https://instagram.com/p/...` | `instagram_post` | `sources/instagram.ts` |
| `https://instagram.com/reel/...` | `instagram_reel` | `sources/instagram.ts` |
| `https://www.tiktok.com/@user/video/...` | `tiktok` | `sources/tiktok.ts` |
| `https://vm.tiktok.com/abc/` | `tiktok_short` | resolve redirect first |
| `https://facebook.com/.../posts/...` | `facebook_post` | `sources/facebook.ts` |
| `https://fb.watch/...` | `facebook_video` | resolve redirect |
| `https://pinterest.com/pin/...` | `pinterest` | usually redirect — fetch then re-classify |
| `https://chefkoch.de/rezepte/...` (any blog) | `web_url` | `sources/web.ts` |
| Pasted plain text | `manual_text` | direkt zum Synthesizer |
| Uploaded image | `image` | `sources/image.ts` |
| Uploaded video file | `video_upload` | wie YouTube ohne Metadaten |

**Edge cases hier:**
- **vm.tiktok.com / fb.watch / lnk.bio Shortlinks** → erst HTTP-HEAD um echte URL zu kriegen, dann re-classify
- **Pinterest** ist fast immer nur ein Redirect-Schaufenster — wenn der Pin auf einen externen Recipe-Blog zeigt, sofort dorthin re-classify
- **YouTube Music URLs** → reject, ist niemals ein Rezept
- **Playlist-URL** statt Video — User fragen welches Video oder erste nehmen + Warning
- **AMP/Mobile/Embed-URLs** → kanonische Form ableiten

---

## YouTube — der Multi-Pass-Champion

YouTube hat **fünf** mögliche Orte wo ein Rezept landen kann:

1. **Video-Beschreibung** (description) — am häufigsten
2. **Gepinnter Top-Kommentar des Creators** — sehr oft bei kurzeren Videos / Shorts
3. **Verlinkte Webseite** in der Beschreibung — Recipe-Blog des Creators
4. **Captions / Untertitel** — manuell hochgeladen ist die Beste, auto-generated ist OK
5. **Audio-Transkript** (last resort) — wenn keine Captions vorhanden

### Tool: `yt-dlp`

`yt-dlp` ist der einzige Weg der wirklich funktioniert. Vorteile:
- Keine YouTube-API-Quota nötig (Data API hat 10k/day, comments=1unit/comment, würde reichen, aber yt-dlp ist robuster)
- Ein Tool deckt Description + Comments (inkl. pinned) + Captions + Audio ab
- Funktioniert auch für **Instagram, TikTok, Facebook** Public-Posts
- Open Source, regelmässige Updates

NPM-Wrapper: `youtube-dl-exec` (lädt yt-dlp Binary in node_modules).

### Fetch-Strategie für YouTube

```
yt-dlp --skip-download \
       --write-info-json \
       --write-comments \
       --extractor-args "youtube:max_comments=20,max_replies=0" \
       --write-auto-subs --write-subs --sub-langs "de,en,it,fr" \
       --convert-subs srt \
       <URL>
```

Das gibt uns:
- `*.info.json` mit `description`, `chapters`, `tags`, `title`, `uploader`, …
- `*.info.json` mit `comments[]` (yt-dlp embedded sie standardmässig)
- `*.de.srt` / `*.en.srt` Subtitle-Files

### Pinned-Comment-Detection

In yt-dlp comments-Array: `comments[i].is_favorited` (creator gefiel) und `comments[i].author_is_uploader` und im Idealfall `is_pinned`. Realität: yt-dlp setzt `is_pinned` nicht zuverlässig. Heuristiken:

1. Nehme `comments[0]` (yt-dlp sortiert nach Top-Kommentaren) — Pinned ist meist erstes
2. Filter: `author_is_uploader === true` für Creator-eigene Kommentare
3. Filter: Kommentar enthält Rezept-Indikatoren (Mengenangaben, Zutaten-Listen)
4. Wenn mehrere Kandidaten: alle einsammeln, LLM entscheidet

### Outbound-Link-Detection

Beschreibung parsen auf URLs. Filter raus:
- Affiliate (amzn.to, click., refer.) — meistens kein Rezept
- Social (instagram.com, twitter.com, patreon.com) — meistens Promo
- Creator's Website (.de, .ch, .com mit Domain == Channel-Name) — VERMUTLICH Rezept

Rest: relevante Links nehmen. Wenn mehrere: alle fetchen (parallel), LLM entscheidet.

**Wichtig:** Bei Recipe-Blog-Links → erst JSON-LD versuchen (siehe Web-Source). Spart Token + ist genauer.

### Captions-Strategie

1. Wenn manuelle deutsche Untertitel: nimm die
2. Sonst manuelle in einer der erkannten Sprachen (en, it, fr): nimm die
3. Sonst auto-generated: nimm die (schlechter, aber besser als nichts)
4. Wenn keine: Audio runterladen + ElevenLabs Scribe

### Chapters für selektive Transkription

Wenn der Creator Chapters gesetzt hat (yt-dlp `chapters`-Array): nur "Ingredients" / "Cooking" / "Recipe" Chapters transkribieren (nicht Intro / Outro / Sponsorship). Spart 60-80% Audio-Cost.

**Heuristik:**
```typescript
const recipeChapters = chapters.filter(c =>
  /zutaten|ingredient|cooking|recipe|rezept|prep|method|how.{0,3}to.{0,3}make/i.test(c.title)
);
```

Wenn keine matchenden Chapters: ganzes Video transkribieren (oder: nur erste 70% — Outro ist meistens hinten).

---

## Instagram — Caption + Bio + Carousel

Instagram-Pattern:

1. **Caption hat ganzes Rezept** — easy, parsen
2. **Caption hat nur Zutaten**, Steps in Video → audio transcribe
3. **"Rezept im Link in Bio"** — Link aus Profil-Bio fetchen
4. **Caption: "swipe für Rezept"** — Carousel-Slides 2-N enthalten Text als Bild → OCR
5. **Story** — kurzlebig, im Idealfall ignorieren oder explizit User-Hinweis

### Carousel-Detection

yt-dlp gibt für Instagram Carousels alle Slides als Liste zurück. Erste Slide ist meist das Hero-Foto. Slides 2-N könnten Text-Slides sein.

Strategie: alle Slides als Bild durch Vision-LLM (Opus 4.7), prompt = "ist hier Rezept-Text drauf?". Wenn ja: extrahieren.

### Bio-Link-Following

In yt-dlp Output: `uploader_url` ist Profil-URL. Profil-Page fetchen, Bio-Link extrahieren (`linkInBio` Feld auf modernen Profilen, oder erste URL in Bio-Text).

Bio-Link kann sein:
- **Direkter Recipe-Link** — perfekt
- **Linktree / lnk.bio / beacons.ai** — Liste von Links, müssen wir scrapen und den richtigen finden
- **Eigene "Rezepte"-Landingpage** — Liste aller Rezepte, müssen den richtigen finden basierend auf Post-Datum

### Linktree-Auflösung

Wenn Linktree erkannt: alle Sub-Links extrahieren, Filter auf "Rezept" oder den Post-Titel. Wenn ambivalent: LLM-Match auf Post-Caption (z.B. Caption sagt "Pasta Aglio e Olio", einer der Linktree-Links heisst "pasta-aglio-e-olio.recipe.com" → match).

### Login-Walled Posts

Private Accounts oder Stories oder Posts die login-required sind: yt-dlp failed graceful. App zeigt "Konnte Post nicht laden — bitte teile ihn als Text-Copy oder Screenshot."

---

## TikTok — Caption + Audio (meistens)

TikTok-Captions sind kurz (max 2200 chars), aber bei Cooking-TikToks oft komplette Zutatenliste drin.

Pinned Comments existieren auch hier, gleiche yt-dlp Strategie.

Cook-TikToks sind meist 15-60s — Audio-Transkription billig und meistens nötig (Steps werden gesprochen).

TikTok-Watermark in Audio: ElevenLabs Scribe filtert das gut raus, kein extra Cleanup nötig.

---

## Facebook — Tricky

Facebook ist die schwierigste Plattform:
- yt-dlp funktioniert für Public Posts/Videos, aber oft mit cookies-Anforderung
- Viele Recipe-Posts sind in geschlossenen Gruppen → kann App nicht
- "Reels" wie Instagram Reels handhaben

Strategie: yt-dlp versuchen, bei Failure → User auffordern Text/Screenshot zu schicken.

---

## Web URL — JSON-LD First, Always

Recipe-Blogs (chefkoch.de, bettybossi.ch, kochbar.de, eatsmarter.de, alle WordPress mit "Recipe Card" Plugin) verwenden seit ~2015 **schema.org Recipe als JSON-LD**.

Beispiel HTML:
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "Recipe",
  "name": "Pasta Carbonara",
  "recipeIngredient": ["200g Spaghetti", "100g Guanciale", ...],
  "recipeInstructions": [
    {"@type": "HowToStep", "text": "Spaghetti kochen"},
    ...
  ],
  "recipeYield": "4",
  "prepTime": "PT10M",
  "cookTime": "PT15M",
  "nutrition": {...}
}
</script>
```

**Strategie:**
1. Fetch HTML (einfach mit `fetch`, oder Firecrawl wenn JS-Rendering nötig)
2. Parse alle `<script type="application/ld+json">` Tags
3. Suche `@type === "Recipe"` (auch in `@graph`-Arrays)
4. Direkt mappen → unsere Schema. **KEIN LLM nötig**.
5. Nur Translations / Unit-Konvertierungen via leichtem LLM-Pass

Das ist deutlich günstiger und genauer als LLM-Markdown-Extraction.

### Fallbacks

Wenn JSON-LD nicht vorhanden:
1. **Microdata** (`itemtype="http://schema.org/Recipe"`) — alte Form, immer noch im Wild
2. **Open Graph** Tags — nur Titel + Image, kaum Rezept-Daten
3. **Firecrawl Markdown** + LLM-Extraction
4. **Fallback final:** Vision-LLM auf gerendertem Page-Screenshot

### Edge Cases Web

- **Paywall** (NYT Cooking, FT) — JSON-LD ist oft trotzdem da (für Google), aber `recipeInstructions` gekürzt. Wir kriegen Zutaten + Teaser, kein vollständiger Step-by-Step. Warning an User: "Volltext nicht zugänglich, Mengen vollständig, Anleitung gekürzt".
- **Cloudflare-Protection** — Firecrawl handhabt das. Wenn Firecrawl auch failed: User-Hinweis "Site blockiert automatisierte Zugriffe — bitte Inhalt copy-pasten."
- **Mehrere Rezepte auf einer Seite** — z.B. "10 Pasta-Rezepte". JSON-LD hat dann mehrere Recipe-Objekte. User muss wählen.
- **JS-rendered SPA** — Firecrawl statt einfachem fetch
- **Notion / Google Docs** mit Public-Sharing — funktioniert mit Firecrawl, aber Layout chaotisch
- **Cookie-Banner / GDPR-Walls** — Firecrawl umgeht das

---

## Plain Text / Image-Upload / Manual

**Plain Text** (User pastet Rezept-Text aus Email/WhatsApp): direkt zum Synthesizer, ein einziger Source = "manual_text".

**Image** (User fotografiert Kochbuch / handgeschrieben): Vision-LLM (Opus 4.7) mit OCR-Prompt. Bei niedriger Confidence: User darf editieren.

**Edge cases Image:**
- Mehrere Rezepte auf einer Seite (Doppelseite Kochbuch) — Vision-LLM teilt auf, User wählt
- Foto vom Esstisch / Fertigem Gericht — kein Rezept, korrekt erkennen + Error
- Screenshot von Instagram-Post — als Plain-Text nach OCR behandeln
- Foto mit Reflektionen / Hand im Bild / Schatten — Vision-LLM schafft die meistens, aber Confidence sinkt

---

## Synthesis — Mehrere Quellen kombinieren

Sobald die Source-Fetcher fertig sind, hat die Pipeline ein **Bündel von Sources**:

```typescript
interface RawSourceContent {
  type: 'description' | 'pinned_comment' | 'caption' | 'transcript'
      | 'jsonld' | 'firecrawl_markdown' | 'image_ocr' | 'linked_page' | 'manual';
  content: string | object; // strings für Text, object für JSON-LD
  metadata: {
    url?: string;
    fetched_at: Date;
    char_count?: number;
    language?: string;
    notes?: string; // z.B. "auto-generated captions, niedrigere Qualität"
  };
}

interface ExtractionBundle {
  primary_url?: string;
  detected_type: SourceType;
  sources: RawSourceContent[];
  fetch_log: FetchLogEntry[]; // für UI-Progress + Debug
}
```

### Vertrauens-Hierarchie

Wenn mehrere Sources Daten liefern, wird folgende Priorität an den LLM kommuniziert:

1. **`jsonld`** (höchstes Vertrauen) — strukturierte Daten von der Quelle selbst
2. **`linked_page`** mit JSON-LD — wenn Description einen Recipe-Blog-Link hatte
3. **`description`** / **`pinned_comment`** / **`caption`** — vom Creator selbst geschrieben
4. **`firecrawl_markdown`** — geparsed aus Webseite ohne JSON-LD
5. **`image_ocr`** — Bild-OCR
6. **`transcript`** (auto-generated) — niedrigste Vertrauen wegen STT-Fehlern

### LLM-Synthesis-Prompt

Der Prompt (siehe `prompts/recipe-extraction.md` Update) kriegt das Bundle und Anweisungen:

- **Wenn JSON-LD vorhanden:** verwende Felder direkt, ergänze nur fehlende
- **Wenn Description komplettes Rezept:** verwende. Crosscheck-Mengen mit Transcript wenn vorhanden.
- **Wenn Description nur Zutaten + Transcript hat Steps:** kombinieren
- **Wenn Konflikt** (Description sagt 200g, Transcript sagt 240g): nimm strukturierte Quelle, vermerke Konflikt in `extraction_warnings`
- **Wenn keine klare Quelle:** lowest-confidence wins, viele Warnings

### Per-Field Provenance

Jede Zutat / jeder Step kriegt ein `provenance` Feld:

```typescript
interface IngredientWithProvenance {
  name: string;
  amount: number | null;
  unit: string | null;
  notes?: string;
  provenance: {
    source_type: 'description' | 'transcript' | 'jsonld' | ...;
    confidence: number; // 0-1
    note?: string; // z.B. "Konflikt mit Audio-Transcript: 240g"
  };
}
```

UI rendert jedes Feld mit Source-Badge + Confidence-Indicator. User sieht sofort wo Unsicherheit liegt.

---

## Persistierung

Nachdem User confirms:

1. `recipes` Insert mit Aggregat-Werten + `source_raw_content` als JSONB (das gesamte ExtractionBundle für späteren Re-Extract)
2. `recipe_ingredients` mit `provenance` JSONB-Feld pro Row
3. `recipe_steps` mit `provenance`
4. Async Background Job: Migros-Lookup pro Zutat + Open Food Facts Fallback

Wenn User später editiert: Original-Bundle bleibt erhalten (für Re-Extraction wenn Algo verbessert wird).

---

## Async-Architektur — Worker-basiert

Audio-Transkription kann 30-120s dauern. Vercel Serverless-Funktionen haben 60s Timeout (Pro). Lösung:

### Pattern A: Vercel Background Functions

Wenn `export const runtime = 'edge'` mit `streamText` und Background-Tasks → reicht für ~80% der Fälle. Für lange Audios (>5min YouTube) zu kurz.

### Pattern B: Separater Worker

Empfohlene Architektur:
- Vercel API: nimmt Request, schreibt `recipe_extraction_jobs` Row, returnt `job_id` sofort
- Worker (separater Service auf Railway / Hetzner / Modal):
  - Polls `recipe_extraction_jobs` mit Status `pending`
  - Hat yt-dlp + ffmpeg installiert, alle env-vars
  - Updates Job-Status während Verarbeitung (`fetching_description`, `transcribing_audio`, …)
  - Schreibt finalen `result` JSON-Field
- Frontend: subscribt via Supabase Realtime auf Job-Updates

```sql
create table recipe_extraction_jobs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id),
  household_id uuid not null references households(id),
  input_payload jsonb not null,        -- die ursprüngliche Anfrage
  detected_source_type text,
  status text not null default 'pending',
                                       -- pending | running | done | failed
  progress jsonb,                      -- Live-Updates: [{step, status, started_at, finished_at}]
  result jsonb,                        -- Finale ExtractionResult oder ExtractionError
  error_text text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### Pattern C: Hybrid (MVP-Pfad)

Für die ersten 2 User: erstmal alles in Vercel-Funktionen (Pro-Plan, 60s Timeout). YouTube-Video > 5min wird zu kurz → User-Feedback einsammeln, dann Pattern B nachrüsten.

Konkret: Der Worker-Service ist eine separate Repo, einfaches Node.js-Programm mit `pg` für DB-Zugriff. Hetzner CX11 (€4/Monat) reicht. Deploy via `git push` auf Coolify oder ähnliches.

**Empfehlung:** Pattern C für MVP, Pattern B nachziehen wenn nötig.

---

## Error-Handling-Matrix

| Szenario | Pipeline-Verhalten | UI-Feedback |
|---|---|---|
| URL ungültig (404) | Fail fast | "URL nicht erreichbar" |
| YouTube-Video age-restricted/private | yt-dlp returnt Error | "Video nicht öffentlich zugänglich. Bitte Description copy-pasten." |
| Cloudflare-Block | Firecrawl-Retry, dann Fail | "Site blockiert automatisierten Zugriff. Bitte Inhalt copy-pasten." |
| Paywall (NYT) | JSON-LD partial, Fortfahren | Recipe partial, Warning: "Anleitung möglicherweise gekürzt" |
| Spam/Sponsored Disguised as Recipe | Confidence niedrig | Recipe wird gespeichert mit Warning |
| Recipe in unbekannter Sprache | Translate via LLM | OK, Hinweis: "Aus [Sprache] übersetzt" |
| Mehrere Rezepte auf einer Seite | Liste an User | Multi-Select-UI |
| Kein Rezept in Quelle | `extractionError` | "Kein Rezept gefunden in dieser Quelle." |
| Transcript-Cost zu hoch (>10min Audio) | Hard-Cap | "Video zu lang für automatische Transkription. Bitte teile Beschreibung oder Link zur Schriftform." |
| Conflicting Mengen (200g vs 240g) | Nimmt strukturiertere Quelle | Warning im Recipe |
| Extraction Job timeout (>5min) | Worker setzt Status `failed` | "Extraktion fehlgeschlagen. Bitte erneut versuchen." |

---

## Cost-Management

LLM- und API-Kosten pro Recipe-Import:

| Source | Tools | Approx. Cost |
|---|---|---|
| Web mit JSON-LD | HTTP fetch + JSON.parse | <€0.001 (kein LLM) |
| Web ohne JSON-LD | Firecrawl + Gemini 3.1 Pro | €0.005-0.01 |
| YouTube mit Description-Recipe | yt-dlp + Opus 4.7 | €0.01-0.02 |
| YouTube mit Comment-Recipe | yt-dlp + Opus 4.7 | €0.01-0.02 |
| YouTube mit Audio-Transcribe | yt-dlp + ElevenLabs (€0.30/h) + Opus 4.7 | €0.10-0.30 |
| Instagram mit Caption | yt-dlp + Opus 4.7 | €0.01-0.02 |
| Instagram mit Bio-Link-Hop | yt-dlp + Firecrawl + Opus 4.7 | €0.02-0.05 |
| Image-Upload | Opus 4.7 Vision | €0.02-0.05 |

**Bei 2 Usern und ~50 Imports/Monat:** maximal €15/Monat AI/STT-Cost. Geht.

**Optimierungen:**
- JSON-LD-First spart 70% der Web-Kosten
- Chapter-basierte Selective Transcription spart 60% Audio-Cost
- Resultate cachen pro URL — bei Re-Import (User editiert Eingabe-URL) kein Re-Fetch

---

## Idempotenz / Caching

`recipe_extraction_jobs` mit Hash auf Input-Payload (URL + image-hash). Wenn gleicher Hash innerhalb von 30 Tagen schon erfolgreich extrahiert: cached result zurückgeben.

Nutzer-Wert: User kann probieren ("hat das geklappt?") ohne Cost zu generieren.

---

## Tabelle: Was wir parsen können (Status-Cheat-Sheet)

| Plattform | Beschreibung | Pinned Comment | Caption/Transcript | Verlinkte Site | Bilder OCR |
|---|---|---|---|---|---|
| **YouTube** | ✓ via yt-dlp | ✓ via yt-dlp | ✓ via yt-dlp + ElevenLabs | ✓ via Firecrawl + JSON-LD | n/a |
| **YouTube Shorts** | ✓ (oft kurz) | ✓ wichtig | ✓ Audio | ✓ | n/a |
| **Instagram Post** | ✓ Caption | ⚠️ Comments-Fetch fragil | n/a (Bild only) | ✓ via Bio-Link | ✓ via Vision-LLM |
| **Instagram Reel** | ✓ Caption | ⚠️ | ✓ Audio | ✓ via Bio-Link | n/a |
| **Instagram Carousel** | ✓ Caption | ⚠️ | n/a | ✓ via Bio-Link | ✓ Slides via Vision-LLM |
| **TikTok** | ✓ Caption | ⚠️ | ✓ Audio | meist keine | n/a |
| **Facebook Post** | ✓ Text | ⚠️ | n/a | ✓ via Outbound Link | n/a |
| **Facebook Video/Reel** | ✓ Text | ⚠️ | ✓ Audio | ✓ | n/a |
| **Pinterest Pin** | ⚠️ kurz | n/a | n/a | ✓ Redirect-Target → re-classify | n/a |
| **Web (Blog)** | n/a | n/a | n/a | JSON-LD ⭐ + Markdown | Vision-Fallback |
| **Foto** | n/a | n/a | n/a | n/a | ✓ Opus 4.7 Vision |
| **Plain Text** | direkt | n/a | n/a | n/a | n/a |

⭐ = bevorzugte Quelle; ⚠️ = funktioniert manchmal, fragiler

---

## Was noch zu bauen ist (Dev-Checklist)

Wenn Claude Code an dem Modul arbeitet, in dieser Reihenfolge:

1. **Source-Detector** (`sources/detector.ts`) — URL classification, redirect-resolution
2. **JSON-LD Parser** (`jsonld.ts`) — der billigste Win, 80% der Web-URLs
3. **Web-Source** (`sources/web.ts`) — JSON-LD first, Firecrawl fallback
4. **YouTube-Source** (`sources/youtube.ts`) — yt-dlp wrapper für alle 4 Sub-Quellen
5. **Synthesis-Prompt** (`prompts/recipe-extraction.md`) — Multi-Source-Modus
6. **Synthesis-Logic** (`synthesis.ts`) — orchestriert LLM-Call mit Bundle
7. **Extraction-Strategy** (`extraction-strategy.ts`) — Pipeline-Orchestrator
8. **Job-System** (`recipe_extraction_jobs` table + UI subscription)
9. **Provenance-UI** — Recipe-Display mit Source-Badges + Confidence
10. **Instagram / TikTok / Facebook** Sources — sekundär nach YouTube
11. **Image-Source** (`sources/image.ts`) — Vision-LLM-Pipeline
12. **Pinterest / Linktree-Auflösung**
13. **Worker-Service** (separates Repo) — wenn Audio-Transkription Vercel-Limits sprengt

---

## Post-Import Pipeline (Tagging, Equipment, Cook-Logging)

Nach erfolgreichem Recipe-Import läuft eine zweite Pipeline-Stufe — meist async im Hintergrund — die das Recipe für die State-of-the-Art Verwaltung enriched.

### 1. Equipment-Erkennung (im LLM-Synthesis-Pass)

Der Recipe-Extraction-Prompt fordert das LLM auf, Equipment aus den Steps zu extrahieren und zu kanonischem Key zu mappen (z.B. "Weber Genesis II auf 110°C" → `weber-grill` mit `notes: "indirekte Hitze, 110°C"`). Catalog: `src/lib/recipes/equipment.ts` mit Aliases für Fuzzy-Match.

Drei Wichtigkeits-Stufen:
- `required` — geht ohne nicht (Sous-Vide für Sous-Vide-Rezept)
- `recommended` — geht improvisiert (Pizzastein ggf. ersetzbar)
- `optional` — nice-to-have (Fleischthermometer)

UI-Gewinn: User kann filtern "zeige mir Rezepte für mein Setup" und sieht im Recipe-Header sofort "Du brauchst: Weber-Grill + Räucherrohr".

### 2. Auto-Tagging

Tags sind dreigeteilt:

- **`ai_tags`** vom LLM (Cuisine, Diet, Lifestyle, Cooking-Style, Season) — direkt aus Synthesis
- **`computed_tags`** vom Server, **NACH** Nutrition-Computation (high-protein, low-carb, low-fat, low-cal, healthy-fast-food, quick, slow-food, balanced) — `src/lib/recipes/tagging.ts`
- **`user_tags`** manuell (Lieblings, Mama-Rezept, Date-Night)

Schwellen für computed_tags (`tagging.ts TAG_THRESHOLDS`):
- `high-protein`: ≥30g Protein/Portion ODER ≥35% kcal aus Protein
- `low-carb`: ≤25g Carbs/Portion
- `low-fat`: ≤10g Fett/Portion
- `low-cal`: ≤400 kcal/Portion
- `healthy-fast-food`: ≤30 Min Total + ≥20g Protein + ≤600 kcal
- `quick`: ≤20 Min Total
- `slow-food`: ≥90 Min Total
- `balanced`: 20-35% Protein, 40-55% Carbs, 20-35% Fett (kcal-basiert)

Trigger für Computation:
- Nach Migros-MCP-Lookup (Nährwerte sind dann bekannt)
- Nach User-Edit (servings/ingredients geändert)
- Manuell via Admin-Endpoint

### 3. Pantry & "Was kann ich heute kochen?"

`pantry_items` Tabelle (household-scoped) speichert was zuhause ist. Quellen:
- Manuelles Adding via UI
- AI-Coach-Conversation ("hab eingekauft: 500g Hähnchen, 200g Reis")
- Migros-Kassenbon-Scan (Phase 2)

Match-Logik: `src/lib/recipes/pantry-match.ts` — `findCookableRecipes(pantry, recipes)` scored alle Recipes:
- 100% match → "kannst du jetzt kochen"
- Near-miss (1-2 echte Zutaten fehlen) → "wenn du noch X kaufst..."
- Stapel (Salz, Pfeffer, Olivenöl, Mehl, Zucker, Butter, Wasser) zählen als "immer da"
- Optionale Zutaten zählen nicht negativ
- Sortiert: 100% > weniger fehlend > mehr Stapel
- Tag-Filter optional ("nur quick", "nur high-protein")

AI-Tools für den Coach:
- `find_recipes_for_pantry` — "was kann ich heute kochen?"
- `get_pantry` — "was hab ich zuhause?"
- `update_pantry` — "ich hab eingekauft: …"
- `build_shopping_list` — "ich plan diese Woche A, B, C — was muss ich kaufen?"

### 4. Cook-Log: "Nachgekocht und gegessen"

Button im Recipe-Detail "Heute gekocht". Dialog:
- Mealtype (Default basierend auf Uhrzeit, siehe `inferMealType()`)
- Servings-Eaten (Default 1, kann <1 sein)
- Toggle "Pantry decrementieren" (Default ja)
- Optional: Rating, Notes

Was passiert (`src/lib/recipes/cook-log.ts`):

1. `recipe_cooks` Insert mit Snapshot der Nährwerte (`buildNutritionSnapshot()`)
2. `nutrition_logs` Inserts (kcal × servings, protein × servings, etc.) — verlinkt zum Cook
3. Pantry-Decrement (`computePantryDecrement()`):
   - Pure-Function, side-effect-frei → testbar
   - Skaliert Zutaten-Mengen mit `servings_eaten / recipe.servings_default`
   - Threshold-Logik: <10g/<10ml → setze Pantry-Item auf `null` + Warning
   - Warnings für Mengen-Konflikte ("hattest nur 80g, brauchtest 100g")
4. Trigger `update_recipe_cook_stats` updated `recipes.times_cooked` + `last_cooked_at`

Gewinn: AI-Coach kennt deine Cooking-History. "Du hast diese Woche 3× Hähnchen gemacht, wie wär's mit Lachs?" oder "Du hast die Spare Ribs vor 2 Wochen 5⭐ bewertet — hab die in deiner Most-Liked-Liste."

AI-Tool:
- `log_cooked_recipe` — "ich hab das gerade gegessen, pack's in mein Mittagessen"
- `get_recent_cooks` — "was hab ich diese Woche gekocht?"

---
