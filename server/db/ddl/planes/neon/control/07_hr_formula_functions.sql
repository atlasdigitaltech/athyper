CREATE OR REPLACE FUNCTION control.trg_guard_published_formula_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF OLD.status <> 'draft' THEN
        RAISE EXCEPTION
            'Published formula version % is immutable (status=%)',
            OLD.id, OLD.status
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF TG_OP = 'UPDATE'
       AND NEW.formula_expression_id IS DISTINCT FROM OLD.formula_expression_id THEN
        RAISE EXCEPTION 'Formula version cannot move to another formula expression'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

COMMENT ON FUNCTION control.trg_guard_published_formula_version() IS
  'Allows draft editing/publication but rejects UPDATE or DELETE after a formula version leaves draft.';
