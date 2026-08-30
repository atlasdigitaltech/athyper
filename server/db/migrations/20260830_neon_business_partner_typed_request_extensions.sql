-- BS360-01: typed request staging and immutable materialization evidence.
BEGIN;

DO $$ BEGIN
  IF current_database() <> 'athyper_neon' THEN
    RAISE EXCEPTION 'Business Partner typed request extensions must target athyper_neon';
  END IF;
END $$;

ALTER TABLE document.business_partner_request
  ADD COLUMN extension_mode text NOT NULL DEFAULT 'legacy_untyped',
  ADD COLUMN extension_fingerprint text,
  ADD COLUMN extension_counts jsonb NOT NULL DEFAULT '{"addresses":0,"contactPersons":0,"contactChannels":0,"identifiers":0,"taxRegistrations":0,"classifications":0,"certifications":0}'::jsonb,
  ADD CONSTRAINT business_partner_request_extension_mode_chk CHECK(extension_mode IN('legacy_untyped','typed_v1')),
  ADD CONSTRAINT business_partner_request_extension_fingerprint_chk CHECK(
    (extension_mode='legacy_untyped' AND extension_fingerprint IS NULL)
    OR (extension_mode='typed_v1' AND extension_fingerprint ~ '^[a-f0-9]{64}$')),
  ADD CONSTRAINT business_partner_request_extension_counts_chk CHECK(
    jsonb_typeof(extension_counts)='object'
    AND extension_counts = jsonb_build_object(
      'addresses',extension_counts->'addresses','contactPersons',extension_counts->'contactPersons',
      'contactChannels',extension_counts->'contactChannels','identifiers',extension_counts->'identifiers',
      'taxRegistrations',extension_counts->'taxRegistrations','classifications',extension_counts->'classifications',
      'certifications',extension_counts->'certifications')
    AND NOT jsonb_path_exists(extension_counts,'$.keyvalue().value ? (@.type() != "number" || @ < 0 || @ % 1 != 0)'));

