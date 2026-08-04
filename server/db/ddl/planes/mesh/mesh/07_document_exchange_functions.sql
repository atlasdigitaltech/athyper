CREATE OR REPLACE FUNCTION mesh.trg_validate_document_envelope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh, control
AS $$
DECLARE
    v_type control.network_document_type%ROWTYPE;
    v_relationship mesh.network_relationship%ROWTYPE;
BEGIN
    SELECT * INTO v_type
      FROM control.network_document_type
     WHERE id = NEW.document_type_id
       AND status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active network document type % not found', NEW.document_type_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_type.direction_scope <> 'both'
       AND v_type.direction_scope::text <> NEW.document_direction::text THEN
        RAISE EXCEPTION 'Document direction is not permitted by document type %', v_type.code
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.entity_id <> v_type.entity_id THEN
        RAISE EXCEPTION 'Envelope Entity identity does not match document type %', v_type.code
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_type.entity_version_policy = 'pinned'
       AND (
           NEW.entity_version_id IS DISTINCT FROM v_type.pinned_entity_version_id
           OR NEW.entity_contract_hash IS DISTINCT FROM v_type.pinned_contract_hash
       ) THEN
        RAISE EXCEPTION 'Envelope does not use the pinned Entity contract for %', v_type.code
            USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM runtime_meta.entity_contract ec
         WHERE ec.entity_id = NEW.entity_id
           AND ec.id = NEW.entity_version_id
           AND ec.entity_contract_hash = NEW.entity_contract_hash
           AND ec.status <> 'revoked'
           AND (
               v_type.entity_version_policy = 'pinned'
               OR ec.status = 'published'
           )
    ) THEN
        RAISE EXCEPTION 'Envelope Entity contract is not an eligible Mesh publication'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    SELECT * INTO v_relationship
      FROM mesh.network_relationship
     WHERE id = NEW.network_relationship_id
       AND status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active network relationship % not found',
            NEW.network_relationship_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.document_direction = 'buyer_to_supplier'
       AND ROW(
           NEW.sender_tenant_id, NEW.sender_account_id,
           NEW.receiver_tenant_id, NEW.receiver_account_id
       ) IS DISTINCT FROM ROW(
           v_relationship.buyer_tenant_id, v_relationship.buyer_account_id,
           v_relationship.supplier_tenant_id, v_relationship.supplier_account_id
       ) THEN
        RAISE EXCEPTION 'Buyer-to-supplier envelope participants do not match the relationship'
            USING ERRCODE = 'check_violation';
    ELSIF NEW.document_direction = 'supplier_to_buyer'
       AND ROW(
           NEW.sender_tenant_id, NEW.sender_account_id,
           NEW.receiver_tenant_id, NEW.receiver_account_id
       ) IS DISTINCT FROM ROW(
           v_relationship.supplier_tenant_id, v_relationship.supplier_account_id,
           v_relationship.buyer_tenant_id, v_relationship.buyer_account_id
       ) THEN
        RAISE EXCEPTION 'Supplier-to-buyer envelope participants do not match the relationship'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_guard_document_envelope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Document envelopes cannot be deleted; archive instead'
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF ROW(
        NEW.id, NEW.envelope_code, NEW.network_relationship_id,
        NEW.document_type_id, NEW.document_direction,
        NEW.sender_tenant_id, NEW.sender_account_id,
        NEW.receiver_tenant_id, NEW.receiver_account_id,
        NEW.entity_id, NEW.entity_version_id, NEW.entity_contract_hash,
        NEW.idempotency_key, NEW.received_at, NEW.created_at, NEW.created_by
    ) IS DISTINCT FROM ROW(
        OLD.id, OLD.envelope_code, OLD.network_relationship_id,
        OLD.document_type_id, OLD.document_direction,
        OLD.sender_tenant_id, OLD.sender_account_id,
        OLD.receiver_tenant_id, OLD.receiver_account_id,
        OLD.entity_id, OLD.entity_version_id, OLD.entity_contract_hash,
        OLD.idempotency_key, OLD.received_at, OLD.created_at, OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Envelope routing, frozen contract, and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (
           (OLD.status = 'received' AND NEW.status IN ('validating', 'rejected', 'failed'))
           OR (OLD.status = 'validating' AND NEW.status IN ('validated', 'rejected', 'failed'))
           OR (OLD.status = 'validated' AND NEW.status IN ('accepted', 'rejected', 'failed'))
           OR (OLD.status = 'accepted' AND NEW.status IN ('routing', 'archived'))
           OR (OLD.status = 'routing' AND NEW.status IN ('routed', 'failed'))
           OR (OLD.status = 'routed' AND NEW.status = 'archived')
       ) THEN
        RAISE EXCEPTION 'Invalid envelope status transition: % -> %', OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_guard_document_payload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Payload evidence cannot be deleted; mark it deleted'
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF ROW(
        NEW.id, NEW.envelope_id, NEW.payload_role, NEW.sequence_no,
        NEW.storage_uri, NEW.payload_hash, NEW.content_type, NEW.size_bytes,
        NEW.created_at, NEW.created_by_tenant_id, NEW.created_by
    ) IS DISTINCT FROM ROW(
        OLD.id, OLD.envelope_id, OLD.payload_role, OLD.sequence_no,
        OLD.storage_uri, OLD.payload_hash, OLD.content_type, OLD.size_bytes,
        OLD.created_at, OLD.created_by_tenant_id, OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Payload identity, object evidence, and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'deleted' AND NEW.status <> 'deleted' THEN
        RAISE EXCEPTION 'Deleted payload evidence cannot be restored in place'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_guard_append_only_document_child()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_validate_document_child_participant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
DECLARE
    v_envelope mesh.document_envelope%ROWTYPE;
BEGIN
    SELECT * INTO v_envelope
      FROM mesh.document_envelope
     WHERE id = NEW.envelope_id;

    IF TG_TABLE_NAME = 'document_acknowledgement'
       AND NOT (
           (NEW.responder_tenant_id, NEW.responder_account_id)
               = (v_envelope.sender_tenant_id, v_envelope.sender_account_id)
           OR
           (NEW.responder_tenant_id, NEW.responder_account_id)
               = (v_envelope.receiver_tenant_id, v_envelope.receiver_account_id)
       ) THEN
        RAISE EXCEPTION 'Acknowledgement responder is not an envelope participant'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'document_payload'
       AND NEW.created_by_tenant_id NOT IN (
           v_envelope.sender_tenant_id, v_envelope.receiver_tenant_id
       ) THEN
        RAISE EXCEPTION 'Payload creator tenant is not an envelope participant'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'document_event'
       AND NEW.created_by_tenant_id NOT IN (
           v_envelope.sender_tenant_id, v_envelope.receiver_tenant_id
       ) THEN
        RAISE EXCEPTION 'Document event creator tenant is not an envelope participant'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'document_event'
       AND NEW.actor_account_id IS NOT NULL
       AND NOT (
           (NEW.actor_tenant_id, NEW.actor_account_id)
               = (v_envelope.sender_tenant_id, v_envelope.sender_account_id)
           OR
           (NEW.actor_tenant_id, NEW.actor_account_id)
               = (v_envelope.receiver_tenant_id, v_envelope.receiver_account_id)
       ) THEN
        RAISE EXCEPTION 'Document event actor is not an envelope participant'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;
