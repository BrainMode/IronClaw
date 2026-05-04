-- =============================================================================
-- Migration 0006 — Per-Übung empfohlene Rep-Range + RIR
-- =============================================================================
-- Hintergrund: Iron Mike's 5-7 Reps RIR=0 funktioniert für klassische
-- Compound-Lifts mit linearer Progression (Bench, Squat, Press). Aber:
--   - KB-Swing ist Hardstyle-Conditioning (15-25 Reps, RIR 1-2)
--   - Bodyweight-Push-up/Inverted-Row trifft Versagen oft erst bei 15+ Reps
--   - Festgewichts-KBs (12/16/20kg) → Brzycki-Progression nicht möglich
--
-- Lösung: jede Übung kann eine eigene empfohlene Rep-Range vorgeben.
-- Plan-Generator nutzt diese statt User-Default wenn vorhanden.
-- =============================================================================

alter table exercises
  add column if not exists recommended_rep_min int,
  add column if not exists recommended_rep_max int,
  add column if not exists recommended_rir_min int,
  add column if not exists recommended_rir_max int;

-- =============================================================================
-- Set per-exercise recommendations
-- =============================================================================

-- Hardstyle-Conditioning: KB-Swing → high rep, niemals zum totalen Versagen
update exercises set
  recommended_rep_min = 15,
  recommended_rep_max = 25,
  recommended_rir_min = 1,
  recommended_rir_max = 3
where slug in ('kb-swing');

-- KB Goblet Squat / RDL / Bent Row / Suitcase Deadlift / BSS / Curl / Tricep
-- Mit festen KB-Gewichten ist 8-12 Reps realistischer als 5-7
update exercises set
  recommended_rep_min = 8,
  recommended_rep_max = 12,
  recommended_rir_min = 0,
  recommended_rir_max = 1
where slug in (
  'kb-goblet-squat',
  'kb-rdl',
  'kb-row-bent',
  'kb-suitcase-deadlift',
  'kb-bulgarian-split-squat',
  'kb-curl',
  'kb-tricep-extension'
);

-- KB Floor Press / Overhead Press: schwerer, 5-8 Reps OK
update exercises set
  recommended_rep_min = 5,
  recommended_rep_max = 8,
  recommended_rir_min = 0,
  recommended_rir_max = 1
where slug in ('kb-floor-press', 'kb-press-overhead');

-- Bodyweight Übungen: Versagen oft erst bei höheren Reps
update exercises set
  recommended_rep_min = 8,
  recommended_rep_max = 15,
  recommended_rir_min = 0,
  recommended_rir_max = 1
where slug in (
  'push-up',
  'inverted-row',
  'bw-bulgarian-split-squat',
  'bw-pike-push-up',
  'pull-up'
);

-- Bands: Tension nicht standardisiert, höhere Reps
update exercises set
  recommended_rep_min = 10,
  recommended_rep_max = 15,
  recommended_rir_min = 0,
  recommended_rir_max = 1
where slug in (
  'band-pulldown',
  'band-row-seated',
  'band-pull-apart',
  'band-lateral-raise',
  'band-press',
  'band-curl',
  'band-tricep-pushdown',
  'band-overhead-tricep'
);

-- TRX: Schwierigkeit über Körperwinkel, 8-15 Reps gut steuerbar
update exercises set
  recommended_rep_min = 8,
  recommended_rep_max = 15,
  recommended_rir_min = 0,
  recommended_rir_max = 1
where slug in (
  'trx-row',
  'trx-push-up',
  'trx-bulgarian-split-squat',
  'trx-pike',
  'trx-curl',
  'trx-tricep-extension'
);

-- Iso-Übungen mit Maschinen: 8-12 Reps idiomatisch
update exercises set
  recommended_rep_min = 8,
  recommended_rep_max = 12
where slug in (
  'leg-extension',
  'lying-leg-curl',
  'seated-leg-curl',
  'cable-crossover',
  'chest-fly-machine',
  'lateral-raise-cable',
  'lateral-raise-dumbbell',
  'rear-delt-fly-cable',
  'face-pull',
  'tricep-pushdown',
  'cable-curl',
  'preacher-curl',
  'incline-dumbbell-curl',
  'hammer-curl'
)
and recommended_rep_min is null;

-- Waden: höhere Reps (10-15)
update exercises set
  recommended_rep_min = 10,
  recommended_rep_max = 15
where slug in ('standing-calf-raise', 'calf-press-leg-press');

-- Core: höhere Reps oder time-based
update exercises set
  recommended_rep_min = 10,
  recommended_rep_max = 20
where slug in ('hanging-leg-raise', 'cable-crunch', 'plank');

-- Cardio: Reps spielt keine Rolle (zeit-basiert)
-- bleibt null für cardio Übungen.
