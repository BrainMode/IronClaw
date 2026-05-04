-- =============================================================================
-- WDC Fitness — Seed Data
-- =============================================================================
-- Übungs-Katalog optimiert für Iron Mike's Methodik.
-- Auswahl orientiert sich an Hebellogik (z.B. langer Trizepskopf = Schulterextension)
-- =============================================================================

-- ============== CHEST ==============
insert into exercises (slug, name_de, name_en, primary_muscle, secondary_muscles, equipment, movement_pattern, is_compound, notes_de) values
('barbell-bench-press', 'Bankdrücken Langhantel', 'Barbell Bench Press', 'chest', '{shoulders_front,triceps}', '{barbell,bench,squat_rack}', 'horizontal_push', true, 'Klassischer Compound für Brust. Schulterblätter retrahieren.'),
('dumbbell-bench-press', 'Bankdrücken Kurzhantel', 'Dumbbell Bench Press', 'chest', '{shoulders_front,triceps}', '{dumbbell,bench}', 'horizontal_push', true, 'Mehr Bewegungsfreiheit als Langhantel, weniger Stabilisator-Anforderung.'),
('incline-dumbbell-press', 'Schrägbankdrücken Kurzhantel', 'Incline Dumbbell Press', 'chest', '{shoulders_front,triceps}', '{dumbbell,bench}', 'horizontal_push_incline', true, 'Fokus oberer Brustanteil.'),
('cable-crossover', 'Kabelzug Crossover', 'Cable Crossover', 'chest', '{shoulders_front}', '{cable}', 'horizontal_adduction', false, 'Konstante Spannung, gut für Endkontraktion. Mike-Favorit für Pec-Dehnung.'),
('chest-fly-machine', 'Brustpresse Maschine (Fly)', 'Chest Fly Machine (Pec Deck)', 'chest', '{}', '{machine}', 'horizontal_adduction', false, 'Iso-Übung. Tiefe Dehnung wichtiger als Endkontraktion.');

-- ============== BACK ==============
insert into exercises (slug, name_de, name_en, primary_muscle, secondary_muscles, equipment, movement_pattern, is_compound, notes_de) values
('lat-pulldown', 'Latzug', 'Lat Pulldown', 'back_lats', '{biceps,back_upper}', '{cable,machine}', 'vertical_pull', true, 'Variabler Griff. Lehne leicht zurück für besseres Kraftprofil.'),
('pull-up', 'Klimmzug', 'Pull-up', 'back_lats', '{biceps,back_upper}', '{pull_up_bar}', 'vertical_pull', true, 'Bodyweight Compound, schwer zu progressieren ohne Gewichtsgürtel.'),
('seated-cable-row', 'Sitzendes Rudern Kabel', 'Seated Cable Row', 'back_upper', '{back_lats,biceps}', '{cable}', 'horizontal_pull', true, 'Kontrolle und Pause in Endposition für mid-back Stimulus.'),
('barbell-row', 'Langhantelrudern', 'Barbell Row', 'back_upper', '{back_lats,biceps}', '{barbell}', 'horizontal_pull', true, 'Hoher technischer Anspruch, dafür sehr effektiv.'),
('chest-supported-row', 'Brustabgestütztes Rudern', 'Chest-Supported Row', 'back_upper', '{back_lats,biceps}', '{machine,dumbbell,bench}', 'horizontal_pull', true, 'Eliminiert Lower-Back als limitierenden Faktor.');

-- ============== SHOULDERS ==============
insert into exercises (slug, name_de, name_en, primary_muscle, secondary_muscles, equipment, movement_pattern, is_compound, notes_de) values
('overhead-press-barbell', 'Schulterdrücken Langhantel', 'Overhead Press', 'shoulders_front', '{triceps,shoulders_side}', '{barbell,squat_rack}', 'vertical_push', true, 'Stehend, voller ROM.'),
('seated-dumbbell-press', 'Schulterdrücken sitzend Kurzhantel', 'Seated Dumbbell Shoulder Press', 'shoulders_front', '{triceps,shoulders_side}', '{dumbbell,bench}', 'vertical_push', true, 'Stabiler als stehend, Fokus reiner auf Schulter.'),
('lateral-raise-cable', 'Seitheben Kabel', 'Cable Lateral Raise', 'shoulders_side', '{}', '{cable}', 'lateral_abduction', false, 'Konstante Spannung. Mike: für Mittel-Delta wichtiger als Kurzhantel-Variante.'),
('lateral-raise-dumbbell', 'Seitheben Kurzhantel', 'Dumbbell Lateral Raise', 'shoulders_side', '{}', '{dumbbell}', 'lateral_abduction', false, 'Klassiker, aber Spannungs-Profil schlechter als Kabel.'),
('rear-delt-fly-cable', 'Reverse Fly Kabel', 'Cable Rear Delt Fly', 'shoulders_rear', '{back_upper}', '{cable}', 'horizontal_abduction', false, 'Hintere Schulter — wichtig für Posture.'),
('face-pull', 'Face Pull', 'Face Pull', 'shoulders_rear', '{back_upper}', '{cable}', 'horizontal_abduction', false, 'Externe Rotation + horizontale Abduktion.');

