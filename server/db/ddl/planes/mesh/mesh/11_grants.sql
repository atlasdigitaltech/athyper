REVOKE ALL ON SCHEMA mesh FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA mesh FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA mesh FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA mesh TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON
            mesh.network_account,
            mesh.network_account_identifier,
            mesh.network_account_reference,
            mesh.network_relationship,
            mesh.catalog,
            mesh.catalog_item,
            mesh.catalog_item_identifier,
            mesh.catalog_item_classification,
            mesh.catalog_item_uom,
            mesh.catalog_audience,
            mesh.catalog_price,
            mesh.catalog_availability
        TO athyperapp;
        GRANT SELECT ON
            mesh.current_tenant_network_account,
            mesh.current_tenant_network_relationship,
            mesh.visible_catalog,
            mesh.visible_catalog_item,
            mesh.visible_catalog_price
        TO athyperapp;
        GRANT EXECUTE ON FUNCTION
            mesh.current_network_account_id_soft(),
            mesh.catalog_is_visible(uuid),
            mesh.catalog_item_is_visible(uuid),
            mesh.catalog_price_is_visible(uuid)
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA mesh TO athyperadmin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA mesh TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA mesh TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON
    mesh.document_envelope,
    mesh.document_payload,
    mesh.document_event,
    mesh.document_acknowledgement,
    mesh.document_business_status_projection
FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION
    mesh.trg_validate_document_envelope(),
    mesh.trg_guard_document_envelope(),
    mesh.trg_guard_document_payload(),
    mesh.trg_guard_append_only_document_child(),
    mesh.trg_validate_document_child_participant(),
    mesh.trg_guard_document_business_status_projection()
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON mesh.document_envelope TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON mesh.document_payload TO athyperapp;
        GRANT SELECT, INSERT ON
            mesh.document_event,
            mesh.document_acknowledgement
        TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON mesh.document_business_status_projection TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            mesh.document_envelope,
            mesh.document_payload,
            mesh.document_event,
            mesh.document_acknowledgement,
            mesh.document_business_status_projection
        TO athyperadmin;
        GRANT EXECUTE ON FUNCTION
            mesh.trg_validate_document_envelope(),
            mesh.trg_guard_document_envelope(),
            mesh.trg_guard_document_payload(),
            mesh.trg_guard_append_only_document_child(),
            mesh.trg_validate_document_child_participant(),
            mesh.trg_guard_document_business_status_projection()
        TO athyperadmin;
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON
            mesh.network_account_profile,
            mesh.network_account_commodity_capability,
            mesh.network_account_industry_classification,
            mesh.network_account_tax_registration,
            mesh.bank_account_link,
            mesh.bank_account_disclosure,
            mesh.bank_account_disclosure_event
        TO athyperapp;
        GRANT SELECT, INSERT ON mesh.network_account_profile_publication,mesh.network_account_profile_publication_event TO athyperapp;
        GRANT EXECUTE ON FUNCTION mesh.profile_publication_payload_is_safe(jsonb),mesh.profile_publication_is_visible(uuid),mesh.lock_profile_publication_relationship(uuid,uuid,uuid) TO athyperapp;
        GRANT INSERT, UPDATE ON mesh.bank_account TO athyperapp;
        GRANT SELECT (
            id, tenant_id, network_account_id, code, name, bank_institution_id, bank_branch_id, provisional_bank_reference_id,
            account_holder_name, account_id_type, account_last4,
            currency_code, bic_override, bank_name_override,
            bank_country_override, provider_account_ref,
            is_verified, verified_at, verified_by, verification_method,
            metadata, status, is_active, status_changed_at,
            status_changed_by, created_at, created_by, updated_at, updated_by
        ) ON mesh.bank_account TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            mesh.network_account_profile,
            mesh.network_account_commodity_capability,
            mesh.network_account_industry_classification,
            mesh.network_account_tax_registration,
            mesh.bank_account,
            mesh.bank_account_link,
            mesh.bank_account_disclosure,
            mesh.bank_account_disclosure_event
        TO athyperadmin;
    END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON mesh.certification_type, mesh.certification TO athyperapp;
GRANT ALL PRIVILEGES
  ON mesh.certification_type, mesh.certification TO athyperadmin;
GRANT EXECUTE
  ON FUNCTION mesh.trg_validate_certification_type_scope()
  TO athyperapp, athyperadmin;


REVOKE ALL ON mesh.network_lifecycle_event FROM PUBLIC;
REVOKE ALL ON FUNCTION mesh.trg_guard_network_lifecycle(),mesh.trg_record_network_lifecycle(),mesh.fn_upsert_network_scope(uuid,authz.scope_kind_d,uuid,uuid,text,text,authz.scope_status_d,uuid,text),mesh.trg_sync_network_account_scope(),mesh.trg_sync_network_relationship_scopes(),mesh.trg_reject_network_lifecycle_event_mutation() FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT ON mesh.network_lifecycle_event TO athyperapp; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL PRIVILEGES ON mesh.network_lifecycle_event TO athyperadmin; END IF;
END $$;
-- Mesh exchange-integrity hardening. This layer intentionally follows grants
-- and reference seeds so it can replace legacy table-centric mutation rights
-- with command-owned, versioned, and idempotent contracts.

DO $preflight$
DECLARE v_oversized bigint; v_price_overlap bigint;
BEGIN
  SELECT sum(issue_count) INTO v_oversized FROM (
    SELECT count(*) AS issue_count FROM mesh.network_account
      WHERE pg_column_size(capabilities)>16384 OR pg_column_size(metadata)>16384
    UNION ALL SELECT count(*) FROM mesh.network_relationship WHERE pg_column_size(metadata)>16384
    UNION ALL SELECT count(*) FROM mesh.catalog WHERE pg_column_size(metadata)>16384
    UNION ALL SELECT count(*) FROM mesh.catalog_item WHERE pg_column_size(metadata)>16384
    UNION ALL SELECT count(*) FROM mesh.catalog_audience WHERE pg_column_size(metadata)>8192
    UNION ALL SELECT count(*) FROM mesh.catalog_price WHERE pg_column_size(metadata)>8192
    UNION ALL SELECT count(*) FROM mesh.catalog_availability WHERE pg_column_size(metadata)>8192
    UNION ALL SELECT count(*) FROM mesh.document_envelope WHERE pg_column_size(metadata)>16384
    UNION ALL SELECT count(*) FROM mesh.document_payload WHERE pg_column_size(metadata)>16384
    UNION ALL SELECT count(*) FROM mesh.document_event WHERE pg_column_size(event_payload)>32768
    UNION ALL SELECT count(*) FROM mesh.document_acknowledgement WHERE pg_column_size(metadata)>8192
    UNION ALL SELECT count(*) FROM mesh.network_lifecycle_event WHERE pg_column_size(evidence)>16384
    UNION ALL SELECT count(*) FROM mesh.certification_type WHERE pg_column_size(metadata)>16384
    UNION ALL SELECT count(*) FROM mesh.certification WHERE pg_column_size(metadata)>16384
  ) issues;
  IF v_oversized > 0 THEN
    RAISE EXCEPTION
      'Mesh hardening preflight: % rows exceed governed JSON limits; run the exception query in this migration and remediate before retrying',
      v_oversized USING ERRCODE='program_limit_exceeded';
  END IF;

  SELECT count(*) INTO v_price_overlap
    FROM mesh.catalog_price left_price
    JOIN mesh.catalog_price right_price
      ON left_price.id < right_price.id
     AND left_price.status='active' AND right_price.status='active'
     AND (left_price.tenant_id,left_price.owner_account_id,left_price.catalog_item_id,
          coalesce(left_price.catalog_item_uom_id,'00000000-0000-0000-0000-000000000000'::uuid),
          left_price.price_type,
          coalesce(left_price.network_relationship_id,'00000000-0000-0000-0000-000000000000'::uuid))
       = (right_price.tenant_id,right_price.owner_account_id,right_price.catalog_item_id,
          coalesce(right_price.catalog_item_uom_id,'00000000-0000-0000-0000-000000000000'::uuid),
          right_price.price_type,
          coalesce(right_price.network_relationship_id,'00000000-0000-0000-0000-000000000000'::uuid))
     AND daterange(left_price.effective_from,coalesce(left_price.effective_until+1,'infinity'::date),'[)')
         && daterange(right_price.effective_from,coalesce(right_price.effective_until+1,'infinity'::date),'[)')
     AND numrange(coalesce(left_price.minimum_quantity,0),left_price.maximum_quantity,'[]')
         && numrange(coalesce(right_price.minimum_quantity,0),right_price.maximum_quantity,'[]');
  IF v_price_overlap > 0 THEN
    RAISE EXCEPTION
      'Mesh hardening preflight: % overlapping active catalog-price pairs require retirement or range correction',
      v_price_overlap USING ERRCODE='exclusion_violation';
  END IF;
END
$preflight$;

ALTER TABLE mesh.network_account
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1,
  ADD CONSTRAINT network_account_row_version_chk CHECK (row_version >= 1);

ALTER TABLE mesh.network_relationship
  ADD COLUMN relationship_identity_id uuid,
  ADD COLUMN episode_no integer,
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1,
  ADD CONSTRAINT network_relationship_row_version_chk CHECK (row_version >= 1);

