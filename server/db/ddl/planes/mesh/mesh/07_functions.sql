CREATE OR REPLACE FUNCTION mesh.trg_guard_creation_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
BEGIN
    IF NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR (
           to_jsonb(NEW) ? 'created_by_tenant_id'
           AND (to_jsonb(NEW) -> 'created_by_tenant_id')
               IS DISTINCT FROM (to_jsonb(OLD) -> 'created_by_tenant_id')
       ) THEN
        RAISE EXCEPTION '%.% creation evidence is immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_guard_network_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
BEGIN
    IF (to_jsonb(NEW) -> 'id') IS DISTINCT FROM (to_jsonb(OLD) -> 'id')
       OR (
           to_jsonb(NEW) ? 'tenant_id'
           AND (to_jsonb(NEW) -> 'tenant_id') IS DISTINCT FROM (to_jsonb(OLD) -> 'tenant_id')
       )
       OR (
           to_jsonb(NEW) ? 'account_code'
           AND (to_jsonb(NEW) -> 'account_code') IS DISTINCT FROM (to_jsonb(OLD) -> 'account_code')
       )
       OR (
           to_jsonb(NEW) ? 'network_account_id'
           AND (to_jsonb(NEW) -> 'network_account_id')
               IS DISTINCT FROM (to_jsonb(OLD) -> 'network_account_id')
       )
       OR (
           to_jsonb(NEW) ? 'owner_account_id'
           AND (to_jsonb(NEW) -> 'owner_account_id')
               IS DISTINCT FROM (to_jsonb(OLD) -> 'owner_account_id')
       )
       OR (
           to_jsonb(NEW) ? 'catalog_id'
           AND (to_jsonb(NEW) -> 'catalog_id')
               IS DISTINCT FROM (to_jsonb(OLD) -> 'catalog_id')
       )
       OR (
           to_jsonb(NEW) ? 'catalog_item_id'
           AND (to_jsonb(NEW) -> 'catalog_item_id')
               IS DISTINCT FROM (to_jsonb(OLD) -> 'catalog_item_id')
       )
       OR (
           to_jsonb(NEW) ? 'buyer_tenant_id'
           AND (
               (to_jsonb(NEW) -> 'buyer_tenant_id')
                   IS DISTINCT FROM (to_jsonb(OLD) -> 'buyer_tenant_id')
               OR (to_jsonb(NEW) -> 'buyer_account_id')
                   IS DISTINCT FROM (to_jsonb(OLD) -> 'buyer_account_id')
               OR (to_jsonb(NEW) -> 'supplier_tenant_id')
                   IS DISTINCT FROM (to_jsonb(OLD) -> 'supplier_tenant_id')
               OR (to_jsonb(NEW) -> 'supplier_account_id')
                   IS DISTINCT FROM (to_jsonb(OLD) -> 'supplier_account_id')
           )
       ) THEN
        RAISE EXCEPTION '%.% identity coordinates are immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_validate_catalog_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM mesh.network_account AS account
        WHERE account.tenant_id = NEW.tenant_id
          AND account.id = NEW.owner_account_id
          AND account.network_role IN ('supplier', 'both')
          AND account.status = 'active'
    ) THEN
        RAISE EXCEPTION
            'catalog owner must be an active supplier-capable network account'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_set_catalog_publication_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh, master
AS $$
BEGIN
    IF NEW.status = 'published'
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        NEW.published_at := COALESCE(NEW.published_at, statement_timestamp());
        NEW.published_by := COALESCE(
            NEW.published_by,
            master.current_principal_id_soft()
        );
        IF NEW.published_by IS NULL THEN
            RAISE EXCEPTION 'publishing a catalog requires principal context'
                USING ERRCODE = 'not_null_violation';
        END IF;
    ELSIF TG_OP = 'UPDATE'
          AND OLD.status = 'published'
          AND NEW.published_at IS DISTINCT FROM OLD.published_at THEN
        RAISE EXCEPTION 'catalog publication evidence is immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_validate_catalog_audience()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM mesh.network_relationship AS relationship
        WHERE relationship.id = NEW.network_relationship_id
          AND relationship.buyer_tenant_id = NEW.buyer_tenant_id
          AND relationship.buyer_account_id = NEW.buyer_account_id
          AND relationship.supplier_tenant_id = NEW.supplier_tenant_id
          AND relationship.supplier_account_id = NEW.supplier_account_id
          AND relationship.status = 'active'
          AND (
              relationship.effective_from IS NULL
              OR relationship.effective_from <= CURRENT_DATE
          )
          AND (
              relationship.effective_until IS NULL
              OR relationship.effective_until >= CURRENT_DATE
          )
    ) THEN
        RAISE EXCEPTION
            'catalog audience requires a matching active network relationship'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_validate_catalog_price()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
