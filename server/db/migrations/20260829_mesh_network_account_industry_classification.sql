BEGIN;

DO $$ BEGIN
    ALTER TABLE shared.industry_code
        ADD CONSTRAINT industry_code_domain_id_uq UNIQUE (domain_code, id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE mesh.network_account_industry_classification (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    network_account_id uuid NOT NULL,
    industry_domain_code text NOT NULL,
    industry_code_id uuid NOT NULL,
    assignment_kind text NOT NULL DEFAULT 'declared',
    is_primary boolean NOT NULL DEFAULT false,
    confidence smallint,
    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    effective_until date,
    verified_at timestamptz,
    verified_by uuid,
    source_system text,
    source_reference text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status mesh.profile_record_status_d NOT NULL DEFAULT 'active',
    is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT network_account_industry_classification_pkey PRIMARY KEY (id),
    CONSTRAINT network_account_industry_classification_tenant_id_uq UNIQUE (tenant_id,id),
    CONSTRAINT network_account_industry_classification_domain_chk CHECK (industry_domain_code IN ('isic','naics')),
    CONSTRAINT network_account_industry_classification_kind_chk CHECK (assignment_kind IN ('declared','verified','inferred','imported')),
    CONSTRAINT network_account_industry_classification_confidence_chk CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 100),
    CONSTRAINT network_account_industry_classification_range_chk CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT network_account_industry_classification_verification_chk CHECK (((verified_at IS NULL) = (verified_by IS NULL)) AND (assignment_kind <> 'verified' OR verified_at IS NOT NULL)),
    CONSTRAINT network_account_industry_classification_source_chk CHECK ((source_system IS NULL OR (btrim(source_system) <> '' AND length(source_system) <= 128)) AND (source_reference IS NULL OR (btrim(source_reference) <> '' AND length(source_reference) <= 256))),
    CONSTRAINT network_account_industry_classification_metadata_chk CHECK (jsonb_typeof(metadata)='object'),
    CONSTRAINT network_account_industry_classification_status_pair_chk CHECK ((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT network_account_industry_classification_audit_pair_chk CHECK ((updated_at IS NULL)=(updated_by IS NULL)),
    CONSTRAINT network_account_industry_classification_account_fk FOREIGN KEY (tenant_id,network_account_id) REFERENCES mesh.network_account(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT network_account_industry_classification_code_fk FOREIGN KEY (industry_domain_code,industry_code_id) REFERENCES shared.industry_code(domain_code,id) ON DELETE RESTRICT,
    CONSTRAINT network_account_industry_classification_verified_by_fk FOREIGN KEY (tenant_id,verified_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT network_account_industry_classification_no_overlap EXCLUDE USING gist (tenant_id WITH =,network_account_id WITH =,industry_domain_code WITH =,industry_code_id WITH =,daterange(effective_from,COALESCE(effective_until,'infinity'::date),'[)') WITH &&) WHERE (status='active'),
    CONSTRAINT network_account_industry_classification_primary_no_overlap EXCLUDE USING gist (tenant_id WITH =,network_account_id WITH =,industry_domain_code WITH =,daterange(effective_from,COALESCE(effective_until,'infinity'::date),'[)') WITH &&) WHERE (is_primary AND status='active')
);

CREATE UNIQUE INDEX network_account_industry_classification_current_uq ON mesh.network_account_industry_classification(tenant_id,network_account_id,industry_domain_code,industry_code_id) WHERE effective_until IS NULL AND status='active';
CREATE UNIQUE INDEX network_account_industry_classification_primary_uq ON mesh.network_account_industry_classification(tenant_id,network_account_id,industry_domain_code) WHERE is_primary AND effective_until IS NULL AND status='active';
CREATE INDEX network_account_industry_classification_code_idx ON mesh.network_account_industry_classification(industry_domain_code,industry_code_id,status);

CREATE TRIGGER trg_network_account_industry_classification_guard BEFORE UPDATE ON mesh.network_account_industry_classification FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_network_identity();
CREATE TRIGGER trg_network_account_industry_classification_creation_evidence BEFORE UPDATE ON mesh.network_account_industry_classification FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_creation_evidence();
CREATE TRIGGER trg_network_account_industry_classification_status BEFORE UPDATE OF status ON mesh.network_account_industry_classification FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_network_account_industry_classification_updated BEFORE UPDATE ON mesh.network_account_industry_classification FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

ALTER TABLE mesh.network_account_industry_classification ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_industry_classification FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON mesh.network_account_industry_classification FOR ALL USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.network_account_industry_classification FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
        GRANT SELECT,INSERT,UPDATE ON mesh.network_account_industry_classification TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        GRANT ALL PRIVILEGES ON mesh.network_account_industry_classification TO athyperadmin;
    END IF;
END $$;

COMMIT;