-- ============== BICEPS ==============
insert into exercises (slug, name_de, name_en, primary_muscle, secondary_muscles, equipment, movement_pattern, is_compound, notes_de) values
('preacher-curl', 'Scott Curls (Preacher)', 'Preacher Curl', 'biceps', '{forearms}', '{barbell,dumbbell,machine}', 'elbow_flexion', false, 'Schulter in Flexion → langer Bizepskopf in Verkürzung. Mike: gute Variante.'),
('incline-dumbbell-curl', 'Schräg-Curls', 'Incline Dumbbell Curl', 'biceps', '{forearms}', '{dumbbell,bench}', 'elbow_flexion', false, 'Schulter in Extension → langer Bizepskopf gedehnt.'),
('hammer-curl', 'Hammer Curls', 'Hammer Curl', 'biceps', '{forearms}', '{dumbbell,cable}', 'elbow_flexion', false, 'Brachialis-Fokus. Gut als zweite Bizeps-Übung.'),
('cable-curl', 'Kabel-Curls', 'Cable Curl', 'biceps', '{forearms}', '{cable}', 'elbow_flexion', false, 'Konstante Spannung, mehrere Griffe möglich.');

-- ============== TRICEPS ==============
insert into exercises (slug, name_de, name_en, primary_muscle, secondary_muscles, equipment, movement_pattern, is_compound, notes_de) values
('overhead-tricep-extension-cable', 'Trizeps-Drücken über Kopf Kabel', 'Overhead Tricep Extension (Cable)', 'triceps', '{}', '{cable}', 'shoulder_extension_elbow_extension', false, 'KRITISCH: Schulter in Extension dehnt langen Trizeps-Kopf — Mike empfiehlt das speziell.'),
('skullcrusher', 'French Press / Skullcrusher', 'Skullcrusher', 'triceps', '{}', '{barbell,dumbbell,bench}', 'elbow_extension', false, 'Hinterer Trizeps-Anteil betont.'),
('tricep-pushdown', 'Trizeps-Pushdown', 'Tricep Pushdown', 'triceps', '{}', '{cable}', 'elbow_extension', false, 'Lateraler Trizeps-Anteil. Sekundär nach Overhead.'),
('close-grip-bench', 'Enges Bankdrücken', 'Close-Grip Bench Press', 'triceps', '{chest,shoulders_front}', '{barbell,bench}', 'horizontal_push', true, 'Compound, gut als erste Trizeps-Übung.');

