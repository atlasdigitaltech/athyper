-- Migrated from the 2026-08-01 live Neon catalog snapshot.
-- Dependencies were checked against the active Neon foundation manifest.

CREATE OR REPLACE VIEW "control"."v_authorization_v2_deferred_constraints" WITH (security_invoker=true, security_barrier=true) AS
SELECT conrelid::regclass::text AS relation_name,
    conname AS constraint_name,
    convalidated AS is_validated
   FROM pg_constraint
  WHERE connamespace = 'control'::regnamespace::oid AND NOT convalidated;