BEGIN
    IF NEW.network_relationship_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM mesh.network_relationship AS relationship
           WHERE relationship.id = NEW.network_relationship_id
             AND relationship.supplier_tenant_id = NEW.tenant_id
             AND relationship.supplier_account_id = NEW.owner_account_id
             AND relationship.status = 'active'
       ) THEN
        RAISE EXCEPTION
            'relationship price requires an active relationship owned by the catalog supplier'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.price_type = 'contract'
       AND NOT EXISTS (
           SELECT 1
           FROM mesh.catalog_audience AS audience
           JOIN mesh.catalog_item AS item
             ON item.tenant_id = NEW.tenant_id
            AND item.owner_account_id = NEW.owner_account_id
            AND item.id = NEW.catalog_item_id
           WHERE audience.supplier_tenant_id = NEW.tenant_id
             AND audience.supplier_account_id = NEW.owner_account_id
             AND audience.catalog_id = item.catalog_id
             AND audience.network_relationship_id = NEW.network_relationship_id
             AND audience.access_kind = 'contract'
             AND audience.status = 'active'
       ) THEN
        RAISE EXCEPTION
            'contract price requires an active contract catalog audience'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

-- Application-facing access helpers are deliberately context bound: callers
-- cannot supply a tenant identifier. Base-table RLS delegates cross-tenant
-- publication reads to these functions.
CREATE OR REPLACE FUNCTION mesh.current_network_account_id_soft()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
    SELECT NULLIF(
        current_setting('app.current_network_account_id', true),
        ''
    )::uuid;
$$;

CREATE OR REPLACE FUNCTION mesh.catalog_is_visible(p_catalog_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, mesh, shared
SET row_security = off
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM mesh.catalog AS catalog
        WHERE catalog.id = p_catalog_id
          AND (
              catalog.tenant_id = shared.current_tenant_id_soft()
              OR (
                  shared.current_tenant_id_soft() IS NOT NULL
                  AND catalog.status = 'published'
                  AND (
                      catalog.valid_from IS NULL
                      OR catalog.valid_from <= CURRENT_DATE
                  )
                  AND (
                      catalog.valid_until IS NULL
                      OR catalog.valid_until >= CURRENT_DATE
                  )
                  AND (
                      catalog.visibility = 'public'
                      OR (
                          catalog.visibility = 'connected'
                          AND EXISTS (
                              SELECT 1
                              FROM mesh.network_relationship AS relationship
                              WHERE relationship.supplier_tenant_id = catalog.tenant_id
                                AND relationship.supplier_account_id = catalog.owner_account_id
                                AND relationship.buyer_tenant_id =
                                    shared.current_tenant_id_soft()
                                AND relationship.buyer_account_id =
                                    mesh.current_network_account_id_soft()
                                AND relationship.status = 'active'
                                AND (
                                    relationship.effective_from IS NULL
                                    OR relationship.effective_from <= CURRENT_DATE
                                )
                                AND (
                                    relationship.effective_until IS NULL
                                    OR relationship.effective_until >= CURRENT_DATE
                                )
                          )
                      )
                      OR (
                          catalog.visibility = 'relationship'
                          AND EXISTS (
                              SELECT 1
                              FROM mesh.catalog_audience AS audience
                              WHERE audience.supplier_tenant_id = catalog.tenant_id
                                AND audience.supplier_account_id = catalog.owner_account_id
                                AND audience.catalog_id = catalog.id
                                AND audience.buyer_tenant_id =
                                    shared.current_tenant_id_soft()
                                AND audience.buyer_account_id =
                                    mesh.current_network_account_id_soft()
                                AND audience.status = 'active'
                                AND (
                                    audience.valid_from IS NULL
                                    OR audience.valid_from <= CURRENT_DATE
                                )
                                AND (
                                    audience.valid_until IS NULL
                                    OR audience.valid_until >= CURRENT_DATE
                                )
                          )
                      )
                  )
              )
          )
    );
$$;