CREATE OR REPLACE FUNCTION document.fn_business_partner_payload_has_restricted_key(p_value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE v_key text; v_child jsonb; v_normalized text;
BEGIN
  IF jsonb_typeof(p_value)='object' THEN
    FOR v_key,v_child IN SELECT key,value FROM jsonb_each(p_value) LOOP
      v_normalized:=regexp_replace(lower(v_key),'[^a-z0-9]','','g');
      IF v_normalized IN('address','addresses','contact','contacts','contactperson','contactpersons','contactchannel','contactchannels',
        'identifier','identifiers','taxregistration','taxregistrations','classification','classifications','certification','certifications',
        'taxidentifier','taxid','nationalidentifier','nationalid') THEN RETURN true; END IF;
      IF document.fn_business_partner_payload_has_restricted_key(v_child) THEN RETURN true; END IF;
    END LOOP;
  ELSIF jsonb_typeof(p_value)='array' THEN
    FOR v_child IN SELECT value FROM jsonb_array_elements(p_value) LOOP
      IF document.fn_business_partner_payload_has_restricted_key(v_child) THEN RETURN true; END IF;
    END LOOP;
  END IF;
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION document.trg_guard_business_partner_request_payload_boundary() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$ BEGIN
  IF TG_OP='UPDATE' AND NEW.extension_mode IS DISTINCT FROM OLD.extension_mode THEN
    RAISE EXCEPTION 'Business Partner request extension mode is immutable' USING ERRCODE='check_violation';
  END IF;
  IF TG_OP='UPDATE' AND OLD.status NOT IN('draft','returned','validation_failed')
    AND (NEW.extension_fingerprint IS DISTINCT FROM OLD.extension_fingerprint OR NEW.extension_counts IS DISTINCT FROM OLD.extension_counts) THEN
    RAISE EXCEPTION 'Reviewed Business Partner request extension summary is immutable' USING ERRCODE='check_violation';
  END IF;
  IF document.fn_business_partner_payload_has_restricted_key(NEW.proposed_payload) THEN
    RAISE EXCEPTION 'Typed identity extensions are not permitted in proposed_payload' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_business_partner_request_payload_boundary
BEFORE INSERT OR UPDATE OF proposed_payload,extension_mode,extension_fingerprint,extension_counts ON document.business_partner_request
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_business_partner_request_payload_boundary();

CREATE TABLE document.business_partner_request_address(
  id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, request_id uuid NOT NULL,
  client_item_key text NOT NULL, definition_field_code text NOT NULL, purpose text NOT NULL,
  address_kind text NOT NULL DEFAULT 'street', line1 text, line2 text, city text, region text, postal_code text, po_box text,
  country_code text NOT NULL, is_primary boolean NOT NULL DEFAULT false, normalized_hash text NOT NULL,
  validation_evidence_id uuid, effective_from date, effective_until date, source_kind text NOT NULL,
  source_reference text, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  PRIMARY KEY(id), UNIQUE(tenant_id,id), UNIQUE(tenant_id,request_id,client_item_key),
  CHECK(client_item_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,126}$'),
  CHECK(definition_field_code ~ '^[A-Za-z][A-Za-z0-9_.-]{1,126}$'),
  CHECK(address_kind IN('street','po_box','rural','military','other')), CHECK(country_code ~ '^[A-Z]{2}$'),
  CHECK(address_kind<>'po_box' OR length(btrim(po_box))>0),
  CHECK(normalized_hash ~ '^[a-f0-9]{64}$'), CHECK(effective_until IS NULL OR effective_from IS NULL OR effective_until>=effective_from),
  FOREIGN KEY(tenant_id,request_id) REFERENCES document.business_partner_request(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,validation_evidence_id) REFERENCES document.business_partner_request_evidence(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT);

CREATE TABLE document.business_partner_request_contact_person(
  id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, request_id uuid NOT NULL,
  client_item_key text NOT NULL, definition_field_code text NOT NULL, contact_name text NOT NULL,
  business_title text, department_name text, role_code text, is_primary boolean NOT NULL DEFAULT false,
  effective_from date, effective_until date, source_kind text NOT NULL, source_reference text,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  PRIMARY KEY(id), UNIQUE(tenant_id,id), UNIQUE(tenant_id,request_id,client_item_key),
  CHECK(client_item_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,126}$'), CHECK(definition_field_code ~ '^[A-Za-z][A-Za-z0-9_.-]{1,126}$'),
  CHECK(length(btrim(contact_name)) BETWEEN 1 AND 255), CHECK(effective_until IS NULL OR effective_from IS NULL OR effective_until>=effective_from),
  FOREIGN KEY(tenant_id,request_id) REFERENCES document.business_partner_request(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT);

CREATE TABLE document.business_partner_request_contact_channel(
  id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, request_id uuid NOT NULL,
  client_item_key text NOT NULL, definition_field_code text NOT NULL, contact_client_item_key text NOT NULL,
  channel_type text NOT NULL, channel_value text NOT NULL, purpose text NOT NULL, is_primary boolean NOT NULL DEFAULT false,
  effective_from date, effective_until date, source_kind text NOT NULL, source_reference text,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  PRIMARY KEY(id), UNIQUE(tenant_id,id), UNIQUE(tenant_id,request_id,client_item_key),
  CHECK(client_item_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,126}$'), CHECK(definition_field_code ~ '^[A-Za-z][A-Za-z0-9_.-]{1,126}$'),
  CHECK(channel_type IN('email','phone','fax','sms','whatsapp','website')), CHECK(length(channel_value) BETWEEN 1 AND 512),
  CHECK(effective_until IS NULL OR effective_from IS NULL OR effective_until>=effective_from),
  FOREIGN KEY(tenant_id,request_id,contact_client_item_key) REFERENCES document.business_partner_request_contact_person(tenant_id,request_id,client_item_key) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT);

CREATE TABLE document.business_partner_request_identifier(
  id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, request_id uuid NOT NULL,
  client_item_key text NOT NULL, definition_field_code text NOT NULL, scheme_code text NOT NULL,
  identifier_value text, protected_value_token text, value_hash text NOT NULL, masked_value text NOT NULL,
  issuing_authority text, issuing_country_code text, is_primary boolean NOT NULL DEFAULT false,
  effective_from date, effective_until date, source_kind text NOT NULL, source_reference text,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  PRIMARY KEY(id), UNIQUE(tenant_id,id), UNIQUE(tenant_id,request_id,client_item_key),
  CHECK(client_item_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,126}$'), CHECK(definition_field_code ~ '^[A-Za-z][A-Za-z0-9_.-]{1,126}$'),
  CHECK(num_nonnulls(identifier_value,protected_value_token)=1), CHECK(value_hash ~ '^[a-f0-9]{64}$'),
  CHECK(issuing_country_code IS NULL OR issuing_country_code ~ '^[A-Z]{2}$'), CHECK(effective_until IS NULL OR effective_from IS NULL OR effective_until>=effective_from),
  FOREIGN KEY(tenant_id,request_id) REFERENCES document.business_partner_request(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT);

CREATE TABLE document.business_partner_request_tax_registration(
  id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, request_id uuid NOT NULL,
  client_item_key text NOT NULL, definition_field_code text NOT NULL, jurisdiction_id uuid NOT NULL, tax_type_id uuid,
  registration_type_code text NOT NULL, protected_value_token text NOT NULL, value_hash text NOT NULL, masked_value text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false, effective_from date, effective_until date, source_kind text NOT NULL,
  source_reference text, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  PRIMARY KEY(id), UNIQUE(tenant_id,id), UNIQUE(tenant_id,request_id,client_item_key),
  CHECK(client_item_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,126}$'), CHECK(definition_field_code ~ '^[A-Za-z][A-Za-z0-9_.-]{1,126}$'),
  CHECK(value_hash ~ '^[a-f0-9]{64}$'), CHECK(effective_until IS NULL OR effective_from IS NULL OR effective_until>=effective_from),
  FOREIGN KEY(tenant_id,request_id) REFERENCES document.business_partner_request(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,tax_type_id) REFERENCES master.tax_type(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT);

CREATE TABLE document.business_partner_request_classification(
  id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, request_id uuid NOT NULL,
  client_item_key text NOT NULL, definition_field_code text NOT NULL, classification_kind text NOT NULL,
  reference_id uuid NOT NULL, domain_code text, partner_role text, assignment_kind text, is_primary boolean NOT NULL DEFAULT false,
  confidence smallint, effective_from date, effective_until date, source_kind text NOT NULL, source_reference text,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  PRIMARY KEY(id), UNIQUE(tenant_id,id), UNIQUE(tenant_id,request_id,client_item_key),
  CHECK(client_item_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,126}$'), CHECK(definition_field_code ~ '^[A-Za-z][A-Za-z0-9_.-]{1,126}$'),
  CHECK(classification_kind IN('commodity','industry')), CHECK(partner_role IS NULL OR partner_role IN('supplier','customer')),
  CHECK(assignment_kind IS NULL OR assignment_kind IN('declared','verified','inferred','imported')),
  CHECK(confidence IS NULL OR confidence BETWEEN 0 AND 1), CHECK(effective_until IS NULL OR effective_from IS NULL OR effective_until>=effective_from),
  FOREIGN KEY(tenant_id,request_id) REFERENCES document.business_partner_request(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT);

CREATE TABLE document.business_partner_request_certification(
  id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, request_id uuid NOT NULL,
  client_item_key text NOT NULL, definition_field_code text NOT NULL, certification_type_id uuid, custom_name text,
  certificate_number_token text, masked_certificate_number text, certified_by text, certified_location text,
  attachment_id uuid, company_code_id uuid, effective_from date, effective_until date, source_kind text NOT NULL,
  source_reference text, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  PRIMARY KEY(id), UNIQUE(tenant_id,id), UNIQUE(tenant_id,request_id,client_item_key),
  CHECK(client_item_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,126}$'), CHECK(definition_field_code ~ '^[A-Za-z][A-Za-z0-9_.-]{1,126}$'),
  CHECK(num_nonnulls(certification_type_id,custom_name)=1), CHECK(effective_until IS NULL OR effective_from IS NULL OR effective_until>=effective_from),
  FOREIGN KEY(tenant_id,request_id) REFERENCES document.business_partner_request(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,attachment_id) REFERENCES document.attachment(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT);

CREATE TABLE document.business_partner_request_materialization_item(
  id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, request_id uuid NOT NULL,
  child_kind text NOT NULL, request_child_id uuid NOT NULL, client_item_key text NOT NULL,
  definition_field_code text NOT NULL, source_kind text NOT NULL, source_reference text,
  effective_from date, effective_until date, target_table text NOT NULL, target_id uuid NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(), applied_by uuid NOT NULL,
  PRIMARY KEY(id), UNIQUE(tenant_id,id), UNIQUE(tenant_id,request_id,child_kind,request_child_id),
  UNIQUE(tenant_id,target_table,target_id),
  CHECK(child_kind IN('address','contact_person','contact_channel','identifier','tax_registration','classification','certification')),
  CHECK(target_table ~ '^(master|common)\.[a-z][a-z0-9_]{1,62}$'),
  FOREIGN KEY(tenant_id,request_id) REFERENCES document.business_partner_request(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,applied_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT);

CREATE OR REPLACE FUNCTION document.trg_guard_business_partner_request_extension() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$ DECLARE v_tenant uuid; v_request uuid; BEGIN
  IF TG_TABLE_NAME='business_partner_request_materialization_item' THEN
    IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Business Partner request materialization evidence is immutable' USING ERRCODE='restrict_violation'; END IF;
    RETURN NEW;
  END IF;
  v_tenant:=CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  v_request:=CASE WHEN TG_OP='DELETE' THEN OLD.request_id ELSE NEW.request_id END;
  IF NOT EXISTS(SELECT 1 FROM document.business_partner_request r WHERE r.tenant_id=v_tenant AND r.id=v_request
    AND r.extension_mode='typed_v1' AND r.status IN('draft','returned','validation_failed')
    AND (TG_OP='DELETE' OR r.source_kind=NEW.source_kind)) THEN
    RAISE EXCEPTION 'Typed request extensions are editable only before submission' USING ERRCODE='object_not_in_prerequisite_state';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

DO $$ DECLARE v_table text; BEGIN
  FOREACH v_table IN ARRAY ARRAY['business_partner_request_address','business_partner_request_contact_person','business_partner_request_contact_channel',
    'business_partner_request_identifier','business_partner_request_tax_registration','business_partner_request_classification','business_partner_request_certification'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON document.%I FOR EACH ROW EXECUTE FUNCTION document.trg_guard_business_partner_request_extension()','trg_'||v_table||'_guard',v_table);
    EXECUTE format('ALTER TABLE document.%I ENABLE ROW LEVEL SECURITY',v_table);
    EXECUTE format('ALTER TABLE document.%I FORCE ROW LEVEL SECURITY',v_table);
    EXECUTE format('CREATE POLICY tenant_access ON document.%I USING(tenant_id=shared.current_tenant_id()) WITH CHECK(tenant_id=shared.current_tenant_id())',v_table);
    EXECUTE format('CREATE INDEX %I ON document.%I(tenant_id,request_id)',v_table||'_request_idx',v_table);
  END LOOP;
END $$;
CREATE TRIGGER trg_business_partner_request_materialization_item_guard BEFORE INSERT OR UPDATE OR DELETE
  ON document.business_partner_request_materialization_item FOR EACH ROW EXECUTE FUNCTION document.trg_guard_business_partner_request_extension();
ALTER TABLE document.business_partner_request_materialization_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.business_partner_request_materialization_item FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON document.business_partner_request_materialization_item
  USING(tenant_id=shared.current_tenant_id()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE INDEX business_partner_request_materialization_item_request_idx
  ON document.business_partner_request_materialization_item(tenant_id,request_id);

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON document.business_partner_request_address,document.business_partner_request_contact_person,
      document.business_partner_request_contact_channel,document.business_partner_request_identifier,
      document.business_partner_request_tax_registration,document.business_partner_request_classification,
      document.business_partner_request_certification TO athyperapp;
    GRANT SELECT,INSERT ON document.business_partner_request_materialization_item TO athyperapp;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    GRANT ALL ON document.business_partner_request_address,document.business_partner_request_contact_person,
      document.business_partner_request_contact_channel,document.business_partner_request_identifier,
      document.business_partner_request_tax_registration,document.business_partner_request_classification,
      document.business_partner_request_certification,document.business_partner_request_materialization_item TO athyperadmin;
  END IF;
END $$;

COMMENT ON COLUMN document.business_partner_request.extension_mode IS 'legacy_untyped rows are never reinterpreted; typed_v1 rows materialize only typed child tables.';
COMMENT ON TABLE document.business_partner_request_materialization_item IS 'Immutable request-child-to-authoritative-row application evidence; contains coordinates and safe provenance only.';

COMMIT;
