BEGIN;

DO $$
BEGIN
  IF current_database() <> 'athyper_neon'
     OR current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'Business Partner domain hardening requires the NEON plane';
  END IF;
END $$;

-- Fail closed before transforming any production value. These are the complete
-- legacy-to-target mappings approved by the three-plane design.
DO $$
DECLARE v_values text;
BEGIN
  SELECT string_agg(value, ', ' ORDER BY value) INTO v_values
  FROM (SELECT DISTINCT partner_category::text AS value FROM master.business_partner
        WHERE partner_category::text NOT IN ('organization','person','group','individual','government','nonprofit','internal')) unexpected;
  IF v_values IS NOT NULL THEN RAISE EXCEPTION 'Unmapped business_partner category values: %', v_values; END IF;

  SELECT string_agg(value, ', ' ORDER BY value) INTO v_values
  FROM (SELECT DISTINCT status::text AS value FROM master.business_partner
        WHERE status::text NOT IN ('draft','active','inactive','archived')) unexpected;
  IF v_values IS NOT NULL THEN RAISE EXCEPTION 'Unmapped business_partner status values: %', v_values; END IF;

  SELECT string_agg(value, ', ' ORDER BY value) INTO v_values
  FROM (SELECT DISTINCT status::text AS value FROM master.supplier
        WHERE status::text NOT IN ('onboarding','active','suspended','inactive','archived')) unexpected;
  IF v_values IS NOT NULL THEN RAISE EXCEPTION 'Unmapped supplier status values: %', v_values; END IF;

  SELECT string_agg(value, ', ' ORDER BY value) INTO v_values
  FROM (SELECT DISTINCT status::text AS value FROM master.customer
        WHERE status::text NOT IN ('prospect','active','suspended','inactive','archived')) unexpected;
  IF v_values IS NOT NULL THEN RAISE EXCEPTION 'Unmapped customer status values: %', v_values; END IF;
END $$;

DO $$ BEGIN
  CREATE DOMAIN master.business_partner_ownership_d AS text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE DOMAIN master.business_partner_legal_classification_d AS text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE master.business_partner
  ADD COLUMN ownership_class master.business_partner_ownership_d NOT NULL DEFAULT 'external',
  ADD COLUMN legal_classification master.business_partner_legal_classification_d,
  ADD COLUMN category_locked_at timestamptz,
  ADD COLUMN category_locked_by uuid,
  ADD COLUMN record_version bigint NOT NULL DEFAULT 1;

ALTER TABLE master.business_partner DISABLE TRIGGER trg_business_partner_10_guard;
ALTER TABLE master.business_partner DISABLE TRIGGER trg_business_partner_30_updated_at;
UPDATE master.business_partner
SET ownership_class = CASE WHEN partner_category::text='internal' THEN 'internal' ELSE 'external' END,
    legal_classification = CASE WHEN partner_category::text IN ('government','nonprofit') THEN partner_category::text ELSE NULL END,
    partner_category = CASE
      WHEN partner_category::text='individual' THEN 'person'
      WHEN partner_category::text IN ('government','nonprofit','internal') THEN 'organization'
      ELSE partner_category::text END,
    category_locked_at = COALESCE(category_locked_at, created_at),
    category_locked_by = COALESCE(category_locked_by, created_by);
ALTER TABLE master.business_partner ENABLE TRIGGER trg_business_partner_10_guard;
ALTER TABLE master.business_partner ENABLE TRIGGER trg_business_partner_30_updated_at;

