CREATE TRIGGER trg_authorization_epoch_coordinates_immutable
BEFORE UPDATE ON runtime_meta.authorization_epoch
FOR EACH ROW EXECUTE FUNCTION runtime_meta.trg_authorization_epoch_coordinates_immutable();

CREATE OR REPLACE FUNCTION event.trg_authorization_invalidation_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'authorization invalidation outbox rows cannot be deleted'; END IF;
    IF (OLD.idempotency_key, OLD.scope_kind, OLD.tenant_id, OLD.plane_code, OLD.authority_schema, OLD.authority_table,
        OLD.authority_operation, OLD.source_row_key, OLD.affected_principal_ids, OLD.affected_group_ids, OLD.affected_role_ids,
        OLD.affected_permission_set_ids, OLD.affected_permission_ids, OLD.affected_scope_ids, OLD.affected_record_ids,
        OLD.affected_delegation_ids, OLD.effective_at, OLD.created_at)
       IS DISTINCT FROM
       (NEW.idempotency_key, NEW.scope_kind, NEW.tenant_id, NEW.plane_code, NEW.authority_schema, NEW.authority_table,
        NEW.authority_operation, NEW.source_row_key, NEW.affected_principal_ids, NEW.affected_group_ids, NEW.affected_role_ids,
        NEW.affected_permission_set_ids, NEW.affected_permission_ids, NEW.affected_scope_ids, NEW.affected_record_ids,
        NEW.affected_delegation_ids, NEW.effective_at, NEW.created_at) THEN
      RAISE EXCEPTION 'authorization invalidation identity is immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_authorization_invalidation_immutable
BEFORE UPDATE OR DELETE ON event.authorization_invalidation_outbox
FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_invalidation_immutable();
