-- ============================================================================
-- mesh_control/05_functions.sql
-- Mesh control helper functions.
-- ============================================================================

CREATE OR REPLACE FUNCTION mesh_control.trg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = mesh_control, pg_catalog
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh_control.trg_prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = mesh_control, pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION '% on %.% is not allowed; row is immutable',
        TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE OR REPLACE FUNCTION mesh_control.trg_policy_rule_version_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = mesh_control, pg_catalog
AS $$
BEGIN
    INSERT INTO mesh_control.policy_rule_version (
        policy_rule_id,
        account_code,
        rule_code,
        version_no,
        rule_snapshot,
        superseded_at,
        superseded_by
    )
    VALUES (
        OLD.id,
        OLD.account_code,
        OLD.rule_code,
        OLD.version_no,
        to_jsonb(OLD),
        now(),
        COALESCE(NEW.updated_by, OLD.updated_by, OLD.created_by, 'system')
    )
    ON CONFLICT (policy_rule_id, version_no) DO NOTHING;

    NEW.version_no := OLD.version_no + 1;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION mesh_control.trg_set_updated_at IS
    'Sets updated_at on Mesh control tables.';
COMMENT ON FUNCTION mesh_control.trg_prevent_mutation IS
    'Blocks UPDATE/DELETE on immutable Mesh control history tables.';
COMMENT ON FUNCTION mesh_control.trg_policy_rule_version_snapshot IS
    'Snapshots the old policy_rule row before update and increments version_no.';