CREATE OR REPLACE FUNCTION mesh.catalog_item_is_visible(p_catalog_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, mesh
SET row_security = off
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM mesh.catalog_item AS item
        WHERE item.id = p_catalog_item_id
          AND mesh.catalog_is_visible(item.catalog_id)
          AND (
              item.tenant_id = shared.current_tenant_id_soft()
              OR item.status = 'published'
          )
    );
$$;

CREATE OR REPLACE FUNCTION mesh.catalog_price_is_visible(p_catalog_price_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, mesh, shared
SET row_security = off
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM mesh.catalog_price AS price
        WHERE price.id = p_catalog_price_id
          AND mesh.catalog_item_is_visible(price.catalog_item_id)
          AND (
              price.network_relationship_id IS NULL
              OR EXISTS (
                  SELECT 1
                  FROM mesh.network_relationship AS relationship
                  WHERE relationship.id = price.network_relationship_id
                    AND (
                        relationship.supplier_tenant_id =
                            shared.current_tenant_id_soft()
                        OR (
                            relationship.buyer_tenant_id =
                                shared.current_tenant_id_soft()
                            AND relationship.buyer_account_id =
                                mesh.current_network_account_id_soft()
                        )
                    )
                    AND relationship.status = 'active'
              )
          )
    );
$$;

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

CREATE OR REPLACE FUNCTION mesh.trg_validate_profile_trade_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
DECLARE
    v_role mesh.network_account_role_d;
BEGIN
    SELECT network_role INTO v_role
      FROM mesh.network_account
     WHERE tenant_id = NEW.tenant_id AND id = NEW.network_account_id;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Network account does not exist'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF (NEW.trade_role = 'supplier' AND v_role NOT IN ('supplier', 'both'))
       OR (NEW.trade_role = 'customer' AND v_role NOT IN ('buyer', 'both')) THEN
        RAISE EXCEPTION 'Trade role % is incompatible with network role %',
            NEW.trade_role, v_role
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_validate_tax_registration_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh, control
AS $$
BEGIN
    NEW.registration_type_code := lower(btrim(NEW.registration_type_code));
    NEW.registration_number := upper(regexp_replace(
        btrim(NEW.registration_number), '\s+', '', 'g'
    ));
    IF NOT control.lookup_value_is_active(
        'mesh.tax_registration_type',
        NEW.registration_type_code,
        NEW.tenant_id
    ) THEN
        RAISE EXCEPTION 'Unknown Mesh tax registration type %',
            NEW.registration_type_code
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_normalize_bank_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
BEGIN
    IF TG_TABLE_NAME = 'bank_party' THEN
        NEW.code := lower(btrim(NEW.code));
        NEW.name := btrim(NEW.name);
        NEW.bic := nullif(upper(regexp_replace(NEW.bic, '\s+', '', 'g')), '');
    ELSE
        NEW.code := nullif(lower(btrim(NEW.code)), '');
        NEW.name := nullif(btrim(NEW.name), '');
        NEW.account_holder_name := btrim(NEW.account_holder_name);
        NEW.account_id_value := upper(regexp_replace(
            NEW.account_id_value, '[^A-Za-z0-9]', '', 'g'
        ));
        NEW.account_last4 := right(NEW.account_id_value, 4);
        NEW.bic_override := nullif(upper(regexp_replace(
            NEW.bic_override, '\s+', '', 'g'
        )), '');
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_guard_bank_account_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.network_account_id IS DISTINCT FROM OLD.network_account_id
       OR NEW.account_id_type IS DISTINCT FROM OLD.account_id_type
       OR (
           EXISTS (
               SELECT 1 FROM mesh.bank_account_link link
                WHERE link.tenant_id = OLD.tenant_id
                  AND link.bank_account_id = OLD.id
           )
           AND NEW.account_id_value IS DISTINCT FROM OLD.account_id_value
       )
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Linked Mesh bank-account identity is immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_validate_bank_disclosure()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
DECLARE
    v_relationship mesh.network_relationship%ROWTYPE;
