-- Neon party finance/compliance optional pack.

CREATE TABLE master.certification_type (
  id uuid DEFAULT shared.uuidv7() NOT NULL,
  tenant_id uuid,
  code text NOT NULL,
  name text NOT NULL,
  issuing_body text,
  category text,
  description text,
  is_custom boolean DEFAULT false NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  is_active boolean GENERATED ALWAYS AS (status = 'active'::text) STORED,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamp with time zone,
  updated_by uuid,
  CONSTRAINT certification_type_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.certification_type IS
  'ARCHETYPE=A;SCOPE=P+T. Shared certification type registry. NULL tenant_id denotes a platform type; non-NULL denotes a tenant custom type.';
COMMENT ON COLUMN master.certification_type.tenant_id IS
  'NULL = platform-wide standard available to all tenants. UUID = tenant-scoped custom type.';

CREATE TABLE master.certification (
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
  status text DEFAULT 'active'::text NOT NULL,
  is_active boolean GENERATED ALWAYS AS (status = 'active'::text) STORED,
  status_changed_at timestamp with time zone,
  status_changed_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamp with time zone,
  updated_by uuid,
  company_code_id uuid,
  site_id uuid,
  CONSTRAINT certification_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
  CONSTRAINT certification_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.certification IS
  'ARCHETYPE=B;SCOPE=T. Shared polymorphic certification record for a party, organization, person, product, or other domain owner.';
COMMENT ON COLUMN master.certification.certification_type_id IS
  'Registered shared certification type. Exactly one of certification_type_id or custom_name must be set.';
COMMENT ON COLUMN master.certification.document_attachment_id IS
  'Optional identifier of the uploaded certificate document; attachment ownership is resolved by the consuming plane.';
COMMENT ON COLUMN master.certification.company_code_id IS
  'Optional company scope identifier. NULL means the certification applies to the entire owner.';
COMMENT ON COLUMN master.certification.site_id IS
  'Optional physical-site scope identifier. NULL means the certification applies to the entire owner.';
