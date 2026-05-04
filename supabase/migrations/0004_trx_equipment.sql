-- =============================================================================
-- Migration 0004 — TRX (Suspension Trainer) als Equipment-Typ
-- =============================================================================
-- Postgres-Constraint: ALTER TYPE ADD VALUE darf nicht in derselben Transaktion
-- wie INSERTs verwendet werden, die diesen neuen Wert nutzen. Daher split:
-- 0004a fügt nur den Enum-Wert hinzu, 0004b seedet die Übungen.
-- =============================================================================

alter type equipment_type add value if not exists 'trx';
