BEGIN;

DO $$
BEGIN
    IF current_database() <> 'athyper_studio'
       OR current_setting('app.database_plane', true) <> 'studio' THEN
        RAISE EXCEPTION 'External-worker identity projection migration requires the Studio plane';
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS trustiam.identity_projection (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    authority_tenant_id uuid NOT NULL,
    source_plane shared.application_plane_d NOT NULL,
    source_tenant_id uuid NOT NULL,
    person_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    relationship_kind text NOT NULL,
    source_ref text NOT NULL,
    realm_key text NOT NULL,
    normalized_identifier text NOT NULL,
    display_name text NOT NULL,
    desired_version bigint NOT NULL,
    desired_hash char(64) NOT NULL,
    desired_status text NOT NULL,
    desired_applications jsonb NOT NULL,
    reconciliation_status trustiam.reconciliation_status_d NOT NULL DEFAULT 'pending',
    provider_subject text,
    provider_sequence bigint,
    observed_status text,
    observed_version bigint,
    observed_hash char(64),
    observed_at timestamptz,
    last_error_code text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT trustiam_identity_projection_pkey PRIMARY KEY(id),
    CONSTRAINT trustiam_identity_projection_tenant_id_uq UNIQUE(authority_tenant_id,id),
    CONSTRAINT trustiam_identity_projection_person_uq UNIQUE(authority_tenant_id,source_plane,source_tenant_id,person_id),
    CONSTRAINT trustiam_identity_projection_identifier_uq UNIQUE(authority_tenant_id,realm_key,normalized_identifier),
    CONSTRAINT trustiam_identity_projection_version_chk CHECK(desired_version>0 AND (provider_sequence IS NULL OR provider_sequence>0) AND (observed_version IS NULL OR observed_version>0)),
    CONSTRAINT trustiam_identity_projection_hash_chk CHECK(desired_hash~'^[a-f0-9]{64}$' AND (observed_hash IS NULL OR observed_hash~'^[a-f0-9]{64}$')),
    CONSTRAINT trustiam_identity_projection_realm_chk CHECK(realm_key~'^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT trustiam_identity_projection_identifier_chk CHECK(btrim(normalized_identifier)<>'' AND length(normalized_identifier)<=320 AND btrim(display_name)<>''),
    CONSTRAINT trustiam_identity_projection_status_chk CHECK(desired_status IN('invited','active','suspended','deprovisioned') AND (observed_status IS NULL OR observed_status IN('invited','active','suspended','deprovisioned'))),
    CONSTRAINT trustiam_identity_projection_applications_chk CHECK(jsonb_typeof(desired_applications)='array' AND (desired_status IN('suspended','deprovisioned') OR jsonb_array_length(desired_applications)>0)),
    CONSTRAINT trustiam_identity_projection_observation_chk CHECK(
        (provider_subject IS NULL AND provider_sequence IS NULL AND observed_status IS NULL AND observed_version IS NULL AND observed_hash IS NULL AND observed_at IS NULL)
        OR (provider_subject IS NOT NULL AND observed_status IS NOT NULL AND observed_version IS NOT NULL AND observed_hash IS NOT NULL AND observed_at IS NOT NULL)
    ),
    CONSTRAINT trustiam_identity_projection_error_chk CHECK((reconciliation_status='failed')=(last_error_code IS NOT NULL)),
    CONSTRAINT trustiam_identity_projection_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM trustiam.identity_projection
         GROUP BY authority_tenant_id, source_plane, source_tenant_id,
                  relationship_kind, source_ref
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate identity source coordinates require reconciliation before migration'
            USING ERRCODE = 'unique_violation';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM trustiam.identity_projection
         WHERE NOT (
             (relationship_kind = 'employer' AND source_ref LIKE 'employment:%')
             OR (relationship_kind = 'contact' AND source_ref LIKE 'business_partner_contact:%')
         )
    ) THEN
        RAISE EXCEPTION 'Historical identity projection has an unsupported relationship/source coordinate'
            USING ERRCODE = 'check_violation';
    END IF;
END;
$$;

ALTER TABLE trustiam.identity_projection
    DROP CONSTRAINT IF EXISTS trustiam_identity_projection_source_uq,
    DROP CONSTRAINT IF EXISTS trustiam_identity_projection_relationship_chk,
    DROP CONSTRAINT IF EXISTS trustiam_identity_projection_source_ref_chk;

ALTER TABLE trustiam.identity_projection
    ADD CONSTRAINT trustiam_identity_projection_source_uq
        UNIQUE(authority_tenant_id, source_plane, source_tenant_id,
               relationship_kind, source_ref),
    ADD CONSTRAINT trustiam_identity_projection_relationship_chk
        CHECK(relationship_kind IN ('employer', 'contact', 'external_worker')),
    ADD CONSTRAINT trustiam_identity_projection_source_ref_chk
        CHECK(
            (relationship_kind = 'employer' AND source_ref LIKE 'employment:%')
            OR (relationship_kind = 'contact' AND source_ref LIKE 'business_partner_contact:%')
            OR (relationship_kind = 'external_worker' AND source_ref LIKE 'worker_engagement:%')
        );

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'trustiam.identity_projection'::regclass
           AND conname = 'trustiam_identity_projection_tenant_fk'
    ) THEN
        ALTER TABLE trustiam.identity_projection
            ADD CONSTRAINT trustiam_identity_projection_tenant_fk
            FOREIGN KEY(authority_tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'trustiam.identity_projection'::regclass
           AND conname = 'trustiam_identity_projection_organization_fk'
    ) THEN
        ALTER TABLE trustiam.identity_projection
            ADD CONSTRAINT trustiam_identity_projection_organization_fk
            FOREIGN KEY(authority_tenant_id,organization_id)
            REFERENCES trustiam.organization(authority_tenant_id,id) ON DELETE RESTRICT;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS trustiam_identity_projection_reconcile_idx
    ON trustiam.identity_projection(reconciliation_status,updated_at,created_at)
    WHERE reconciliation_status IN('pending','drifted','failed');

COMMENT ON TABLE trustiam.identity_projection IS
    'Desired and safely fenced observed identity projection, uniquely correlated to its employment, BP-contact, or worker-engagement authority. desired_applications is transport input only; plane-local principal, membership, role and scope tables remain authoritative.';

COMMIT;
