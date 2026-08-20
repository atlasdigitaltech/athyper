-- seed-pack-version: 2.0.0
-- disposition: merged-into-wave5-governance
--
-- The legacy tenant payload duplicated finance-close configuration in the
-- retired governance.cycle_* model. The Wave 5 governance pack now owns the
-- canonical control.cycle_* types, phases, categories, task templates,
-- dependencies, and carry-forward rules, including company expansion.

DO $seed$
DECLARE
    v_tid       uuid := nullif(current_setting('app.seed_tenant_id', true), '')::uuid;
    v_actor     uuid := nullif(current_setting('app.current_principal_id', true), '')::uuid;
    v_types     integer;
    v_templates integer;
BEGIN
    IF v_tid IS NULL OR NOT EXISTS (
        SELECT 1 FROM master.tenant t
        WHERE t.id = v_tid
          AND t.realm_key = 'athyper'
          AND t.code = 'cirrusatlantic'
          AND t.status = 'active'
    ) THEN
        RAISE EXCEPTION '[001_finance_close_cycle] active CirrusAtlantic tenant scope required';
    END IF;

    IF v_actor IS NULL OR NOT EXISTS (
        SELECT 1 FROM master.principal p
        WHERE p.id = v_actor
          AND p.tenant_id = v_tid
          AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION '[001_finance_close_cycle] active tenant-local seed principal required';
    END IF;

    SELECT count(*) INTO v_types
    FROM control.cycle_type t
    WHERE t.tenant_id = v_tid
      AND t.domain_code = 'finance_close'
      AND t.status = 'active';

    IF v_types <> 4 THEN
        RAISE EXCEPTION
            '[001_finance_close_cycle] expected 4 active Wave 5 finance-close cycle types, found %',
            v_types;
    END IF;

    SELECT count(*) INTO v_templates
    FROM control.cycle_task_template template
    JOIN control.cycle_type cycle_type
      ON cycle_type.tenant_id = template.tenant_id
     AND cycle_type.id = template.cycle_type_id
    WHERE template.tenant_id = v_tid
      AND template.entity_code = 'catl'
      AND template.status = 'active'
      AND cycle_type.domain_code = 'finance_close'
      AND cycle_type.status = 'active';

    IF v_templates = 0 THEN
        RAISE EXCEPTION
            '[001_finance_close_cycle] Wave 5 company-expanded task templates missing for catl';
    END IF;

    RAISE NOTICE
        '[001_finance_close_cycle] legacy governance payload merged; validated 4 types and % catl templates',
        v_templates;
END $seed$;