-- ============== LEGS ==============
insert into exercises (slug, name_de, name_en, primary_muscle, secondary_muscles, equipment, movement_pattern, is_compound, notes_de) values
('back-squat', 'Kniebeuge', 'Back Squat', 'quads', '{glutes,hamstrings,core}', '{barbell,squat_rack}', 'squat', true, 'Klassiker Compound.'),
('leg-press', 'Beinpresse', 'Leg Press', 'quads', '{glutes,hamstrings}', '{leg_press}', 'squat_machine', true, 'Geringerer Stabilisations-Anspruch, höhere Lasten möglich.'),
('hack-squat', 'Hack Squat', 'Hack Squat', 'quads', '{glutes}', '{machine}', 'squat_machine', true, 'Maschinen-Squat mit Gradient.'),
('leg-extension', 'Beinstrecker', 'Leg Extension', 'quads', '{}', '{machine}', 'knee_extension', false, 'Iso-Quad. Tiefe Dehnung wichtig.'),
('romanian-deadlift', 'Rumänisches Kreuzheben (RDL)', 'Romanian Deadlift', 'hamstrings', '{glutes,back_upper}', '{barbell,dumbbell}', 'hip_hinge', true, 'Hüft-Hinge mit gestreckten Knien — Hamstring-Dehnung.'),
('lying-leg-curl', 'Liegender Beinbeuger', 'Lying Leg Curl', 'hamstrings', '{}', '{machine}', 'knee_flexion', false, 'Iso-Hamstring.'),
('seated-leg-curl', 'Sitzender Beinbeuger', 'Seated Leg Curl', 'hamstrings', '{}', '{machine}', 'knee_flexion', false, 'Knie in Flexion → bessere Längenspannung.'),
('hip-thrust', 'Hip Thrust', 'Hip Thrust', 'glutes', '{hamstrings}', '{barbell,bench}', 'hip_extension', true, 'Glutes-Spezifisch.'),
('standing-calf-raise', 'Wadenheben stehend', 'Standing Calf Raise', 'calves', '{}', '{machine,dumbbell}', 'plantarflexion', false, 'Mike: STEHEND, weil Gastrocnemius bei gestrecktem Knie aktiv. Tief in Dehnung gehen.'),
('calf-press-leg-press', 'Wadenheben Beinpresse', 'Calf Press on Leg Press', 'calves', '{}', '{leg_press}', 'plantarflexion', false, 'Stehend-Äquivalent mit hohem Gewicht möglich. Mike: ideal.');

-- ============== CORE ==============
insert into exercises (slug, name_de, name_en, primary_muscle, secondary_muscles, equipment, movement_pattern, is_compound, notes_de) values
('hanging-leg-raise', 'Beinheben hängend', 'Hanging Leg Raise', 'core', '{}', '{pull_up_bar}', 'spinal_flexion', false, 'Lower Abs.'),
('cable-crunch', 'Kabel-Crunch', 'Cable Crunch', 'core', '{}', '{cable}', 'spinal_flexion', false, 'Gewichtsbelastung möglich.'),
('plank', 'Plank', 'Plank', 'core', '{}', '{bodyweight}', 'isometric', false, 'Iso, Stabilität.');

-- ============== CARDIO ==============
insert into exercises (slug, name_de, name_en, primary_muscle, secondary_muscles, equipment, movement_pattern, is_compound, notes_de) values
('zone2-bike', 'Zone 2 — Fahrrad', 'Zone 2 Bike', 'cardio', '{}', '{bike}', 'cardio_steady_state', false, 'LISS / Zone 2. 60-70% HRmax, 30 Min. Mike: kritisch für HRV.'),
('zone2-rower', 'Zone 2 — Rudergerät', 'Zone 2 Rower', 'cardio', '{}', '{rower}', 'cardio_steady_state', false, 'Ganzkörper-Cardio.'),
('zone2-treadmill', 'Zone 2 — Laufband', 'Zone 2 Treadmill', 'cardio', '{}', '{treadmill}', 'cardio_steady_state', false, 'Inkline-Walking funktioniert oft besser für Zone 2 als Joggen.'),
('zone2-incline-walk', 'Zone 2 — Steigung Walken', 'Zone 2 Incline Walk', 'cardio', '{}', '{treadmill}', 'cardio_steady_state', false, 'Realistischste Zone-2-Form für die meisten.');


-- =============================================================================
-- HOUSEHOLD SETUP TEMPLATE (manuell pro Deployment ausfüllen)
-- =============================================================================
-- Schritte:
--   1. Im Supabase Auth Dashboard: User anlegen (Denny + Frau)
--   2. UUIDs der User aus auth.users kopieren
--   3. Folgende Statements ausführen (UUIDs ersetzen!)
--
-- Beispiel:
--
-- insert into households (id, name) values
--   ('11111111-1111-1111-1111-111111111111', 'Weber Family');
--
-- insert into household_members (household_id, user_id, role) values
--   ('11111111-1111-1111-1111-111111111111', '<denny-auth-uuid>',  'admin'),
--   ('11111111-1111-1111-1111-111111111111', '<frau-auth-uuid>',   'recipe_only');
--
-- insert into macro_targets (user_id, kcal_target, protein_g_target, carbs_g_target, fat_g_target, training_day_kcal_offset) values
--   ('<denny-auth-uuid>', 2400, 180, 250, 80, 200);  -- DEFAULT, später anpassen
