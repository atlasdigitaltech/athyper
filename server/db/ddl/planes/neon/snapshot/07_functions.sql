CREATE OR REPLACE FUNCTION snapshot.trg_reject_template_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, snapshot
AS $$
BEGIN
    RAISE EXCEPTION
        'snapshot.template_version is immutable; create a new version instead'
        USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE FUNCTION snapshot.trg_set_template_version_created_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, snapshot
AS $$
DECLARE
    v_actor uuid := nullif(
        current_setting('app.current_principal_id', true), ''
    )::uuid;
BEGIN
    IF current_user = 'athyperapp' THEN
        IF v_actor IS NULL THEN
            RAISE EXCEPTION 'Current principal context is required'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        NEW.created_by := v_actor;
    ELSIF v_actor IS NOT NULL THEN
        NEW.created_by := v_actor;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION snapshot.trg_reject_bom_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, snapshot
AS $$
BEGIN
    RAISE EXCEPTION 'snapshot.% is immutable; create a new snapshot instead',
        TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE FUNCTION snapshot.trg_set_bom_snapshot_created_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, snapshot
AS $$
DECLARE
    v_actor uuid := nullif(
        current_setting('app.current_principal_id', true), ''
    )::uuid;
BEGIN
    IF current_user = 'athyperapp' AND v_actor IS NULL THEN
        RAISE EXCEPTION 'Current principal context is required'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_actor IS NOT NULL THEN
        NEW.created_by := v_actor;
        IF TG_TABLE_NAME = 'bom' THEN
            NEW.released_by := v_actor;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION snapshot.trg_validate_bom_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, snapshot, master
AS $$
DECLARE
    v_source master.bom%ROWTYPE;
BEGIN
    SELECT * INTO v_source
      FROM master.bom
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.source_bom_id;

    IF FOUND AND (
        v_source.status <> 'released'
        OR v_source.company_code_id <> NEW.company_code_id
        OR v_source.output_item_id <> NEW.output_item_id
        OR v_source.code <> NEW.code
        OR v_source.name <> NEW.name
        OR v_source.bom_type <> NEW.bom_type
        OR v_source.base_quantity <> NEW.base_quantity
        OR v_source.uom_code <> NEW.uom_code
        OR v_source.effective_from IS DISTINCT FROM NEW.effective_from
        OR v_source.effective_until IS DISTINCT FROM NEW.effective_until
    ) THEN
        RAISE EXCEPTION
            'BOM snapshot must exactly represent a released source BOM'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION snapshot.trg_validate_bom_component_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, snapshot, master
AS $$
DECLARE
    v_source_bom uuid;
    v_component  master.bom_component%ROWTYPE;
BEGIN
    SELECT source_bom_id INTO v_source_bom
      FROM snapshot.bom
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.bom_snapshot_id;

    SELECT * INTO v_component
      FROM master.bom_component
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.source_bom_component_id;

    IF FOUND AND (
        v_component.bom_id <> v_source_bom
        OR v_component.component_item_id <> NEW.component_item_id
        OR v_component.line_no <> NEW.line_no
        OR v_component.quantity <> NEW.quantity
        OR v_component.uom_code <> NEW.uom_code
        OR v_component.scrap_percent <> NEW.scrap_percent
        OR v_component.issue_method <> NEW.issue_method
        OR v_component.is_optional <> NEW.is_optional
        OR v_component.alternate_group_code
            IS DISTINCT FROM NEW.alternate_group_code
        OR v_component.sort_order <> NEW.sort_order
    ) THEN
        RAISE EXCEPTION
            'BOM component snapshot must exactly represent a component of its source BOM'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;
