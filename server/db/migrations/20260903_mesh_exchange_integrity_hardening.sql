BEGIN;
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

COMMIT;
