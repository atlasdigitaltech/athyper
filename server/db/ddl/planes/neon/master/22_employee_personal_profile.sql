-- Structured employee personal-history records. Sensitive values remain tokenized
-- or refer to protected content; normal Employee 360 reads must not select them.
CREATE TABLE IF NOT EXISTS master.person_address_use (
  id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
  person_id uuid NOT NULL, address_id uuid NOT NULL,
  purpose text NOT NULL, is_primary boolean NOT NULL DEFAULT false,
  effective_from date NOT NULL, effective_until date,
  status text NOT NULL DEFAULT 'active', row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  updated_at timestamptz, updated_by uuid,
  CONSTRAINT person_address_use_tenant_id_uq UNIQUE(tenant_id,id),
  CONSTRAINT person_address_use_person_fk FOREIGN KEY(tenant_id,person_id) REFERENCES master.person(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT person_address_use_address_fk FOREIGN KEY(tenant_id,address_id) REFERENCES master.address(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT person_address_use_purpose_chk CHECK(purpose IN('home','mailing','temporary','other')),
  CONSTRAINT person_address_use_dates_chk CHECK(effective_until IS NULL OR effective_until>effective_from),
  CONSTRAINT person_address_use_status_chk CHECK(status IN('active','inactive','archived')),
  CONSTRAINT person_address_use_version_chk CHECK(row_version>=1),
  CONSTRAINT person_address_use_audit_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
CREATE INDEX IF NOT EXISTS person_address_use_person_idx ON master.person_address_use(tenant_id,person_id,purpose,effective_from DESC);
ALTER TABLE master.person_address_use ADD CONSTRAINT person_address_use_one_primary_excl
  EXCLUDE USING gist(tenant_id WITH =,person_id WITH =,purpose WITH =,daterange(effective_from,effective_until,'[)') WITH &&)
  WHERE(is_primary AND status='active');

CREATE TABLE IF NOT EXISTS master.person_identity_document (
  id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
  person_id uuid NOT NULL, document_type text NOT NULL,
  value_token text NOT NULL, issuing_country_code char(2),
  issued_on date, valid_from date, expires_on date, issue_place text,
  front_content_item_id uuid, back_content_item_id uuid,
  verification_status text NOT NULL DEFAULT 'unverified',
  supersedes_document_id uuid, status text NOT NULL DEFAULT 'active',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  updated_at timestamptz, updated_by uuid,
  CONSTRAINT person_identity_document_tenant_id_uq UNIQUE(tenant_id,id),
  CONSTRAINT person_identity_document_person_fk FOREIGN KEY(tenant_id,person_id) REFERENCES master.person(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT person_identity_document_front_fk FOREIGN KEY(tenant_id,front_content_item_id) REFERENCES document.content_item(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT person_identity_document_back_fk FOREIGN KEY(tenant_id,back_content_item_id) REFERENCES document.content_item(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT person_identity_document_supersedes_fk FOREIGN KEY(tenant_id,supersedes_document_id) REFERENCES master.person_identity_document(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT person_identity_document_type_chk CHECK(document_type~'^[a-z][a-z0-9_.-]{1,62}$'),
  CONSTRAINT person_identity_document_token_chk CHECK(length(btrim(value_token)) BETWEEN 8 AND 1024),
  CONSTRAINT person_identity_document_dates_chk CHECK((valid_from IS NULL OR expires_on IS NULL OR expires_on>=valid_from) AND (issued_on IS NULL OR expires_on IS NULL OR expires_on>=issued_on)),
  CONSTRAINT person_identity_document_verification_chk CHECK(verification_status IN('unverified','pending','verified','rejected','expired')),
  CONSTRAINT person_identity_document_status_chk CHECK(status IN('active','inactive','archived')),
  CONSTRAINT person_identity_document_version_chk CHECK(row_version>=1),
  CONSTRAINT person_identity_document_audit_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
CREATE INDEX IF NOT EXISTS person_identity_document_person_idx ON master.person_identity_document(tenant_id,person_id,document_type,created_at DESC);

CREATE TABLE IF NOT EXISTS master.person_emergency_contact (
  id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
  person_id uuid NOT NULL, name_token text NOT NULL,
  phone_token text, email_token text, relationship_code text,
  priority smallint NOT NULL DEFAULT 1,
  effective_from date NOT NULL, effective_until date,
  status text NOT NULL DEFAULT 'active', row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  updated_at timestamptz, updated_by uuid,
  CONSTRAINT person_emergency_contact_tenant_id_uq UNIQUE(tenant_id,id),
  CONSTRAINT person_emergency_contact_person_fk FOREIGN KEY(tenant_id,person_id) REFERENCES master.person(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT person_emergency_contact_name_chk CHECK(length(btrim(name_token)) BETWEEN 8 AND 1024),
  CONSTRAINT person_emergency_contact_priority_chk CHECK(priority BETWEEN 1 AND 99),
  CONSTRAINT person_emergency_contact_dates_chk CHECK(effective_until IS NULL OR effective_until>effective_from),
  CONSTRAINT person_emergency_contact_status_chk CHECK(status IN('active','inactive','archived')),
  CONSTRAINT person_emergency_contact_version_chk CHECK(row_version>=1),
  CONSTRAINT person_emergency_contact_audit_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
CREATE INDEX IF NOT EXISTS person_emergency_contact_person_idx ON master.person_emergency_contact(tenant_id,person_id,priority,effective_from DESC);
ALTER TABLE master.person_emergency_contact ADD CONSTRAINT person_emergency_contact_priority_excl
  EXCLUDE USING gist(tenant_id WITH =,person_id WITH =,priority WITH =,daterange(effective_from,effective_until,'[)') WITH &&)
  WHERE(status='active');

CREATE TABLE IF NOT EXISTS master.person_education (
  id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
  person_id uuid NOT NULL, institution_name text NOT NULL,
  qualification_name text NOT NULL, level_code text, field_of_study text,
  started_on date, completed_on date, completion_year smallint,
  verification_status text NOT NULL DEFAULT 'unverified',
  evidence_content_item_id uuid, status text NOT NULL DEFAULT 'active',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  updated_at timestamptz, updated_by uuid,
  CONSTRAINT person_education_tenant_id_uq UNIQUE(tenant_id,id),
  CONSTRAINT person_education_person_fk FOREIGN KEY(tenant_id,person_id) REFERENCES master.person(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT person_education_evidence_fk FOREIGN KEY(tenant_id,evidence_content_item_id) REFERENCES document.content_item(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT person_education_names_chk CHECK(btrim(institution_name)<>'' AND btrim(qualification_name)<>''),
  CONSTRAINT person_education_dates_chk CHECK((started_on IS NULL OR completed_on IS NULL OR completed_on>=started_on) AND (completion_year IS NULL OR completion_year BETWEEN 1900 AND 9999) AND (completed_on IS NULL OR completion_year IS NULL OR extract(year FROM completed_on)=completion_year)),
  CONSTRAINT person_education_verification_chk CHECK(verification_status IN('unverified','pending','verified','rejected')),
  CONSTRAINT person_education_status_chk CHECK(status IN('active','inactive','archived')),
  CONSTRAINT person_education_version_chk CHECK(row_version>=1),
  CONSTRAINT person_education_audit_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
CREATE INDEX IF NOT EXISTS person_education_person_idx ON master.person_education(tenant_id,person_id,completed_on DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS master.person_prior_employment (
  id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
  person_id uuid NOT NULL, employer_name text NOT NULL, role_title text NOT NULL,
  started_on date, ended_on date, start_year smallint, end_year smallint,
  country_code char(2), evidence_content_item_id uuid,
  verification_status text NOT NULL DEFAULT 'unverified',
  status text NOT NULL DEFAULT 'active', row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  updated_at timestamptz, updated_by uuid,
  CONSTRAINT person_prior_employment_tenant_id_uq UNIQUE(tenant_id,id),
  CONSTRAINT person_prior_employment_person_fk FOREIGN KEY(tenant_id,person_id) REFERENCES master.person(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT person_prior_employment_evidence_fk FOREIGN KEY(tenant_id,evidence_content_item_id) REFERENCES document.content_item(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT person_prior_employment_names_chk CHECK(btrim(employer_name)<>'' AND btrim(role_title)<>''),
  CONSTRAINT person_prior_employment_dates_chk CHECK((started_on IS NULL OR ended_on IS NULL OR ended_on>=started_on) AND (start_year IS NULL OR start_year BETWEEN 1900 AND 9999) AND (end_year IS NULL OR end_year BETWEEN 1900 AND 9999) AND (start_year IS NULL OR end_year IS NULL OR end_year>=start_year) AND (started_on IS NULL OR start_year IS NULL OR extract(year FROM started_on)=start_year) AND (ended_on IS NULL OR end_year IS NULL OR extract(year FROM ended_on)=end_year)),
  CONSTRAINT person_prior_employment_verification_chk CHECK(verification_status IN('unverified','pending','verified','rejected')),
  CONSTRAINT person_prior_employment_status_chk CHECK(status IN('active','inactive','archived')),
  CONSTRAINT person_prior_employment_version_chk CHECK(row_version>=1),
  CONSTRAINT person_prior_employment_audit_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
CREATE INDEX IF NOT EXISTS person_prior_employment_person_idx ON master.person_prior_employment(tenant_id,person_id,ended_on DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS master.person_health_profile (
  id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
  person_id uuid NOT NULL, blood_group_code text,
  protected_content_item_id uuid, recorded_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active', row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  updated_at timestamptz, updated_by uuid,
  CONSTRAINT person_health_profile_tenant_id_uq UNIQUE(tenant_id,id),
  CONSTRAINT person_health_profile_person_fk FOREIGN KEY(tenant_id,person_id) REFERENCES master.person(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT person_health_profile_content_fk FOREIGN KEY(tenant_id,protected_content_item_id) REFERENCES document.content_item(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT person_health_profile_blood_chk CHECK(blood_group_code IS NULL OR blood_group_code IN('A+','A-','B+','B-','AB+','AB-','O+','O-','unknown')),
  CONSTRAINT person_health_profile_status_chk CHECK(status IN('active','inactive','archived')),
  CONSTRAINT person_health_profile_version_chk CHECK(row_version>=1),
  CONSTRAINT person_health_profile_audit_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
CREATE INDEX IF NOT EXISTS person_health_profile_person_idx ON master.person_health_profile(tenant_id,person_id,recorded_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS person_health_profile_current_uq ON master.person_health_profile(tenant_id,person_id) WHERE status='active';

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['person_address_use','person_identity_document','person_emergency_contact','person_education','person_prior_employment','person_health_profile'] LOOP
    EXECUTE format('ALTER TABLE master.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE master.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_access ON master.%I FOR ALL USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id())',table_name);
    EXECUTE format('CREATE POLICY seed_write ON master.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)',table_name);
    EXECUTE format('REVOKE ALL ON master.%I FROM PUBLIC',table_name);
    EXECUTE format('GRANT SELECT ON master.%I TO athyperapp',table_name);
  END LOOP;
END $$;
