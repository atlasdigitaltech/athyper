-- Mesh projection of the Neon-derived party finance/compliance optional pack.
-- The reusable core is tenant/owner scoped; Mesh deliberately omits Neon-only
-- company_code_id and site_id extensions.

CREATE TABLE mesh.certification_type (
  id uuid DEFAULT shared.uuidv7() NOT NULL,
  tenant_id uuid,
  code text NOT NULL,
  name text NOT NULL,
  issuing_body text,
  category text,
  description text,
  is_custom boolean DEFAULT false NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'active' NOT NULL,
  is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz,
  updated_by uuid,
  CONSTRAINT mesh_certification_type_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE mesh.certification_type IS
  'ARCHETYPE=A;SCOPE=P+T. Mesh certification registry. NULL tenant_id is a reusable platform standard; non-NULL is tenant custom.';

CREATE TABLE mesh.certification (
  id uuid DEFAULT shared.uuidv7() NOT NULL,
  tenant_id uuid NOT NULL,
  owner_type text NOT NULL,
  owner_id uuid NOT NULL,
  certification_type_id uuid,
  custom_name text,
  certificate_number text,
  certified_by text,
  certified_location text,
  additional_info text,
  document_attachment_id uuid,
  effective_from date,
  effective_until date,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'active' NOT NULL,
  is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
  status_changed_at timestamptz,
  status_changed_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz,
  updated_by uuid,
  CONSTRAINT mesh_certification_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
  CONSTRAINT mesh_certification_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE mesh.certification IS
  'ARCHETYPE=B;SCOPE=T. Mesh certification attached polymorphically to a network account or another Mesh owner.';
COMMENT ON COLUMN mesh.certification.owner_type IS
  'Use network_account for participant certifications; other Mesh owner types require an owning service contract.';
COMMENT ON COLUMN mesh.certification.document_attachment_id IS
  'Optional document attachment identifier resolved by the Mesh document service.';