ALTER TABLE master.business_partner
  ALTER COLUMN category_locked_at SET NOT NULL,
  ALTER COLUMN category_locked_at SET DEFAULT now(),
  ALTER COLUMN category_locked_by SET NOT NULL,
  ADD CONSTRAINT business_partner_record_version_chk CHECK(record_version >= 1),
  ADD CONSTRAINT business_partner_person_facts_chk CHECK(
    partner_category <> 'person' OR
    (legal_classification IS NULL AND legal_form IS NULL AND registration_country_code IS NULL
      AND incorporation_date IS NULL AND website_url IS NULL)) NOT VALID,
  ADD CONSTRAINT business_partner_category_locked_by_fk
    FOREIGN KEY(tenant_id,category_locked_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE master.business_partner VALIDATE CONSTRAINT business_partner_category_locked_by_fk;

CREATE OR REPLACE FUNCTION master.trg_set_master_created_by() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master AS $$
DECLARE v_actor uuid:=nullif(current_setting('app.current_principal_id',true),'')::uuid;
BEGIN
  IF current_user='athyperapp' THEN
    IF v_actor IS NULL THEN RAISE EXCEPTION 'Current principal context is required' USING ERRCODE='insufficient_privilege'; END IF;
    NEW.created_by:=v_actor;
  ELSIF v_actor IS NOT NULL THEN NEW.created_by:=v_actor;
  END IF;
  IF TG_TABLE_NAME='business_partner' THEN NEW.category_locked_by:=NEW.created_by; NEW.category_locked_at:=COALESCE(NEW.category_locked_at,now()); END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION master.trg_guard_business_partner_structure() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master AS $$
BEGIN
  IF (NEW.partner_category,NEW.ownership_class,NEW.category_locked_at,NEW.category_locked_by,NEW.representation_purpose_code)
     IS DISTINCT FROM
     (OLD.partner_category,OLD.ownership_class,OLD.category_locked_at,OLD.category_locked_by,OLD.representation_purpose_code)
     OR (OLD.status<>'draft' AND NEW.canonical_party_id IS DISTINCT FROM OLD.canonical_party_id) THEN
    RAISE EXCEPTION 'Business-partner structural identity is immutable' USING ERRCODE='check_violation';
  END IF;
  NEW.record_version:=OLD.record_version+1;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_business_partner_11_structure BEFORE UPDATE ON master.business_partner FOR EACH ROW EXECUTE FUNCTION master.trg_guard_business_partner_structure();

ALTER DOMAIN master.business_partner_category_d ADD CONSTRAINT business_partner_category_d_check
  CHECK(VALUE IN('organization','person','group')) NOT VALID;
ALTER DOMAIN master.business_partner_category_d VALIDATE CONSTRAINT business_partner_category_d_check;
ALTER DOMAIN master.business_partner_status_d ADD CONSTRAINT business_partner_status_d_check
  CHECK(VALUE IN('draft','active','inactive','archived')) NOT VALID;
ALTER DOMAIN master.business_partner_status_d VALIDATE CONSTRAINT business_partner_status_d_check;
ALTER DOMAIN master.supplier_status_d ADD CONSTRAINT supplier_status_d_check
  CHECK(VALUE IN('onboarding','active','suspended','inactive','archived')) NOT VALID;
ALTER DOMAIN master.supplier_status_d VALIDATE CONSTRAINT supplier_status_d_check;
ALTER DOMAIN master.customer_status_d ADD CONSTRAINT customer_status_d_check
  CHECK(VALUE IN('prospect','active','suspended','inactive','archived')) NOT VALID;
ALTER DOMAIN master.customer_status_d VALIDATE CONSTRAINT customer_status_d_check;
ALTER DOMAIN master.business_partner_ownership_d ADD CONSTRAINT business_partner_ownership_d_check
  CHECK(VALUE IN('external','internal')) NOT VALID;
ALTER DOMAIN master.business_partner_ownership_d VALIDATE CONSTRAINT business_partner_ownership_d_check;
ALTER DOMAIN master.business_partner_legal_classification_d ADD CONSTRAINT business_partner_legal_classification_d_check
  CHECK(VALUE IN('government','nonprofit','sole_proprietor')) NOT VALID;
ALTER DOMAIN master.business_partner_legal_classification_d VALIDATE CONSTRAINT business_partner_legal_classification_d_check;

ALTER TABLE master.person ADD COLUMN business_partner_id uuid;
CREATE UNIQUE INDEX person_business_partner_uq
  ON master.person(tenant_id,business_partner_id) WHERE business_partner_id IS NOT NULL;
ALTER TABLE master.person
  ADD CONSTRAINT person_business_partner_fk FOREIGN KEY(tenant_id,business_partner_id)
    REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT person_business_partner_required_chk CHECK(business_partner_id IS NOT NULL) NOT VALID;
ALTER TABLE master.person VALIDATE CONSTRAINT person_business_partner_fk;

CREATE OR REPLACE FUNCTION master.trg_validate_commercial_role() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master AS $$
DECLARE v_ownership master.business_partner_ownership_d; v_status master.business_partner_status_d; v_intercompany boolean;
BEGIN
  SELECT ownership_class,status INTO v_ownership,v_status FROM master.business_partner
   WHERE tenant_id=NEW.tenant_id AND id=NEW.business_partner_id;
  IF v_ownership IS NULL THEN RAISE EXCEPTION 'Business partner does not exist in tenant' USING ERRCODE='foreign_key_violation'; END IF;
  IF v_status='archived' THEN RAISE EXCEPTION 'Archived business partner cannot receive a new or changed role' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  v_intercompany=CASE TG_TABLE_NAME WHEN 'supplier' THEN to_jsonb(NEW)->>'supplier_type'='intercompany' WHEN 'customer' THEN to_jsonb(NEW)->>'customer_type'='intercompany' ELSE false END;
  IF (v_ownership='internal') IS DISTINCT FROM v_intercompany THEN RAISE EXCEPTION 'Internal business partners require an intercompany % role, and intercompany roles require an internal business partner',TG_TABLE_NAME USING ERRCODE='check_violation'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION master.trg_validate_legal_entity_partner_link() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master AS $$
DECLARE v_ownership master.business_partner_ownership_d;
BEGIN
  SELECT ownership_class INTO v_ownership FROM master.business_partner WHERE tenant_id=NEW.tenant_id AND id=NEW.business_partner_id;
  IF v_ownership IS DISTINCT FROM 'internal'::master.business_partner_ownership_d THEN RAISE EXCEPTION 'Legal entity self mapping requires an internal business partner' USING ERRCODE='check_violation'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION master.trg_validate_person_business_partner() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master AS $$
DECLARE v_category master.business_partner_category_d;
BEGIN
  IF NEW.business_partner_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND (NEW.id,NEW.tenant_id,NEW.business_partner_id,NEW.created_at,NEW.created_by) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.business_partner_id,OLD.created_at,OLD.created_by) THEN RAISE EXCEPTION 'Person Business Partner binding and creation evidence are immutable' USING ERRCODE='check_violation'; END IF;
  SELECT partner_category INTO v_category FROM master.business_partner WHERE tenant_id=NEW.tenant_id AND id=NEW.business_partner_id;
  IF v_category IS DISTINCT FROM 'person'::master.business_partner_category_d THEN RAISE EXCEPTION 'Person rows require a person-category Business Partner in the same tenant' USING ERRCODE='check_violation'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_person_business_partner_guard BEFORE INSERT OR UPDATE ON master.person FOR EACH ROW EXECUTE FUNCTION master.trg_validate_person_business_partner();

CREATE INDEX business_partner_category_ownership_idx ON master.business_partner(tenant_id,partner_category,ownership_class,status);

COMMENT ON COLUMN master.person.business_partner_id IS 'Staged one-to-one canonical person-category Business Partner coordinate. The NOT VALID required check records legacy backfill debt while rejecting new unlinked rows.';
COMMENT ON CONSTRAINT business_partner_person_facts_chk ON master.business_partner IS 'NOT VALID during legacy cleanup; new person-category rows cannot contain organization-only facts.';

COMMIT;
