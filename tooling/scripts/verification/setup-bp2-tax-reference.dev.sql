-- Synthetic CATL reference for governed BP tax acceptance, not a legal tax configuration.
-- Run only on athyper-dev-db-1. Default is rollback; psql -v apply=true commits.
\if :{?apply}
\else
\set apply false
\endif
BEGIN;
SET LOCAL lock_timeout='3s';
DO $setup$
DECLARE
 t constant uuid := '44444444-4444-4444-8444-444444444444';
 reference_id constant uuid := 'c9d8f102-5c7b-4d5e-9a42-8d316feb4204';
 actor uuid;
BEGIN
 IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Neon required'; END IF;
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=t AND code='seed.three-plane-provisioner' AND status='active';
 IF EXISTS(SELECT 1 FROM master.tax_jurisdiction WHERE id=reference_id OR (tenant_id=t AND code='BP2_TEST_MY')) THEN
   IF NOT EXISTS(SELECT 1 FROM master.tax_jurisdiction WHERE id=reference_id AND tenant_id=t AND code='BP2_TEST_MY'
     AND metadata->>'fixture'='bp2-tax-acceptance-20260923' AND country_code='MY' AND status='active')
     THEN RAISE EXCEPTION 'Synthetic reference identity conflict'; END IF;
 ELSE
   INSERT INTO master.tax_jurisdiction(id,tenant_id,code,name,description,jurisdiction_type,country_code,metadata,status,created_by)
   VALUES(reference_id,t,'BP2_TEST_MY','Synthetic BP2 tax jurisdiction — not for business use',
     'DEV acceptance fixture only. No rates, tax policy, real authority or compliance conclusion.',
     'country','MY','{"fixture":"bp2-tax-acceptance-20260923","synthetic":true}'::jsonb,'active',actor);
 END IF;
END $setup$;
SET CONSTRAINTS ALL IMMEDIATE;
\if :apply
COMMIT;
\else
ROLLBACK;
\endif
