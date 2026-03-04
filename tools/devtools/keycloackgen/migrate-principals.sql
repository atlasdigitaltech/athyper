-- ============================================================================
-- One-time migration: rename principal_codes from long-prefix to short-prefix
-- and normalize camelCase persona suffixes to snake_case.
--
-- Run:  docker exec athyper-mesh-db-1 psql -U athyperadmin -d athyper_dev1 \
--         -f /path/to/migrate-principals.sql
-- ============================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- Step 1: Delete the 2 system-created duplicate principals.
--         These were created by the identity-mapper on first login and use
--         the Keycloak short-prefix convention (demoin_tenant_admin,
--         demomy_viewer).  After renaming the seed principals (step 2),
--         the seed ones will take over these codes.
--
--         We must first move idp_identity links to the seed principal that
--         will inherit the code, then delete the duplicate.
-- -------------------------------------------------------------------------

-- 1a) Prepare a temp table with the merge plan
CREATE TEMP TABLE _merge_plan AS
SELECT
  sys_p.id            AS sys_principal_id,
  sys_p.principal_code AS sys_code,
  seed_p.id           AS seed_principal_id,
  seed_p.principal_code AS seed_code_old
FROM core.principal sys_p
JOIN (VALUES
  ('demoin_tenant_admin', 'demoindia_tenantAdmin'),
  ('demomy_viewer',       'demomalaysia_viewer')
) AS mapping(sys_code, seed_code)
  ON sys_p.principal_code = mapping.sys_code
JOIN core.principal seed_p
  ON seed_p.principal_code = mapping.seed_code;

-- 1b) Move idp_identity links from system-created to seed-created principals
UPDATE core.idp_identity i
SET principal_id = mp.seed_principal_id,
    updated_at   = now(),
    updated_by   = 'migration'
FROM _merge_plan mp
WHERE i.principal_id = mp.sys_principal_id;

-- 1c) Move principal_profile from system-created if seed doesn't have one
-- (unlikely conflict since seed profiles exist, but handle safely)
DELETE FROM core.principal_profile
WHERE principal_id IN (SELECT sys_principal_id FROM _merge_plan)
  AND principal_id NOT IN (SELECT seed_principal_id FROM _merge_plan);

-- 1d) Delete the system-created duplicate principals
--     (must delete profile first if any remain)
DELETE FROM core.principal_profile
WHERE principal_id IN (SELECT sys_principal_id FROM _merge_plan);

DELETE FROM core.principal
WHERE id IN (SELECT sys_principal_id FROM _merge_plan);

DROP TABLE _merge_plan;


-- -------------------------------------------------------------------------
-- Step 2: Rename all seed-created principals from long-prefix to short-prefix
-- -------------------------------------------------------------------------

UPDATE core.principal SET
  principal_code = replace(principal_code, 'demomalaysia_',    'demomy_'),
  email          = replace(email,          'demomalaysia_',    'demomy_'),
  updated_by     = 'migration',
  updated_at     = now()
WHERE principal_code LIKE 'demomalaysia_%';

UPDATE core.principal SET
  principal_code = replace(principal_code, 'demoindia_',       'demoin_'),
  email          = replace(email,          'demoindia_',       'demoin_'),
  updated_by     = 'migration',
  updated_at     = now()
WHERE principal_code LIKE 'demoindia_%';

UPDATE core.principal SET
  principal_code = replace(principal_code, 'demosaudiarabia_', 'demosa_'),
  email          = replace(email,          'demosaudiarabia_', 'demosa_'),
  updated_by     = 'migration',
  updated_at     = now()
WHERE principal_code LIKE 'demosaudiarabia_%';

UPDATE core.principal SET
  principal_code = replace(principal_code, 'demoqatar_',       'demoqa_'),
  email          = replace(email,          'demoqatar_',       'demoqa_'),
  updated_by     = 'migration',
  updated_at     = now()
WHERE principal_code LIKE 'demoqatar_%';

UPDATE core.principal SET
  principal_code = replace(principal_code, 'demofrance_',      'demofr_'),
  email          = replace(email,          'demofrance_',      'demofr_'),
  updated_by     = 'migration',
  updated_at     = now()
WHERE principal_code LIKE 'demofrance_%';

UPDATE core.principal SET
  principal_code = replace(principal_code, 'demogermany_',     'demode_'),
  email          = replace(email,          'demogermany_',     'demode_'),
  updated_by     = 'migration',
  updated_at     = now()
WHERE principal_code LIKE 'demogermany_%';

UPDATE core.principal SET
  principal_code = replace(principal_code, 'demoswitzerland_', 'democh_'),
  email          = replace(email,          'demoswitzerland_', 'democh_'),
  updated_by     = 'migration',
  updated_at     = now()
WHERE principal_code LIKE 'demoswitzerland_%';

UPDATE core.principal SET
  principal_code = replace(principal_code, 'demousa_',         'demous_'),
  email          = replace(email,          'demousa_',         'demous_'),
  updated_by     = 'migration',
  updated_at     = now()
WHERE principal_code LIKE 'demousa_%';

UPDATE core.principal SET
  principal_code = replace(principal_code, 'democanada_',      'democa_'),
  email          = replace(email,          'democanada_',      'democa_'),
  updated_by     = 'migration',
  updated_at     = now()
WHERE principal_code LIKE 'democanada_%';


-- -------------------------------------------------------------------------
-- Step 3: Normalize camelCase persona suffixes to snake_case
-- -------------------------------------------------------------------------

UPDATE core.principal SET
  principal_code = replace(principal_code, '_tenantAdmin', '_tenant_admin'),
  email          = replace(email,          '_tenantAdmin', '_tenant_admin'),
  updated_by     = 'migration',
  updated_at     = now()
WHERE principal_code LIKE 'demo%_tenantAdmin';

UPDATE core.principal SET
  principal_code = replace(principal_code, '_moduleAdmin', '_module_admin'),
  email          = replace(email,          '_moduleAdmin', '_module_admin'),
  updated_by     = 'migration',
  updated_at     = now()
WHERE principal_code LIKE 'demo%_moduleAdmin';


-- -------------------------------------------------------------------------
-- Step 4: Verify
-- -------------------------------------------------------------------------

-- Should show 63 principals with short prefixes
SELECT count(*) AS total_principals
FROM core.principal
WHERE principal_code LIKE 'demo%';

-- Should show 0 (no old-format codes remain)
SELECT count(*) AS old_format_remaining
FROM core.principal
WHERE principal_code LIKE 'demomalaysia_%'
   OR principal_code LIKE 'demoindia_%'
   OR principal_code LIKE 'demosaudiarabia_%'
   OR principal_code LIKE 'demoqatar_%'
   OR principal_code LIKE 'demofrance_%'
   OR principal_code LIKE 'demogermany_%'
   OR principal_code LIKE 'demoswitzerland_%'
   OR principal_code LIKE 'demousa_%'
   OR principal_code LIKE 'democanada_%';

-- Should show 0 (no camelCase suffixes remain)
SELECT count(*) AS camelcase_remaining
FROM core.principal
WHERE principal_code LIKE '%_tenantAdmin'
   OR principal_code LIKE '%_moduleAdmin';

-- Show idp_identity links (should still have 2 with correct principal_ids)
SELECT p.principal_code, i.idp_name, i.idp_subject
FROM core.idp_identity i
JOIN core.principal p ON p.id = i.principal_id
ORDER BY p.principal_code;

COMMIT;
