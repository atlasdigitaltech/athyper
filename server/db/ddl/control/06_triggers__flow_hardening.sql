-- =============================================================================
-- control/06_triggers__flow_hardening.sql
-- Purpose : Flow engine integrity triggers — permission code validation,
--           single-writer enforcement across steps, and section_key referential
--           integrity check (deferred FK equivalent via trigger).
-- Tables  : control.entity_flow_field  (triggers: validate_perm, one_writer,
--                                                  validate_section)
--           control.entity_flow_section (trigger: validate_entity_code)
-- Idempotent: yes — CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS before
--             each CREATE TRIGGER.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Trigger 1: trg_flow_field_validate_perm
-- Validates that override_permission references an active code in
-- shared.permission before the row is written.
-- Fires: BEFORE INSERT OR UPDATE OF override_permission
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION control.trg_fn_flow_field_validate_perm()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.override_permission IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM shared.permission
       WHERE code   = NEW.override_permission
         AND status = 'active'
    ) THEN
      RAISE EXCEPTION
        'entity_flow_field: override_permission "%" not found in shared.permission (active codes only)',
        NEW.override_permission;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flow_field_validate_perm ON control.entity_flow_field;
CREATE TRIGGER trg_flow_field_validate_perm
  BEFORE INSERT OR UPDATE OF override_permission ON control.entity_flow_field
  FOR EACH ROW EXECUTE FUNCTION control.trg_fn_flow_field_validate_perm();

-- ---------------------------------------------------------------------------
-- Trigger 2: trg_flow_field_one_writer
-- Enforces at most one write-capable binding (mode IN ('required','editable'))
-- per (flow, entity_field, tenant) across all steps of the same flow.
-- Fires: AFTER INSERT OR UPDATE OF mode, entity_field_id, flow_step_id, tenant_id
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION control.trg_fn_flow_field_one_writer()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_flow_id      uuid;
  v_writer_count bigint;
BEGIN
  IF NEW.mode NOT IN ('required', 'editable') THEN
    RETURN NEW;
  END IF;

  SELECT efs.flow_id INTO v_flow_id
    FROM control.entity_flow_step efs
   WHERE efs.id = NEW.flow_step_id;

  PERFORM 1
    FROM control.entity_flow ef
   WHERE ef.id = v_flow_id
   FOR UPDATE;

  SELECT count(*) INTO v_writer_count
    FROM control.entity_flow_field  eff
    JOIN control.entity_flow_step   efs ON efs.id = eff.flow_step_id
   WHERE efs.flow_id          = v_flow_id
     AND eff.entity_field_id  = NEW.entity_field_id
     AND eff.mode             IN ('required', 'editable')
     AND COALESCE(eff.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = COALESCE(NEW.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF v_writer_count > 1 THEN
    RAISE EXCEPTION
      'entity_flow_field: at most one write-capable binding (required/editable) per flow and field; found % bindings for entity_field_id=%',
      v_writer_count, NEW.entity_field_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flow_field_one_writer ON control.entity_flow_field;
CREATE TRIGGER trg_flow_field_one_writer
  AFTER INSERT OR UPDATE OF mode, entity_field_id, flow_step_id, tenant_id ON control.entity_flow_field
  FOR EACH ROW EXECUTE FUNCTION control.trg_fn_flow_field_one_writer();

-- ---------------------------------------------------------------------------
-- Trigger 3: trg_flow_field_validate_section
-- Validates that section_key references a row in entity_flow_section that
-- belongs to the same flow_step_id and tenant scope.  Acts as a soft FK for
-- the cross-column (flow_step_id, section_key, tenant_id) composite reference
-- that a plain FOREIGN KEY cannot express.
-- Fires: BEFORE INSERT OR UPDATE OF section_key
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION control.trg_fn_flow_field_validate_section()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.section_key IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM control.entity_flow_section efsec
     WHERE efsec.flow_step_id = NEW.flow_step_id
       AND efsec.section_key  = NEW.section_key
       AND COALESCE(efsec.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(NEW.tenant_id,   '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION
      'entity_flow_field: section_key "%" not found in entity_flow_section for flow_step_id=%',
      NEW.section_key, NEW.flow_step_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flow_field_validate_section ON control.entity_flow_field;
CREATE TRIGGER trg_flow_field_validate_section
  BEFORE INSERT OR UPDATE OF section_key ON control.entity_flow_field
  FOR EACH ROW EXECUTE FUNCTION control.trg_fn_flow_field_validate_section();

-- ---------------------------------------------------------------------------
-- Trigger 4: trg_flow_section_validate_entity_code
-- Validates optional entity_code references on composite/field sections.
-- Platform sections may reference platform entities; tenant sections may
-- reference either tenant-scoped entities or platform entities.
-- Fires: BEFORE INSERT OR UPDATE OF section_type, entity_code, tenant_id
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION control.trg_fn_flow_section_validate_entity_code()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.entity_code IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM control.entity e
     WHERE e.entity_code = NEW.entity_code
       AND e.is_active = true
       AND (
         e.tenant_id IS NULL
         OR e.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
       )
  ) THEN
    RAISE EXCEPTION
      'entity_flow_section: entity_code "%" does not reference an active control.entity for tenant_id=%',
      NEW.entity_code, COALESCE(NEW.tenant_id::text, '<platform>');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flow_section_validate_entity_code ON control.entity_flow_section;
CREATE TRIGGER trg_flow_section_validate_entity_code
  BEFORE INSERT OR UPDATE OF section_type, entity_code, tenant_id ON control.entity_flow_section
  FOR EACH ROW EXECUTE FUNCTION control.trg_fn_flow_section_validate_entity_code();
