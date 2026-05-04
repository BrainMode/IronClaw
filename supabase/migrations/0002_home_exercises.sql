-- =============================================================================
-- Migration 0002 — Home-Gym Exercises (Kettlebell, Bands, Bodyweight)
-- =============================================================================
-- Idempotent: ON CONFLICT DO NOTHING auf slug.
-- =============================================================================

insert into exercises (slug, name_de, name_en, primary_muscle, secondary_muscles, equipment, movement_pattern, is_compound, notes_de) values

-- Kettlebell
('kb-goblet-squat', 'KB Goblet Squat', 'Kettlebell Goblet Squat', 'quads', '{glutes,core}', '{kettlebell}', 'squat', true,
  'Kettlebell vor Brust gehalten. Tiefe Hocke, aufrechter Oberkörper. Gut als Squat-Substitute zu Hause.'),
('kb-swing', 'KB Swing', 'Kettlebell Swing', 'glutes', '{hamstrings,core,back_upper}', '{kettlebell}', 'hip_hinge', true,
  'Russian Style: Hüfthöhe. Power kommt aus den Hüften, nicht aus den Armen. AMRAP-fähig.'),
('kb-floor-press', 'KB Floor Press', 'Kettlebell Floor Press', 'chest', '{shoulders_front,triceps}', '{kettlebell}', 'horizontal_push', true,
  'Auf Boden liegen. Trizeps berührt Boden, dann hoch. Kein Bench nötig.'),
('kb-row-bent', 'KB Bent Over Row', 'Kettlebell Bent Over Row', 'back_upper', '{back_lats,biceps}', '{kettlebell}', 'horizontal_pull', true,
  'Einarmig, Rücken neutral. Variante: 2-arm wenn schwerere KBs vorhanden.'),
('kb-press-overhead', 'KB Schulterdrücken', 'Kettlebell Overhead Press', 'shoulders_front', '{triceps,shoulders_side}', '{kettlebell}', 'vertical_push', true,
  'Einarmig stehend. Core fest gegen Anti-Rotation. Optional Z-Press auf Boden.'),
('kb-rdl', 'KB Romanian Deadlift', 'Kettlebell Romanian Deadlift', 'hamstrings', '{glutes,back_upper}', '{kettlebell}', 'hip_hinge', true,
  'Hüfthinge mit gestreckten Knien. KB vor den Füssen, Hamstring-Dehnung am Tiefpunkt.'),
('kb-suitcase-deadlift', 'KB Suitcase Deadlift', 'Kettlebell Suitcase Deadlift', 'hamstrings', '{glutes,core,back_upper}', '{kettlebell}', 'hip_hinge', true,
  'Einarmig — Anti-Lateral-Flexion-Core-Stimulus zusätzlich zum Hinge.'),
('kb-curl', 'KB Curl', 'Kettlebell Curl', 'biceps', '{forearms}', '{kettlebell}', 'elbow_flexion', false,
  'KB-Griff erfordert mehr Forearm-Engagement als DB.'),
('kb-tricep-extension', 'KB Trizeps-Drücken über Kopf', 'Kettlebell Overhead Tricep Extension', 'triceps', '{}', '{kettlebell}', 'elbow_extension', false,
  'Zwei Hände halten KB hinter Kopf. Schulter in Flexion → langer Trizeps-Kopf in Dehnung. Mike-konform.'),
('kb-bulgarian-split-squat', 'KB Bulgarian Split Squat', 'Kettlebell Bulgarian Split Squat', 'quads', '{glutes,hamstrings}', '{kettlebell}', 'lunge', true,
  'Hinterer Fuss erhöht. KB einarmig oder beidarmig. Sehr Quad-fokussiert.'),

-- Resistance Band
('band-pulldown', 'Band Lat Pulldown', 'Band Lat Pulldown', 'back_lats', '{biceps}', '{resistance_band}', 'vertical_pull', true,
  'Band an Türrahmen oben. Sitzend pulldown. Spannung in Endkontraktion gut.'),
('band-row-seated', 'Band Seated Row', 'Band Seated Row', 'back_upper', '{back_lats,biceps}', '{resistance_band}', 'horizontal_pull', true,
  'Band um Füsse gespannt, sitzend horizontal ziehen. Ellbogen nah am Körper.'),
('band-pull-apart', 'Band Pull-Apart', 'Band Pull-Apart', 'shoulders_rear', '{back_upper}', '{resistance_band}', 'horizontal_abduction', false,
  'Posture-Übung. Hintere Schulter + obere Rückenmuskel. AMRAP-fähig.'),
('band-lateral-raise', 'Band Lateral Raise', 'Band Lateral Raise', 'shoulders_side', '{}', '{resistance_band}', 'lateral_abduction', false,
  'Band auf Boden, Step-on. Lateral Raise mit beiden Armen. Mid-Delta-Stimulus.'),
('band-press', 'Band Chest Press', 'Band Chest Press', 'chest', '{shoulders_front,triceps}', '{resistance_band}', 'horizontal_push', true,
  'Band hinter Rücken durch. Beidarmig pressen. Tension-Profil ähnlich Cable.'),
('band-curl', 'Band Curl', 'Band Curl', 'biceps', '{forearms}', '{resistance_band}', 'elbow_flexion', false,
  'Step-on, beide Hände hochcurlen. Konstante Spannung wie Cable.'),
('band-tricep-pushdown', 'Band Tricep Pushdown', 'Band Tricep Pushdown', 'triceps', '{}', '{resistance_band}', 'elbow_extension', false,
  'Band hoch verankern (Tür / Stange). Pushdown beidarmig.'),
('band-overhead-tricep', 'Band Trizeps über Kopf', 'Band Overhead Tricep Extension', 'triceps', '{}', '{resistance_band}', 'elbow_extension', false,
  'Band hinter Rücken nach unten verankert. Einarmig oder beidarmig nach oben strecken. Long-head-Stretch wie Cable.'),

-- Bodyweight (für Travel / minimum equipment)
('push-up', 'Liegestütze', 'Push-up', 'chest', '{shoulders_front,triceps}', '{bodyweight}', 'horizontal_push', true,
  'Klassiker. Variation: Decline (Füsse hoch) für mehr Schulter, Diamond für Trizeps, Spider-Man für Stabilität.'),
('inverted-row', 'Inverted Row', 'Inverted Row', 'back_upper', '{back_lats,biceps}', '{bodyweight}', 'horizontal_pull', true,
  'Unter Tisch oder Stange. Brust zur Stange ziehen. Höhe steuert Schwierigkeit.'),
('bw-bulgarian-split-squat', 'Bulgarian Split Squat (Bodyweight)', 'Bulgarian Split Squat (BW)', 'quads', '{glutes,hamstrings}', '{bodyweight}', 'lunge', true,
  'Hinterer Fuss erhöht. Tiefe Range — schwerer als gedacht ohne Zusatz-Last.'),
('bw-pike-push-up', 'Pike Push-up', 'Pike Push-up', 'shoulders_front', '{triceps}', '{bodyweight}', 'vertical_push', true,
  'Hüfte hoch (Down-Dog). Push-up Richtung Boden. Vertical-Push-Substitute ohne Press.')

on conflict (slug) do update set
  notes_de = excluded.notes_de,
  primary_muscle = excluded.primary_muscle,
  equipment = excluded.equipment,
  is_compound = excluded.is_compound;
