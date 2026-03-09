-- ============================================================================
-- 071: Class x Governance Combination Guard (Defense-in-Depth)
-- ============================================================================
-- Enforces valid entity_class x governance_level combinations at DB level.
-- Application-level validation in entity-meta-utils.ts is the primary gate;
-- this trigger is defense-in-depth for direct SQL and migrations.
-- ============================================================================

-- Guard trigger: reject invalid class x governance combinations on INSERT/UPDATE
CREATE OR REPLACE FUNCTION meta.trg_class_governance_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = meta
AS $$
DECLARE
  v_class text := COALESCE(NEW.entity_class, 'MASTER');
  v_gov   text := COALESCE(NEW.governance_level, 'full');
BEGIN
  -- Validate the combination
  CASE v_class
    WHEN 'REFERENCE' THEN
      IF v_gov NOT IN ('full', 'light', 'audit_only') THEN
        RAISE EXCEPTION 'CLASS_GOVERNANCE_GUARD: entity_class ''%'' does not support governance_level ''%''. Allowed: full, light, audit_only',
          v_class, v_gov
          USING ERRCODE = 'integrity_constraint_violation';
      END IF;
    WHEN 'MASTER' THEN
      IF v_gov NOT IN ('full', 'light') THEN
        RAISE EXCEPTION 'CLASS_GOVERNANCE_GUARD: entity_class ''%'' does not support governance_level ''%''. Allowed: full, light',
          v_class, v_gov
          USING ERRCODE = 'integrity_constraint_violation';
      END IF;
    WHEN 'CONTROL' THEN
      IF v_gov NOT IN ('full', 'light') THEN
        RAISE EXCEPTION 'CLASS_GOVERNANCE_GUARD: entity_class ''%'' does not support governance_level ''%''. Allowed: full, light',
          v_class, v_gov
          USING ERRCODE = 'integrity_constraint_violation';
      END IF;
    WHEN 'DOCUMENT' THEN
      IF v_gov <> 'full' THEN
        RAISE EXCEPTION 'CLASS_GOVERNANCE_GUARD: entity_class ''%'' does not support governance_level ''%''. Allowed: full',
          v_class, v_gov
          USING ERRCODE = 'integrity_constraint_violation';
      END IF;
    WHEN 'LEDGER' THEN
      IF v_gov <> 'full' THEN
        RAISE EXCEPTION 'CLASS_GOVERNANCE_GUARD: entity_class ''%'' does not support governance_level ''%''. Allowed: full',
          v_class, v_gov
          USING ERRCODE = 'integrity_constraint_violation';
      END IF;
    WHEN 'LOG' THEN
      IF v_gov NOT IN ('full', 'light', 'audit_only') THEN
        RAISE EXCEPTION 'CLASS_GOVERNANCE_GUARD: entity_class ''%'' does not support governance_level ''%''. Allowed: full, light, audit_only',
          v_class, v_gov
          USING ERRCODE = 'integrity_constraint_violation';
      END IF;
    ELSE
      -- Unknown class — let the CHECK constraint on entity_class handle it
      NULL;
  END CASE;

  RETURN NEW;
END;
$$;

-- Attach to meta.entity (fires after existing evolution guard)
DROP TRIGGER IF EXISTS trg_class_governance_guard ON meta.entity;
CREATE TRIGGER trg_class_governance_guard
  BEFORE INSERT OR UPDATE OF entity_class, governance_level
  ON meta.entity
  FOR EACH ROW
  EXECUTE FUNCTION meta.trg_class_governance_guard();

-- Separate guard for meta.entity_runtime_profile (governance_level lives here,
-- but entity_class lives on meta.entity — need a JOIN to validate)
CREATE OR REPLACE FUNCTION meta.trg_class_governance_guard_runtime()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = meta
AS $$
DECLARE
  v_class text;
  v_gov   text := COALESCE(NEW.governance_level, 'full');
BEGIN
  SELECT entity_class INTO v_class
    FROM meta.entity
   WHERE id = NEW.entity_id;

  IF v_class IS NULL THEN
    RETURN NEW; -- entity not found, FK constraint will catch it
  END IF;

  -- Reuse same validation logic
  CASE v_class
    WHEN 'REFERENCE' THEN
      IF v_gov NOT IN ('full', 'light', 'audit_only') THEN
        RAISE EXCEPTION 'CLASS_GOVERNANCE_GUARD: entity_class ''%'' does not support governance_level ''%''',
          v_class, v_gov USING ERRCODE = 'integrity_constraint_violation';
      END IF;
    WHEN 'MASTER', 'CONTROL' THEN
      IF v_gov NOT IN ('full', 'light') THEN
        RAISE EXCEPTION 'CLASS_GOVERNANCE_GUARD: entity_class ''%'' does not support governance_level ''%''',
          v_class, v_gov USING ERRCODE = 'integrity_constraint_violation';
      END IF;
    WHEN 'DOCUMENT', 'LEDGER' THEN
      IF v_gov <> 'full' THEN
        RAISE EXCEPTION 'CLASS_GOVERNANCE_GUARD: entity_class ''%'' does not support governance_level ''%''',
          v_class, v_gov USING ERRCODE = 'integrity_constraint_violation';
      END IF;
    WHEN 'LOG' THEN
      IF v_gov NOT IN ('full', 'light', 'audit_only') THEN
        RAISE EXCEPTION 'CLASS_GOVERNANCE_GUARD: entity_class ''%'' does not support governance_level ''%''',
          v_class, v_gov USING ERRCODE = 'integrity_constraint_violation';
      END IF;
    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_class_governance_guard_runtime ON meta.entity_runtime_profile;
CREATE TRIGGER trg_class_governance_guard_runtime
  BEFORE INSERT OR UPDATE OF governance_level
  ON meta.entity_runtime_profile
  FOR EACH ROW
  EXECUTE FUNCTION meta.trg_class_governance_guard_runtime();
