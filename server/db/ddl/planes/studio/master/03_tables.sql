CREATE TABLE master.canonical_party (
  id uuid NOT NULL DEFAULT shared.uuidv7(), authority_tenant_id uuid NOT NULL,
  party_kind master.canonical_party_kind_d NOT NULL, legal_name text NOT NULL,
  display_name text NOT NULL, incorporation_country_code character(2),
  verification_status master.party_verification_status_d NOT NULL DEFAULT 'unverified',
  status master.party_lifecycle_status_d NOT NULL DEFAULT 'draft', merged_into_party_id uuid,
  record_version bigint NOT NULL DEFAULT 1, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status_changed_at timestamptz, status_changed_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
  CONSTRAINT canonical_party_pkey PRIMARY KEY(id),
  CONSTRAINT canonical_party_tenant_id_uq UNIQUE(authority_tenant_id,id),
  CONSTRAINT canonical_party_names_chk CHECK (btrim(legal_name)<>'' AND btrim(display_name)<>''),
  CONSTRAINT canonical_party_merge_state_chk CHECK ((status='merged')=(merged_into_party_id IS NOT NULL)),
  CONSTRAINT canonical_party_no_self_merge_chk CHECK (merged_into_party_id IS NULL OR merged_into_party_id<>id),
  CONSTRAINT canonical_party_version_chk CHECK(record_version>0),
  CONSTRAINT canonical_party_metadata_chk CHECK(jsonb_typeof(metadata)='object'),
  CONSTRAINT canonical_party_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
  CONSTRAINT canonical_party_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE master.canonical_party_identifier (
  id uuid NOT NULL DEFAULT shared.uuidv7(), authority_tenant_id uuid NOT NULL, party_id uuid NOT NULL,
  scheme text NOT NULL, issuer_country_code character(2), issuer_authority text,
  normalized_value text NOT NULL, value_hash text NOT NULL, masked_display text,
  claim_status master.party_identifier_claim_status_d NOT NULL DEFAULT 'claimed',
  verification_status master.party_verification_status_d NOT NULL DEFAULT 'unverified',
  evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, verified_at timestamptz, verified_by uuid,
  effective_from timestamptz NOT NULL DEFAULT now(), effective_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
  CONSTRAINT canonical_party_identifier_pkey PRIMARY KEY(id),
  CONSTRAINT canonical_party_identifier_scheme_chk CHECK(scheme~'^[a-z][a-z0-9_.:-]{1,62}$'),
  CONSTRAINT canonical_party_identifier_hash_chk CHECK(value_hash~'^[a-f0-9]{64}$'),
  CONSTRAINT canonical_party_identifier_value_chk CHECK(btrim(normalized_value)<>''),
  CONSTRAINT canonical_party_identifier_range_chk CHECK(effective_until IS NULL OR effective_until>effective_from),
  CONSTRAINT canonical_party_identifier_evidence_chk CHECK(jsonb_typeof(evidence_snapshot)='object'),
  CONSTRAINT canonical_party_identifier_verify_pair_chk CHECK((verified_at IS NULL)=(verified_by IS NULL)),
  CONSTRAINT canonical_party_identifier_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE master.canonical_party_relationship (
  id uuid NOT NULL DEFAULT shared.uuidv7(), authority_tenant_id uuid NOT NULL,
  from_party_id uuid NOT NULL, to_party_id uuid NOT NULL, relationship_kind text NOT NULL,
  verification_status master.party_verification_status_d NOT NULL DEFAULT 'unverified',
  evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status master.party_relationship_status_d NOT NULL DEFAULT 'pending',
  effective_from timestamptz NOT NULL, effective_until timestamptz,
  status_changed_at timestamptz, status_changed_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
  CONSTRAINT canonical_party_relationship_pkey PRIMARY KEY(id),
  CONSTRAINT canonical_party_relationship_kind_chk CHECK(relationship_kind~'^[a-z][a-z0-9_.:-]{1,62}$'),
  CONSTRAINT canonical_party_relationship_no_self_chk CHECK(from_party_id<>to_party_id),
  CONSTRAINT canonical_party_relationship_range_chk CHECK(effective_until IS NULL OR effective_until>effective_from),
  CONSTRAINT canonical_party_relationship_evidence_chk CHECK(jsonb_typeof(evidence_snapshot)='object'),
  CONSTRAINT canonical_party_relationship_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
  CONSTRAINT canonical_party_relationship_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE master.canonical_party_merge (
  id uuid NOT NULL DEFAULT shared.uuidv7(), authority_tenant_id uuid NOT NULL,
  losing_party_id uuid NOT NULL, surviving_party_id uuid NOT NULL, approved_case_id uuid,
  reason text NOT NULL, before_snapshot jsonb NOT NULL, after_snapshot jsonb NOT NULL,
  effective_at timestamptz NOT NULL, approved_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  CONSTRAINT canonical_party_merge_pkey PRIMARY KEY(id),
  CONSTRAINT canonical_party_merge_loser_uq UNIQUE(losing_party_id),
  CONSTRAINT canonical_party_merge_no_self_chk CHECK(losing_party_id<>surviving_party_id),
  CONSTRAINT canonical_party_merge_reason_chk CHECK(btrim(reason)<>''),
  CONSTRAINT canonical_party_merge_snapshots_chk CHECK(jsonb_typeof(before_snapshot)='object' AND jsonb_typeof(after_snapshot)='object')
);

COMMENT ON TABLE master.canonical_party IS 'Admin authority for deduplicated real-world parties. A party is not a tenant, identity organization, legal entity record, business partner, or network account.';
COMMENT ON COLUMN master.canonical_party.id IS 'Stable opaque reconciliation coordinate copied to application planes; it creates no cross-database foreign key.';
