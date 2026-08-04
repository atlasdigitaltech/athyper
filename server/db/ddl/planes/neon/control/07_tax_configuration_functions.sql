CREATE OR REPLACE FUNCTION control.trg_guard_tax_policy_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_old_business jsonb;
    v_new_business jsonb;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Only draft % rows may be deleted', TG_TABLE_NAME
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION '% identity and creation evidence are immutable', TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' THEN
        v_old_business := to_jsonb(OLD) - ARRAY[
            'status', 'is_active', 'status_changed_at', 'status_changed_by',
            'updated_at', 'updated_by', 'effective_to'
        ];
        v_new_business := to_jsonb(NEW) - ARRAY[
            'status', 'is_active', 'status_changed_at', 'status_changed_by',
            'updated_at', 'updated_by', 'effective_to'
        ];

        IF v_new_business IS DISTINCT FROM v_old_business THEN
            RAISE EXCEPTION 'Activated % policy is immutable; create an effective-dated successor', TG_TABLE_NAME
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.effective_to IS DISTINCT FROM OLD.effective_to
           AND (NEW.effective_to IS NULL
                OR NEW.effective_to < OLD.effective_from
                OR (OLD.effective_to IS NOT NULL AND NEW.effective_to > OLD.effective_to)) THEN
            RAISE EXCEPTION 'An activated % period may only be shortened', TG_TABLE_NAME
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
        (OLD.status = 'draft' AND NEW.status IN ('scheduled', 'active', 'retired'))
        OR (OLD.status = 'scheduled' AND NEW.status IN ('active', 'retired'))
        OR (OLD.status = 'active' AND NEW.status IN ('expired', 'retired'))
        OR (OLD.status = 'expired' AND NEW.status = 'retired')
    ) THEN
        RAISE EXCEPTION 'Invalid % status transition: % -> %', TG_TABLE_NAME, OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_tax_rate_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_tax_class master.tax_class_d;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'Tax-rate schedules must be created as draft'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT tax_class INTO v_tax_class
      FROM master.tax_type
     WHERE tenant_id = NEW.tenant_id AND id = NEW.tax_type_id;

    IF FOUND AND ((v_tax_class = 'withholding') <> (NEW.wht_basis IS NOT NULL)) THEN
        RAISE EXCEPTION 'Withholding tax schedules must define wht_basis and non-withholding schedules must not'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_tax_group()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_previous control.tax_group%ROWTYPE;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'Tax groups must be created as draft before components are assigned'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.supersedes_tax_group_id IS NOT NULL THEN
        SELECT * INTO v_previous
          FROM control.tax_group
         WHERE tenant_id = NEW.tenant_id AND id = NEW.supersedes_tax_group_id;

        IF FOUND AND (
            v_previous.code <> NEW.code
            OR v_previous.jurisdiction_id <> NEW.jurisdiction_id
            OR v_previous.group_kind <> NEW.group_kind
            OR v_previous.effective_from >= NEW.effective_from
            OR v_previous.effective_to IS NULL
            OR v_previous.effective_to >= NEW.effective_from
        ) THEN
            RAISE EXCEPTION 'Tax-group successor must retain code, jurisdiction and kind and begin after its closed predecessor'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_OP = 'INSERT' AND EXISTS (
        SELECT 1 FROM control.tax_group g
         WHERE g.tenant_id = NEW.tenant_id AND g.code = NEW.code
    ) THEN
        RAISE EXCEPTION 'A later tax-group revision must identify supersedes_tax_group_id'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IN ('scheduled', 'active') THEN
        IF NOT EXISTS (
            SELECT 1 FROM control.rounding_rule r
             WHERE r.tenant_id = NEW.tenant_id
               AND r.id = NEW.rounding_rule_id
               AND r.status = 'active'
        ) THEN
            RAISE EXCEPTION 'Scheduled or active tax group requires an active rounding rule'
                USING ERRCODE = 'check_violation';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM control.tax_group_component c
             WHERE c.tenant_id = NEW.tenant_id AND c.tax_group_id = NEW.id
        ) THEN
            RAISE EXCEPTION 'Scheduled or active tax group requires at least one component'
                USING ERRCODE = 'check_violation';
        END IF;

        IF EXISTS (
            SELECT 1
              FROM control.tax_group_component c
              JOIN control.tax_rate_schedule s
                ON s.tenant_id = c.tenant_id AND s.id = c.tax_rate_schedule_id
              JOIN master.tax_type t
                ON t.tenant_id = s.tenant_id AND t.id = s.tax_type_id
             WHERE c.tenant_id = NEW.tenant_id
               AND c.tax_group_id = NEW.id
               AND (
                    s.status NOT IN ('scheduled', 'active')
                    OR s.jurisdiction_id <> NEW.jurisdiction_id
                    OR s.effective_from > NEW.effective_from
                    OR (NEW.effective_to IS NULL AND s.effective_to IS NOT NULL)
                    OR (NEW.effective_to IS NOT NULL AND s.effective_to IS NOT NULL
                        AND s.effective_to < NEW.effective_to)
                    OR (NEW.group_kind = 'withholding' AND t.tax_class <> 'withholding')
                    OR (NEW.group_kind = 'indirect_tax' AND t.tax_class = 'withholding')
                    OR (NEW.group_kind = 'reverse_charge' AND s.reverse_charge_mode = 'NONE')
               )
        ) THEN
            RAISE EXCEPTION 'Tax-group components must be eligible and cover the complete group period'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_tax_group_component()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_group control.tax_group%ROWTYPE;
    v_schedule control.tax_rate_schedule%ROWTYPE;
