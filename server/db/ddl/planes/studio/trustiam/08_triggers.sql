DO $$ DECLARE v_table text; BEGIN FOREACH v_table IN ARRAY ARRAY['organization','organization_provider','application_projection','projection_scope','identity_provisioning_request'] LOOP EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON trustiam.%I FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',v_table||'_updated_at',v_table); END LOOP; END $$;
CREATE TRIGGER identity_provisioning_attempt_updated_at BEFORE UPDATE ON trustiam.identity_provisioning_attempt FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE OR REPLACE FUNCTION trustiam.trg_guard_identity_provisioning_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('applied','failed','cancelled') THEN RAISE EXCEPTION 'terminal identity provisioning attempts are immutable' USING ERRCODE='23514'; END IF;
 IF NOT ((OLD.status='claimed' AND NEW.status IN ('started','failed','cancelled')) OR (OLD.status='started' AND NEW.status IN ('applied','failed','cancelled'))) THEN RAISE EXCEPTION 'invalid identity provisioning attempt transition: % -> %',OLD.status,NEW.status USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER identity_provisioning_attempt_transition_guard BEFORE UPDATE ON trustiam.identity_provisioning_attempt FOR EACH ROW EXECUTE FUNCTION trustiam.trg_guard_identity_provisioning_attempt();
CREATE TRIGGER trustiam_organization_status_changed BEFORE UPDATE OF status ON trustiam.organization FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trustiam_organization_provider_status_changed BEFORE UPDATE OF status ON trustiam.organization_provider FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trustiam_application_projection_status_changed BEFORE UPDATE OF status ON trustiam.application_projection FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trustiam_identity_provisioning_request_status_changed BEFORE UPDATE OF status ON trustiam.identity_provisioning_request FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
