BEGIN;
DO $$BEGIN IF to_regclass('snapshot.business_partner_definition_revision') IS NOT NULL THEN
 ALTER TABLE snapshot.business_partner_definition_revision DROP CONSTRAINT IF EXISTS business_partner_definition_revision_bundle_chk;
 ALTER TABLE snapshot.business_partner_definition_revision ADD CONSTRAINT business_partner_definition_revision_bundle_chk CHECK(jsonb_typeof(bundle_json)='object' AND bundle_json->>'schema'='athyper.business-partner-definition-bundle.v1' AND bundle_json->>'bundleCode'=bundle_code AND bundle_json->>'semanticVersion'=semantic_version AND bundle_json?&ARRAY['requestSchemas','fieldPolicies','validationDeclarations','duplicateRules','formDescriptors','viewDescriptors','mappingContracts','workflowDefinitions','evidencePolicies','readinessGates','reasonCodeCatalog','meshSafeSchemas','compatibilityRules','sourceContractHashes'] AND bundle_json->'requestSchemas'?&ARRAY['supplier.new','supplier.add','supplier.qualify','supplier.company','supplier.bank','customer.new','customer.add','customer.credit','customer.company','workforce.new','workforce.add','workforce.change','workforce.offboard'] AND bundle_json->'mappingContracts'?&ARRAY['internal','portal','mesh','import','api'] AND bundle_json->'workflowDefinitions'?&ARRAY['supplier','customer','workforce']) NOT VALID;
END IF;END$$;
CREATE OR REPLACE FUNCTION runtime_meta.trg_guard_business_partner_definition_head() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,runtime_meta AS $$
DECLARE v_candidate text;v_active text;v_exact_previous boolean;
BEGIN
 IF TG_OP='UPDATE' AND NEW.publication_key LIKE 'studio.business_partner.definition.%' THEN
  SELECT payload.coordinates->>'semantic_version' INTO v_candidate FROM runtime_meta.applied_release_payload payload WHERE payload.applied_release_id=NEW.applied_release_id AND payload.artifact_kind='business_partner_definition_bundle';
  SELECT payload.coordinates->>'semantic_version' INTO v_active FROM runtime_meta.applied_release_payload payload WHERE payload.applied_release_id=OLD.applied_release_id AND payload.artifact_kind='business_partner_definition_bundle';
  IF v_candidate IS NULL OR v_active IS NULL THEN RAISE EXCEPTION 'BUSINESS_PARTNER_DEFINITION_ACTIVATION_PAYLOAD_REQUIRED' USING ERRCODE='check_violation';END IF;
  IF NEW.source_release_no<OLD.source_release_no THEN
   SELECT EXISTS(SELECT 1 FROM runtime_meta.release_activation_event event WHERE event.publication_key=NEW.publication_key AND event.applied_release_id=OLD.applied_release_id AND event.previous_applied_release_id=NEW.applied_release_id) INTO v_exact_previous;
   IF NOT v_exact_previous THEN RAISE EXCEPTION 'BUSINESS_PARTNER_DEFINITION_ROLLBACK_NOT_EXACT_PREVIOUS' USING ERRCODE='object_not_in_prerequisite_state';END IF;
  ELSIF string_to_array(split_part(v_candidate,'-',1),'.')::int[]<=string_to_array(split_part(v_active,'-',1),'.')::int[] THEN
   RAISE EXCEPTION 'BUSINESS_PARTNER_DEFINITION_DOWNGRADE_FORBIDDEN' USING ERRCODE='object_not_in_prerequisite_state';
  END IF;
 END IF;
 RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS runtime_business_partner_definition_head_guard ON runtime_meta.release_activation_head;
CREATE TRIGGER runtime_business_partner_definition_head_guard BEFORE UPDATE ON runtime_meta.release_activation_head FOR EACH ROW EXECUTE FUNCTION runtime_meta.trg_guard_business_partner_definition_head();
REVOKE ALL ON FUNCTION runtime_meta.trg_guard_business_partner_definition_head() FROM PUBLIC;
COMMIT;
