-- =============================================================================
-- Migration 0007 — chest-fly-machine umbenennen zu "Pec Deck (Butterfly)"
-- =============================================================================
-- Klarere Bezeichnung: "Brustpresse Maschine (Fly)" verwirrt — Pec Deck ist
-- eine Iso-Adduktion-Bewegung (Butterfly), keine Press-Bewegung.
-- =============================================================================

update exercises
set
  name_de = 'Pec Deck (Butterfly)',
  name_en = 'Pec Deck'
where slug = 'chest-fly-machine';
