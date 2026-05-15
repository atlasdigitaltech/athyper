-- 900_seed_data/001_shared/021_persona_permission_platform_admin.sql
-- Seed: Persona × Permission bindings for platform-admin caps permissions
-- Schema: shared | Table: persona_permission
-- Depends on: 010_persona.sql, 020_permission_platform_admin.sql
-- Idempotent: on conflict (persona_id, permission_id) do update
--
-- Binding matrix for the caps-style platform-admin permissions seeded in
-- 020_permission_platform_admin.sql. Kept separate from 017 because the
-- atomic entity/workflow/finance grant matrix there is stable and widely
-- reviewed; platform-admin permissions are a newer layer and will grow as
-- more admin surfaces (pgweb, queue schedules UI, future sidecars) are
-- embedded behind RBAC.
--
-- Rationale:
--   JOBS.BOARD.VIEW  → admin + owner
--     `admin` is the platform-configuration tier (bulk data ops,
--     delete/merge/import) — queue diagnostics is a platform-admin concern
--     and fits the tier's remit. `owner` gets it too because the full-access
--     tier must be able to see everything `admin` sees.
--
--   JOBS.QUEUE.MANAGE → owner only
--     Mutations (pause / resume / retry / clean) can cause data loss — e.g.
--     wiping the DLQ destroys replayable state, retrying a poison message
--     loops the worker. Kept to the higher-privilege tier where the
--     equivalent `delete`/`reverse`/`bulk_delete` permissions already live.
--     `admin` can inspect and file a ticket; `owner` executes.
--
-- Shorthand note: these codes are caps-style MODULE.RESOURCE.ACTION. See
-- the header of 020 for why that's the convention for new platform-admin
-- permissions going forward.

WITH persona_grants AS (
  SELECT p.id AS pid, pm.id AS permid, v.is_granted
  FROM shared.persona p
  CROSS JOIN shared.permission pm
  JOIN (VALUES
    -- admin tier: read-only queue visibility for platform diagnostics
    ('admin', 'JOBS.BOARD.VIEW',   true),
    -- owner tier: full queue control (view + mutate)
    ('owner', 'JOBS.BOARD.VIEW',   true),
    ('owner', 'JOBS.QUEUE.MANAGE', true),
    -- tenant parameter overrides are high-risk runtime behavior changes
    ('admin', 'IAM.PARAMETER.MANAGE', true),
    ('owner', 'IAM.PARAMETER.MANAGE', true)
  ) AS v(pc, pmc, is_granted) ON p.code = v.pc AND pm.code = v.pmc
)
INSERT INTO shared.persona_permission (persona_id, permission_id, is_granted, created_by)
SELECT pid, permid, is_granted, '00000000-0000-0000-0000-000000000000'::uuid
FROM persona_grants
ON CONFLICT (persona_id, permission_id) DO UPDATE
  SET is_granted = EXCLUDED.is_granted;
