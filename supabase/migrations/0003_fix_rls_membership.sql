-- =============================================================================
-- Migration 0003 — Simplify household_members RLS to avoid recursive lookup
-- =============================================================================
-- Idempotent: drop+create.
--
-- Problem: original policy used `or household_id = current_household_id()`,
-- which itself queries household_members. Even with security_definer, this
-- caused the role lookup in the app layout to silently return nothing.
--
-- Solution: keep only the first clause. Each user can read their own
-- membership row. If we ever need cross-member visibility (e.g. show Frau's
-- avatar in Denny's profile), we'll add a separate policy later.
-- =============================================================================

drop policy if exists "users can read own membership" on household_members;

create policy "users can read own membership"
  on household_members
  for select
  using (user_id = auth.uid());
