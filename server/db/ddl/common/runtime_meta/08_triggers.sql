CREATE TRIGGER tenant_usage_counter_updated_at
BEFORE UPDATE ON runtime_meta.tenant_usage_counter
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER entity_number_counter_20_validate
BEFORE INSERT OR UPDATE ON runtime_meta.entity_number_counter
FOR EACH ROW EXECUTE FUNCTION runtime_meta.trg_validate_entity_number_counter();
CREATE TRIGGER entity_number_counter_90_updated_at
BEFORE UPDATE ON runtime_meta.entity_number_counter
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE OR REPLACE FUNCTION runtime_meta.trg_reject_activation_event_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'release_activation_event is append-only' USING ERRCODE='integrity_constraint_violation'; END $$;
CREATE TRIGGER runtime_release_activation_event_immutable BEFORE UPDATE OR DELETE ON runtime_meta.release_activation_event FOR EACH ROW EXECUTE FUNCTION runtime_meta.trg_reject_activation_event_mutation();
