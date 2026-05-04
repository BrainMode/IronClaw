-- =============================================================================
-- Migration 0004b — TRX Übungen (separate Datei wegen Postgres ALTER-TYPE-Constraint)
-- =============================================================================
-- Vorbedingung: 0004_trx_equipment.sql wurde bereits appliziert (in eigener Transaktion).
-- =============================================================================

insert into exercises (slug, name_de, name_en, primary_muscle, secondary_muscles, equipment, movement_pattern, is_compound, notes_de) values

('trx-row', 'TRX Row', 'TRX Row', 'back_upper', '{back_lats,biceps}', '{trx}', 'horizontal_pull', true,
  'TRX-Suspension. Schwierigkeit über Körperwinkel: Füsse näher zur Verankerung = härter. Brust zur Stange ziehen, Schulterblätter retrahieren.'),

('trx-push-up', 'TRX Push-up', 'TRX Push-up', 'chest', '{shoulders_front,triceps,core}', '{trx}', 'horizontal_push', true,
  'TRX in Höhe der Hüfte, Push-up auf den Griffen — Instabilität rekrutiert mehr Stabilisatoren als Boden-Push-up.'),

('trx-bulgarian-split-squat', 'TRX Bulgarian Split Squat', 'TRX Bulgarian Split Squat', 'quads', '{glutes,hamstrings}', '{trx}', 'lunge', true,
  'Hinterer Fuss in TRX-Schlinge — exzellente Range + Stabilitäts-Stimulus. Optional mit KB/DB belastet.'),

('trx-pike', 'TRX Pike', 'TRX Pike', 'shoulders_front', '{core,triceps}', '{trx}', 'vertical_push', true,
  'Plank-Position mit Füssen in TRX. Hüfte hochziehen → Schulter-Vertical-Push-Stimulus + Core. Surrogat für Pike Push-up wenn diese zu leicht ist.'),

('trx-curl', 'TRX Bicep Curl', 'TRX Bicep Curl', 'biceps', '{forearms}', '{trx}', 'elbow_flexion', false,
  'Suspension Curl: Körper schräg, beide Hände in TRX-Griffen, Curlen. Konstante Spannung wie Cable.'),

('trx-tricep-extension', 'TRX Trizeps-Drücken', 'TRX Tricep Extension', 'triceps', '{shoulders_front}', '{trx}', 'elbow_extension', false,
  'Körper nach vorn gelehnt, TRX-Griffe vor Stirn, French-Press-Bewegung. Schulter-Position dehnt langen Trizeps-Kopf.')

on conflict (slug) do update set
  notes_de = excluded.notes_de,
  primary_muscle = excluded.primary_muscle,
  equipment = excluded.equipment;
