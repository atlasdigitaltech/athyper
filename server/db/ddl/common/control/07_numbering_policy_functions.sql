CREATE OR REPLACE FUNCTION control.trg_validate_numbering_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_remainder text;
BEGIN
    IF regexp_count(NEW.format_template, '\{seq\}') <> 1 THEN
        RAISE EXCEPTION 'Numbering format_template must contain exactly one {seq}' USING ERRCODE = 'check_violation';
    END IF;
    v_remainder := regexp_replace(
        NEW.format_template,
        '\{(seq|yyyy|yy|mm|dd|fiscal_year|scope)\}',
        '',
        'g'
    );
    IF v_remainder ~ '[{}]' THEN
        RAISE EXCEPTION 'Numbering format_template contains an unknown or malformed token' USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.format_template ~ '\{(yyyy|yy|mm|dd)\}' OR NEW.reset_kind LIKE 'calendar_%')
       AND NEW.timezone_code IS NULL THEN
        RAISE EXCEPTION 'Calendar numbering tokens and reset policies require timezone_code' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.format_template ~ '\{fiscal_year\}' AND NEW.reset_kind <> 'fiscal_year' THEN
        RAISE EXCEPTION '{fiscal_year} requires reset_kind=fiscal_year' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_numbering_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF NEW.id <> OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.policy_code <> OLD.policy_code
       OR NEW.policy_revision <> OLD.policy_revision THEN
        RAISE EXCEPTION 'Numbering policy identity is immutable' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF OLD.status = 'active' AND (
        NEW.name IS DISTINCT FROM OLD.name
        OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.format_template IS DISTINCT FROM OLD.format_template
        OR NEW.sequence_width IS DISTINCT FROM OLD.sequence_width
        OR NEW.pad_character IS DISTINCT FROM OLD.pad_character
        OR NEW.start_value IS DISTINCT FROM OLD.start_value
        OR NEW.increment_by IS DISTINCT FROM OLD.increment_by
        OR NEW.maximum_value IS DISTINCT FROM OLD.maximum_value
        OR NEW.scope_kind IS DISTINCT FROM OLD.scope_kind
        OR NEW.reset_kind IS DISTINCT FROM OLD.reset_kind
        OR NEW.timezone_code IS DISTINCT FROM OLD.timezone_code
        OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
        OR NEW.activated_by IS DISTINCT FROM OLD.activated_by
    ) THEN
        RAISE EXCEPTION 'Active numbering policy revisions are immutable' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.status <> OLD.status AND NOT (
        (OLD.status = 'draft' AND NEW.status IN ('active','retired'))
        OR (OLD.status = 'active' AND NEW.status = 'retired')
    ) THEN
        RAISE EXCEPTION 'Invalid numbering policy status transition: % -> %', OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
