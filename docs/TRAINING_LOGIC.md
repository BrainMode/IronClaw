# Trainings-Logik — Iron Mike Methodik

> Dieses Dokument fasst die Methodik aus dem Iron-Mike-Podcast zusammen, die als Default-Trainingslogik der App dient. Quelle: Podcast-Transkript "Vom Knast zum BIOHACKER".

## Kernprinzipien

### 1. Frequenz vor Volumen
- **Jeden Muskel 2x/Woche trainieren** ist optimal für Hypertrophie
- Bei 2 Sessions/Woche: **Ganzkörper-Split** (jede Muskelgruppe in jeder Session)
- Bei 3-4 Sessions: Upper/Lower oder Torso/Limbs Split

### 2. Intensität: bis zum Versagen
- **1 bis 2 Arbeitssätze pro Muskel pro Session**, jeweils ZUM MUSKELVERSAGEN
- Mehr Sätze → keine messbaren Hypertrophie-Vorteile, aber gesteigerte Erholungs-Last
- "Jeder Set, der nicht ans Versagen geht, ist ein verschwendeter Set"

### 3. Mechanische Spannung im 5-7 Rep Range
- Hypertrophie kommt aus **mechanischer Spannung**, NICHT aus Pump oder Volumen
- Mechanische Spannung entsteht in den **letzten 5-6 Reps vor Muskelversagen**
- Niedrigere Reps (1-4) → fehlende Stimulus-Dauer; höhere Reps (10+) → kardiovaskuläre Limitierung statt Muskel-Limitierung
- **Default-Ziel: 6 Reps RIR=0** (= bis Versagen)
- **Akzeptable Range: 5-7 Reps**

### 4. Aufwärmen
- **Erste Übung des Tages**: 2 Aufwärmsätze
  - Set 1: ~20-25% des Arbeitsgewichts, 12-15 Reps
  - Set 2: ~50% des Arbeitsgewichts, 8 Reps
- **Folgende Übungen**: 1 Aufwärmsatz reicht
- Aufwärmsätze sind NICHT zum Versagen — Bewegung etablieren, Gelenk vorbereiten

### 5. Cardio (Zone 2)
- **2x/Woche, 30 Minuten**
- **Zone 2** = 60-70% der maximalen Herzfrequenz
- HRmax-Approximation: `220 - Alter` (Männer)
- Zone-2-HR-Bereich Beispiel (40 Jahre): 108-126 bpm
- Subjektiv: "kann mich noch flüssig unterhalten"
- Modus: Bike, Rower, Inkline-Walking auf Laufband (joggen wird oft zu intensiv)
- **Effekt:** mitochondriale Dichte, Erholungsfähigkeit, HRV-Verbesserung

## Übungs-Auswahl: Hebellogik

Mike legt grossen Wert auf **Hebel-Profile** (welche Muskel-Anteile in welcher Position aktiviert sind):

### Brust
- Cable Crossover: konstante Spannung über gesamten ROM, exzellente Endkontraktion
- Schrägbankdrücken: oberer Brustanteil
- Bankdrücken Kurzhantel > Langhantel (mehr ROM, individueller Bewegungsweg)

### Rücken
- Latzug + brustabgestütztes Rudern als Kern-Kombination
- Klimmzug schwer zu progressieren ohne Gewichtsgürtel
- Eine vertikale + eine horizontale Pull-Bewegung pro Session

### Schultern
- Schulterdrücken stehend (Frontdelta + Compound)
- **Cable Lateral Raise > Dumbbell Lateral Raise** (besseres Spannungs-Profil im Mitteldelta)
- Face Pulls oder reverse Fly für Hinterer Anteil

### Bizeps
- **Schräg-Curls (Inkline-Bench)**: langer Bizepskopf in DEHNUNG (Schulter-Extension) → starker Stimulus
- Preacher: Bizeps in Verkürzung (alternative Hebel-Position)
- Hammer-Curls für Brachialis als zweite Bizeps-Übung

### Trizeps
- **Overhead Tricep Extension (Cable)**: langer Trizeps-Kopf in DEHNUNG (Schulter-Flexion) → wichtiger Stimulus
- Pushdowns adressieren primär lateralen Kopf — Sekundär nach Overhead

### Beine — Quads
- Compound (Squat / Beinpresse / Hack Squat) als Erstes
- Beinstrecker (Iso) für Endkontraktion und Quad-Isolation

### Beine — Hamstrings
- **RDL** (Hüft-Hinge mit Hamstring-Dehnung) + **sitzender Beinbeuger** (Knie-Flexion bei "langer" Schulter-Position) als Kombination

### Beine — Waden
- **STEHEND** (Gastrocnemius bei gestrecktem Knie aktiv)
- Sitzend trifft nur Soleus — als Zusatz möglich, aber nicht primär
- **Tief in die Dehnung** gehen, langsam exzentrisch

### Glutes
- Hip Thrust für direkte Glute-Belastung (RDL trifft sie sekundär)

## Progression

Das Tool im Code (`src/lib/training/progression.ts`) implementiert:

1. **Estimated 1RM** via Brzycki-Formel, korrigiert für RIR
2. **Wenn Reps + RIR > Target**: Gewicht erhöhen (cap +5kg/Session bei Langhantel)
3. **Wenn exakt Target erreicht**: minimaler Schritt (0.5kg) drauf
4. **Wenn 1 Rep unter Target**: Gewicht halten, nochmal versuchen (5 statt 6 Reps ist noch in produktiver Range)
5. **Wenn 2+ Reps unter Target**: zurück um 1 Schritt

**Hardware:** 0.25kg Mini-Scheiben = effektiv 0.5kg Schritte auf der Stange (1 Scheibe pro Seite).

## Deload

Siehe `src/lib/training/deload.ts`.

Trigger:
- 2 Sessions in Folge mit Reps deutlich unter Target → Deload
- HRV >15% unter 30-Tage-Baseline + verminderte Performance → Deload
- AI-Coach trifft die Entscheidung kontextuell

Reduktion: Standard 20%, bei kombinierten Triggern 25%.

## Was NICHT in Mike's System

- **Drop-Sets / Pyramiden / Cluster-Sets**: nicht primär. Wenn der User es will, geht's, aber Default ist clean: 1-2 Arbeitssätze, fertig.
- **Periodisierung mit Block-Wechsel**: zu komplex für 2x/Woche-User. Linear progression mit ad-hoc Deloads.
- **Pump-Workouts / High-Volume**: Mike sieht das als ineffizient — Pump ist subjektiv-belohnend, aber kein Hypertrophie-Treiber.
- **Cardio-First**: Mike trainiert Krafttraining VOR Cardio (oder an separaten Tagen). Cardio nach Krafttraining nur Zone 2, nie HIIT.

## Quellen-Disclaimer

Diese Methodik ist eine eine bestimmte Schule (Mike's Ansatz). Sie ist evidenzbasiert (mechanische Spannung, Frequenz-Studien), aber andere effektive Schulen existieren (z.B. höhere Volumen-Bias bei Schoenfeld-Schule). Für Denny ist Mike's System der Default; die App kann später custom Plans erlauben.