CREATE TABLE mesh.network_relationship_identity (
  id uuid NOT NULL DEFAULT shared.uuidv7(),
  buyer_tenant_id uuid NOT NULL,
  buyer_account_id uuid NOT NULL,
  supplier_tenant_id uuid NOT NULL,
  supplier_account_id uuid NOT NULL,
  relationship_kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by_tenant_id uuid NOT NULL,
  created_by uuid NOT NULL,
  CONSTRAINT network_relationship_identity_pkey PRIMARY KEY (id),
  CONSTRAINT network_relationship_identity_coordinate_uq UNIQUE (
    buyer_account_id, supplier_account_id, relationship_kind
  ),
  CONSTRAINT network_relationship_identity_kind_chk
    CHECK (relationship_kind ~ '^[a-z][a-z0-9_.-]{1,62}$'),
  CONSTRAINT network_relationship_identity_buyer_fk
    FOREIGN KEY (buyer_tenant_id, buyer_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT network_relationship_identity_supplier_fk
    FOREIGN KEY (supplier_tenant_id, supplier_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT network_relationship_identity_created_by_fk
    FOREIGN KEY (created_by_tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT
);

INSERT INTO mesh.network_relationship_identity (
  buyer_tenant_id, buyer_account_id, supplier_tenant_id, supplier_account_id,
  relationship_kind, created_at, created_by_tenant_id, created_by
)
SELECT buyer_tenant_id, buyer_account_id, supplier_tenant_id,
       supplier_account_id, relationship_kind, min(created_at),
       (array_agg(created_by_tenant_id ORDER BY created_at, id))[1],
       (array_agg(created_by ORDER BY created_at, id))[1]
  FROM mesh.network_relationship
 GROUP BY buyer_tenant_id, buyer_account_id, supplier_tenant_id,
          supplier_account_id, relationship_kind;

UPDATE mesh.network_relationship relationship
   SET relationship_identity_id = identity.id
  FROM mesh.network_relationship_identity identity
 WHERE identity.buyer_account_id = relationship.buyer_account_id
   AND identity.supplier_account_id = relationship.supplier_account_id
   AND identity.relationship_kind = relationship.relationship_kind;

WITH numbered AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY relationship_identity_id
           ORDER BY created_at, id
         )::integer AS episode_no
    FROM mesh.network_relationship
)
UPDATE mesh.network_relationship relationship
   SET episode_no = numbered.episode_no
  FROM numbered
 WHERE numbered.id = relationship.id;

UPDATE mesh.network_account account
   SET row_version = greatest(account.row_version, history.last_sequence)
  FROM (
    SELECT resource_id, max(sequence_no) AS last_sequence
      FROM mesh.network_lifecycle_event
     WHERE resource_kind = 'network_account'
     GROUP BY resource_id
  ) history
 WHERE history.resource_id = account.id;

UPDATE mesh.network_relationship relationship
   SET row_version = greatest(relationship.row_version, history.last_sequence)
  FROM (
    SELECT resource_id, max(sequence_no) AS last_sequence
      FROM mesh.network_lifecycle_event
     WHERE resource_kind = 'network_relationship'
     GROUP BY resource_id
  ) history
 WHERE history.resource_id = relationship.id;

ALTER TABLE mesh.network_relationship
  ALTER COLUMN relationship_identity_id SET NOT NULL,
  ALTER COLUMN episode_no SET NOT NULL,
  DROP CONSTRAINT network_relationship_coordinate_uq,
  ADD CONSTRAINT network_relationship_identity_episode_uq
    UNIQUE (relationship_identity_id, episode_no),
  ADD CONSTRAINT network_relationship_identity_fk
    FOREIGN KEY (relationship_identity_id)
    REFERENCES mesh.network_relationship_identity (id) ON DELETE RESTRICT,
  ADD CONSTRAINT network_relationship_episode_chk CHECK (episode_no >= 1),
  ADD CONSTRAINT network_relationship_effective_period_excl
    EXCLUDE USING gist (
      relationship_identity_id WITH =,
      daterange(
        coalesce(effective_from, '-infinity'::date),
        coalesce(effective_until, 'infinity'::date),
        '[)'
      ) WITH &&
    ) WHERE (status IN ('requested', 'active', 'suspended'));

CREATE TABLE mesh.network_command_evidence (
  id uuid NOT NULL DEFAULT shared.uuidv7(),
  actor_tenant_id uuid NOT NULL,
  counterparty_tenant_id uuid,
  aggregate_kind text NOT NULL,
  aggregate_id uuid NOT NULL,
  command_code text NOT NULL,
  from_state text NOT NULL,
  to_state text NOT NULL,
  expected_version bigint NOT NULL,
  resulting_version bigint NOT NULL,
  reason text NOT NULL,
  idempotency_key text NOT NULL,
  command_fingerprint char(64) NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  occurred_by uuid NOT NULL,
  CONSTRAINT network_command_evidence_pkey PRIMARY KEY (id),
  CONSTRAINT network_command_evidence_tenant_id_uq UNIQUE (actor_tenant_id, id),
  CONSTRAINT network_command_evidence_idempotency_uq
    UNIQUE (actor_tenant_id, idempotency_key),
  CONSTRAINT network_command_evidence_version_uq
    UNIQUE (aggregate_kind, aggregate_id, resulting_version),
  CONSTRAINT network_command_evidence_kind_chk CHECK (
    aggregate_kind IN (
      'network_account', 'network_relationship', 'catalog', 'document_envelope'
    )
  ),
  CONSTRAINT network_command_evidence_code_chk
    CHECK (command_code ~ '^[a-z][a-z0-9_.-]{2,126}$'),
  CONSTRAINT network_command_evidence_state_chk CHECK (
    from_state ~ '^[a-z][a-z0-9_.-]{1,62}$'
    AND to_state ~ '^[a-z][a-z0-9_.-]{1,62}$'
    AND from_state <> to_state
  ),
  CONSTRAINT network_command_evidence_version_chk CHECK (
    expected_version >= 0 AND resulting_version = expected_version + 1
  ),
  CONSTRAINT network_command_evidence_reason_chk
    CHECK (length(btrim(reason)) BETWEEN 1 AND 2000),
  CONSTRAINT network_command_evidence_key_chk CHECK (
    btrim(idempotency_key) = idempotency_key
    AND length(idempotency_key) BETWEEN 8 AND 200
  ),
  CONSTRAINT network_command_evidence_fingerprint_chk
    CHECK (command_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT network_command_evidence_payload_chk CHECK (
    jsonb_typeof(evidence) = 'object' AND pg_column_size(evidence) <= 16384
  ),
  CONSTRAINT network_command_evidence_actor_tenant_fk
    FOREIGN KEY (actor_tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
  CONSTRAINT network_command_evidence_counterparty_tenant_fk
    FOREIGN KEY (counterparty_tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
  CONSTRAINT network_command_evidence_actor_fk
    FOREIGN KEY (actor_tenant_id, occurred_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX network_command_evidence_aggregate_idx
  ON mesh.network_command_evidence
     (aggregate_kind, aggregate_id, resulting_version DESC);

CREATE TABLE mesh.catalog_revision (
  id uuid NOT NULL DEFAULT shared.uuidv7(),
  tenant_id uuid NOT NULL,
  catalog_id uuid NOT NULL,
  revision_no integer NOT NULL,
  content_snapshot jsonb NOT NULL,
  content_digest char(64) NOT NULL,
  schema_name text NOT NULL DEFAULT 'mesh.catalog-publication',
  schema_version integer NOT NULL DEFAULT 1,
  effective_from date,
  effective_until date,
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  published_by uuid NOT NULL,
  CONSTRAINT catalog_revision_pkey PRIMARY KEY (id),
  CONSTRAINT catalog_revision_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT catalog_revision_coordinate_uq UNIQUE (tenant_id, catalog_id, revision_no),
  CONSTRAINT catalog_revision_version_chk CHECK (revision_no >= 1 AND schema_version >= 1),
  CONSTRAINT catalog_revision_digest_chk CHECK (content_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT catalog_revision_snapshot_chk CHECK (
    jsonb_typeof(content_snapshot) = 'object'
    AND pg_column_size(content_snapshot) <= 16777216
  ),
  CONSTRAINT catalog_revision_schema_chk
    CHECK (schema_name ~ '^[a-z][a-z0-9_.-]{2,126}$'),
  CONSTRAINT catalog_revision_range_chk
    CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from),
  CONSTRAINT catalog_revision_catalog_fk
    FOREIGN KEY (tenant_id, catalog_id)
    REFERENCES mesh.catalog (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT catalog_revision_published_by_fk
    FOREIGN KEY (tenant_id, published_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE mesh.catalog
  ADD COLUMN current_revision_no integer NOT NULL DEFAULT 0,
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1,
  ADD CONSTRAINT catalog_current_revision_chk CHECK (current_revision_no >= 0),
  ADD CONSTRAINT catalog_row_version_chk CHECK (row_version >= 1);

CREATE OR REPLACE FUNCTION mesh.fn_catalog_publication_snapshot(p_catalog_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, mesh SET row_security = off AS $$
  SELECT jsonb_build_object(
    'catalog', to_jsonb(catalog) - ARRAY['updated_at','updated_by']::text[],
    'items', (SELECT coalesce(jsonb_agg(to_jsonb(value) ORDER BY value.code,value.id),'[]'::jsonb)
                FROM mesh.catalog_item value WHERE value.catalog_id=catalog.id),
    'identifiers', (SELECT coalesce(jsonb_agg(to_jsonb(value) ORDER BY value.catalog_item_id,value.id),'[]'::jsonb)
                      FROM mesh.catalog_item_identifier value
                      JOIN mesh.catalog_item item ON item.id=value.catalog_item_id
                     WHERE item.catalog_id=catalog.id),
    'classifications', (SELECT coalesce(jsonb_agg(to_jsonb(value) ORDER BY value.catalog_item_id,value.id),'[]'::jsonb)
                          FROM mesh.catalog_item_classification value
                          JOIN mesh.catalog_item item ON item.id=value.catalog_item_id
                         WHERE item.catalog_id=catalog.id),
    'unitsOfMeasure', (SELECT coalesce(jsonb_agg(to_jsonb(value) ORDER BY value.catalog_item_id,value.id),'[]'::jsonb)
                         FROM mesh.catalog_item_uom value
                         JOIN mesh.catalog_item item ON item.id=value.catalog_item_id
                        WHERE item.catalog_id=catalog.id),
    'audiences', (SELECT coalesce(jsonb_agg(to_jsonb(value) ORDER BY value.id),'[]'::jsonb)
                    FROM mesh.catalog_audience value WHERE value.catalog_id=catalog.id),
    'prices', (SELECT coalesce(jsonb_agg(to_jsonb(value) ORDER BY value.catalog_item_id,value.id),'[]'::jsonb)
                 FROM mesh.catalog_price value
                 JOIN mesh.catalog_item item ON item.id=value.catalog_item_id
                WHERE item.catalog_id=catalog.id),
    'availability', (SELECT coalesce(jsonb_agg(to_jsonb(value) ORDER BY value.catalog_item_id,value.id),'[]'::jsonb)
                       FROM mesh.catalog_availability value
                       JOIN mesh.catalog_item item ON item.id=value.catalog_item_id
                      WHERE item.catalog_id=catalog.id)
  ) FROM mesh.catalog catalog WHERE catalog.id=p_catalog_id
$$;

INSERT INTO mesh.catalog_revision(
  tenant_id,catalog_id,revision_no,content_snapshot,content_digest,
  effective_from,effective_until,published_at,published_by
)
SELECT catalog.tenant_id,catalog.id,1,snapshot.value,
       encode(public.digest(convert_to(snapshot.value::text,'UTF8'),'sha256'),'hex'),
       catalog.valid_from,catalog.valid_until,catalog.published_at,catalog.published_by
  FROM mesh.catalog catalog
 CROSS JOIN LATERAL (
   SELECT mesh.fn_catalog_publication_snapshot(catalog.id) AS value
 ) snapshot
 WHERE catalog.status='published';

UPDATE mesh.catalog SET current_revision_no=1 WHERE status='published';

ALTER TABLE mesh.document_envelope
  ADD COLUMN request_fingerprint char(64),
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1;

UPDATE mesh.document_envelope
   SET request_fingerprint = encode(public.digest(convert_to(jsonb_build_object(
         'senderTenantId', sender_tenant_id,
         'senderAccountId', sender_account_id,
         'receiverTenantId', receiver_tenant_id,
         'receiverAccountId', receiver_account_id,
         'entityVersionId', entity_version_id,
         'entityContractHash', entity_contract_hash,
         'idempotencyKey', idempotency_key
       )::text, 'UTF8'), 'sha256'), 'hex')
 WHERE request_fingerprint IS NULL;

ALTER TABLE mesh.document_envelope
  ALTER COLUMN request_fingerprint SET NOT NULL,
  ADD CONSTRAINT document_envelope_fingerprint_chk
    CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT document_envelope_row_version_chk CHECK (row_version >= 1);

-- Govern the flexible extension surfaces. Typed/searchable authority remains in
-- columns; these limits prevent metadata from becoming an unbounded side store.
ALTER TABLE mesh.network_account
  ADD CONSTRAINT network_account_capabilities_size_chk CHECK (pg_column_size(capabilities) <= 16384),
  ADD CONSTRAINT network_account_metadata_size_chk CHECK (pg_column_size(metadata) <= 16384);
ALTER TABLE mesh.network_relationship
  ADD CONSTRAINT network_relationship_metadata_size_chk CHECK (pg_column_size(metadata) <= 16384);
ALTER TABLE mesh.catalog
  ADD CONSTRAINT catalog_metadata_size_chk CHECK (pg_column_size(metadata) <= 16384);
ALTER TABLE mesh.catalog_item
  ADD CONSTRAINT catalog_item_metadata_size_chk CHECK (pg_column_size(metadata) <= 16384);
ALTER TABLE mesh.catalog_audience
  ADD CONSTRAINT catalog_audience_metadata_size_chk CHECK (pg_column_size(metadata) <= 8192);
ALTER TABLE mesh.catalog_price
  ADD CONSTRAINT catalog_price_metadata_size_chk CHECK (pg_column_size(metadata) <= 8192),
  ADD CONSTRAINT catalog_price_effective_quantity_excl
    EXCLUDE USING gist (
      tenant_id WITH =,
      owner_account_id WITH =,
      catalog_item_id WITH =,
      coalesce(catalog_item_uom_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
      price_type WITH =,
      coalesce(network_relationship_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
      daterange(effective_from, coalesce(effective_until + 1, 'infinity'::date), '[)') WITH &&,
      numrange(coalesce(minimum_quantity, 0), maximum_quantity, '[]') WITH &&
    ) WHERE (status = 'active');
ALTER TABLE mesh.catalog_availability
  ADD CONSTRAINT catalog_availability_metadata_size_chk CHECK (pg_column_size(metadata) <= 8192);
ALTER TABLE mesh.document_envelope
  ADD CONSTRAINT document_envelope_metadata_size_chk CHECK (pg_column_size(metadata) <= 16384);
ALTER TABLE mesh.document_payload
  ADD CONSTRAINT document_payload_metadata_size_chk CHECK (pg_column_size(metadata) <= 16384);
ALTER TABLE mesh.document_event
  ADD CONSTRAINT document_event_payload_size_chk CHECK (pg_column_size(event_payload) <= 32768);
ALTER TABLE mesh.document_acknowledgement
  ADD CONSTRAINT document_acknowledgement_metadata_size_chk CHECK (pg_column_size(metadata) <= 8192);
ALTER TABLE mesh.network_lifecycle_event
  ADD CONSTRAINT network_lifecycle_event_evidence_size_chk CHECK (pg_column_size(evidence) <= 16384);
ALTER TABLE mesh.certification_type
  ADD CONSTRAINT certification_type_metadata_size_chk CHECK (pg_column_size(metadata) <= 16384);
ALTER TABLE mesh.certification
  ADD CONSTRAINT certification_metadata_size_chk CHECK (pg_column_size(metadata) <= 16384);

CREATE OR REPLACE FUNCTION mesh.trg_reject_immutable_exchange_evidence()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION '% is immutable evidence', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_enforce_network_command()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, mesh AS $$
DECLARE
  v_evidence_id uuid;
  v_kind text := CASE TG_TABLE_NAME
    WHEN 'network_account' THEN 'network_account'
    WHEN 'network_relationship' THEN 'network_relationship'
    WHEN 'catalog' THEN 'catalog'
    ELSE 'document_envelope'
  END;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.row_version IS NOT DISTINCT FROM OLD.row_version THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_evidence_id := nullif(current_setting('app.mesh_command_evidence_id', true), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_evidence_id := NULL;
  END;
  IF v_evidence_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM mesh.network_command_evidence evidence
     WHERE evidence.id = v_evidence_id
       AND evidence.aggregate_kind = v_kind
       AND evidence.aggregate_id = NEW.id
       AND evidence.from_state = OLD.status::text
       AND evidence.to_state = NEW.status::text
       AND evidence.expected_version = OLD.row_version
       AND evidence.resulting_version = NEW.row_version
  ) THEN
    RAISE EXCEPTION 'mesh.%.status requires its command function', TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_guard_network_identity_coordinates()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_TABLE_NAME = 'network_account' THEN
    IF (NEW.id, NEW.tenant_id, NEW.created_at, NEW.created_by)
       IS DISTINCT FROM
       (OLD.id, OLD.tenant_id, OLD.created_at, OLD.created_by) THEN
      RAISE EXCEPTION 'mesh.network_account identity coordinates are immutable'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  ELSIF TG_TABLE_NAME = 'network_relationship' THEN
    IF (NEW.id, NEW.buyer_tenant_id, NEW.buyer_account_id,
        NEW.supplier_tenant_id, NEW.supplier_account_id,
        NEW.relationship_kind, NEW.relationship_identity_id, NEW.episode_no,
        NEW.created_by_tenant_id, NEW.created_at, NEW.created_by)
       IS DISTINCT FROM
       (OLD.id, OLD.buyer_tenant_id, OLD.buyer_account_id,
        OLD.supplier_tenant_id, OLD.supplier_account_id,
        OLD.relationship_kind, OLD.relationship_identity_id, OLD.episode_no,
        OLD.created_by_tenant_id, OLD.created_at, OLD.created_by) THEN
      RAISE EXCEPTION 'mesh.network_relationship identity coordinates are immutable'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_record_network_lifecycle()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, mesh AS $$
DECLARE
  v_kind text := TG_ARGV[0];
  v_owner uuid;
  v_counterparty uuid;
  v_actor uuid;
  v_from text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF v_kind = 'network_account' THEN
    v_owner := NEW.tenant_id;
  ELSE
    v_owner := NEW.buyer_tenant_id;
    v_counterparty := NEW.supplier_tenant_id;
  END IF;
  v_actor := coalesce(NEW.status_changed_by, NEW.updated_by, NEW.created_by);
  v_from := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status::text END;
  INSERT INTO mesh.network_lifecycle_event (
    resource_kind, resource_id, owner_tenant_id, counterparty_tenant_id,
    sequence_no, event_kind, from_status, to_status, recorded_by, evidence
  ) VALUES (
    v_kind, NEW.id, v_owner, v_counterparty, NEW.row_version,
    CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE NEW.status::text END,
    v_from, NEW.status::text, v_actor,
    jsonb_build_object('source_table', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
                       'rowVersion', NEW.row_version)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.fn_record_network_command(
  p_actor_tenant_id uuid, p_counterparty_tenant_id uuid,
  p_aggregate_kind text, p_aggregate_id uuid, p_command_code text,
  p_from_state text, p_to_state text, p_expected_version bigint,
  p_reason text, p_idempotency_key text, p_command_fingerprint text,
  p_evidence jsonb, p_actor_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, mesh, event, audit, shared AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO mesh.network_command_evidence (
    actor_tenant_id, counterparty_tenant_id, aggregate_kind, aggregate_id,
    command_code, from_state, to_state, expected_version, resulting_version,
    reason, idempotency_key, command_fingerprint, evidence, occurred_by
  ) VALUES (
    p_actor_tenant_id, p_counterparty_tenant_id, p_aggregate_kind, p_aggregate_id,
    p_command_code, p_from_state, p_to_state, p_expected_version, p_expected_version + 1,
    p_reason, p_idempotency_key, p_command_fingerprint,
    coalesce(p_evidence, '{}'::jsonb), p_actor_id
  ) RETURNING id INTO v_id;

  INSERT INTO event.outbox (
    tenant_id, topic, event_type, event_key, entity_type, entity_id,
    aggregate_type, aggregate_id, event_version, actor_id, source,
    payload, created_by
  ) VALUES (
    p_actor_tenant_id, 'mesh-network',
    'mesh.' || p_aggregate_kind || '.' || p_to_state,
    'mesh-command:' || v_id::text, p_aggregate_kind, p_aggregate_id,
    p_aggregate_kind, p_aggregate_id,
    least(p_expected_version + 1, 2147483647)::integer,
    p_actor_id, 'mesh.ddl',
    jsonb_build_object(
      'evidenceId', v_id, 'aggregateKind', p_aggregate_kind,
      'aggregateId', p_aggregate_id, 'commandCode', p_command_code,
      'fromState', p_from_state, 'toState', p_to_state,
      'rowVersion', p_expected_version + 1,
      'counterpartyTenantId', p_counterparty_tenant_id,
      'commandFingerprint', p_command_fingerprint
    ), p_actor_id
  );

  PERFORM audit.append_event(
    p_event_code => 'action.mesh_command',
    p_operation => 'execute',
    p_entity_type => p_aggregate_kind,
    p_entity_id => p_aggregate_id,
    p_context => jsonb_build_object(
      'evidenceId', v_id, 'commandCode', p_command_code,
      'fromState', p_from_state, 'toState', p_to_state,
      'rowVersion', p_expected_version + 1,
      'counterpartyTenantId', p_counterparty_tenant_id
    )
  );
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.command_network_account_lifecycle(
  p_account_id uuid, p_to_state text, p_expected_version bigint,
  p_reason text, p_idempotency_key text, p_actor_id uuid
) RETURNS TABLE (
  account_id uuid, status text, row_version bigint, evidence_id uuid, replayed boolean
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, mesh, shared AS $$
DECLARE
  v_account mesh.network_account%ROWTYPE;
  v_existing mesh.network_command_evidence%ROWTYPE;
  v_tenant_id uuid := shared.current_tenant_id();
  v_fingerprint text;
  v_evidence_id uuid;
  v_valid boolean;
BEGIN
  IF master.current_principal_id_soft() IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Mesh account command actor does not match session context'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF length(btrim(p_reason)) NOT BETWEEN 1 AND 2000
     OR btrim(p_idempotency_key) <> p_idempotency_key
     OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'Invalid Mesh account command' USING ERRCODE = 'check_violation';
  END IF;
  v_fingerprint := encode(public.digest(convert_to(jsonb_build_object(
    'accountId', p_account_id, 'toState', p_to_state,
    'expectedVersion', p_expected_version, 'reason', p_reason,
    'idempotencyKey', p_idempotency_key, 'actorId', p_actor_id
  )::text, 'UTF8'), 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant_id::text || ':mesh:' || p_idempotency_key, 0));
  SELECT * INTO v_existing FROM mesh.network_command_evidence
   WHERE actor_tenant_id = v_tenant_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.command_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'Mesh idempotency key was reused with a different command'
        USING ERRCODE = 'unique_violation';
    END IF;
    RETURN QUERY SELECT v_existing.aggregate_id, v_existing.to_state,
                        v_existing.resulting_version, v_existing.id, true;
    RETURN;
  END IF;
  SELECT * INTO v_account FROM mesh.network_account
   WHERE tenant_id = v_tenant_id AND id = p_account_id FOR UPDATE;
  IF NOT FOUND OR v_account.row_version <> p_expected_version THEN RETURN; END IF;
  v_valid :=
    (v_account.status = 'pending' AND p_to_state IN ('active', 'retired'))
    OR (v_account.status = 'active' AND p_to_state IN ('suspended', 'retired'))
    OR (v_account.status = 'suspended' AND p_to_state IN ('active', 'retired'));
  IF NOT v_valid THEN
    RAISE EXCEPTION 'Invalid network account transition: % -> %', v_account.status, p_to_state
      USING ERRCODE = 'check_violation';
  END IF;
  v_evidence_id := mesh.fn_record_network_command(
    v_tenant_id, NULL, 'network_account', p_account_id,
    'account_' || p_to_state, v_account.status::text, p_to_state,
    p_expected_version, p_reason, p_idempotency_key, v_fingerprint,
    '{}'::jsonb, p_actor_id
  );
  PERFORM set_config('app.mesh_command_evidence_id', v_evidence_id::text, true);
  UPDATE mesh.network_account AS target
     SET status = p_to_state::mesh.network_account_status_d,
         row_version = target.row_version + 1, updated_by = p_actor_id
   WHERE id = p_account_id AND tenant_id = v_tenant_id;
  PERFORM set_config('app.mesh_command_evidence_id', '', true);
  RETURN QUERY SELECT p_account_id, p_to_state, p_expected_version + 1, v_evidence_id, false;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.command_request_network_relationship(
  p_buyer_tenant_id uuid, p_buyer_account_id uuid,
  p_supplier_tenant_id uuid, p_supplier_account_id uuid,
  p_relationship_kind text, p_effective_from date, p_effective_until date,
  p_reason text, p_idempotency_key text, p_actor_id uuid
) RETURNS TABLE (
  relationship_id uuid, status text, row_version bigint, evidence_id uuid, replayed boolean
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, mesh, shared AS $$
DECLARE
  v_actor_tenant_id uuid := shared.current_tenant_id();
  v_actor_account_id uuid := mesh.current_network_account_id_soft();
  v_identity_id uuid;
  v_episode_no integer;
  v_relationship_id uuid := shared.uuidv7();
  v_existing mesh.network_command_evidence%ROWTYPE;
  v_fingerprint text;
  v_evidence_id uuid;
  v_counterparty_tenant_id uuid;
BEGIN
  IF master.current_principal_id_soft() IS DISTINCT FROM p_actor_id
     OR v_actor_tenant_id NOT IN (p_buyer_tenant_id, p_supplier_tenant_id)
     OR v_actor_account_id IS DISTINCT FROM (CASE
          WHEN v_actor_tenant_id = p_buyer_tenant_id THEN p_buyer_account_id
          ELSE p_supplier_account_id END) THEN
    RAISE EXCEPTION 'Relationship requester is not the current participant'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_buyer_tenant_id = p_supplier_tenant_id
     OR p_buyer_account_id = p_supplier_account_id
     OR p_relationship_kind !~ '^[a-z][a-z0-9_.-]{1,62}$'
     OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000
     OR btrim(p_idempotency_key) <> p_idempotency_key
     OR length(p_idempotency_key) NOT BETWEEN 8 AND 200
     OR (p_effective_until IS NOT NULL AND p_effective_from IS NOT NULL
         AND p_effective_until <= p_effective_from) THEN
    RAISE EXCEPTION 'Invalid relationship request' USING ERRCODE = 'check_violation';
  END IF;
  v_counterparty_tenant_id := CASE
    WHEN v_actor_tenant_id = p_buyer_tenant_id THEN p_supplier_tenant_id
    ELSE p_buyer_tenant_id END;
  v_fingerprint := encode(public.digest(convert_to(jsonb_build_object(
    'buyerTenantId', p_buyer_tenant_id, 'buyerAccountId', p_buyer_account_id,
    'supplierTenantId', p_supplier_tenant_id, 'supplierAccountId', p_supplier_account_id,
    'relationshipKind', p_relationship_kind, 'effectiveFrom', p_effective_from,
    'effectiveUntil', p_effective_until, 'reason', p_reason,
    'idempotencyKey', p_idempotency_key, 'actorId', p_actor_id
  )::text, 'UTF8'), 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor_tenant_id::text || ':mesh:' || p_idempotency_key, 0));
  SELECT * INTO v_existing FROM mesh.network_command_evidence
   WHERE actor_tenant_id = v_actor_tenant_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.command_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'Mesh idempotency key was reused with a different command'
        USING ERRCODE = 'unique_violation';
    END IF;
    RETURN QUERY SELECT v_existing.aggregate_id, v_existing.to_state,
                        v_existing.resulting_version, v_existing.id, true;
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_buyer_account_id::text || ':' || p_supplier_account_id::text || ':' || p_relationship_kind, 0));
  INSERT INTO mesh.network_relationship_identity (
    buyer_tenant_id, buyer_account_id, supplier_tenant_id, supplier_account_id,
    relationship_kind, created_by_tenant_id, created_by
  ) VALUES (
    p_buyer_tenant_id, p_buyer_account_id, p_supplier_tenant_id,
    p_supplier_account_id, p_relationship_kind, v_actor_tenant_id, p_actor_id
  ) ON CONFLICT (buyer_account_id, supplier_account_id, relationship_kind)
    DO UPDATE SET relationship_kind = EXCLUDED.relationship_kind
  RETURNING id INTO v_identity_id;
  SELECT coalesce(max(episode_no), 0) + 1 INTO v_episode_no
    FROM mesh.network_relationship WHERE relationship_identity_id = v_identity_id;
  INSERT INTO mesh.network_relationship (
    id, buyer_tenant_id, buyer_account_id, supplier_tenant_id,
    supplier_account_id, relationship_kind, effective_from, effective_until,
    status, created_by_tenant_id, created_by,
    relationship_identity_id, episode_no, row_version
  ) VALUES (
    v_relationship_id, p_buyer_tenant_id, p_buyer_account_id, p_supplier_tenant_id,
    p_supplier_account_id, p_relationship_kind, p_effective_from, p_effective_until,
    'requested', v_actor_tenant_id, p_actor_id, v_identity_id, v_episode_no, 1
  );
  v_evidence_id := mesh.fn_record_network_command(
    v_actor_tenant_id, v_counterparty_tenant_id, 'network_relationship',
    v_relationship_id, 'relationship_request', 'none', 'requested', 0,
    p_reason, p_idempotency_key, v_fingerprint,
    jsonb_build_object('relationshipIdentityId', v_identity_id, 'episodeNo', v_episode_no),
    p_actor_id
  );
  RETURN QUERY SELECT v_relationship_id, 'requested'::text, 1::bigint, v_evidence_id, false;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.command_network_relationship_lifecycle(
  p_relationship_id uuid, p_action text, p_expected_version bigint,
  p_reason text, p_idempotency_key text, p_actor_id uuid
) RETURNS TABLE (
  relationship_id uuid, status text, row_version bigint, evidence_id uuid, replayed boolean
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, mesh, shared AS $$
DECLARE
  v_relationship mesh.network_relationship%ROWTYPE;
  v_existing mesh.network_command_evidence%ROWTYPE;
  v_actor_tenant_id uuid := shared.current_tenant_id();
  v_to_state text;
  v_fingerprint text;
  v_evidence_id uuid;
  v_counterparty_tenant_id uuid;
BEGIN
  IF master.current_principal_id_soft() IS DISTINCT FROM p_actor_id
     OR p_action NOT IN ('accept', 'reject', 'cancel', 'suspend', 'reactivate', 'terminate')
     OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000
     OR btrim(p_idempotency_key) <> p_idempotency_key
     OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'Invalid relationship lifecycle command'
      USING ERRCODE = 'check_violation';
  END IF;
  v_fingerprint := encode(public.digest(convert_to(jsonb_build_object(
    'relationshipId', p_relationship_id, 'action', p_action,
    'expectedVersion', p_expected_version, 'reason', p_reason,
    'idempotencyKey', p_idempotency_key, 'actorId', p_actor_id
  )::text, 'UTF8'), 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor_tenant_id::text || ':mesh:' || p_idempotency_key, 0));
  SELECT * INTO v_existing FROM mesh.network_command_evidence
   WHERE actor_tenant_id = v_actor_tenant_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.command_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'Mesh idempotency key was reused with a different command'
        USING ERRCODE = 'unique_violation';
    END IF;
    RETURN QUERY SELECT v_existing.aggregate_id, v_existing.to_state,
                        v_existing.resulting_version, v_existing.id, true;
    RETURN;
  END IF;
  SELECT * INTO v_relationship FROM mesh.network_relationship
   WHERE id = p_relationship_id FOR UPDATE;
  IF NOT FOUND OR v_actor_tenant_id NOT IN (
       v_relationship.buyer_tenant_id, v_relationship.supplier_tenant_id
     ) THEN
    RAISE EXCEPTION 'Relationship is not visible to the current participant'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_relationship.row_version <> p_expected_version THEN RETURN; END IF;
  v_to_state := CASE p_action
    WHEN 'accept' THEN 'active'
    WHEN 'reactivate' THEN 'active'
    WHEN 'suspend' THEN 'suspended'
    ELSE 'terminated' END;
  IF (p_action = 'accept' AND NOT (
        v_relationship.status = 'requested'
        AND v_actor_tenant_id <> v_relationship.created_by_tenant_id))
     OR (p_action = 'reject' AND NOT (
        v_relationship.status = 'requested'
        AND v_actor_tenant_id <> v_relationship.created_by_tenant_id))
     OR (p_action = 'cancel' AND NOT (
        v_relationship.status = 'requested'
        AND v_actor_tenant_id = v_relationship.created_by_tenant_id))
     OR (p_action = 'suspend' AND v_relationship.status <> 'active')
     OR (p_action = 'reactivate' AND v_relationship.status <> 'suspended')
     OR (p_action = 'terminate' AND v_relationship.status NOT IN ('active', 'suspended')) THEN
    RAISE EXCEPTION 'Participant is not allowed to % relationship in state %',
      p_action, v_relationship.status USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_counterparty_tenant_id := CASE
    WHEN v_actor_tenant_id = v_relationship.buyer_tenant_id
      THEN v_relationship.supplier_tenant_id
    ELSE v_relationship.buyer_tenant_id END;
  v_evidence_id := mesh.fn_record_network_command(
    v_actor_tenant_id, v_counterparty_tenant_id, 'network_relationship',
    p_relationship_id, 'relationship_' || p_action,
    v_relationship.status::text, v_to_state, p_expected_version,
    p_reason, p_idempotency_key, v_fingerprint,
    jsonb_build_object('participantRole', CASE
      WHEN v_actor_tenant_id = v_relationship.buyer_tenant_id THEN 'buyer' ELSE 'supplier' END),
    p_actor_id
  );
  PERFORM set_config('app.mesh_command_evidence_id', v_evidence_id::text, true);
  UPDATE mesh.network_relationship AS target
     SET status = v_to_state::mesh.network_relationship_status_d,
         row_version = target.row_version + 1, updated_by = p_actor_id
   WHERE id = p_relationship_id;
  PERFORM set_config('app.mesh_command_evidence_id', '', true);
  RETURN QUERY SELECT p_relationship_id, v_to_state, p_expected_version + 1, v_evidence_id, false;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.command_accept_network_relationship(uuid,bigint,text,text,uuid)
RETURNS TABLE (relationship_id uuid,status text,row_version bigint,evidence_id uuid,replayed boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,mesh AS $$
  SELECT * FROM mesh.command_network_relationship_lifecycle($1,'accept',$2,$3,$4,$5)
$$;
CREATE OR REPLACE FUNCTION mesh.command_reject_network_relationship(uuid,bigint,text,text,uuid)
RETURNS TABLE (relationship_id uuid,status text,row_version bigint,evidence_id uuid,replayed boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,mesh AS $$
  SELECT * FROM mesh.command_network_relationship_lifecycle($1,'reject',$2,$3,$4,$5)
$$;
CREATE OR REPLACE FUNCTION mesh.command_suspend_network_relationship(uuid,bigint,text,text,uuid)
RETURNS TABLE (relationship_id uuid,status text,row_version bigint,evidence_id uuid,replayed boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,mesh AS $$
  SELECT * FROM mesh.command_network_relationship_lifecycle($1,'suspend',$2,$3,$4,$5)
$$;
CREATE OR REPLACE FUNCTION mesh.command_terminate_network_relationship(uuid,bigint,text,text,uuid)
RETURNS TABLE (relationship_id uuid,status text,row_version bigint,evidence_id uuid,replayed boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,mesh AS $$
  SELECT * FROM mesh.command_network_relationship_lifecycle($1,'terminate',$2,$3,$4,$5)
$$;

CREATE OR REPLACE FUNCTION mesh.trg_guard_published_catalog_content()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, mesh AS $$
DECLARE v_catalog_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'catalog_item' THEN
    v_catalog_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.catalog_id ELSE NEW.catalog_id END;
  ELSIF TG_TABLE_NAME = 'catalog_audience' THEN
    v_catalog_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.catalog_id ELSE NEW.catalog_id END;
  ELSE
    SELECT item.catalog_id INTO v_catalog_id FROM mesh.catalog_item item
     WHERE item.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.catalog_item_id ELSE NEW.catalog_item_id END;
  END IF;
  IF EXISTS (SELECT 1 FROM mesh.catalog WHERE id = v_catalog_id AND status = 'published') THEN
    RAISE EXCEPTION 'Published catalog content is immutable; create and publish a new revision'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.command_catalog_lifecycle(
  p_catalog_id uuid, p_action text, p_expected_version bigint,
  p_reason text, p_idempotency_key text, p_actor_id uuid
) RETURNS TABLE (
  catalog_id uuid, status text, row_version bigint,
  revision_no integer, evidence_id uuid, replayed boolean
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, mesh, shared AS $$
DECLARE
  v_catalog mesh.catalog%ROWTYPE;
  v_existing mesh.network_command_evidence%ROWTYPE;
  v_tenant_id uuid := shared.current_tenant_id();
  v_to_state text;
  v_fingerprint text;
  v_evidence_id uuid;
  v_snapshot jsonb;
  v_revision_no integer;
BEGIN
  IF master.current_principal_id_soft() IS DISTINCT FROM p_actor_id
     OR p_action NOT IN ('publish', 'unpublish', 'archive')
     OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000
     OR btrim(p_idempotency_key) <> p_idempotency_key
     OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'Invalid catalog lifecycle command' USING ERRCODE = 'check_violation';
  END IF;
  v_fingerprint := encode(public.digest(convert_to(jsonb_build_object(
    'catalogId', p_catalog_id, 'action', p_action,
    'expectedVersion', p_expected_version, 'reason', p_reason,
    'idempotencyKey', p_idempotency_key, 'actorId', p_actor_id
  )::text, 'UTF8'), 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant_id::text || ':mesh:' || p_idempotency_key, 0));
  SELECT * INTO v_existing FROM mesh.network_command_evidence
   WHERE actor_tenant_id = v_tenant_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.command_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'Mesh idempotency key was reused with a different command'
        USING ERRCODE = 'unique_violation';
    END IF;
    SELECT current_revision_no INTO v_revision_no FROM mesh.catalog WHERE id = v_existing.aggregate_id;
    RETURN QUERY SELECT v_existing.aggregate_id, v_existing.to_state,
                        v_existing.resulting_version, v_revision_no,
                        v_existing.id, true;
    RETURN;
  END IF;
  SELECT * INTO v_catalog FROM mesh.catalog
   WHERE id = p_catalog_id AND tenant_id = v_tenant_id FOR UPDATE;
  IF NOT FOUND OR v_catalog.row_version <> p_expected_version THEN RETURN; END IF;
  v_to_state := CASE p_action WHEN 'publish' THEN 'published'
                  WHEN 'unpublish' THEN 'unpublished' ELSE 'archived' END;
  IF (p_action = 'publish' AND v_catalog.status NOT IN ('draft','pending_review','unpublished'))
     OR (p_action = 'unpublish' AND v_catalog.status <> 'published')
     OR (p_action = 'archive' AND v_catalog.status NOT IN ('draft','unpublished')) THEN
    RAISE EXCEPTION 'Invalid catalog transition: % -> %', v_catalog.status, v_to_state
      USING ERRCODE = 'check_violation';
  END IF;
  v_revision_no := v_catalog.current_revision_no;
  IF p_action = 'publish' THEN
    v_revision_no := v_revision_no + 1;
    v_snapshot := mesh.fn_catalog_publication_snapshot(p_catalog_id);
    INSERT INTO mesh.catalog_revision (
      tenant_id, catalog_id, revision_no, content_snapshot, content_digest,
      effective_from, effective_until, published_by
    ) VALUES (
      v_tenant_id, p_catalog_id, v_revision_no, v_snapshot,
      encode(public.digest(convert_to(v_snapshot::text, 'UTF8'), 'sha256'), 'hex'),
      v_catalog.valid_from, v_catalog.valid_until, p_actor_id
    );
  END IF;
  v_evidence_id := mesh.fn_record_network_command(
    v_tenant_id, NULL, 'catalog', p_catalog_id, 'catalog_' || p_action,
    v_catalog.status::text, v_to_state, p_expected_version, p_reason,
    p_idempotency_key, v_fingerprint,
    jsonb_build_object('revisionNo', v_revision_no), p_actor_id
  );
  PERFORM set_config('app.mesh_command_evidence_id', v_evidence_id::text, true);
  UPDATE mesh.catalog AS target SET
    status = v_to_state::mesh.catalog_status_d,
    current_revision_no = v_revision_no,
    row_version = target.row_version + 1,
    published_at = CASE WHEN p_action = 'publish' THEN clock_timestamp() ELSE published_at END,
    published_by = CASE WHEN p_action = 'publish' THEN p_actor_id ELSE published_by END,
    updated_by = p_actor_id
   WHERE id = p_catalog_id AND tenant_id = v_tenant_id;
  PERFORM set_config('app.mesh_command_evidence_id', '', true);
  RETURN QUERY SELECT p_catalog_id, v_to_state, p_expected_version + 1,
                      v_revision_no, v_evidence_id, false;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.command_publish_catalog(uuid,bigint,text,text,uuid)
RETURNS TABLE (catalog_id uuid,status text,row_version bigint,revision_no integer,evidence_id uuid,replayed boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,mesh AS $$
  SELECT * FROM mesh.command_catalog_lifecycle($1,'publish',$2,$3,$4,$5)
$$;

CREATE OR REPLACE FUNCTION mesh.trg_guard_document_participant_action()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, mesh, shared AS $$
BEGIN
  IF TG_TABLE_NAME = 'document_envelope' THEN
    IF NEW.sender_tenant_id IS DISTINCT FROM shared.current_tenant_id()
       OR NEW.sender_account_id IS DISTINCT FROM mesh.current_network_account_id_soft() THEN
      RAISE EXCEPTION 'Only the sender may submit a document envelope'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF TG_TABLE_NAME = 'document_payload' THEN
    IF NEW.created_by_tenant_id IS DISTINCT FROM shared.current_tenant_id()
       OR NEW.created_by IS DISTINCT FROM master.current_principal_id_soft() THEN
      RAISE EXCEPTION 'Payload creator does not match session context'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF TG_TABLE_NAME = 'document_event' THEN
    IF NEW.created_by_tenant_id IS DISTINCT FROM shared.current_tenant_id()
       OR NEW.created_by IS DISTINCT FROM master.current_principal_id_soft()
       OR (NEW.actor_tenant_id IS NOT NULL AND (
         NEW.actor_tenant_id IS DISTINCT FROM shared.current_tenant_id()
         OR NEW.actor_principal_id IS DISTINCT FROM master.current_principal_id_soft()
       )) THEN
      RAISE EXCEPTION 'Document event actor does not match session context'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    IF NEW.responder_tenant_id IS DISTINCT FROM shared.current_tenant_id()
       OR NEW.responder_principal_id IS DISTINCT FROM master.current_principal_id_soft() THEN
      RAISE EXCEPTION 'Acknowledgement responder does not match session context'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.command_submit_document_envelope(
  p_envelope_code text, p_network_relationship_id uuid, p_document_type_id uuid,
  p_document_direction mesh.document_direction_d, p_sender_account_id uuid,
  p_receiver_tenant_id uuid, p_receiver_account_id uuid,
  p_entity_id uuid, p_entity_version_id uuid, p_entity_contract_hash text,
  p_business_key text, p_correlation_id text, p_idempotency_key text,
  p_request_fingerprint text, p_metadata jsonb, p_actor_id uuid
) RETURNS TABLE (
  envelope_id uuid, status text, row_version bigint, evidence_id uuid, replayed boolean
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, mesh, shared AS $$
DECLARE
  v_sender_tenant_id uuid := shared.current_tenant_id();
  v_envelope_id uuid := shared.uuidv7();
  v_existing mesh.network_command_evidence%ROWTYPE;
  v_command_fingerprint text;
  v_evidence_id uuid;
BEGIN
  IF master.current_principal_id_soft() IS DISTINCT FROM p_actor_id
     OR mesh.current_network_account_id_soft() IS DISTINCT FROM p_sender_account_id
     OR p_receiver_tenant_id = v_sender_tenant_id
     OR p_entity_contract_hash !~ '^[a-f0-9]{64}$'
     OR p_request_fingerprint !~ '^[a-f0-9]{64}$'
     OR btrim(p_idempotency_key) <> p_idempotency_key
     OR length(p_idempotency_key) NOT BETWEEN 8 AND 200
     OR jsonb_typeof(coalesce(p_metadata,'{}'::jsonb)) <> 'object'
     OR pg_column_size(coalesce(p_metadata,'{}'::jsonb)) > 16384 THEN
    RAISE EXCEPTION 'Invalid document submission command'
      USING ERRCODE = 'check_violation';
  END IF;
  v_command_fingerprint := encode(public.digest(convert_to(jsonb_build_object(
    'envelopeCode',p_envelope_code,'relationshipId',p_network_relationship_id,
    'documentTypeId',p_document_type_id,'direction',p_document_direction,
    'senderTenantId',v_sender_tenant_id,'senderAccountId',p_sender_account_id,
    'receiverTenantId',p_receiver_tenant_id,'receiverAccountId',p_receiver_account_id,
    'entityId',p_entity_id,'entityVersionId',p_entity_version_id,
    'entityContractHash',p_entity_contract_hash,'businessKey',p_business_key,
    'correlationId',p_correlation_id,'idempotencyKey',p_idempotency_key,
    'requestFingerprint',p_request_fingerprint,'metadata',coalesce(p_metadata,'{}'::jsonb),
    'actorId',p_actor_id
  )::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_sender_tenant_id::text||':mesh:'||p_idempotency_key,0));
  SELECT * INTO v_existing FROM mesh.network_command_evidence
   WHERE actor_tenant_id=v_sender_tenant_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing.command_fingerprint<>v_command_fingerprint THEN
      RAISE EXCEPTION 'Mesh idempotency key was reused with a different command'
        USING ERRCODE='unique_violation';
    END IF;
    RETURN QUERY SELECT v_existing.aggregate_id,v_existing.to_state,
                        v_existing.resulting_version,v_existing.id,true;
    RETURN;
  END IF;
  INSERT INTO mesh.document_envelope(
    id,envelope_code,network_relationship_id,document_type_id,document_direction,
    sender_tenant_id,sender_account_id,receiver_tenant_id,receiver_account_id,
    entity_id,entity_version_id,entity_contract_hash,business_key,correlation_id,
    idempotency_key,request_fingerprint,status,metadata,created_by,row_version
  ) VALUES (
    v_envelope_id,p_envelope_code,p_network_relationship_id,p_document_type_id,p_document_direction,
    v_sender_tenant_id,p_sender_account_id,p_receiver_tenant_id,p_receiver_account_id,
    p_entity_id,p_entity_version_id,p_entity_contract_hash,p_business_key,p_correlation_id,
    p_idempotency_key,p_request_fingerprint,'received',coalesce(p_metadata,'{}'::jsonb),p_actor_id,1
  );
  v_evidence_id:=mesh.fn_record_network_command(
    v_sender_tenant_id,p_receiver_tenant_id,'document_envelope',v_envelope_id,
    'document_submit','none','received',0,'document submitted',p_idempotency_key,
    v_command_fingerprint,jsonb_build_object('requestFingerprint',p_request_fingerprint),p_actor_id
  );
  RETURN QUERY SELECT v_envelope_id,'received'::text,1::bigint,v_evidence_id,false;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_guard_document_fingerprint()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint THEN
    RAISE EXCEPTION 'Document request fingerprint is immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.command_document_envelope_lifecycle(
  p_envelope_id uuid, p_to_state text, p_actor_kind text,
  p_expected_version bigint, p_reason text, p_idempotency_key text,
  p_actor_id uuid
) RETURNS TABLE (
  envelope_id uuid, status text, row_version bigint, evidence_id uuid, replayed boolean
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, mesh, shared AS $$
DECLARE
  v_envelope mesh.document_envelope%ROWTYPE;
  v_existing mesh.network_command_evidence%ROWTYPE;
  v_tenant_id uuid := shared.current_tenant_id();
  v_fingerprint text;
  v_evidence_id uuid;
  v_allowed boolean := false;
  v_counterparty uuid;
BEGIN
  IF master.current_principal_id_soft() IS DISTINCT FROM p_actor_id
     OR p_actor_kind NOT IN ('sender','receiver','routing_service')
     OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000
     OR btrim(p_idempotency_key) <> p_idempotency_key
     OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'Invalid document lifecycle command' USING ERRCODE = 'check_violation';
  END IF;
  v_fingerprint := encode(public.digest(convert_to(jsonb_build_object(
    'envelopeId', p_envelope_id, 'toState', p_to_state,
    'actorKind', p_actor_kind, 'expectedVersion', p_expected_version,
    'reason', p_reason, 'idempotencyKey', p_idempotency_key, 'actorId', p_actor_id
  )::text, 'UTF8'), 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant_id::text || ':mesh:' || p_idempotency_key, 0));
  SELECT * INTO v_existing FROM mesh.network_command_evidence
   WHERE actor_tenant_id = v_tenant_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.command_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'Mesh idempotency key was reused with a different command'
        USING ERRCODE = 'unique_violation';
    END IF;
    RETURN QUERY SELECT v_existing.aggregate_id, v_existing.to_state,
                        v_existing.resulting_version, v_existing.id, true;
    RETURN;
  END IF;
  SELECT * INTO v_envelope FROM mesh.document_envelope WHERE id = p_envelope_id FOR UPDATE;
  IF NOT FOUND OR v_tenant_id NOT IN (v_envelope.sender_tenant_id, v_envelope.receiver_tenant_id) THEN
    RAISE EXCEPTION 'Envelope is not visible to the current participant'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_envelope.row_version <> p_expected_version THEN RETURN; END IF;
  IF p_actor_kind = 'sender' THEN
    v_allowed := v_tenant_id = v_envelope.sender_tenant_id
      AND v_envelope.status = 'routed' AND p_to_state = 'archived';
  ELSIF p_actor_kind = 'receiver' THEN
    v_allowed := v_tenant_id = v_envelope.receiver_tenant_id AND (
      (v_envelope.status = 'received' AND p_to_state IN ('validating','rejected'))
      OR (v_envelope.status = 'validating' AND p_to_state IN ('validated','rejected'))
      OR (v_envelope.status = 'validated' AND p_to_state IN ('accepted','rejected'))
    );
  ELSE
    IF NOT pg_has_role(session_user, 'athyper_projection_applier', 'MEMBER') THEN
      RAISE EXCEPTION 'Routing transition requires the projection-applier role'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_allowed :=
      (v_envelope.status IN ('received','validating','validated','routing') AND p_to_state = 'failed')
      OR (v_envelope.status = 'accepted' AND p_to_state = 'routing')
      OR (v_envelope.status = 'routing' AND p_to_state = 'routed')
      OR (v_envelope.status = 'routed' AND p_to_state = 'archived');
  END IF;
  IF NOT v_allowed THEN
    RAISE EXCEPTION '% cannot transition envelope from % to %',
      p_actor_kind, v_envelope.status, p_to_state USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_counterparty := CASE WHEN v_tenant_id = v_envelope.sender_tenant_id
    THEN v_envelope.receiver_tenant_id ELSE v_envelope.sender_tenant_id END;
  v_evidence_id := mesh.fn_record_network_command(
    v_tenant_id, v_counterparty, 'document_envelope', p_envelope_id,
    'document_' || p_to_state, v_envelope.status::text, p_to_state,
    p_expected_version, p_reason, p_idempotency_key, v_fingerprint,
    jsonb_build_object('actorKind', p_actor_kind,
                       'requestFingerprint', v_envelope.request_fingerprint), p_actor_id
  );
  PERFORM set_config('app.mesh_command_evidence_id', v_evidence_id::text, true);
  UPDATE mesh.document_envelope AS target
     SET status = p_to_state::mesh.document_envelope_status_d,
         row_version = target.row_version + 1,
         processed_at = CASE WHEN p_to_state IN ('accepted','rejected','routed','failed','archived')
                             THEN clock_timestamp() ELSE processed_at END,
         updated_by = p_actor_id
   WHERE id = p_envelope_id;
  PERFORM set_config('app.mesh_command_evidence_id', '', true);
  RETURN QUERY SELECT p_envelope_id, p_to_state, p_expected_version + 1, v_evidence_id, false;
END;
$$;

DROP TRIGGER wave6_network_account_event ON mesh.network_account;
DROP TRIGGER wave6_network_relationship_event ON mesh.network_relationship;
CREATE TRIGGER wave6_network_account_event
AFTER INSERT OR UPDATE OF status ON mesh.network_account
FOR EACH ROW EXECUTE FUNCTION mesh.trg_record_network_lifecycle('network_account');
CREATE TRIGGER wave6_network_relationship_event
AFTER INSERT OR UPDATE OF status ON mesh.network_relationship
FOR EACH ROW EXECUTE FUNCTION mesh.trg_record_network_lifecycle('network_relationship');

CREATE TRIGGER trg_network_account_command_authority
BEFORE UPDATE OF status, row_version ON mesh.network_account
FOR EACH ROW EXECUTE FUNCTION mesh.trg_enforce_network_command();
CREATE TRIGGER trg_network_account_identity_coordinates_immutable
BEFORE UPDATE ON mesh.network_account
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_network_identity_coordinates();
CREATE TRIGGER trg_network_relationship_command_authority
BEFORE UPDATE OF status, row_version ON mesh.network_relationship
FOR EACH ROW EXECUTE FUNCTION mesh.trg_enforce_network_command();
CREATE TRIGGER trg_network_relationship_identity_coordinates_immutable
BEFORE UPDATE ON mesh.network_relationship
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_network_identity_coordinates();
CREATE TRIGGER trg_catalog_command_authority
BEFORE UPDATE OF status, row_version ON mesh.catalog
FOR EACH ROW EXECUTE FUNCTION mesh.trg_enforce_network_command();
CREATE TRIGGER trg_document_envelope_command_authority
BEFORE UPDATE OF status, row_version ON mesh.document_envelope
FOR EACH ROW EXECUTE FUNCTION mesh.trg_enforce_network_command();
CREATE TRIGGER trg_document_envelope_fingerprint_immutable
BEFORE UPDATE ON mesh.document_envelope
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_document_fingerprint();

CREATE TRIGGER trg_network_command_evidence_immutable
BEFORE UPDATE OR DELETE ON mesh.network_command_evidence
FOR EACH ROW EXECUTE FUNCTION mesh.trg_reject_immutable_exchange_evidence();
CREATE TRIGGER trg_catalog_revision_immutable
BEFORE UPDATE OR DELETE ON mesh.catalog_revision
FOR EACH ROW EXECUTE FUNCTION mesh.trg_reject_immutable_exchange_evidence();

CREATE TRIGGER trg_catalog_item_published_immutable
BEFORE INSERT OR UPDATE OR DELETE ON mesh.catalog_item
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_published_catalog_content();
CREATE TRIGGER trg_catalog_item_identifier_published_immutable
BEFORE INSERT OR UPDATE OR DELETE ON mesh.catalog_item_identifier
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_published_catalog_content();
CREATE TRIGGER trg_catalog_item_classification_published_immutable
BEFORE INSERT OR UPDATE OR DELETE ON mesh.catalog_item_classification
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_published_catalog_content();
CREATE TRIGGER trg_catalog_item_uom_published_immutable
BEFORE INSERT OR UPDATE OR DELETE ON mesh.catalog_item_uom
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_published_catalog_content();
CREATE TRIGGER trg_catalog_audience_published_immutable
BEFORE INSERT OR UPDATE OR DELETE ON mesh.catalog_audience
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_published_catalog_content();
CREATE TRIGGER trg_catalog_price_published_immutable
BEFORE INSERT OR UPDATE OR DELETE ON mesh.catalog_price
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_published_catalog_content();
CREATE TRIGGER trg_catalog_availability_published_immutable
BEFORE INSERT OR UPDATE OR DELETE ON mesh.catalog_availability
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_published_catalog_content();

CREATE TRIGGER trg_document_envelope_sender_authority
BEFORE INSERT ON mesh.document_envelope
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_document_participant_action();
CREATE TRIGGER trg_document_payload_creator_authority
BEFORE INSERT ON mesh.document_payload
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_document_participant_action();
CREATE TRIGGER trg_document_acknowledgement_responder_authority
BEFORE INSERT ON mesh.document_acknowledgement
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_document_participant_action();
CREATE TRIGGER trg_document_event_actor_authority
BEFORE INSERT ON mesh.document_event
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_document_participant_action();

ALTER TABLE mesh.network_relationship_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_relationship_identity FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_command_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_command_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_revision FORCE ROW LEVEL SECURITY;

CREATE POLICY network_relationship_identity_participant_read
ON mesh.network_relationship_identity FOR SELECT
USING (shared.current_tenant_id_soft() IN (buyer_tenant_id, supplier_tenant_id));
CREATE POLICY network_relationship_identity_seed_owner
ON mesh.network_relationship_identity FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY network_command_evidence_participant_read
ON mesh.network_command_evidence FOR SELECT
USING (shared.current_tenant_id_soft() IN (actor_tenant_id, counterparty_tenant_id));
CREATE POLICY network_command_evidence_seed_owner
ON mesh.network_command_evidence FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY catalog_revision_visible
ON mesh.catalog_revision FOR SELECT
USING (tenant_id = shared.current_tenant_id_soft() OR mesh.catalog_is_visible(catalog_id));
CREATE POLICY catalog_revision_seed_owner
ON mesh.catalog_revision FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

REVOKE ALL ON mesh.network_relationship_identity,
  mesh.network_command_evidence, mesh.catalog_revision FROM PUBLIC;
REVOKE ALL ON FUNCTION
  mesh.fn_record_network_command(uuid,uuid,text,uuid,text,text,text,bigint,text,text,text,jsonb,uuid),
  mesh.trg_enforce_network_command(),
  mesh.trg_guard_network_identity_coordinates(),
  mesh.trg_reject_immutable_exchange_evidence(),
  mesh.trg_guard_published_catalog_content(),
  mesh.trg_guard_document_participant_action(),
  mesh.trg_guard_document_fingerprint(),
  mesh.fn_catalog_publication_snapshot(uuid)
FROM PUBLIC;
REVOKE ALL ON FUNCTION
  mesh.command_network_account_lifecycle(uuid,text,bigint,text,text,uuid),
  mesh.command_request_network_relationship(uuid,uuid,uuid,uuid,text,date,date,text,text,uuid),
  mesh.command_network_relationship_lifecycle(uuid,text,bigint,text,text,uuid),
  mesh.command_accept_network_relationship(uuid,bigint,text,text,uuid),
  mesh.command_reject_network_relationship(uuid,bigint,text,text,uuid),
  mesh.command_suspend_network_relationship(uuid,bigint,text,text,uuid),
  mesh.command_terminate_network_relationship(uuid,bigint,text,text,uuid),
  mesh.command_catalog_lifecycle(uuid,text,bigint,text,text,uuid),
  mesh.command_publish_catalog(uuid,bigint,text,text,uuid),
  mesh.command_submit_document_envelope(text,uuid,uuid,mesh.document_direction_d,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb,uuid),
  mesh.command_document_envelope_lifecycle(uuid,text,text,bigint,text,text,uuid)
FROM PUBLIC;

REVOKE UPDATE ON mesh.network_account, mesh.network_relationship,
  mesh.document_envelope, mesh.document_payload,
  mesh.document_business_status_projection FROM athyperapp;
REVOKE INSERT ON mesh.document_envelope,
  mesh.document_business_status_projection FROM athyperapp;
GRANT UPDATE (account_code, display_name, legal_name, country_code,
  default_currency, logo_asset_ref, capabilities, metadata, updated_by)
ON mesh.network_account TO athyperapp;
REVOKE INSERT ON mesh.network_relationship FROM athyperapp;

GRANT SELECT ON mesh.network_relationship_identity,
  mesh.network_command_evidence, mesh.catalog_revision TO athyperapp;
GRANT EXECUTE ON FUNCTION
  mesh.command_network_account_lifecycle(uuid,text,bigint,text,text,uuid),
  mesh.command_request_network_relationship(uuid,uuid,uuid,uuid,text,date,date,text,text,uuid),
  mesh.command_network_relationship_lifecycle(uuid,text,bigint,text,text,uuid),
  mesh.command_accept_network_relationship(uuid,bigint,text,text,uuid),
  mesh.command_reject_network_relationship(uuid,bigint,text,text,uuid),
  mesh.command_suspend_network_relationship(uuid,bigint,text,text,uuid),
  mesh.command_terminate_network_relationship(uuid,bigint,text,text,uuid),
  mesh.command_catalog_lifecycle(uuid,text,bigint,text,text,uuid),
  mesh.command_publish_catalog(uuid,bigint,text,text,uuid),
  mesh.command_submit_document_envelope(text,uuid,uuid,mesh.document_direction_d,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb,uuid),
  mesh.command_document_envelope_lifecycle(uuid,text,text,bigint,text,text,uuid)
TO athyperapp;

GRANT SELECT,INSERT,UPDATE ON mesh.document_business_status_projection
TO athyper_projection_applier;

GRANT ALL PRIVILEGES ON mesh.network_relationship_identity,
  mesh.network_command_evidence, mesh.catalog_revision TO athyperadmin;
GRANT EXECUTE ON FUNCTION
  mesh.command_network_account_lifecycle(uuid,text,bigint,text,text,uuid),
  mesh.command_request_network_relationship(uuid,uuid,uuid,uuid,text,date,date,text,text,uuid),
  mesh.command_network_relationship_lifecycle(uuid,text,bigint,text,text,uuid),
  mesh.command_accept_network_relationship(uuid,bigint,text,text,uuid),
  mesh.command_reject_network_relationship(uuid,bigint,text,text,uuid),
  mesh.command_suspend_network_relationship(uuid,bigint,text,text,uuid),
  mesh.command_terminate_network_relationship(uuid,bigint,text,text,uuid),
  mesh.command_catalog_lifecycle(uuid,text,bigint,text,text,uuid),
  mesh.command_publish_catalog(uuid,bigint,text,text,uuid),
  mesh.command_submit_document_envelope(text,uuid,uuid,mesh.document_direction_d,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb,uuid),
  mesh.command_document_envelope_lifecycle(uuid,text,text,bigint,text,text,uuid)
TO athyperadmin;

COMMENT ON TABLE mesh.network_relationship_identity IS
  'Stable buyer/supplier relationship identity. Individual commercial periods are versioned as network_relationship episodes.';
COMMENT ON TABLE mesh.network_command_evidence IS
  'Append-only command evidence for exact replay, optimistic concurrency, participant authority, audit and outbox atomicity.';
COMMENT ON TABLE mesh.catalog_revision IS
  'Immutable digest-addressed snapshot of each published catalog revision.';
-- G3 relationship-capability foundation. Relationship identity/episodes remain
-- the bilateral edge; each independently authorized collaboration mode is a
-- separate effective-dated capability episode.

CREATE TABLE mesh.network_relationship_kind (
    code                text        NOT NULL,
    name                text        NOT NULL,
    description         text,
    status              text        NOT NULL DEFAULT 'active',
    created_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by          uuid        NOT NULL,
    CONSTRAINT network_relationship_kind_pkey PRIMARY KEY (code),
    CONSTRAINT network_relationship_kind_code_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT network_relationship_kind_name_chk CHECK (length(btrim(name)) BETWEEN 1 AND 128),
    CONSTRAINT network_relationship_kind_description_chk CHECK (description IS NULL OR length(description) <= 2000),
    CONSTRAINT network_relationship_kind_status_chk CHECK (status IN ('active', 'deprecated', 'retired'))
);

INSERT INTO mesh.network_relationship_kind(code, name, description, created_by)
VALUES ('commercial', 'Commercial', 'Buyer and supplier commercial relationship; access is granted only by active child capabilities.', '00000000-0000-0000-0000-000000000000'::uuid);

ALTER TABLE mesh.network_relationship
    ADD CONSTRAINT network_relationship_kind_fk
    FOREIGN KEY (relationship_kind)
    REFERENCES mesh.network_relationship_kind(code) ON DELETE RESTRICT;
ALTER TABLE mesh.network_relationship_identity
    ADD CONSTRAINT network_relationship_identity_kind_fk
    FOREIGN KEY (relationship_kind)
    REFERENCES mesh.network_relationship_kind(code) ON DELETE RESTRICT;

CREATE TABLE mesh.network_relationship_capability (
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    network_relationship_id  uuid        NOT NULL,
    capability_code          text        NOT NULL,
    episode_no               integer     NOT NULL,
    requested_by_tenant_id   uuid        NOT NULL,
    approved_by_tenant_id    uuid,
    effective_from           date        NOT NULL,
    effective_until          date,
    routing_policy           jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                   text        NOT NULL DEFAULT 'requested',
    row_version              bigint      NOT NULL DEFAULT 1,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by               uuid        NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,
    CONSTRAINT network_relationship_capability_pkey PRIMARY KEY (id),
    CONSTRAINT network_relationship_capability_episode_uq UNIQUE (network_relationship_id, capability_code, episode_no),
    CONSTRAINT network_relationship_capability_code_chk CHECK (capability_code IN ('profile_exchange', 'sourcing', 'procurement', 'invoicing', 'payments', 'services_procurement')),
    CONSTRAINT network_relationship_capability_episode_chk CHECK (episode_no >= 1),
    CONSTRAINT network_relationship_capability_range_chk CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT network_relationship_capability_route_chk CHECK (jsonb_typeof(routing_policy) = 'object' AND pg_column_size(routing_policy) <= 16384),
    CONSTRAINT network_relationship_capability_status_chk CHECK (status IN ('requested', 'active', 'suspended', 'rejected', 'ended')),
    CONSTRAINT network_relationship_capability_approval_chk CHECK (
        (status = 'requested' AND approved_by_tenant_id IS NULL)
        OR (status = 'rejected' AND approved_by_tenant_id IS NOT NULL)
        OR (status IN ('active', 'suspended') AND approved_by_tenant_id IS NOT NULL AND approved_by_tenant_id <> requested_by_tenant_id)
        OR (status = 'ended' AND (approved_by_tenant_id IS NULL OR approved_by_tenant_id <> requested_by_tenant_id))
    ),
    CONSTRAINT network_relationship_capability_version_chk CHECK (row_version >= 1),
    CONSTRAINT network_relationship_capability_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT network_relationship_capability_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
    CONSTRAINT network_relationship_capability_relationship_fk FOREIGN KEY (network_relationship_id)
        REFERENCES mesh.network_relationship(id) ON DELETE RESTRICT,
    CONSTRAINT network_relationship_capability_requester_fk FOREIGN KEY (requested_by_tenant_id)
        REFERENCES master.tenant(id) ON DELETE RESTRICT,
    CONSTRAINT network_relationship_capability_approver_fk FOREIGN KEY (approved_by_tenant_id)
        REFERENCES master.tenant(id) ON DELETE RESTRICT,
    CONSTRAINT network_relationship_capability_no_overlap_excl EXCLUDE USING gist (
        network_relationship_id WITH =,
        capability_code WITH =,
        daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)') WITH &&
    ) WHERE (status IN ('requested', 'active', 'suspended'))
);

COMMENT ON TABLE mesh.network_relationship_capability IS
  'G3 bilateral, effective-dated capability episodes. A requested capability grants no access; activation requires counterparty command evidence. Relationship metadata is never an authorization source.';

CREATE INDEX network_relationship_capability_lookup_idx
    ON mesh.network_relationship_capability(network_relationship_id, capability_code, status, effective_from, effective_until);

ALTER TABLE mesh.network_account_commodity_capability
    ADD CONSTRAINT network_account_commodity_capability_no_overlap_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        network_account_id WITH =,
        commodity_code_id WITH =,
        trade_role WITH =,
        daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active');

ALTER TABLE mesh.network_relationship_kind ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_relationship_kind FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_relationship_capability ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_relationship_capability FORCE ROW LEVEL SECURITY;

CREATE POLICY network_relationship_kind_read ON mesh.network_relationship_kind
    FOR SELECT USING (true);
CREATE POLICY network_relationship_kind_seed_owner ON mesh.network_relationship_kind
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY network_relationship_capability_participant_read ON mesh.network_relationship_capability
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM mesh.network_relationship relationship
         WHERE relationship.id = network_relationship_id
           AND shared.current_tenant_id_soft() IN (relationship.buyer_tenant_id, relationship.supplier_tenant_id)
    ));
CREATE POLICY network_relationship_capability_seed_owner ON mesh.network_relationship_capability
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

REVOKE ALL ON mesh.network_relationship_kind, mesh.network_relationship_capability FROM PUBLIC;
GRANT SELECT ON mesh.network_relationship_kind, mesh.network_relationship_capability TO athyperapp;
GRANT ALL PRIVILEGES ON mesh.network_relationship_kind, mesh.network_relationship_capability TO athyperadmin;

-- Bounded registration exchange. It records participant intent and invitation
-- state only; no row is a NEON Business Partner or an access grant.
CREATE TABLE mesh.registration_exchange (
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    requester_tenant_id      uuid        NOT NULL,
    counterparty_tenant_id   uuid        NOT NULL,
    requester_account_id     uuid        NOT NULL,
    counterparty_account_id  uuid        NOT NULL,
    intent_kind              text        NOT NULL,
    relationship_kind        text        NOT NULL DEFAULT 'commercial',
    contract_name            text        NOT NULL,
    contract_version         integer     NOT NULL,
    contract_hash            char(64)    NOT NULL,
    intent_snapshot          jsonb       NOT NULL,
    invitation_token_hash    char(64)    NOT NULL,
    expires_at               timestamptz NOT NULL,
    status                   text        NOT NULL DEFAULT 'issued',
    row_version              bigint      NOT NULL DEFAULT 1,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by               uuid        NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,
    CONSTRAINT registration_exchange_pkey PRIMARY KEY(id),
    CONSTRAINT registration_exchange_participants_chk CHECK(requester_tenant_id<>counterparty_tenant_id AND requester_account_id<>counterparty_account_id),
    CONSTRAINT registration_exchange_intent_chk CHECK(intent_kind IN('buyer_request','supplier_self_registration','discovery_nomination')),
    CONSTRAINT registration_exchange_contract_chk CHECK(contract_name~'^[a-z][a-z0-9_.-]{2,126}$' AND contract_version>=1 AND contract_hash~'^[a-f0-9]{64}$'),
    CONSTRAINT registration_exchange_snapshot_chk CHECK(jsonb_typeof(intent_snapshot)='object' AND pg_column_size(intent_snapshot)<=16384 AND intent_snapshot-ARRAY['displayName','countryCode','requestedCapabilities','sourceReference','message']::text[]='{}'::jsonb),
    CONSTRAINT registration_exchange_token_chk CHECK(invitation_token_hash~'^[a-f0-9]{64}$'),
    CONSTRAINT registration_exchange_expiry_chk CHECK(expires_at>created_at),
    CONSTRAINT registration_exchange_status_chk CHECK(status IN('issued','accepted','rejected','cancelled','expired')),
    CONSTRAINT registration_exchange_version_chk CHECK(row_version>=1),
    CONSTRAINT registration_exchange_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT registration_exchange_requester_fk FOREIGN KEY(requester_tenant_id,requester_account_id) REFERENCES mesh.network_account(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT registration_exchange_counterparty_fk FOREIGN KEY(counterparty_tenant_id,counterparty_account_id) REFERENCES mesh.network_account(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT registration_exchange_kind_fk FOREIGN KEY(relationship_kind) REFERENCES mesh.network_relationship_kind(code) ON DELETE RESTRICT
);

ALTER TABLE mesh.network_command_evidence DROP CONSTRAINT network_command_evidence_kind_chk,
  ADD CONSTRAINT network_command_evidence_kind_chk CHECK(aggregate_kind IN('network_account','network_relationship','network_relationship_capability','registration_exchange','catalog','document_envelope'));

CREATE OR REPLACE FUNCTION mesh.trg_enforce_g3_command()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,mesh AS $$
DECLARE v_evidence_id uuid;v_kind text:=TG_TABLE_NAME;v_from text;v_expected bigint;
BEGIN
  IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.row_version IS NOT DISTINCT FROM OLD.row_version THEN RETURN NEW; END IF;
  v_from:=CASE WHEN TG_OP='INSERT' THEN 'none' ELSE OLD.status::text END;
  v_expected:=CASE WHEN TG_OP='INSERT' THEN 0 ELSE OLD.row_version END;
  BEGIN v_evidence_id:=nullif(current_setting('app.mesh_command_evidence_id',true),'')::uuid;EXCEPTION WHEN invalid_text_representation THEN v_evidence_id:=NULL;END;
  IF v_evidence_id IS NULL OR NOT EXISTS(SELECT 1 FROM mesh.network_command_evidence e WHERE e.id=v_evidence_id AND e.aggregate_kind=v_kind AND e.aggregate_id=NEW.id AND e.from_state=v_from AND e.to_state=NEW.status AND e.expected_version=v_expected AND e.resulting_version=NEW.row_version) THEN
    RAISE EXCEPTION 'mesh.%.lifecycle requires its command function',TG_TABLE_NAME USING ERRCODE='insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION mesh.command_request_relationship_capability(
  p_relationship_id uuid,p_capability_code text,p_effective_from date,p_effective_until date,
  p_routing_policy jsonb,p_reason text,p_idempotency_key text,p_actor_id uuid
) RETURNS TABLE(capability_id uuid,status text,row_version bigint,evidence_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,mesh,shared AS $$
DECLARE v_rel mesh.network_relationship%ROWTYPE;v_actor uuid:=shared.current_tenant_id();v_existing mesh.network_command_evidence%ROWTYPE;v_id uuid:=shared.uuidv7();v_episode integer;v_hash text;v_evidence uuid;v_other uuid;
BEGIN
  IF master.current_principal_id_soft() IS DISTINCT FROM p_actor_id OR p_capability_code NOT IN('profile_exchange','sourcing','procurement','invoicing','payments','services_procurement') OR p_effective_from IS NULL OR(p_effective_until IS NOT NULL AND p_effective_until<=p_effective_from) OR jsonb_typeof(COALESCE(p_routing_policy,'{}'))<>'object' OR pg_column_size(COALESCE(p_routing_policy,'{}'))>16384 OR COALESCE(p_routing_policy,'{}')-ARRAY['protocol','endpointAlias','documentKinds','region']::text[]<>'{}'::jsonb OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Invalid relationship capability request' USING ERRCODE='check_violation';END IF;
  v_hash:=encode(public.digest(convert_to(jsonb_build_object('relationshipId',p_relationship_id,'capabilityCode',p_capability_code,'effectiveFrom',p_effective_from,'effectiveUntil',p_effective_until,'routingPolicy',COALESCE(p_routing_policy,'{}'),'reason',p_reason,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||':mesh:'||p_idempotency_key,0));
  SELECT * INTO v_existing FROM mesh.network_command_evidence WHERE actor_tenant_id=v_actor AND idempotency_key=p_idempotency_key;
  IF FOUND THEN IF v_existing.command_fingerprint<>v_hash THEN RAISE EXCEPTION 'Mesh idempotency key was reused with a different command' USING ERRCODE='unique_violation';END IF;RETURN QUERY SELECT v_existing.aggregate_id,v_existing.to_state,v_existing.resulting_version,v_existing.id,true;RETURN;END IF;
  SELECT * INTO v_rel FROM mesh.network_relationship WHERE id=p_relationship_id FOR UPDATE;
  IF NOT FOUND OR v_actor NOT IN(v_rel.buyer_tenant_id,v_rel.supplier_tenant_id) THEN RAISE EXCEPTION 'Relationship is not visible to current participant' USING ERRCODE='insufficient_privilege';END IF;
  IF v_rel.status='requested' AND p_capability_code<>'profile_exchange' THEN RAISE EXCEPTION 'Potential relationships may request profile exchange only' USING ERRCODE='insufficient_privilege';END IF;
  IF v_rel.status NOT IN('requested','active') THEN RAISE EXCEPTION 'Relationship cannot receive a capability in state %',v_rel.status USING ERRCODE='object_not_in_prerequisite_state';END IF;
  v_other:=CASE WHEN v_actor=v_rel.buyer_tenant_id THEN v_rel.supplier_tenant_id ELSE v_rel.buyer_tenant_id END;
  SELECT COALESCE(max(episode_no),0)+1 INTO v_episode FROM mesh.network_relationship_capability WHERE network_relationship_id=p_relationship_id AND capability_code=p_capability_code;
  v_evidence:=mesh.fn_record_network_command(v_actor,v_other,'network_relationship_capability',v_id,'capability_request','none','requested',0,p_reason,p_idempotency_key,v_hash,jsonb_build_object('relationshipId',p_relationship_id,'capabilityCode',p_capability_code,'episodeNo',v_episode),p_actor_id);
  PERFORM set_config('app.mesh_command_evidence_id',v_evidence::text,true);
  INSERT INTO mesh.network_relationship_capability(id,network_relationship_id,capability_code,episode_no,requested_by_tenant_id,effective_from,effective_until,routing_policy,status,row_version,created_by) VALUES(v_id,p_relationship_id,p_capability_code,v_episode,v_actor,p_effective_from,p_effective_until,COALESCE(p_routing_policy,'{}'),'requested',1,p_actor_id);
  PERFORM set_config('app.mesh_command_evidence_id','',true);
  RETURN QUERY SELECT v_id,'requested'::text,1::bigint,v_evidence,false;
END $$;

CREATE OR REPLACE FUNCTION mesh.command_relationship_capability_lifecycle(p_capability_id uuid,p_action text,p_expected_version bigint,p_reason text,p_idempotency_key text,p_actor_id uuid)
RETURNS TABLE(capability_id uuid,status text,row_version bigint,evidence_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,mesh,shared AS $$
DECLARE v_cap mesh.network_relationship_capability%ROWTYPE;v_rel mesh.network_relationship%ROWTYPE;v_actor uuid:=shared.current_tenant_id();v_existing mesh.network_command_evidence%ROWTYPE;v_to text;v_hash text;v_evidence uuid;v_other uuid;
BEGIN
 IF master.current_principal_id_soft() IS DISTINCT FROM p_actor_id OR p_action NOT IN('accept','reject','suspend','end') OR p_expected_version<1 OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Invalid capability lifecycle command' USING ERRCODE='check_violation';END IF;
 v_hash:=encode(public.digest(convert_to(jsonb_build_object('capabilityId',p_capability_id,'action',p_action,'expectedVersion',p_expected_version,'reason',p_reason,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||':mesh:'||p_idempotency_key,0));SELECT * INTO v_existing FROM mesh.network_command_evidence WHERE actor_tenant_id=v_actor AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF v_existing.command_fingerprint<>v_hash THEN RAISE EXCEPTION 'Mesh idempotency key was reused with a different command' USING ERRCODE='unique_violation';END IF;RETURN QUERY SELECT v_existing.aggregate_id,v_existing.to_state,v_existing.resulting_version,v_existing.id,true;RETURN;END IF;
 SELECT c.* INTO v_cap FROM mesh.network_relationship_capability c WHERE c.id=p_capability_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Capability was not found' USING ERRCODE='no_data_found';END IF;
 SELECT * INTO v_rel FROM mesh.network_relationship WHERE id=v_cap.network_relationship_id;IF v_actor NOT IN(v_rel.buyer_tenant_id,v_rel.supplier_tenant_id) THEN RAISE EXCEPTION 'Capability is not visible to current participant' USING ERRCODE='insufficient_privilege';END IF;
 IF v_cap.row_version<>p_expected_version THEN RAISE EXCEPTION 'Capability version is stale' USING ERRCODE='serialization_failure';END IF;
 v_to:=CASE p_action WHEN 'accept' THEN 'active' WHEN 'reject' THEN 'rejected' WHEN 'suspend' THEN 'suspended' ELSE 'ended' END;
 IF(p_action IN('accept','reject') AND(v_cap.status<>'requested' OR v_actor=v_cap.requested_by_tenant_id))OR(p_action='suspend' AND v_cap.status<>'active')OR(p_action='end' AND (v_cap.status NOT IN('active','suspended','requested') OR (v_cap.status='requested' AND v_actor<>v_cap.requested_by_tenant_id)))THEN RAISE EXCEPTION 'Invalid capability transition or participant' USING ERRCODE='object_not_in_prerequisite_state';END IF;
 v_other:=CASE WHEN v_actor=v_rel.buyer_tenant_id THEN v_rel.supplier_tenant_id ELSE v_rel.buyer_tenant_id END;
 v_evidence:=mesh.fn_record_network_command(v_actor,v_other,'network_relationship_capability',p_capability_id,'capability_'||p_action,v_cap.status,v_to,p_expected_version,p_reason,p_idempotency_key,v_hash,jsonb_build_object('relationshipId',v_rel.id,'capabilityCode',v_cap.capability_code,'episodeNo',v_cap.episode_no),p_actor_id);
 PERFORM set_config('app.mesh_command_evidence_id',v_evidence::text,true);UPDATE mesh.network_relationship_capability AS target SET status=v_to,approved_by_tenant_id=CASE WHEN p_action IN('accept','reject') THEN v_actor ELSE target.approved_by_tenant_id END,row_version=target.row_version+1,status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_at=clock_timestamp(),updated_by=p_actor_id WHERE target.id=p_capability_id;PERFORM set_config('app.mesh_command_evidence_id','',true);
 RETURN QUERY SELECT p_capability_id,v_to,p_expected_version+1,v_evidence,false;
END $$;

-- Discovery receipts preserve the original nullable input fingerprint and resolved date.
-- Private command state: callers use the SECURITY DEFINER command, never this table.
CREATE TABLE mesh.network_discovery_receipt (
  actor_tenant_id uuid NOT NULL REFERENCES master.tenant(id),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200 AND btrim(idempotency_key)=idempotency_key),
  command_fingerprint text NOT NULL CHECK (command_fingerprint ~ '^[a-f0-9]{64}$'),
  relationship_id uuid NOT NULL REFERENCES mesh.network_relationship(id),
  capability_id uuid NOT NULL REFERENCES mesh.network_relationship_capability(id),
  PRIMARY KEY(actor_tenant_id,idempotency_key)
);
ALTER TABLE mesh.network_discovery_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_discovery_receipt FORCE ROW LEVEL SECURITY;
CREATE POLICY network_discovery_receipt_owner ON mesh.network_discovery_receipt
  FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
REVOKE ALL ON mesh.network_discovery_receipt FROM PUBLIC,athyperapp;
CREATE TRIGGER network_discovery_receipt_immutable BEFORE UPDATE OR DELETE ON mesh.network_discovery_receipt
  FOR EACH ROW EXECUTE FUNCTION mesh.trg_reject_immutable_exchange_evidence();

CREATE OR REPLACE FUNCTION mesh.command_discover_network_relationship(
  p_buyer_tenant_id uuid,p_buyer_account_id uuid,p_supplier_tenant_id uuid,p_supplier_account_id uuid,
  p_effective_from date,p_effective_until date,p_reason text,p_idempotency_key text,p_actor_id uuid
) RETURNS TABLE(relationship_id uuid,capability_id uuid,status text,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,mesh AS $$
DECLARE
  v_relationship record; v_capability record;
  v_actor uuid := shared.current_tenant_id();
  v_receipt mesh.network_discovery_receipt%ROWTYPE;
  v_hash text; v_key text; v_relationship_key text; v_capability_key text;
  v_legacy boolean; v_relationship_from date; v_capability_from date;
BEGIN
  IF p_actor_id IS NULL OR master.current_principal_id_soft() IS DISTINCT FROM p_actor_id
     OR v_actor NOT IN(p_buyer_tenant_id,p_supplier_tenant_id)
     OR mesh.current_network_account_id_soft() IS DISTINCT FROM
        (CASE WHEN v_actor=p_buyer_tenant_id THEN p_buyer_account_id ELSE p_supplier_account_id END) THEN
    RAISE EXCEPTION 'Discovery requester is not the current participant' USING ERRCODE='insufficient_privilege';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 200
     OR btrim(p_idempotency_key)<>p_idempotency_key THEN
    RAISE EXCEPTION 'Invalid discovery idempotency key' USING ERRCODE='check_violation';
  END IF;
  v_hash:=encode(public.digest(convert_to(jsonb_build_object(
    'buyerTenantId',p_buyer_tenant_id,'buyerAccountId',p_buyer_account_id,
    'supplierTenantId',p_supplier_tenant_id,'supplierAccountId',p_supplier_account_id,
    'effectiveFrom',p_effective_from,'effectiveUntil',p_effective_until,
    'reason',p_reason,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||':mesh-discovery:'||p_idempotency_key,0));
  SELECT * INTO v_receipt FROM mesh.network_discovery_receipt r
    WHERE r.actor_tenant_id=v_actor AND r.idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_receipt.command_fingerprint<>v_hash THEN
      RAISE EXCEPTION 'Discovery idempotency key was reused with a different command' USING ERRCODE='unique_violation';
    END IF;
    RETURN QUERY SELECT v_receipt.relationship_id,c.id,c.status::text,true
      FROM mesh.network_relationship_capability c WHERE c.id=v_receipt.capability_id;
    RETURN;
  END IF;
  -- Hash every new caller key. Separate prefixes cannot alias legacy keys,
  -- which always ended in .relationship/.profile, or another command kind.
  v_key:=encode(public.digest(convert_to(p_idempotency_key,'UTF8'),'sha256'),'hex');
  v_relationship_key:='discovery.relationship.'||v_key;
  v_capability_key:='discovery.profile.'||v_key;
  SELECT EXISTS(SELECT 1 FROM mesh.network_command_evidence e
    WHERE e.actor_tenant_id=v_actor AND e.idempotency_key=p_idempotency_key||'.relationship') INTO v_legacy;
  IF v_legacy THEN
    v_relationship_key:=p_idempotency_key||'.relationship';
    v_capability_key:=p_idempotency_key||'.profile';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||':mesh:'||v_relationship_key,0));
  IF v_legacy THEN
    -- Legacy discovery fingerprinted the raw nullable relationship date.
    v_relationship_from:=p_effective_from;
    SELECT c.effective_from INTO v_capability_from
      FROM mesh.network_command_evidence e JOIN mesh.network_relationship_capability c ON c.id=e.aggregate_id
      WHERE e.actor_tenant_id=v_actor AND e.idempotency_key=v_capability_key;
  ELSE
    v_relationship_from:=COALESCE(p_effective_from,CURRENT_DATE);
  END IF;
  SELECT * INTO v_relationship FROM mesh.command_request_network_relationship(
    p_buyer_tenant_id,p_buyer_account_id,p_supplier_tenant_id,p_supplier_account_id,
    'commercial',v_relationship_from,p_effective_until,p_reason,v_relationship_key,p_actor_id);
  SELECT * INTO v_capability FROM mesh.command_request_relationship_capability(
    v_relationship.relationship_id,'profile_exchange',COALESCE(p_effective_from,v_capability_from,v_relationship_from,CURRENT_DATE),
    p_effective_until,'{}'::jsonb,p_reason,v_capability_key,p_actor_id);
  INSERT INTO mesh.network_discovery_receipt VALUES(v_actor,p_idempotency_key,v_hash,v_relationship.relationship_id,v_capability.capability_id);
  RETURN QUERY SELECT v_relationship.relationship_id,c.id,c.status::text,(v_relationship.replayed AND v_capability.replayed)
    FROM mesh.network_relationship_capability c WHERE c.id=v_capability.capability_id;
END $$;
-- Discovery IDs are idempotent; status reflects the capability at response time.
-- A replay never changes the relationship or capability lifecycle.


CREATE OR REPLACE FUNCTION mesh.command_issue_registration_exchange(p_counterparty_tenant_id uuid,p_requester_account_id uuid,p_counterparty_account_id uuid,p_intent_kind text,p_relationship_kind text,p_contract_name text,p_contract_version integer,p_contract_hash text,p_intent_snapshot jsonb,p_invitation_token_hash text,p_expires_at timestamptz,p_reason text,p_idempotency_key text,p_actor_id uuid)
RETURNS TABLE(exchange_id uuid,status text,row_version bigint,evidence_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,mesh,shared AS $$
DECLARE v_actor uuid:=shared.current_tenant_id();v_existing mesh.network_command_evidence%ROWTYPE;v_id uuid:=shared.uuidv7();v_hash text;v_evidence uuid;
BEGIN
 IF master.current_principal_id_soft() IS DISTINCT FROM p_actor_id OR v_actor=p_counterparty_tenant_id OR p_intent_kind NOT IN('buyer_request','supplier_self_registration','discovery_nomination') OR p_contract_name!~'^[a-z][a-z0-9_.-]{2,126}$' OR p_contract_version<1 OR p_contract_hash!~'^[a-f0-9]{64}$' OR p_invitation_token_hash!~'^[a-f0-9]{64}$' OR jsonb_typeof(p_intent_snapshot)<>'object' OR pg_column_size(p_intent_snapshot)>16384 OR p_intent_snapshot-ARRAY['displayName','countryCode','requestedCapabilities','sourceReference','message','policyEvaluation']::text[]<>'{}'::jsonb OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Invalid registration exchange' USING ERRCODE='check_violation';END IF;
 IF NOT EXISTS(SELECT 1 FROM mesh.network_account WHERE tenant_id=v_actor AND id=p_requester_account_id)OR NOT EXISTS(SELECT 1 FROM mesh.network_account WHERE tenant_id=p_counterparty_tenant_id AND id=p_counterparty_account_id)THEN RAISE EXCEPTION 'Registration exchange accounts do not match participants' USING ERRCODE='foreign_key_violation';END IF;
 v_hash:=encode(public.digest(convert_to(jsonb_build_object('requesterTenantId',v_actor,'counterpartyTenantId',p_counterparty_tenant_id,'requesterAccountId',p_requester_account_id,'counterpartyAccountId',p_counterparty_account_id,'intentKind',p_intent_kind,'relationshipKind',p_relationship_kind,'contractName',p_contract_name,'contractVersion',p_contract_version,'contractHash',p_contract_hash,'intentSnapshot',p_intent_snapshot-'policyEvaluation','invitationTokenHash',p_invitation_token_hash,'expiresAt',p_expires_at,'reason',p_reason,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||':mesh:'||p_idempotency_key,0));SELECT * INTO v_existing FROM mesh.network_command_evidence WHERE actor_tenant_id=v_actor AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF v_existing.command_fingerprint<>v_hash THEN RAISE EXCEPTION 'Mesh idempotency key was reused with a different command' USING ERRCODE='unique_violation';END IF;RETURN QUERY SELECT v_existing.aggregate_id,v_existing.to_state,v_existing.resulting_version,v_existing.id,true;RETURN;END IF;
 IF p_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Registration exchange expiry must be in the future' USING ERRCODE='check_violation';END IF;
 v_evidence:=mesh.fn_record_network_command(v_actor,p_counterparty_tenant_id,'registration_exchange',v_id,'registration_issue','none','issued',0,p_reason,p_idempotency_key,v_hash,jsonb_build_object('intentKind',p_intent_kind,'contractName',p_contract_name,'contractVersion',p_contract_version,'contractHash',p_contract_hash,'policyEvaluation',p_intent_snapshot->'policyEvaluation'),p_actor_id);
 PERFORM set_config('app.mesh_command_evidence_id',v_evidence::text,true);INSERT INTO mesh.registration_exchange(id,requester_tenant_id,counterparty_tenant_id,requester_account_id,counterparty_account_id,intent_kind,relationship_kind,contract_name,contract_version,contract_hash,intent_snapshot,invitation_token_hash,expires_at,status,row_version,created_by)VALUES(v_id,v_actor,p_counterparty_tenant_id,p_requester_account_id,p_counterparty_account_id,p_intent_kind,p_relationship_kind,p_contract_name,p_contract_version,p_contract_hash,p_intent_snapshot-'policyEvaluation',p_invitation_token_hash,p_expires_at,'issued',1,p_actor_id);PERFORM set_config('app.mesh_command_evidence_id','',true);
 RETURN QUERY SELECT v_id,'issued'::text,1::bigint,v_evidence,false;
END $$;

CREATE OR REPLACE FUNCTION mesh.command_registration_exchange_lifecycle(p_exchange_id uuid,p_action text,p_expected_version bigint,p_reason text,p_idempotency_key text,p_actor_id uuid)
RETURNS TABLE(exchange_id uuid,status text,row_version bigint,evidence_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,mesh,shared AS $$
DECLARE v_row mesh.registration_exchange%ROWTYPE;v_actor uuid:=shared.current_tenant_id();v_existing mesh.network_command_evidence%ROWTYPE;v_to text;v_hash text;v_evidence uuid;v_other uuid;
BEGIN
 IF master.current_principal_id_soft() IS DISTINCT FROM p_actor_id OR p_action NOT IN('accept','reject','cancel','expire') OR p_expected_version<1 OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Invalid registration lifecycle command' USING ERRCODE='check_violation';END IF;
 v_hash:=encode(public.digest(convert_to(jsonb_build_object('exchangeId',p_exchange_id,'action',p_action,'expectedVersion',p_expected_version,'reason',p_reason,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||':mesh:'||p_idempotency_key,0));SELECT * INTO v_existing FROM mesh.network_command_evidence WHERE actor_tenant_id=v_actor AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF v_existing.command_fingerprint<>v_hash THEN RAISE EXCEPTION 'Mesh idempotency key was reused with a different command' USING ERRCODE='unique_violation';END IF;RETURN QUERY SELECT v_existing.aggregate_id,v_existing.to_state,v_existing.resulting_version,v_existing.id,true;RETURN;END IF;
 SELECT * INTO v_row FROM mesh.registration_exchange WHERE id=p_exchange_id FOR UPDATE;IF NOT FOUND OR v_actor NOT IN(v_row.requester_tenant_id,v_row.counterparty_tenant_id)THEN RAISE EXCEPTION 'Registration exchange is not visible to participant' USING ERRCODE='insufficient_privilege';END IF;IF v_row.row_version<>p_expected_version THEN RAISE EXCEPTION 'Registration version is stale' USING ERRCODE='serialization_failure';END IF;
 IF v_row.status<>'issued' OR(p_action IN('accept','reject') AND v_actor<>v_row.counterparty_tenant_id)OR(p_action='cancel' AND v_actor<>v_row.requester_tenant_id)OR(p_action='accept' AND clock_timestamp()>=v_row.expires_at)OR(p_action='expire' AND clock_timestamp()<v_row.expires_at)THEN RAISE EXCEPTION 'Invalid registration transition or participant' USING ERRCODE='object_not_in_prerequisite_state';END IF;
 v_to:=CASE p_action WHEN 'accept' THEN 'accepted' WHEN 'reject' THEN 'rejected' WHEN 'cancel' THEN 'cancelled' ELSE 'expired' END;v_other:=CASE WHEN v_actor=v_row.requester_tenant_id THEN v_row.counterparty_tenant_id ELSE v_row.requester_tenant_id END;
 v_evidence:=mesh.fn_record_network_command(v_actor,v_other,'registration_exchange',p_exchange_id,'registration_'||p_action,v_row.status,v_to,p_expected_version,p_reason,p_idempotency_key,v_hash,jsonb_build_object('intentKind',v_row.intent_kind,'contractHash',v_row.contract_hash),p_actor_id);PERFORM set_config('app.mesh_command_evidence_id',v_evidence::text,true);UPDATE mesh.registration_exchange AS target SET status=v_to,row_version=target.row_version+1,status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_at=clock_timestamp(),updated_by=p_actor_id WHERE target.id=p_exchange_id;PERFORM set_config('app.mesh_command_evidence_id','',true);RETURN QUERY SELECT p_exchange_id,v_to,p_expected_version+1,v_evidence,false;
END $$;

CREATE TRIGGER trg_network_relationship_capability_command BEFORE INSERT OR UPDATE OF status,row_version ON mesh.network_relationship_capability FOR EACH ROW EXECUTE FUNCTION mesh.trg_enforce_g3_command();
CREATE TRIGGER trg_registration_exchange_command BEFORE INSERT OR UPDATE OF status,row_version ON mesh.registration_exchange FOR EACH ROW EXECUTE FUNCTION mesh.trg_enforce_g3_command();
CREATE TRIGGER trg_registration_exchange_immutable BEFORE UPDATE ON mesh.registration_exchange FOR EACH ROW WHEN(NEW.requester_tenant_id IS DISTINCT FROM OLD.requester_tenant_id OR NEW.counterparty_tenant_id IS DISTINCT FROM OLD.counterparty_tenant_id OR NEW.requester_account_id IS DISTINCT FROM OLD.requester_account_id OR NEW.counterparty_account_id IS DISTINCT FROM OLD.counterparty_account_id OR NEW.intent_kind IS DISTINCT FROM OLD.intent_kind OR NEW.contract_hash IS DISTINCT FROM OLD.contract_hash OR NEW.invitation_token_hash IS DISTINCT FROM OLD.invitation_token_hash) EXECUTE FUNCTION mesh.trg_reject_immutable_exchange_evidence();
CREATE TRIGGER trg_registration_exchange_no_delete BEFORE DELETE ON mesh.registration_exchange FOR EACH ROW EXECUTE FUNCTION mesh.trg_reject_immutable_exchange_evidence();
CREATE TRIGGER trg_network_relationship_capability_immutable BEFORE UPDATE ON mesh.network_relationship_capability FOR EACH ROW WHEN(NEW.network_relationship_id IS DISTINCT FROM OLD.network_relationship_id OR NEW.capability_code IS DISTINCT FROM OLD.capability_code OR NEW.episode_no IS DISTINCT FROM OLD.episode_no OR NEW.requested_by_tenant_id IS DISTINCT FROM OLD.requested_by_tenant_id OR NEW.effective_from IS DISTINCT FROM OLD.effective_from OR NEW.effective_until IS DISTINCT FROM OLD.effective_until OR NEW.routing_policy IS DISTINCT FROM OLD.routing_policy OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by) EXECUTE FUNCTION mesh.trg_reject_immutable_exchange_evidence();
CREATE TRIGGER trg_network_relationship_capability_no_delete BEFORE DELETE ON mesh.network_relationship_capability FOR EACH ROW EXECUTE FUNCTION mesh.trg_reject_immutable_exchange_evidence();

ALTER TABLE mesh.registration_exchange ENABLE ROW LEVEL SECURITY;ALTER TABLE mesh.registration_exchange FORCE ROW LEVEL SECURITY;
CREATE POLICY registration_exchange_participant_read ON mesh.registration_exchange FOR SELECT USING(shared.current_tenant_id_soft() IN(requester_tenant_id,counterparty_tenant_id));
CREATE POLICY registration_exchange_seed_owner ON mesh.registration_exchange FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
REVOKE ALL ON mesh.registration_exchange FROM PUBLIC;REVOKE INSERT,UPDATE,DELETE ON mesh.network_relationship_capability,mesh.registration_exchange FROM athyperapp;
GRANT SELECT ON mesh.registration_exchange TO athyperapp;GRANT ALL PRIVILEGES ON mesh.registration_exchange TO athyperadmin;
REVOKE ALL ON FUNCTION mesh.command_request_relationship_capability(uuid,text,date,date,jsonb,text,text,uuid),mesh.command_relationship_capability_lifecycle(uuid,text,bigint,text,text,uuid),mesh.command_discover_network_relationship(uuid,uuid,uuid,uuid,date,date,text,text,uuid),mesh.command_issue_registration_exchange(uuid,uuid,uuid,text,text,text,integer,text,jsonb,text,timestamptz,text,text,uuid),mesh.command_registration_exchange_lifecycle(uuid,text,bigint,text,text,uuid),mesh.trg_enforce_g3_command() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mesh.command_request_relationship_capability(uuid,text,date,date,jsonb,text,text,uuid),mesh.command_relationship_capability_lifecycle(uuid,text,bigint,text,text,uuid),mesh.command_discover_network_relationship(uuid,uuid,uuid,uuid,date,date,text,text,uuid),mesh.command_issue_registration_exchange(uuid,uuid,uuid,text,text,text,integer,text,jsonb,text,timestamptz,text,text,uuid),mesh.command_registration_exchange_lifecycle(uuid,text,bigint,text,text,uuid) TO athyperapp,athyperadmin;

COMMENT ON TABLE mesh.registration_exchange IS 'Bounded, contract-pinned invitation/registration intent exchanged between MESH participants. Token material is hash-only and acceptance does not create NEON master authority or grant relationship access.';
-- G4 data protection and stewardship. Protected bank values remain in the
-- bank authority only; every ordinary evidence/event payload is hash/mask only.

CREATE TABLE mesh.bank_disclosure_purpose (
  code text NOT NULL,
  name text NOT NULL,
  owner_relationship_role text NOT NULL,
  recipient_relationship_role text NOT NULL,
  required_capability_code text NOT NULL,
  maximum_retrieval_seconds integer NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid NOT NULL,
  CONSTRAINT bank_disclosure_purpose_pkey PRIMARY KEY(code),
  CONSTRAINT bank_disclosure_purpose_code_chk CHECK(code~'^[a-z][a-z0-9_.-]{1,62}$'),
  CONSTRAINT bank_disclosure_purpose_name_chk CHECK(length(btrim(name)) BETWEEN 1 AND 128),
  CONSTRAINT bank_disclosure_purpose_roles_chk CHECK(
    owner_relationship_role IN('buyer','supplier') AND
    recipient_relationship_role IN('buyer','supplier') AND
    owner_relationship_role<>recipient_relationship_role),
  CONSTRAINT bank_disclosure_purpose_capability_chk CHECK(required_capability_code IN('payments')),
  CONSTRAINT bank_disclosure_purpose_ttl_chk CHECK(maximum_retrieval_seconds BETWEEN 30 AND 900),
  CONSTRAINT bank_disclosure_purpose_status_chk CHECK(status IN('active','deprecated','retired'))
);

INSERT INTO mesh.bank_disclosure_purpose(
  code,name,owner_relationship_role,recipient_relationship_role,
  required_capability_code,maximum_retrieval_seconds,created_by
) VALUES
  ('settlement','Settlement','supplier','buyer','payments',300,'00000000-0000-0000-0000-000000000000'),
  ('refund','Refund','buyer','supplier','payments',300,'00000000-0000-0000-0000-000000000000');

INSERT INTO master.audit_event_contract(
  code,event_code_pattern,priority,allowed_operations,default_severity,
  allowed_actor_types,allowed_scope,reason_required,capture_mode,
  max_payload_bytes,schema_version,metadata,status
) VALUES(
  'mesh_protected_value_event','^data\.mesh_bank_retrieved$',14,
  ARRAY['execute']::audit.operation_d[],'warning',
  ARRAY['user','service_account','system']::audit.actor_type_d[],
  'tenant',false,'metadata',8192,1,
  '{"event_category":"protected_value","owner":"mesh-payments-security","purpose":"purpose_bound_bank_retrieval"}',
  'active'
) ON CONFLICT(code) DO NOTHING;

ALTER TABLE mesh.bank_account_link
  DROP CONSTRAINT mesh_bank_account_link_purpose_chk,
  ADD CONSTRAINT mesh_bank_account_link_purpose_fk FOREIGN KEY(purpose)
    REFERENCES mesh.bank_disclosure_purpose(code) ON DELETE RESTRICT,
  DROP CONSTRAINT mesh_bank_account_link_metadata_chk,
  ADD CONSTRAINT mesh_bank_account_link_metadata_chk CHECK(
    jsonb_typeof(metadata)='object' AND pg_column_size(metadata)<=4096 AND
    metadata-ARRAY['_seed','sourceReference','notes']::text[]='{}'::jsonb);

ALTER TABLE mesh.bank_account_disclosure
  DROP CONSTRAINT bank_account_disclosure_purpose_chk,
  ADD CONSTRAINT bank_account_disclosure_purpose_fk FOREIGN KEY(purpose)
    REFERENCES mesh.bank_disclosure_purpose(code) ON DELETE RESTRICT,
  DROP CONSTRAINT bank_account_disclosure_metadata_chk,
  ADD CONSTRAINT bank_account_disclosure_metadata_chk CHECK(
    jsonb_typeof(metadata)='object' AND pg_column_size(metadata)<=4096 AND
    metadata-ARRAY['_seed','sourceReference','approvalReference']::text[]='{}'::jsonb);

ALTER TABLE mesh.network_account
  ADD COLUMN capabilities_contract_name text NOT NULL DEFAULT 'mesh.network-account-capabilities',
  ADD COLUMN capabilities_contract_version integer NOT NULL DEFAULT 1,
  ADD COLUMN capabilities_contract_hash char(64) NOT NULL DEFAULT '948e75f92322a56e0e47dbcc2b665c9d21d935fbc36e6a9ed65065c4f2748e41',
  ADD COLUMN metadata_contract_name text NOT NULL DEFAULT 'mesh.network-account-metadata',
  ADD COLUMN metadata_contract_version integer NOT NULL DEFAULT 1,
  ADD COLUMN metadata_contract_hash char(64) NOT NULL DEFAULT 'db11d1ce09619543edebc85bc7c9b458643688613268287279450a080b61fa93',
  ADD CONSTRAINT network_account_contract_release_chk CHECK(
    capabilities_contract_name='mesh.network-account-capabilities' AND
    capabilities_contract_version=1 AND
    capabilities_contract_hash='948e75f92322a56e0e47dbcc2b665c9d21d935fbc36e6a9ed65065c4f2748e41' AND
    metadata_contract_name='mesh.network-account-metadata' AND
    metadata_contract_version=1 AND
    metadata_contract_hash='db11d1ce09619543edebc85bc7c9b458643688613268287279450a080b61fa93'),
  ADD CONSTRAINT network_account_capabilities_allowlist_chk CHECK(
    capabilities-ARRAY['documentKinds','protocols','regions','features']::text[]='{}'::jsonb),
  ADD CONSTRAINT network_account_metadata_allowlist_chk CHECK(
    metadata-ARRAY['_seed','externalScopeKey','sourceReference','tags','onboardingChannel']::text[]='{}'::jsonb);

ALTER TABLE mesh.network_account_profile
  DROP CONSTRAINT network_account_profile_website_chk,
  ADD CONSTRAINT network_account_profile_metadata_allowlist_chk CHECK(
    metadata-ARRAY['_seed','sourceReference','tags']::text[]='{}'::jsonb);
ALTER TABLE mesh.network_account_commodity_capability
  DROP CONSTRAINT network_account_commodity_capability_metadata_chk,
  ADD CONSTRAINT network_account_commodity_capability_metadata_chk CHECK(
    jsonb_typeof(metadata)='object' AND pg_column_size(metadata)<=4096 AND
    metadata-ARRAY['_seed','sourceReference','certifications','regions']::text[]='{}'::jsonb);
ALTER TABLE mesh.bank_account
  ADD CONSTRAINT mesh_bank_account_metadata_allowlist_chk CHECK(
    metadata-ARRAY['_seed','sourceReference','verificationReference','provider','labels']::text[]='{}'::jsonb);

CREATE OR REPLACE FUNCTION mesh.is_hardened_https_url(p_value text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT p_value IS NOT NULL
     AND p_value=btrim(p_value)
     AND length(p_value)<=2048
     AND p_value!~'[[:cntrl:][:space:]\\]'
     AND p_value!~'@'
     AND p_value~'^https://([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}(?::[0-9]{1,5})?(?:[/?#][^[:space:]\\]*)?$'
$$;
ALTER TABLE mesh.network_account_profile
  ADD CONSTRAINT network_account_profile_website_chk CHECK(
    website_url IS NULL OR mesh.is_hardened_https_url(website_url));

CREATE TABLE mesh.network_account_profile_address (
  id uuid NOT NULL DEFAULT shared.uuidv7(),
  tenant_id uuid NOT NULL,
  network_account_id uuid NOT NULL,
  address_kind text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  locality text NOT NULL,
  administrative_area text,
  postal_code text,
  country_code character(2) NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_until date,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid NOT NULL,
  updated_at timestamptz,
  updated_by uuid,
  CONSTRAINT network_account_profile_address_pkey PRIMARY KEY(id),
  CONSTRAINT network_account_profile_address_tenant_uq UNIQUE(tenant_id,id),
  CONSTRAINT network_account_profile_address_kind_chk CHECK(address_kind IN('registered','remittance','operational')),
  CONSTRAINT network_account_profile_address_values_chk CHECK(
    length(btrim(address_line1)) BETWEEN 1 AND 256 AND
    (address_line2 IS NULL OR length(btrim(address_line2)) BETWEEN 1 AND 256) AND
    length(btrim(locality)) BETWEEN 1 AND 128 AND
    (administrative_area IS NULL OR length(btrim(administrative_area)) BETWEEN 1 AND 128) AND
    (postal_code IS NULL OR length(btrim(postal_code)) BETWEEN 1 AND 32)),
  CONSTRAINT network_account_profile_address_range_chk CHECK(effective_until IS NULL OR effective_until>effective_from),
  CONSTRAINT network_account_profile_address_status_chk CHECK(status IN('active','inactive')),
  CONSTRAINT network_account_profile_address_audit_chk CHECK((updated_at IS NULL)=(updated_by IS NULL)),
  CONSTRAINT network_account_profile_address_account_fk FOREIGN KEY(tenant_id,network_account_id)
    REFERENCES mesh.network_account(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT network_account_profile_address_country_fk FOREIGN KEY(country_code)
    REFERENCES shared.country(code) ON DELETE RESTRICT,
  CONSTRAINT network_account_profile_address_created_by_fk FOREIGN KEY(tenant_id,created_by)
    REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT network_account_profile_address_updated_by_fk FOREIGN KEY(tenant_id,updated_by)
    REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX network_account_profile_address_current_uq
  ON mesh.network_account_profile_address(tenant_id,network_account_id,address_kind)
  WHERE status='active' AND effective_until IS NULL;

CREATE TABLE mesh.bank_account_retrieval_evidence (
  id uuid NOT NULL DEFAULT shared.uuidv7(),
  recipient_tenant_id uuid NOT NULL,
  recipient_account_id uuid NOT NULL,
  disclosure_id uuid NOT NULL,
  purpose_code text NOT NULL,
  disclosure_version integer NOT NULL,
  protection_key_version integer NOT NULL,
  protected_token_hash char(64) NOT NULL,
  command_fingerprint char(64) NOT NULL,
  idempotency_key text NOT NULL,
  authorized_until timestamptz NOT NULL,
  retrieved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retrieved_by uuid NOT NULL,
  CONSTRAINT bank_account_retrieval_evidence_pkey PRIMARY KEY(id),
  CONSTRAINT bank_account_retrieval_evidence_key_uq UNIQUE(recipient_tenant_id,idempotency_key),
  CONSTRAINT bank_account_retrieval_evidence_hash_chk CHECK(
    protected_token_hash~'^[a-f0-9]{64}$' AND command_fingerprint~'^[a-f0-9]{64}$'),
  CONSTRAINT bank_account_retrieval_evidence_version_chk CHECK(disclosure_version>=1 AND protection_key_version>=1),
  CONSTRAINT bank_account_retrieval_evidence_key_chk CHECK(
    btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
  CONSTRAINT bank_account_retrieval_evidence_expiry_chk CHECK(authorized_until>retrieved_at),
  CONSTRAINT bank_account_retrieval_evidence_disclosure_fk FOREIGN KEY(disclosure_id)
    REFERENCES mesh.bank_account_disclosure(id) ON DELETE RESTRICT,
  CONSTRAINT bank_account_retrieval_evidence_purpose_fk FOREIGN KEY(purpose_code)
    REFERENCES mesh.bank_disclosure_purpose(code) ON DELETE RESTRICT,
  CONSTRAINT bank_account_retrieval_evidence_actor_fk FOREIGN KEY(recipient_tenant_id,retrieved_by)
    REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE mesh.canonical_party_correlation_case (
  id uuid NOT NULL DEFAULT shared.uuidv7(),
  tenant_id uuid NOT NULL,
  network_account_id uuid NOT NULL,
  current_canonical_party_id uuid,
  proposed_canonical_party_id uuid NOT NULL,
  reason text NOT NULL,
  resolution_reason text,
  status text NOT NULL DEFAULT 'open',
  row_version bigint NOT NULL DEFAULT 1,
  opened_by uuid NOT NULL,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT canonical_party_correlation_case_pkey PRIMARY KEY(id),
  CONSTRAINT canonical_party_correlation_case_tenant_uq UNIQUE(tenant_id,id),
  CONSTRAINT canonical_party_correlation_case_claim_chk CHECK(
    proposed_canonical_party_id IS DISTINCT FROM current_canonical_party_id),
  CONSTRAINT canonical_party_correlation_case_reason_chk CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),
  CONSTRAINT canonical_party_correlation_case_status_chk CHECK(status IN('open','accepted','rejected')),
  CONSTRAINT canonical_party_correlation_case_resolution_chk CHECK(
    (status='open' AND resolution_reason IS NULL AND resolved_by IS NULL AND resolved_at IS NULL) OR
    (status IN('accepted','rejected') AND length(btrim(resolution_reason)) BETWEEN 1 AND 2000 AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)),
  CONSTRAINT canonical_party_correlation_case_version_chk CHECK(row_version>=1),
  CONSTRAINT canonical_party_correlation_case_account_fk FOREIGN KEY(tenant_id,network_account_id)
    REFERENCES mesh.network_account(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT canonical_party_correlation_case_opened_by_fk FOREIGN KEY(tenant_id,opened_by)
    REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT canonical_party_correlation_case_resolved_by_fk FOREIGN KEY(tenant_id,resolved_by)
    REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX canonical_party_correlation_case_open_uq
  ON mesh.canonical_party_correlation_case(tenant_id,network_account_id) WHERE status='open';

ALTER TABLE mesh.network_command_evidence DROP CONSTRAINT network_command_evidence_kind_chk,
  ADD CONSTRAINT network_command_evidence_kind_chk CHECK(aggregate_kind IN(
    'network_account','network_relationship','network_relationship_capability',
    'registration_exchange','bank_account','canonical_party_correlation_case',
    'catalog','document_envelope'));

CREATE OR REPLACE FUNCTION mesh.trg_normalize_bank_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,mesh AS $$
BEGIN
    NEW.code:=nullif(lower(btrim(NEW.code)),'');NEW.name:=nullif(btrim(NEW.name),'');
    NEW.account_holder_name:=btrim(NEW.account_holder_name);
    NEW.protected_value_token:=btrim(NEW.protected_value_token);
    NEW.identifier_fingerprint:=lower(NEW.identifier_fingerprint);
    NEW.account_last4:=upper(btrim(NEW.account_last4));
    NEW.bic_override:=nullif(upper(regexp_replace(NEW.bic_override,'\s+','','g')),'');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mesh_bank_account_normalize ON mesh.bank_account;
CREATE TRIGGER trg_mesh_bank_account_normalize
BEFORE INSERT OR UPDATE OF code,name,account_holder_name,protected_value_token,
  identifier_fingerprint,account_last4,bic_override
ON mesh.bank_account FOR EACH ROW EXECUTE FUNCTION mesh.trg_normalize_bank_identity();

CREATE OR REPLACE FUNCTION mesh.trg_guard_bank_account_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,mesh AS $$
DECLARE v_evidence uuid;
BEGIN
  IF (OLD.is_verified OR EXISTS(SELECT 1 FROM mesh.bank_account_link l WHERE l.tenant_id=OLD.tenant_id AND l.bank_account_id=OLD.id))
  AND ROW(NEW.bank_institution_id,NEW.bank_branch_id,NEW.provisional_bank_reference_id)
      IS DISTINCT FROM ROW(OLD.bank_institution_id,OLD.bank_branch_id,OLD.provisional_bank_reference_id) THEN
    RAISE EXCEPTION 'Verified or linked bank routing identity is immutable; create a replacement account';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.network_account_id IS DISTINCT FROM OLD.network_account_id
     OR NEW.account_id_type IS DISTINCT FROM OLD.account_id_type
     OR NEW.identifier_fingerprint IS DISTINCT FROM OLD.identifier_fingerprint
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Mesh bank-account identity is immutable' USING ERRCODE='check_violation';
  END IF;
  IF ROW(NEW.protected_value_token,NEW.protection_key_version)
     IS DISTINCT FROM ROW(OLD.protected_value_token,OLD.protection_key_version) THEN
    BEGIN v_evidence:=nullif(current_setting('app.mesh_command_evidence_id',true),'')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN v_evidence:=NULL;END;
    IF v_evidence IS NULL OR NOT EXISTS(
      SELECT 1 FROM mesh.network_command_evidence e WHERE e.id=v_evidence
       AND e.aggregate_kind='bank_account' AND e.aggregate_id=NEW.id
       AND e.command_code='bank_token_rotate'
       AND (e.evidence->>'oldKeyVersion')::integer=OLD.protection_key_version
       AND (e.evidence->>'newKeyVersion')::integer=NEW.protection_key_version
       AND e.evidence->>'oldTokenHash'=encode(public.digest(convert_to(OLD.protected_value_token,'UTF8'),'sha256'),'hex')
       AND e.evidence->>'newTokenHash'=encode(public.digest(convert_to(NEW.protected_value_token,'UTF8'),'sha256'),'hex')) THEN
      RAISE EXCEPTION 'Bank token rotation requires its command function' USING ERRCODE='insufficient_privilege';
    END IF;
  END IF;RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION mesh.trg_validate_bank_disclosure()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,mesh AS $$
DECLARE v_relationship mesh.network_relationship%ROWTYPE;v_purpose mesh.bank_disclosure_purpose%ROWTYPE;v_actual_owner text;v_actual_recipient text;
BEGIN
  SELECT * INTO v_relationship FROM mesh.network_relationship WHERE id=NEW.network_relationship_id AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Bank disclosure requires an active relationship' USING ERRCODE='foreign_key_violation';END IF;
  SELECT * INTO v_purpose FROM mesh.bank_disclosure_purpose WHERE code=NEW.purpose AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Bank disclosure purpose is not active' USING ERRCODE='foreign_key_violation';END IF;
  v_actual_owner:=CASE WHEN (NEW.owner_tenant_id,NEW.owner_account_id)=(v_relationship.buyer_tenant_id,v_relationship.buyer_account_id) THEN 'buyer' WHEN (NEW.owner_tenant_id,NEW.owner_account_id)=(v_relationship.supplier_tenant_id,v_relationship.supplier_account_id) THEN 'supplier' END;
  v_actual_recipient:=CASE WHEN (NEW.recipient_tenant_id,NEW.recipient_account_id)=(v_relationship.buyer_tenant_id,v_relationship.buyer_account_id) THEN 'buyer' WHEN (NEW.recipient_tenant_id,NEW.recipient_account_id)=(v_relationship.supplier_tenant_id,v_relationship.supplier_account_id) THEN 'supplier' END;
  IF v_actual_owner IS DISTINCT FROM v_purpose.owner_relationship_role OR v_actual_recipient IS DISTINCT FROM v_purpose.recipient_relationship_role THEN
    RAISE EXCEPTION 'Bank disclosure participants violate governed purpose direction' USING ERRCODE='check_violation';
  END IF;RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION mesh.command_rotate_bank_protected_token(
  p_bank_account_id uuid,p_new_token text,p_new_key_version integer,
  p_reason text,p_idempotency_key text,p_actor_id uuid
) RETURNS TABLE(bank_account_id uuid,protection_key_version integer,evidence_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,mesh,shared AS $$
DECLARE v_row mesh.bank_account%ROWTYPE;v_actor uuid:=shared.current_tenant_id();v_existing mesh.network_command_evidence%ROWTYPE;v_hash text;v_evidence uuid;v_old_hash text;v_new_hash text;
BEGIN
  IF master.current_principal_id_soft() IS DISTINCT FROM p_actor_id OR p_new_token IS NULL OR btrim(p_new_token)<>p_new_token OR length(p_new_token) NOT BETWEEN 8 AND 512 OR p_new_token!~'^[A-Za-z0-9][A-Za-z0-9._:/-]+$' OR p_new_token~'(\.\.|//)' OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Invalid bank token rotation' USING ERRCODE='check_violation';END IF;
  v_hash:=encode(public.digest(convert_to(jsonb_build_object('bankAccountId',p_bank_account_id,'newTokenHash',encode(public.digest(convert_to(p_new_token,'UTF8'),'sha256'),'hex'),'newKeyVersion',p_new_key_version,'reason',p_reason,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||':mesh:'||p_idempotency_key,0));
  SELECT * INTO v_existing FROM mesh.network_command_evidence WHERE actor_tenant_id=v_actor AND idempotency_key=p_idempotency_key;
  IF FOUND THEN IF v_existing.command_fingerprint<>v_hash THEN RAISE EXCEPTION 'Mesh idempotency key was reused with a different command' USING ERRCODE='unique_violation';END IF;RETURN QUERY SELECT v_existing.aggregate_id,(v_existing.evidence->>'newKeyVersion')::integer,v_existing.id,true;RETURN;END IF;
  SELECT * INTO v_row FROM mesh.bank_account WHERE tenant_id=v_actor AND id=p_bank_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bank account is not visible to owner' USING ERRCODE='no_data_found';END IF;
  IF p_new_key_version<>v_row.protection_key_version+1 OR p_new_token=v_row.protected_value_token THEN RAISE EXCEPTION 'Bank token rotation version is stale or token is unchanged' USING ERRCODE='serialization_failure';END IF;
  v_old_hash:=encode(public.digest(convert_to(v_row.protected_value_token,'UTF8'),'sha256'),'hex');v_new_hash:=encode(public.digest(convert_to(p_new_token,'UTF8'),'sha256'),'hex');
  v_evidence:=mesh.fn_record_network_command(v_actor,NULL,'bank_account',v_row.id,'bank_token_rotate','key_v'||v_row.protection_key_version::text,'key_v'||p_new_key_version::text,v_row.protection_key_version,p_reason,p_idempotency_key,v_hash,jsonb_build_object('oldKeyVersion',v_row.protection_key_version,'newKeyVersion',p_new_key_version,'oldTokenHash',v_old_hash,'newTokenHash',v_new_hash),p_actor_id);
  PERFORM set_config('app.mesh_command_evidence_id',v_evidence::text,true);
  UPDATE mesh.bank_account SET protected_value_token=p_new_token,protection_key_version=p_new_key_version,updated_by=p_actor_id WHERE id=v_row.id;
  PERFORM set_config('app.mesh_command_evidence_id','',true);
  RETURN QUERY SELECT v_row.id,p_new_key_version,v_evidence,false;
END $$;

CREATE OR REPLACE FUNCTION mesh.command_retrieve_bank_protected_token(
  p_disclosure_id uuid,p_expected_disclosure_version integer,p_reason text,
  p_idempotency_key text,p_actor_id uuid
) RETURNS TABLE(protected_value_token text,protection_key_version integer,authorized_until timestamptz,evidence_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,mesh,shared,audit AS $$
DECLARE v_disclosure mesh.bank_account_disclosure%ROWTYPE;v_bank mesh.bank_account%ROWTYPE;v_purpose mesh.bank_disclosure_purpose%ROWTYPE;v_existing mesh.bank_account_retrieval_evidence%ROWTYPE;v_actor uuid:=shared.current_tenant_id();v_hash text;v_token_hash text;v_until timestamptz;v_id uuid:=shared.uuidv7();
BEGIN
  IF NOT pg_has_role(session_user,'athyper_protected_value_retriever','MEMBER') OR master.current_principal_id_soft() IS DISTINCT FROM p_actor_id OR p_expected_disclosure_version<1 OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Protected bank retrieval is not authorized' USING ERRCODE='insufficient_privilege';END IF;
  v_hash:=encode(public.digest(convert_to(jsonb_build_object('disclosureId',p_disclosure_id,'expectedVersion',p_expected_disclosure_version,'reason',p_reason,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||':bank-retrieval:'||p_idempotency_key,0));
  SELECT * INTO v_existing FROM mesh.bank_account_retrieval_evidence WHERE recipient_tenant_id=v_actor AND idempotency_key=p_idempotency_key;
  SELECT d.* INTO v_disclosure FROM mesh.bank_account_disclosure d WHERE d.id=p_disclosure_id AND d.recipient_tenant_id=v_actor FOR SHARE;
  IF NOT FOUND OR v_disclosure.status<>'active' OR v_disclosure.disclosure_version<>p_expected_disclosure_version OR (v_disclosure.expires_at IS NOT NULL AND v_disclosure.expires_at<=clock_timestamp()) THEN RAISE EXCEPTION 'Disclosure is unavailable, stale, expired or revoked' USING ERRCODE='insufficient_privilege';END IF;
  -- SHARE locks serialize retrieval with relationship/account/capability revocation.
  PERFORM 1 FROM mesh.network_relationship r
    WHERE r.id=v_disclosure.network_relationship_id AND r.status='active'
      AND (r.effective_from IS NULL OR r.effective_from<=CURRENT_DATE)
      AND (r.effective_until IS NULL OR r.effective_until>CURRENT_DATE)
    FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Relationship is unavailable or outside its effective interval' USING ERRCODE='insufficient_privilege'; END IF;
  PERFORM 1 FROM mesh.network_account a WHERE a.id=v_disclosure.owner_account_id
    AND a.tenant_id=v_disclosure.owner_tenant_id AND a.status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Disclosure owner account is unavailable' USING ERRCODE='insufficient_privilege'; END IF;
  PERFORM 1 FROM mesh.network_account a WHERE a.id=v_disclosure.recipient_account_id
    AND a.tenant_id=v_disclosure.recipient_tenant_id AND a.status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Disclosure recipient account is unavailable' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT * INTO v_purpose FROM mesh.bank_disclosure_purpose WHERE code=v_disclosure.purpose AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Disclosure purpose is unavailable' USING ERRCODE='insufficient_privilege'; END IF;
  PERFORM 1 FROM mesh.network_relationship_capability c WHERE c.network_relationship_id=v_disclosure.network_relationship_id
    AND c.capability_code=v_purpose.required_capability_code AND c.status='active'
    AND c.effective_from<=CURRENT_DATE AND (c.effective_until IS NULL OR c.effective_until>CURRENT_DATE) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Required relationship capability is unavailable' USING ERRCODE='insufficient_privilege';END IF;
  SELECT * INTO v_bank FROM mesh.bank_account WHERE id=v_disclosure.bank_account_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bank account is unavailable' USING ERRCODE='insufficient_privilege'; END IF;
  v_token_hash:=encode(public.digest(convert_to(v_bank.protected_value_token,'UTF8'),'sha256'),'hex');
  IF v_existing.id IS NOT NULL THEN IF v_existing.command_fingerprint<>v_hash OR v_existing.protected_token_hash<>v_token_hash OR v_existing.authorized_until<=clock_timestamp() THEN RAISE EXCEPTION 'Retrieval replay is stale or mismatched' USING ERRCODE='serialization_failure';END IF;RETURN QUERY SELECT v_bank.protected_value_token,v_bank.protection_key_version,v_existing.authorized_until,v_existing.id,true;RETURN;END IF;
  v_until:=least(COALESCE(v_disclosure.expires_at,'infinity'::timestamptz),clock_timestamp()+make_interval(secs=>v_purpose.maximum_retrieval_seconds));
  INSERT INTO mesh.bank_account_retrieval_evidence(id,recipient_tenant_id,recipient_account_id,disclosure_id,purpose_code,disclosure_version,protection_key_version,protected_token_hash,command_fingerprint,idempotency_key,authorized_until,retrieved_by) VALUES(v_id,v_actor,v_disclosure.recipient_account_id,v_disclosure.id,v_disclosure.purpose,v_disclosure.disclosure_version,v_bank.protection_key_version,v_token_hash,v_hash,p_idempotency_key,v_until,p_actor_id);
  PERFORM audit.append_event(p_event_code=>'data.mesh_bank_retrieved',p_operation=>'execute',p_entity_type=>'bank_account_disclosure',p_entity_id=>v_disclosure.id,p_context=>jsonb_build_object('retrievalEvidenceId',v_id,'purpose',v_disclosure.purpose,'recipientAccountId',v_disclosure.recipient_account_id,'authorizedUntil',v_until,'protectionKeyVersion',v_bank.protection_key_version));
  RETURN QUERY SELECT v_bank.protected_value_token,v_bank.protection_key_version,v_until,v_id,false;
END $$;

CREATE OR REPLACE FUNCTION mesh.command_open_canonical_party_correlation_case(
  p_network_account_id uuid,p_proposed_canonical_party_id uuid,p_reason text,
  p_idempotency_key text,p_actor_id uuid
) RETURNS TABLE(case_id uuid,status text,row_version bigint,evidence_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,mesh,shared AS $$
DECLARE v_account mesh.network_account%ROWTYPE;v_actor uuid:=shared.current_tenant_id();v_existing mesh.network_command_evidence%ROWTYPE;v_id uuid:=shared.uuidv7();v_hash text;v_evidence uuid;
BEGIN
 IF master.current_principal_id_soft() IS DISTINCT FROM p_actor_id OR p_proposed_canonical_party_id IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Invalid correlation dispute' USING ERRCODE='check_violation';END IF;
 v_hash:=encode(public.digest(convert_to(jsonb_build_object('networkAccountId',p_network_account_id,'proposedCanonicalPartyId',p_proposed_canonical_party_id,'reason',p_reason,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||':mesh:'||p_idempotency_key,0));SELECT * INTO v_existing FROM mesh.network_command_evidence WHERE actor_tenant_id=v_actor AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF v_existing.command_fingerprint<>v_hash THEN RAISE EXCEPTION 'Mesh idempotency key was reused with a different command' USING ERRCODE='unique_violation';END IF;RETURN QUERY SELECT v_existing.aggregate_id,v_existing.to_state,v_existing.resulting_version,v_existing.id,true;RETURN;END IF;
 SELECT * INTO v_account FROM mesh.network_account WHERE tenant_id=v_actor AND id=p_network_account_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Network account is not visible to owner' USING ERRCODE='no_data_found';END IF;IF v_account.canonical_party_id IS NOT DISTINCT FROM p_proposed_canonical_party_id THEN RAISE EXCEPTION 'Correlation claim does not conflict' USING ERRCODE='check_violation';END IF;
 v_evidence:=mesh.fn_record_network_command(v_actor,NULL,'canonical_party_correlation_case',v_id,'correlation_open','none','open',0,p_reason,p_idempotency_key,v_hash,jsonb_build_object('networkAccountId',v_account.id,'currentCanonicalPartyId',v_account.canonical_party_id,'proposedCanonicalPartyId',p_proposed_canonical_party_id),p_actor_id);PERFORM set_config('app.mesh_command_evidence_id',v_evidence::text,true);INSERT INTO mesh.canonical_party_correlation_case(id,tenant_id,network_account_id,current_canonical_party_id,proposed_canonical_party_id,reason,status,row_version,opened_by)VALUES(v_id,v_actor,v_account.id,v_account.canonical_party_id,p_proposed_canonical_party_id,p_reason,'open',1,p_actor_id);PERFORM set_config('app.mesh_command_evidence_id','',true);RETURN QUERY SELECT v_id,'open'::text,1::bigint,v_evidence,false;
END $$;

CREATE OR REPLACE FUNCTION mesh.command_resolve_canonical_party_correlation_case(
  p_case_id uuid,p_action text,p_expected_version bigint,p_reason text,
  p_idempotency_key text,p_actor_id uuid
) RETURNS TABLE(case_id uuid,status text,row_version bigint,evidence_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,mesh,shared AS $$
DECLARE v_case mesh.canonical_party_correlation_case%ROWTYPE;v_actor uuid:=shared.current_tenant_id();v_existing mesh.network_command_evidence%ROWTYPE;v_hash text;v_evidence uuid;v_to text;
BEGIN
 IF master.current_principal_id_soft() IS DISTINCT FROM p_actor_id OR p_action NOT IN('accept','reject') OR p_expected_version<1 OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Invalid correlation resolution' USING ERRCODE='check_violation';END IF;
 v_hash:=encode(public.digest(convert_to(jsonb_build_object('caseId',p_case_id,'action',p_action,'expectedVersion',p_expected_version,'reason',p_reason,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||':mesh:'||p_idempotency_key,0));SELECT * INTO v_existing FROM mesh.network_command_evidence WHERE actor_tenant_id=v_actor AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF v_existing.command_fingerprint<>v_hash THEN RAISE EXCEPTION 'Mesh idempotency key was reused with a different command' USING ERRCODE='unique_violation';END IF;RETURN QUERY SELECT v_existing.aggregate_id,v_existing.to_state,v_existing.resulting_version,v_existing.id,true;RETURN;END IF;
 SELECT * INTO v_case FROM mesh.canonical_party_correlation_case WHERE tenant_id=v_actor AND id=p_case_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Correlation case is not visible to owner' USING ERRCODE='no_data_found';END IF;IF v_case.status<>'open' OR v_case.row_version<>p_expected_version OR v_case.opened_by=p_actor_id THEN RAISE EXCEPTION 'Correlation resolution is stale, terminal or violates maker-checker' USING ERRCODE='serialization_failure';END IF;
 v_to:=CASE p_action WHEN 'accept' THEN 'accepted' ELSE 'rejected' END;v_evidence:=mesh.fn_record_network_command(v_actor,NULL,'canonical_party_correlation_case',v_case.id,'correlation_'||p_action,'open',v_to,p_expected_version,p_reason,p_idempotency_key,v_hash,jsonb_build_object('networkAccountId',v_case.network_account_id,'currentCanonicalPartyId',v_case.current_canonical_party_id,'proposedCanonicalPartyId',v_case.proposed_canonical_party_id),p_actor_id);PERFORM set_config('app.mesh_command_evidence_id',v_evidence::text,true);IF p_action='accept' THEN UPDATE mesh.network_account SET canonical_party_id=v_case.proposed_canonical_party_id,updated_by=p_actor_id WHERE tenant_id=v_actor AND id=v_case.network_account_id AND canonical_party_id IS NOT DISTINCT FROM v_case.current_canonical_party_id;IF NOT FOUND THEN RAISE EXCEPTION 'Canonical-party correlation changed concurrently' USING ERRCODE='serialization_failure';END IF;END IF;UPDATE mesh.canonical_party_correlation_case AS target SET status=v_to,row_version=target.row_version+1,resolution_reason=p_reason,resolved_by=p_actor_id,resolved_at=clock_timestamp() WHERE target.id=v_case.id;PERFORM set_config('app.mesh_command_evidence_id','',true);RETURN QUERY SELECT v_case.id,v_to,p_expected_version+1,v_evidence,false;
END $$;

CREATE TRIGGER trg_canonical_party_correlation_case_command BEFORE INSERT OR UPDATE OF status,row_version ON mesh.canonical_party_correlation_case FOR EACH ROW EXECUTE FUNCTION mesh.trg_enforce_g3_command();
CREATE TRIGGER trg_canonical_party_correlation_case_immutable BEFORE UPDATE ON mesh.canonical_party_correlation_case FOR EACH ROW WHEN(NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.network_account_id IS DISTINCT FROM OLD.network_account_id OR NEW.current_canonical_party_id IS DISTINCT FROM OLD.current_canonical_party_id OR NEW.proposed_canonical_party_id IS DISTINCT FROM OLD.proposed_canonical_party_id OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.opened_by IS DISTINCT FROM OLD.opened_by OR NEW.created_at IS DISTINCT FROM OLD.created_at) EXECUTE FUNCTION mesh.trg_reject_immutable_exchange_evidence();
CREATE TRIGGER trg_canonical_party_correlation_case_no_delete BEFORE DELETE ON mesh.canonical_party_correlation_case FOR EACH ROW EXECUTE FUNCTION mesh.trg_reject_immutable_exchange_evidence();
CREATE TRIGGER trg_bank_account_retrieval_evidence_immutable BEFORE UPDATE OR DELETE ON mesh.bank_account_retrieval_evidence FOR EACH ROW EXECUTE FUNCTION mesh.trg_reject_immutable_exchange_evidence();
CREATE TRIGGER trg_network_account_profile_address_updated BEFORE UPDATE ON mesh.network_account_profile_address FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

ALTER TABLE mesh.bank_disclosure_purpose ENABLE ROW LEVEL SECURITY;ALTER TABLE mesh.bank_disclosure_purpose FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_profile_address ENABLE ROW LEVEL SECURITY;ALTER TABLE mesh.network_account_profile_address FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_account_retrieval_evidence ENABLE ROW LEVEL SECURITY;ALTER TABLE mesh.bank_account_retrieval_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.canonical_party_correlation_case ENABLE ROW LEVEL SECURITY;ALTER TABLE mesh.canonical_party_correlation_case FORCE ROW LEVEL SECURITY;
CREATE POLICY bank_disclosure_purpose_read ON mesh.bank_disclosure_purpose FOR SELECT USING(true);CREATE POLICY bank_disclosure_purpose_owner ON mesh.bank_disclosure_purpose FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY network_account_profile_address_tenant ON mesh.network_account_profile_address USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());CREATE POLICY network_account_profile_address_owner ON mesh.network_account_profile_address FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY bank_account_retrieval_evidence_recipient ON mesh.bank_account_retrieval_evidence FOR SELECT USING(recipient_tenant_id=shared.current_tenant_id_soft());CREATE POLICY bank_account_retrieval_evidence_owner ON mesh.bank_account_retrieval_evidence FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY canonical_party_correlation_case_tenant ON mesh.canonical_party_correlation_case FOR SELECT USING(tenant_id=shared.current_tenant_id_soft());CREATE POLICY canonical_party_correlation_case_owner ON mesh.canonical_party_correlation_case FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

REVOKE ALL ON mesh.bank_disclosure_purpose,mesh.network_account_profile_address,mesh.bank_account_retrieval_evidence,mesh.canonical_party_correlation_case FROM PUBLIC;
GRANT SELECT ON mesh.bank_disclosure_purpose,mesh.network_account_profile_address,mesh.canonical_party_correlation_case TO athyperapp;
GRANT INSERT,UPDATE ON mesh.network_account_profile_address TO athyperapp;
GRANT ALL PRIVILEGES ON mesh.bank_disclosure_purpose,mesh.network_account_profile_address,mesh.bank_account_retrieval_evidence,mesh.canonical_party_correlation_case TO athyperadmin;
REVOKE INSERT,UPDATE,DELETE ON mesh.bank_account_retrieval_evidence,mesh.canonical_party_correlation_case FROM athyperapp;
GRANT USAGE ON SCHEMA mesh TO athyper_protected_value_retriever;
REVOKE ALL ON FUNCTION mesh.command_rotate_bank_protected_token(uuid,text,integer,text,text,uuid),mesh.command_retrieve_bank_protected_token(uuid,integer,text,text,uuid),mesh.command_open_canonical_party_correlation_case(uuid,uuid,text,text,uuid),mesh.command_resolve_canonical_party_correlation_case(uuid,text,bigint,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mesh.command_rotate_bank_protected_token(uuid,text,integer,text,text,uuid),mesh.command_open_canonical_party_correlation_case(uuid,uuid,text,text,uuid),mesh.command_resolve_canonical_party_correlation_case(uuid,text,bigint,text,text,uuid) TO athyperapp,athyperadmin;
GRANT EXECUTE ON FUNCTION mesh.command_retrieve_bank_protected_token(uuid,integer,text,text,uuid) TO athyper_protected_value_retriever;

COMMENT ON TABLE mesh.bank_account_retrieval_evidence IS 'Immutable purpose-bound retrieval audit. Contains token hashes and authorization coordinates only, never a token or bank identifier.';
COMMENT ON TABLE mesh.canonical_party_correlation_case IS 'Stewarded conflicting correlation claim. Opening a case grants no access and never overwrites the current canonical-party coordinate.';

REVOKE ALL ON mesh.business_partner_delivery_acknowledgement FROM PUBLIC;
REVOKE ALL ON FUNCTION mesh.trg_delivery_acknowledgement_immutable() FROM PUBLIC;
GRANT SELECT ON mesh.business_partner_delivery_acknowledgement TO athyperapp;
GRANT USAGE ON SCHEMA mesh TO athyper_jobs_service;
GRANT SELECT, INSERT ON mesh.business_partner_delivery_acknowledgement TO athyper_jobs_service;

REVOKE ALL ON FUNCTION mesh.read_eligible_bank_disclosure_source(uuid, uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mesh.read_eligible_bank_disclosure_source(uuid, uuid, uuid, uuid, text) TO athyperapp, athyperadmin;

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
 GRANT SELECT,INSERT ON mesh.bank_provisional_reference TO athyperapp;
 END IF;
END $$;
