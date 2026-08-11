CREATE TRIGGER tenant_usage_counter_updated_at
BEFORE UPDATE ON runtime_meta.tenant_usage_counter
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER entity_number_counter_20_validate
BEFORE INSERT OR UPDATE ON runtime_meta.entity_number_counter
FOR EACH ROW EXECUTE FUNCTION runtime_meta.trg_validate_entity_number_counter();
CREATE TRIGGER entity_number_counter_90_updated_at
BEFORE UPDATE ON runtime_meta.entity_number_counter
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER entity_number_allocation_immutable
BEFORE UPDATE OR DELETE ON runtime_meta.entity_number_allocation
FOR EACH ROW EXECUTE FUNCTION runtime_meta.trg_reject_entity_number_allocation_mutation();

CREATE OR REPLACE FUNCTION runtime_meta.trg_reject_activation_event_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'release_activation_event is append-only' USING ERRCODE='integrity_constraint_violation'; END $$;
CREATE TRIGGER runtime_release_activation_event_immutable BEFORE UPDATE OR DELETE ON runtime_meta.release_activation_event FOR EACH ROW EXECUTE FUNCTION runtime_meta.trg_reject_activation_event_mutation();

CREATE OR REPLACE FUNCTION runtime_meta.trg_guard_entity_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,runtime_meta
AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Entity contracts are immutable; revoke instead' USING ERRCODE='restrict_violation';
  END IF;
  IF ROW(NEW.id,NEW.tenant_id,NEW.entity_id,NEW.entity_code,NEW.release_id,NEW.revision_id,
         NEW.release_no,NEW.contract_schema_code,NEW.contract_schema_version,
         NEW.entity_contract_hash,NEW.contract_json,NEW.publication_key,
         NEW.signature_algorithm,NEW.signing_key_id,NEW.signature,NEW.published_at,NEW.received_at)
     IS DISTINCT FROM
     ROW(OLD.id,OLD.tenant_id,OLD.entity_id,OLD.entity_code,OLD.release_id,OLD.revision_id,
         OLD.release_no,OLD.contract_schema_code,OLD.contract_schema_version,
         OLD.entity_contract_hash,OLD.contract_json,OLD.publication_key,
         OLD.signature_algorithm,OLD.signing_key_id,OLD.signature,OLD.published_at,OLD.received_at) THEN
    RAISE EXCEPTION 'Entity contract content is immutable' USING ERRCODE='integrity_constraint_violation';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status='staged' AND NEW.status IN ('published','revoked'))
      OR (OLD.status='published' AND NEW.status IN ('superseded','revoked'))
      OR (OLD.status='superseded' AND NEW.status IN ('published','revoked'))
  ) THEN
    RAISE EXCEPTION 'Invalid Entity contract status transition: % -> %',OLD.status,NEW.status
      USING ERRCODE='integrity_constraint_violation';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION runtime_meta.trg_guard_entity_descriptor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,runtime_meta
AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Entity descriptors are immutable; retire instead' USING ERRCODE='restrict_violation';
  END IF;
  IF ROW(NEW.id,NEW.tenant_id,NEW.entity_contract_id,NEW.entity_id,NEW.release_id,NEW.revision_id,
         NEW.plane_code,NEW.descriptor_kind,NEW.descriptor_schema_version,NEW.source_contract_hash,
         NEW.compiled_hash,NEW.compiled_json,NEW.compiler_version,NEW.compatibility_level,
         NEW.applied_release_id,NEW.generated_at,NEW.received_at)
     IS DISTINCT FROM
     ROW(OLD.id,OLD.tenant_id,OLD.entity_contract_id,OLD.entity_id,OLD.release_id,OLD.revision_id,
         OLD.plane_code,OLD.descriptor_kind,OLD.descriptor_schema_version,OLD.source_contract_hash,
         OLD.compiled_hash,OLD.compiled_json,OLD.compiler_version,OLD.compatibility_level,
         OLD.applied_release_id,OLD.generated_at,OLD.received_at) THEN
    RAISE EXCEPTION 'Entity descriptor content is immutable' USING ERRCODE='integrity_constraint_violation';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status='staged' AND NEW.status='active')
      OR (OLD.status='active' AND NEW.status='retired')
      OR (OLD.status='retired' AND NEW.status='active')
  ) THEN
    RAISE EXCEPTION 'Invalid Entity descriptor status transition: % -> %',OLD.status,NEW.status
      USING ERRCODE='integrity_constraint_violation';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER runtime_entity_contract_immutable
BEFORE UPDATE OR DELETE ON runtime_meta.entity_contract
FOR EACH ROW EXECUTE FUNCTION runtime_meta.trg_guard_entity_contract();

CREATE TRIGGER runtime_entity_descriptor_immutable
BEFORE UPDATE OR DELETE ON runtime_meta.entity_descriptor
FOR EACH ROW EXECUTE FUNCTION runtime_meta.trg_guard_entity_descriptor();