BEGIN
    SELECT * INTO v_group FROM control.tax_group
     WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
       AND id = COALESCE(NEW.tax_group_id, OLD.tax_group_id);

    IF NOT FOUND OR v_group.status <> 'draft' THEN
        RAISE EXCEPTION 'Tax-group components may only change while the parent group is draft'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id
        OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Tax-group component identity and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_schedule FROM control.tax_rate_schedule
     WHERE tenant_id = NEW.tenant_id AND id = NEW.tax_rate_schedule_id;

    IF FOUND AND (
        v_schedule.status = 'retired'
        OR v_schedule.jurisdiction_id <> v_group.jurisdiction_id
        OR v_schedule.effective_from > v_group.effective_from
        OR (v_group.effective_to IS NULL AND v_schedule.effective_to IS NOT NULL)
        OR (v_group.effective_to IS NOT NULL AND v_schedule.effective_to IS NOT NULL
            AND v_schedule.effective_to < v_group.effective_to)
    ) THEN
        RAISE EXCEPTION 'Component schedule must match jurisdiction and cover the complete tax-group period'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_tax_resolution_rule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_code text;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'Tax-resolution rules must be created as draft'
            USING ERRCODE = 'check_violation';
    END IF;

    FOREACH v_code IN ARRAY NEW.scope_doc_entity_codes LOOP
        IF v_code !~ '^[a-z][a-z0-9_.-]{0,126}$' THEN
            RAISE EXCEPTION 'Invalid document entity code: %', v_code
                USING ERRCODE = 'check_violation';
        END IF;
    END LOOP;

    IF NEW.status IN ('scheduled', 'active') AND NOT EXISTS (
        SELECT 1 FROM control.tax_group g
         WHERE g.tenant_id = NEW.tenant_id
           AND g.id = NEW.resolved_tax_group_id
           AND g.status IN ('scheduled', 'active')
           AND g.effective_from <= NEW.effective_from
           AND (NEW.effective_to IS NULL AND g.effective_to IS NULL
                OR NEW.effective_to IS NOT NULL
                   AND (g.effective_to IS NULL OR g.effective_to >= NEW.effective_to))
    ) THEN
        RAISE EXCEPTION 'Resolved tax group must cover the complete active rule period'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_wht_threshold_config()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_tax_class master.tax_class_d;
    v_section_mode master.tax_section_code_mode_d;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'WHT threshold policies must be created as draft'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT t.tax_class, t.section_code_mode
      INTO v_tax_class, v_section_mode
      FROM master.tax_type t
     WHERE t.tenant_id = NEW.tenant_id AND t.id = NEW.tax_type_id;

    IF FOUND AND v_tax_class <> 'withholding' THEN
        RAISE EXCEPTION 'WHT threshold tax_type_id must identify a withholding tax type'
            USING ERRCODE = 'check_violation';
    END IF;

    IF FOUND AND (
        (v_section_mode = 'required' AND NEW.section_code IS NULL)
        OR (v_section_mode = 'not_used' AND NEW.section_code IS NOT NULL)
    ) THEN
        RAISE EXCEPTION 'WHT threshold section_code does not satisfy the tax type section mode'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;
