-- ============================================================================
-- governance/02_pre_constraint.sql
-- Order-sensitive routines reconstructed from the live catalog.
-- Generated from the live Neon database governance schema. Do not hand-edit.
-- ============================================================================

CREATE OR REPLACE FUNCTION governance.trg_check_dep_cycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'governance', 'pg_catalog'
AS $function$
DECLARE
    v_max_depth  CONSTANT int := 100;
    v_has_cycle  boolean;
    v_hit_limit  boolean;
BEGIN
    SELECT
        bool_or(template_id = NEW.predecessor_template_id),
        bool_or(depth >= v_max_depth)
    INTO v_has_cycle, v_hit_limit
    FROM (
        WITH RECURSIVE chain AS (
            SELECT NEW.successor_template_id AS template_id, 1 AS depth
            UNION ALL
            SELECT d.successor_template_id, c.depth + 1
            FROM governance.cycle_task_dependency d
            JOIN chain c ON c.template_id = d.predecessor_template_id
            WHERE d.tenant_id = NEW.tenant_id
              AND d.cycle_type_id = NEW.cycle_type_id
              AND d.entity_code = NEW.entity_code
              AND d.is_active = true
              AND c.depth < v_max_depth
        )
        SELECT template_id, depth FROM chain
    ) sub;

    IF v_has_cycle THEN
        RAISE EXCEPTION 'Circular dependency detected: % -> % would create a cycle',
            NEW.predecessor_template_id, NEW.successor_template_id;
    END IF;

    IF v_hit_limit THEN
        RAISE WARNING 'Dependency chain for cycle_type_id=% entity_code=% reached '
            'depth limit (%). Cycle detection may be incomplete — '
            'consider reviewing the dependency graph.',
            NEW.cycle_type_id, NEW.entity_code, v_max_depth;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION governance.trg_validate_run_domain_data()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'governance', 'pg_catalog'
AS $function$
DECLARE v_schema jsonb;
BEGIN
    IF NEW.domain_data IS NULL OR NEW.domain_data = '{}'::jsonb THEN RETURN NEW; END IF;

    SELECT ct.run_data_schema INTO v_schema
    FROM governance.cycle_type ct
    WHERE ct.id = NEW.cycle_type_id AND ct.tenant_id = NEW.tenant_id;

    PERFORM governance.validate_domain_data(NEW.domain_data, v_schema);
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION governance.trg_validate_task_dep_refs()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'governance', 'pg_catalog'
AS $function$
DECLARE
    v_pred record;
    v_succ record;
BEGIN
    SELECT tenant_id, entity_code, cycle_type_id INTO v_pred
    FROM governance.cycle_task_template WHERE id = NEW.predecessor_template_id;

    SELECT tenant_id, entity_code, cycle_type_id INTO v_succ
    FROM governance.cycle_task_template WHERE id = NEW.successor_template_id;

    IF v_pred IS NULL THEN
        RAISE EXCEPTION 'predecessor_template_id % not found', NEW.predecessor_template_id;
    END IF;
    IF v_succ IS NULL THEN
        RAISE EXCEPTION 'successor_template_id % not found', NEW.successor_template_id;
    END IF;

    IF v_pred.tenant_id     IS DISTINCT FROM NEW.tenant_id     THEN RAISE EXCEPTION 'predecessor template tenant mismatch: % vs %', v_pred.tenant_id, NEW.tenant_id; END IF;
    IF v_succ.tenant_id     IS DISTINCT FROM NEW.tenant_id     THEN RAISE EXCEPTION 'successor template tenant mismatch: % vs %', v_succ.tenant_id, NEW.tenant_id; END IF;
    IF v_pred.cycle_type_id IS DISTINCT FROM NEW.cycle_type_id THEN RAISE EXCEPTION 'predecessor template type mismatch: % vs %', v_pred.cycle_type_id, NEW.cycle_type_id; END IF;
    IF v_succ.cycle_type_id IS DISTINCT FROM NEW.cycle_type_id THEN RAISE EXCEPTION 'successor template type mismatch: % vs %', v_succ.cycle_type_id, NEW.cycle_type_id; END IF;
    IF v_pred.entity_code   IS DISTINCT FROM NEW.entity_code   THEN RAISE EXCEPTION 'predecessor template entity mismatch: % vs %', v_pred.entity_code, NEW.entity_code; END IF;
    IF v_succ.entity_code   IS DISTINCT FROM NEW.entity_code   THEN RAISE EXCEPTION 'successor template entity mismatch: % vs %', v_succ.entity_code, NEW.entity_code; END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION governance.trg_validate_task_domain_data()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'governance', 'pg_catalog'
AS $function$
DECLARE v_schema jsonb;
BEGIN
    IF NEW.domain_data IS NULL OR NEW.domain_data = '{}'::jsonb THEN RETURN NEW; END IF;

    SELECT ct.task_data_schema INTO v_schema
    FROM governance.cycle_type ct
    JOIN governance.cycle_run cr ON cr.cycle_type_id = ct.id AND cr.tenant_id = ct.tenant_id
    WHERE cr.id = NEW.cycle_run_id;

    PERFORM governance.validate_domain_data(NEW.domain_data, v_schema);
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION governance.trg_validate_task_refs()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'governance', 'pg_catalog'
AS $function$
DECLARE
    v_run_type   uuid;
    v_run_tenant uuid;
    v_ref_type   uuid;
BEGIN
    SELECT cycle_type_id, tenant_id INTO v_run_type, v_run_tenant
    FROM governance.cycle_run WHERE id = NEW.cycle_run_id;

    IF v_run_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'task tenant (%) != run tenant (%)', NEW.tenant_id, v_run_tenant;
    END IF;

    SELECT cycle_type_id INTO v_ref_type FROM governance.cycle_phase WHERE id = NEW.phase_id;
    IF v_ref_type IS DISTINCT FROM v_run_type THEN
        RAISE EXCEPTION 'task phase type (%) != run type (%)', v_ref_type, v_run_type;
    END IF;

    SELECT cycle_type_id INTO v_ref_type FROM governance.cycle_task_category WHERE id = NEW.category_id;
    IF v_ref_type IS DISTINCT FROM v_run_type THEN
        RAISE EXCEPTION 'task category type (%) != run type (%)', v_ref_type, v_run_type;
    END IF;

    SELECT cycle_type_id INTO v_ref_type FROM governance.cycle_task_template WHERE id = NEW.template_id;
    IF v_ref_type IS DISTINCT FROM v_run_type THEN
        RAISE EXCEPTION 'task template type (%) != run type (%)', v_ref_type, v_run_type;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION governance.trg_validate_workflow_request_tenant()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'governance', 'pg_catalog'
AS $function$
DECLARE v_request_tenant uuid;
BEGIN
    IF NEW.workflow_request_id IS NULL THEN RETURN NEW; END IF;

    -- Check if workflow_request table exists (avoid hard dependency)
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'document' AND c.relname = 'workflow_request'
    ) THEN
        RETURN NEW;
    END IF;

    EXECUTE 'SELECT tenant_id FROM document.workflow_request WHERE id = $1'
    INTO v_request_tenant USING NEW.workflow_request_id;

    IF v_request_tenant IS NULL THEN
        RAISE EXCEPTION 'workflow_request_id % not found', NEW.workflow_request_id;
    END IF;
    IF v_request_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'workflow_request tenant (%) does not match record tenant (%)',
            v_request_tenant, NEW.tenant_id;
    END IF;
    RETURN NEW;
END;
$function$;