BEGIN
    SELECT * INTO v_relationship
      FROM mesh.network_relationship
     WHERE id = NEW.network_relationship_id
       AND status = 'active';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bank disclosure requires an active relationship'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.purpose = 'settlement' THEN
        IF (NEW.owner_tenant_id, NEW.owner_account_id,
            NEW.recipient_tenant_id, NEW.recipient_account_id)
           IS DISTINCT FROM
           (v_relationship.supplier_tenant_id, v_relationship.supplier_account_id,
            v_relationship.buyer_tenant_id, v_relationship.buyer_account_id) THEN
            RAISE EXCEPTION 'Settlement account must be disclosed supplier-to-buyer'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        IF (NEW.owner_tenant_id, NEW.owner_account_id,
            NEW.recipient_tenant_id, NEW.recipient_account_id)
           IS DISTINCT FROM
           (v_relationship.buyer_tenant_id, v_relationship.buyer_account_id,
            v_relationship.supplier_tenant_id, v_relationship.supplier_account_id) THEN
            RAISE EXCEPTION 'Refund account must be disclosed buyer-to-supplier'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_guard_bank_disclosure()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.owner_tenant_id IS DISTINCT FROM OLD.owner_tenant_id
       OR NEW.owner_account_id IS DISTINCT FROM OLD.owner_account_id
       OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id
       OR NEW.network_relationship_id IS DISTINCT FROM OLD.network_relationship_id
       OR NEW.recipient_tenant_id IS DISTINCT FROM OLD.recipient_tenant_id
       OR NEW.recipient_account_id IS DISTINCT FROM OLD.recipient_account_id
       OR NEW.purpose IS DISTINCT FROM OLD.purpose
       OR NEW.disclosed_at IS DISTINCT FROM OLD.disclosed_at
       OR NEW.disclosed_by IS DISTINCT FROM OLD.disclosed_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Mesh bank-disclosure coordinates and evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status <> 'active' AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Terminal bank disclosure cannot transition'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'revoked'
       AND (NEW.revoked_at IS NULL OR NEW.revoked_by IS NULL) THEN
        RAISE EXCEPTION 'Revocation requires evidence'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_validate_certification_type_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_type_tenant_id uuid;
BEGIN
  IF NEW.certification_type_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id INTO v_type_tenant_id
    FROM mesh.certification_type
   WHERE id = NEW.certification_type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown certification type: %', NEW.certification_type_id
      USING ERRCODE = '23503';
  END IF;
  IF v_type_tenant_id IS NOT NULL AND v_type_tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Certification type % belongs to another tenant',
      NEW.certification_type_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION mesh.trg_guard_network_lifecycle() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,mesh AS $$
DECLARE v_profile text:=TG_ARGV[0]; v_old text:=OLD.status::text; v_new text:=NEW.status::text; v_allowed boolean;
BEGIN
  IF v_old=v_new THEN RETURN NEW; END IF;
  v_allowed:=CASE v_profile
    WHEN 'account' THEN (v_old='pending' AND v_new IN ('active','retired')) OR (v_old='active' AND v_new IN ('suspended','retired')) OR (v_old='suspended' AND v_new IN ('active','retired'))
    WHEN 'relationship' THEN (v_old='requested' AND v_new IN ('active','terminated')) OR (v_old='active' AND v_new IN ('suspended','terminated')) OR (v_old='suspended' AND v_new IN ('active','terminated'))
    ELSE false END;
  IF NOT v_allowed THEN RAISE EXCEPTION 'INVALID_NETWORK_LIFECYCLE: % -> %',v_old,v_new USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION mesh.trg_record_network_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,mesh AS $$
DECLARE v_kind text:=TG_ARGV[0]; v_sequence bigint; v_owner uuid; v_counterparty uuid; v_actor uuid; v_from text;
BEGIN
  IF TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF v_kind='network_account' THEN v_owner:=NEW.tenant_id; v_counterparty:=NULL;
  ELSE v_owner:=NEW.buyer_tenant_id; v_counterparty:=NEW.supplier_tenant_id; END IF;
  v_actor:=COALESCE(NEW.status_changed_by,NEW.updated_by,NEW.created_by);
  v_from:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.status::text END;
  SELECT COALESCE(max(sequence_no),0)+1 INTO v_sequence FROM mesh.network_lifecycle_event WHERE resource_kind=v_kind AND resource_id=NEW.id;
  INSERT INTO mesh.network_lifecycle_event(resource_kind,resource_id,owner_tenant_id,counterparty_tenant_id,sequence_no,event_kind,from_status,to_status,recorded_by,evidence)
  VALUES(v_kind,NEW.id,v_owner,v_counterparty,v_sequence,CASE WHEN TG_OP='INSERT' THEN 'created' ELSE NEW.status::text END,v_from,NEW.status::text,v_actor,jsonb_build_object('source_table',TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION mesh.fn_upsert_network_scope(
  p_tenant_id uuid,p_kind authz.scope_kind_d,p_target_id uuid,p_parent_target_id uuid,p_scope_key text,p_display_name text,p_status authz.scope_status_d,p_actor uuid,p_authority_table text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,authz AS $$
DECLARE v_parent uuid; v_id uuid;
BEGIN
  SELECT id INTO v_parent FROM authz.scope_target WHERE tenant_id=p_tenant_id AND target_id=p_parent_target_id AND scope_kind=CASE WHEN p_kind='network_account' THEN 'tenant'::authz.scope_kind_d ELSE 'network_account'::authz.scope_kind_d END;
  IF v_parent IS NULL AND p_kind='network_account' THEN
    INSERT INTO authz.scope_target(id,tenant_id,scope_kind,scope_key,target_id,parent_scope_target_id,display_name,metadata,status,created_by)
    SELECT md5(p_tenant_id::text||':scope:tenant')::uuid,p_tenant_id,'tenant',p_tenant_id::text,p_tenant_id,NULL,t.display_name,jsonb_build_object('authority_table','master.tenant'),'active',p_actor
      FROM master.tenant t WHERE t.id=p_tenant_id RETURNING id INTO v_parent;
  END IF;
  IF v_parent IS NULL THEN RAISE EXCEPTION 'PARENT_SCOPE_TARGET_REQUIRED' USING ERRCODE='foreign_key_violation'; END IF;
  INSERT INTO authz.scope_target(id,tenant_id,scope_kind,scope_key,target_id,parent_scope_target_id,display_name,metadata,status,created_by)
  VALUES(md5(p_tenant_id::text||':scope:'||replace(p_kind::text,'_','-')||':'||p_target_id::text)::uuid,p_tenant_id,p_kind,p_scope_key,p_target_id,v_parent,p_display_name,jsonb_build_object('authority_table',p_authority_table),p_status,p_actor)
  ON CONFLICT(tenant_id,scope_kind,target_id) DO UPDATE SET parent_scope_target_id=EXCLUDED.parent_scope_target_id,display_name=EXCLUDED.display_name,metadata=EXCLUDED.metadata,status=EXCLUDED.status,updated_by=p_actor
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION mesh.trg_sync_network_account_scope() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,mesh,authz,event AS $$
DECLARE v_status authz.scope_status_d; v_scope uuid; v_actor uuid;
BEGIN
  v_actor:=COALESCE(NEW.updated_by,NEW.status_changed_by,NEW.created_by);
  v_status:=CASE WHEN NEW.status='active' THEN 'active'::authz.scope_status_d WHEN NEW.status='retired' THEN 'retired'::authz.scope_status_d ELSE 'suspended'::authz.scope_status_d END;
  v_scope:=mesh.fn_upsert_network_scope(NEW.tenant_id,'network_account',NEW.id,NEW.tenant_id,NEW.account_code,NEW.display_name,v_status,v_actor,'mesh.network_account');
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION mesh.trg_sync_network_relationship_scopes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,mesh,authz,event AS $$
DECLARE v_status authz.scope_status_d; v_buyer_scope uuid; v_supplier_scope uuid; v_actor uuid; v_label text;
BEGIN
  v_actor:=COALESCE(NEW.updated_by,NEW.status_changed_by,NEW.created_by);
  v_status:=CASE WHEN NEW.status='active' THEN 'active'::authz.scope_status_d WHEN NEW.status='terminated' THEN 'retired'::authz.scope_status_d ELSE 'suspended'::authz.scope_status_d END;
  v_label:='Relationship '||NEW.buyer_account_id::text||' / '||NEW.supplier_account_id::text;
  v_buyer_scope:=mesh.fn_upsert_network_scope(NEW.buyer_tenant_id,'network_relationship',NEW.id,NEW.buyer_account_id,'network_relationship:'||NEW.id::text,v_label,v_status,v_actor,'mesh.network_relationship');
  v_supplier_scope:=mesh.fn_upsert_network_scope(NEW.supplier_tenant_id,'network_relationship',NEW.id,NEW.supplier_account_id,'network_relationship:'||NEW.id::text,v_label,v_status,v_actor,'mesh.network_relationship');
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION mesh.trg_reject_network_lifecycle_event_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'network_lifecycle_event is append-only' USING ERRCODE='integrity_constraint_violation'; END $$;
