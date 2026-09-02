BEGIN;

-- S4 upgrade preflight: surface dirty authorities instead of silently
-- truncating or discarding governed data.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM master.business_partner WHERE octet_length(metadata::text)>16384 OR metadata ?| ARRAY['status','supplierType','customerType','creditLimit','bankAccount','taxRegistration','qualification'])
     OR EXISTS (SELECT 1 FROM master.supplier WHERE octet_length(metadata::text)>16384 OR metadata ?| ARRAY['paymentTerms','bankAccount','qualification','readiness','status'])
     OR EXISTS (SELECT 1 FROM master.customer WHERE octet_length(metadata::text)>16384 OR metadata ?| ARRAY['creditLimit','riskClass','keyAccount','paymentTerms','status']) THEN
    RAISE EXCEPTION 'S4 preflight failed: oversized or authority-bearing BP metadata must be remediated';
  END IF;
END $$;

INSERT INTO control.lookup_domain(code,name,description,source_schema,is_extensible,metadata,status,created_by)
VALUES
 ('master.supplier_type','Supplier Type','Governed procurement role classification for a supplier.','master',true,'{"configurability":"tenant_extensible"}','active','00000000-0000-0000-0000-000000000000'),
 ('master.customer_type','Customer Type','Governed sales role classification for a customer.','master',true,'{"configurability":"tenant_extensible"}','active','00000000-0000-0000-0000-000000000000')
ON CONFLICT(code) DO UPDATE SET name=excluded.name,description=excluded.description,source_schema=excluded.source_schema,is_extensible=true,status='active';

INSERT INTO control.lookup_value(tenant_id,code,name,domain_code,category,sort_order,is_system,metadata,status,created_by)
SELECT NULL,v.code,v.name,v.domain_code,v.category,v.sort_order,true,'{}','active','00000000-0000-0000-0000-000000000000'
FROM (VALUES
 ('general','General','master.supplier_type','commercial',10::smallint),('strategic','Strategic','master.supplier_type','commercial',20::smallint),
 ('service','Service Provider','master.supplier_type','commercial',30::smallint),('carrier','Carrier','master.supplier_type','logistics',40::smallint),
 ('intercompany','Intercompany','master.supplier_type','internal',50::smallint),('corporate','Corporate','master.customer_type','organization',10::smallint),
 ('government','Government','master.customer_type','organization',20::smallint),('individual','Individual (legacy)','master.customer_type','legacy',30::smallint),
 ('intercompany','Intercompany','master.customer_type','internal',40::smallint)
) v(code,name,domain_code,category,sort_order)
ON CONFLICT(domain_code,code) WHERE tenant_id IS NULL DO UPDATE SET name=excluded.name,category=excluded.category,sort_order=excluded.sort_order,status='active';

CREATE TABLE master.business_partner_alias (
 id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, business_partner_id uuid NOT NULL,
 alias_kind text NOT NULL DEFAULT 'search', alias_name text NOT NULL,
 normalized_alias text GENERATED ALWAYS AS(lower(regexp_replace(btrim(alias_name),'\s+',' ','g'))) STORED,
 language_code text, country_code character(2), effective_from date NOT NULL DEFAULT CURRENT_DATE,effective_until date,
 is_primary boolean NOT NULL DEFAULT false,source_system text,metadata jsonb NOT NULL DEFAULT '{}',status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT business_partner_alias_pkey PRIMARY KEY(id),CONSTRAINT business_partner_alias_tenant_id_uq UNIQUE(tenant_id,id),
 CONSTRAINT business_partner_alias_kind_chk CHECK(alias_kind IN('legal','trading','former','search')),
 CONSTRAINT business_partner_alias_name_chk CHECK(btrim(alias_name)<>'' AND length(alias_name)<=320),
 CONSTRAINT business_partner_alias_language_chk CHECK(language_code IS NULL OR language_code~'^[a-z]{2,3}(-[A-Z]{2})?$'),
 CONSTRAINT business_partner_alias_country_chk CHECK(country_code IS NULL OR country_code::text~'^[A-Z]{2}$'),
 CONSTRAINT business_partner_alias_range_chk CHECK(effective_until IS NULL OR effective_until>effective_from),
 CONSTRAINT business_partner_alias_source_chk CHECK(source_system IS NULL OR length(btrim(source_system)) BETWEEN 1 AND 128),
 CONSTRAINT business_partner_alias_metadata_chk CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=8192),
 CONSTRAINT business_partner_alias_status_chk CHECK(status IN('active','inactive')),
 CONSTRAINT business_partner_alias_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL)),
 CONSTRAINT business_partner_alias_partner_fk FOREIGN KEY(tenant_id,business_partner_id) REFERENCES master.business_partner(tenant_id,id) ON DELETE CASCADE,
 CONSTRAINT business_partner_alias_country_fk FOREIGN KEY(country_code) REFERENCES shared.country(code) ON DELETE RESTRICT,
 CONSTRAINT business_partner_alias_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_alias_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_alias_no_overlap_excl EXCLUDE USING gist(tenant_id WITH =,business_partner_id WITH =,normalized_alias WITH =,alias_kind WITH =,COALESCE(country_code,'**'::bpchar) WITH =,COALESCE(language_code,'*') WITH =,daterange(effective_from,COALESCE(effective_until,'infinity'::date),'[)') WITH &&) WHERE(status='active'),
 CONSTRAINT business_partner_alias_primary_no_overlap_excl EXCLUDE USING gist(tenant_id WITH =,business_partner_id WITH =,alias_kind WITH =,COALESCE(country_code,'**'::bpchar) WITH =,COALESCE(language_code,'*') WITH =,daterange(effective_from,COALESCE(effective_until,'infinity'::date),'[)') WITH &&) WHERE(status='active' AND is_primary)
);
COMMENT ON TABLE master.business_partner_alias IS 'Authoritative normalized, effective-dated legal/trading/former/search names for a Business Partner.';
INSERT INTO master.business_partner_alias(tenant_id,business_partner_id,alias_name,created_by)
SELECT bp.tenant_id,bp.id,btrim(a.name),bp.created_by FROM master.business_partner bp CROSS JOIN LATERAL unnest(bp.aliases) a(name) WHERE btrim(a.name)<>''
ON CONFLICT DO NOTHING;
ALTER TABLE master.business_partner DROP CONSTRAINT IF EXISTS business_partner_aliases_chk;
ALTER TABLE master.business_partner ADD CONSTRAINT business_partner_aliases_cache_chk CHECK(cardinality(aliases)<=50);
COMMENT ON COLUMN master.business_partner.aliases IS 'Read-compatible cache maintained from master.business_partner_alias; direct writes are rejected.';

CREATE TABLE control.business_partner_decision_scope (
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,qualification_id uuid,supplier_preference_id uuid,customer_designation_id uuid,credit_review_id uuid,
 scope_group smallint NOT NULL DEFAULT 1,scope_mode text NOT NULL DEFAULT 'include',scope_kind text NOT NULL,
 operating_organization_id uuid,company_code_id uuid,commodity_category_id uuid,country_code character(2),tax_jurisdiction_id uuid,organization_unit_id uuid,
 effective_from date NOT NULL DEFAULT CURRENT_DATE,effective_until date,hierarchy_version bigint,resolution_fingerprint text,metadata jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,
 CONSTRAINT business_partner_decision_scope_pkey PRIMARY KEY(id),CONSTRAINT business_partner_decision_scope_tenant_id_uq UNIQUE(tenant_id,id),
 CONSTRAINT business_partner_decision_scope_authority_chk CHECK(num_nonnulls(qualification_id,supplier_preference_id,customer_designation_id,credit_review_id)=1),
 CONSTRAINT business_partner_decision_scope_group_chk CHECK(scope_group BETWEEN 1 AND 100),CONSTRAINT business_partner_decision_scope_mode_chk CHECK(scope_mode IN('include','exclude')),
 CONSTRAINT business_partner_decision_scope_kind_chk CHECK(scope_kind IN('global','operating_organization','company_code','commodity_category','country','tax_jurisdiction','organization_unit')),
 CONSTRAINT business_partner_decision_scope_target_chk CHECK(
  (scope_kind='global' AND num_nonnulls(operating_organization_id,company_code_id,commodity_category_id,country_code,tax_jurisdiction_id,organization_unit_id)=0) OR
  (scope_kind='operating_organization' AND operating_organization_id IS NOT NULL AND num_nonnulls(company_code_id,commodity_category_id,country_code,tax_jurisdiction_id,organization_unit_id)=0) OR
  (scope_kind='company_code' AND company_code_id IS NOT NULL AND num_nonnulls(operating_organization_id,commodity_category_id,country_code,tax_jurisdiction_id,organization_unit_id)=0) OR
  (scope_kind='commodity_category' AND commodity_category_id IS NOT NULL AND num_nonnulls(operating_organization_id,company_code_id,country_code,tax_jurisdiction_id,organization_unit_id)=0) OR
  (scope_kind='country' AND country_code IS NOT NULL AND num_nonnulls(operating_organization_id,company_code_id,commodity_category_id,tax_jurisdiction_id,organization_unit_id)=0) OR
  (scope_kind='tax_jurisdiction' AND tax_jurisdiction_id IS NOT NULL AND num_nonnulls(operating_organization_id,company_code_id,commodity_category_id,country_code,organization_unit_id)=0) OR
  (scope_kind='organization_unit' AND organization_unit_id IS NOT NULL AND num_nonnulls(operating_organization_id,company_code_id,commodity_category_id,country_code,tax_jurisdiction_id)=0)),
 CONSTRAINT business_partner_decision_scope_range_chk CHECK(effective_until IS NULL OR effective_until>effective_from),
 CONSTRAINT business_partner_decision_scope_hierarchy_chk CHECK((hierarchy_version IS NULL)=(resolution_fingerprint IS NULL) AND(hierarchy_version IS NULL OR hierarchy_version>=1)),
 CONSTRAINT business_partner_decision_scope_fingerprint_chk CHECK(resolution_fingerprint IS NULL OR resolution_fingerprint~'^[a-f0-9]{64}$'),
 CONSTRAINT business_partner_decision_scope_metadata_chk CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=8192),
 CONSTRAINT business_partner_decision_scope_qualification_fk FOREIGN KEY(tenant_id,qualification_id) REFERENCES control.business_partner_qualification(tenant_id,id) ON DELETE CASCADE,
 CONSTRAINT business_partner_decision_scope_preference_fk FOREIGN KEY(tenant_id,supplier_preference_id) REFERENCES control.supplier_preference_designation(tenant_id,id) ON DELETE CASCADE,
 CONSTRAINT business_partner_decision_scope_designation_fk FOREIGN KEY(tenant_id,customer_designation_id) REFERENCES control.customer_account_designation(tenant_id,id) ON DELETE CASCADE,
 CONSTRAINT business_partner_decision_scope_credit_fk FOREIGN KEY(tenant_id,credit_review_id) REFERENCES control.customer_credit_review(tenant_id,id) ON DELETE CASCADE,
 CONSTRAINT business_partner_decision_scope_org_fk FOREIGN KEY(tenant_id,operating_organization_id) REFERENCES master.operating_organization(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_decision_scope_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_decision_scope_commodity_fk FOREIGN KEY(tenant_id,commodity_category_id) REFERENCES master.commodity_category(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_decision_scope_country_fk FOREIGN KEY(country_code) REFERENCES shared.country(code) ON DELETE RESTRICT,
 CONSTRAINT business_partner_decision_scope_jurisdiction_fk FOREIGN KEY(tenant_id,tax_jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_decision_scope_org_unit_fk FOREIGN KEY(tenant_id,organization_unit_id) REFERENCES master.org_unit(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_decision_scope_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_decision_scope_no_overlap_excl EXCLUDE USING gist(tenant_id WITH =,COALESCE(qualification_id,'00000000-0000-0000-0000-000000000000') WITH =,COALESCE(supplier_preference_id,'00000000-0000-0000-0000-000000000000') WITH =,COALESCE(customer_designation_id,'00000000-0000-0000-0000-000000000000') WITH =,COALESCE(credit_review_id,'00000000-0000-0000-0000-000000000000') WITH =,scope_group WITH =,scope_mode WITH =,scope_kind WITH =,COALESCE(operating_organization_id,company_code_id,commodity_category_id,tax_jurisdiction_id,organization_unit_id,'00000000-0000-0000-0000-000000000000') WITH =,COALESCE(country_code,'**'::bpchar) WITH =,daterange(effective_from,COALESCE(effective_until,'infinity'::date),'[)') WITH &&)
);
COMMENT ON TABLE control.business_partner_decision_scope IS 'Normalized include/exclude scope coordinates for BP qualification, preference, designation, and credit decisions.';

-- Backfill the supported baseline's flattened scope coordinates.
INSERT INTO control.business_partner_decision_scope(tenant_id,qualification_id,scope_kind,operating_organization_id,company_code_id,commodity_category_id,effective_from,effective_until,created_by)
SELECT q.tenant_id,q.id,x.kind,x.org_id,x.company_id,x.commodity_id,COALESCE(q.effective_from,CURRENT_DATE),q.effective_until,q.created_by
FROM control.business_partner_qualification q LEFT JOIN master.business_partner_commodity_capability cap ON cap.tenant_id=q.tenant_id AND cap.id=q.commodity_capability_id
CROSS JOIN LATERAL(VALUES('operating_organization',q.operating_organization_id,NULL::uuid,NULL::uuid),('company_code',NULL::uuid,q.company_code_id,NULL::uuid),('commodity_category',NULL::uuid,NULL::uuid,cap.commodity_category_id))x(kind,org_id,company_id,commodity_id)
WHERE COALESCE(x.org_id,x.company_id,x.commodity_id) IS NOT NULL;
INSERT INTO control.business_partner_decision_scope(tenant_id,qualification_id,scope_kind,effective_from,effective_until,created_by)
SELECT q.tenant_id,q.id,'global',COALESCE(q.effective_from,CURRENT_DATE),q.effective_until,q.created_by FROM control.business_partner_qualification q
WHERE q.operating_organization_id IS NULL AND q.company_code_id IS NULL AND q.commodity_capability_id IS NULL;
INSERT INTO control.business_partner_decision_scope(tenant_id,supplier_preference_id,scope_kind,operating_organization_id,company_code_id,commodity_category_id,effective_from,effective_until,created_by)
SELECT p.tenant_id,p.id,x.kind,x.org_id,x.company_id,x.commodity_id,p.effective_from,p.effective_until,p.created_by FROM control.supplier_preference_designation p
CROSS JOIN LATERAL(VALUES('operating_organization',p.operating_organization_id,NULL::uuid,NULL::uuid),('company_code',NULL::uuid,p.company_code_id,NULL::uuid),('commodity_category',NULL::uuid,NULL::uuid,p.commodity_category_id))x(kind,org_id,company_id,commodity_id) WHERE COALESCE(x.org_id,x.company_id,x.commodity_id) IS NOT NULL;
INSERT INTO control.business_partner_decision_scope(tenant_id,customer_designation_id,scope_kind,operating_organization_id,company_code_id,effective_from,effective_until,created_by)
SELECT d.tenant_id,d.id,x.kind,x.org_id,x.company_id,d.effective_from,d.effective_until,d.created_by FROM control.customer_account_designation d
CROSS JOIN LATERAL(VALUES('operating_organization',d.operating_organization_id,NULL::uuid),('company_code',NULL::uuid,d.company_code_id))x(kind,org_id,company_id) WHERE COALESCE(x.org_id,x.company_id) IS NOT NULL;
INSERT INTO control.business_partner_decision_scope(tenant_id,credit_review_id,scope_kind,operating_organization_id,company_code_id,effective_from,effective_until,created_by)
SELECT r.tenant_id,r.id,x.kind,x.org_id,x.company_id,r.effective_from,r.effective_until,r.created_by FROM control.customer_credit_review r
CROSS JOIN LATERAL(VALUES('operating_organization',r.operating_organization_id,NULL::uuid),('company_code',NULL::uuid,r.company_code_id))x(kind,org_id,company_id);
UPDATE control.business_partner_decision_scope s
SET hierarchy_version=1,
    resolution_fingerprint=encode(public.digest(convert_to(concat_ws(':',s.tenant_id::text,s.scope_kind,
      COALESCE(s.operating_organization_id,s.organization_unit_id)::text,'1'),'UTF8'),'sha256'),'hex')
WHERE s.scope_kind IN('operating_organization','organization_unit');

ALTER TABLE master.business_partner DROP CONSTRAINT business_partner_metadata_object_chk,
 ADD CONSTRAINT business_partner_metadata_object_chk CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=16384 AND NOT(metadata ?| ARRAY['status','supplierType','customerType','creditLimit','bankAccount','taxRegistration','qualification']));
ALTER TABLE master.supplier DROP CONSTRAINT supplier_metadata_object_chk,
 ADD CONSTRAINT supplier_metadata_object_chk CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=16384 AND NOT(metadata ?| ARRAY['paymentTerms','bankAccount','qualification','readiness','status']));
ALTER TABLE master.customer DROP CONSTRAINT customer_metadata_object_chk,
 ADD CONSTRAINT customer_metadata_object_chk CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=16384 AND NOT(metadata ?| ARRAY['creditLimit','riskClass','keyAccount','paymentTerms','status']));
ALTER TABLE master.business_partner_relationship DROP CONSTRAINT business_partner_relationship_metadata_chk,
 ADD CONSTRAINT business_partner_relationship_metadata_chk CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=16384);
ALTER TABLE master.business_partner_operating_organization_assignment DROP CONSTRAINT business_partner_operating_org_assignment_metadata_chk,
 ADD CONSTRAINT business_partner_operating_org_assignment_metadata_chk CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=8192);
ALTER TABLE master.company_code_supplier_profile DROP CONSTRAINT company_code_supplier_profile_metadata_chk,
 ADD CONSTRAINT company_code_supplier_profile_metadata_chk CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=16384 AND NOT(metadata ?| ARRAY['creditLimit','bankAccount','paymentTerms','currency']));
ALTER TABLE master.company_code_customer_profile DROP CONSTRAINT company_code_customer_profile_metadata_chk,
 ADD CONSTRAINT company_code_customer_profile_metadata_chk CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=16384 AND NOT(metadata ?| ARRAY['creditLimit','riskClass','keyAccount','paymentTerms','currency']));
ALTER TABLE control.business_partner_qualification DROP CONSTRAINT business_partner_qualification_metadata_chk,
 ADD CONSTRAINT business_partner_qualification_metadata_chk CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=16384);
ALTER TABLE control.supplier_preference_designation DROP CONSTRAINT supplier_preference_designation_metadata_chk,
 ADD CONSTRAINT supplier_preference_designation_metadata_chk CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=16384);
ALTER TABLE control.customer_account_designation DROP CONSTRAINT customer_account_designation_metadata_chk,
 ADD CONSTRAINT customer_account_designation_metadata_chk CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=16384);
ALTER TABLE control.customer_credit_review DROP CONSTRAINT customer_credit_review_conditions_chk,DROP CONSTRAINT customer_credit_review_authority_evidence_chk,
 ADD CONSTRAINT customer_credit_review_conditions_chk CHECK(jsonb_typeof(conditions)='array' AND jsonb_array_length(conditions)<=50 AND octet_length(conditions::text)<=32768),
 ADD CONSTRAINT customer_credit_review_authority_evidence_chk CHECK(jsonb_typeof(authority_evidence)='object' AND octet_length(authority_evidence::text)<=65536);
ALTER TABLE control.customer_lifecycle_event DROP CONSTRAINT customer_lifecycle_event_evidence_chk,
 ADD CONSTRAINT customer_lifecycle_event_evidence_chk CHECK(jsonb_typeof(readiness_evidence)='object' AND octet_length(readiness_evidence::text)<=65536);

ALTER TABLE master.business_partner_relationship ADD CONSTRAINT business_partner_relationship_no_overlap_excl EXCLUDE USING gist(tenant_id WITH =,source_business_partner_id WITH =,target_business_partner_id WITH =,relationship_type_code WITH =,COALESCE(country_code,'**'::bpchar) WITH =,daterange(COALESCE(effective_from,'-infinity'::date),COALESCE(effective_until,'infinity'::date),'[)') WITH &&) WHERE(status='active');
ALTER TABLE master.business_partner_operating_organization_assignment ADD CONSTRAINT business_partner_operating_org_assignment_no_overlap_excl EXCLUDE USING gist(tenant_id WITH =,business_partner_id WITH =,operating_organization_id WITH =,partner_role WITH =,daterange(effective_from,COALESCE(effective_until,'infinity'::date),'[)') WITH &&) WHERE(status='active');

CREATE INDEX business_partner_alias_resolution_idx ON master.business_partner_alias(tenant_id,business_partner_id,effective_from,effective_until) WHERE status='active';
CREATE INDEX business_partner_alias_normalized_idx ON master.business_partner_alias(tenant_id,normalized_alias) WHERE status='active';
CREATE INDEX business_partner_decision_scope_authority_idx ON control.business_partner_decision_scope(tenant_id,qualification_id,supplier_preference_id,customer_designation_id,credit_review_id,scope_group);

ALTER TABLE master.business_partner_alias ENABLE ROW LEVEL SECURITY; ALTER TABLE master.business_partner_alias FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON master.business_partner_alias FOR ALL USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON master.business_partner_alias FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
ALTER TABLE control.business_partner_decision_scope ENABLE ROW LEVEL SECURITY; ALTER TABLE control.business_partner_decision_scope FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON control.business_partner_decision_scope USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON control.business_partner_decision_scope FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
REVOKE ALL ON master.business_partner_alias,control.business_partner_decision_scope FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT,INSERT,UPDATE ON master.business_partner_alias TO athyperapp; GRANT SELECT,INSERT,UPDATE,DELETE ON control.business_partner_decision_scope TO athyperapp; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL ON master.business_partner_alias,control.business_partner_decision_scope TO athyperadmin; END IF;
END $$;

CREATE OR REPLACE FUNCTION master.trg_validate_counterparty_catalog() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master,control AS $$
DECLARE v_domain text;v_code text;BEGIN
 IF TG_TABLE_NAME='business_partner' THEN IF NEW.legal_form IS NULL THEN RETURN NEW;END IF;NEW.legal_form:=CASE lower(btrim(NEW.legal_form)) WHEN 'private_limited_company' THEN 'private_limited' ELSE lower(btrim(NEW.legal_form)) END;v_domain:='master.legal_form';v_code:=NEW.legal_form;
 ELSIF TG_TABLE_NAME='supplier' THEN v_domain:='master.supplier_type';v_code:=NEW.supplier_type::text;
 ELSIF TG_TABLE_NAME='customer' THEN v_domain:='master.customer_type';v_code:=NEW.customer_type::text;
 ELSE IF NEW.statement_cycle_code IS NULL THEN RETURN NEW;END IF;NEW.statement_cycle_code:=lower(btrim(NEW.statement_cycle_code));v_domain:='master.statement_cycle';v_code:=NEW.statement_cycle_code;END IF;
 IF NOT control.lookup_value_is_active(v_domain,v_code,NEW.tenant_id) THEN RAISE EXCEPTION 'Unknown or inactive lookup value %/%',v_domain,v_code USING ERRCODE='check_violation';END IF;RETURN NEW;END $$;
CREATE TRIGGER trg_business_partner_catalog BEFORE INSERT OR UPDATE OF tenant_id,legal_form ON master.business_partner FOR EACH ROW EXECUTE FUNCTION master.trg_validate_counterparty_catalog();
CREATE TRIGGER trg_supplier_type_catalog BEFORE INSERT OR UPDATE OF tenant_id,supplier_type ON master.supplier FOR EACH ROW EXECUTE FUNCTION master.trg_validate_counterparty_catalog();
CREATE TRIGGER trg_customer_type_catalog BEFORE INSERT OR UPDATE OF tenant_id,customer_type ON master.customer FOR EACH ROW EXECUTE FUNCTION master.trg_validate_counterparty_catalog();
CREATE TRIGGER trg_customer_statement_cycle_catalog BEFORE INSERT OR UPDATE OF tenant_id,statement_cycle_code ON master.company_code_customer_profile FOR EACH ROW EXECUTE FUNCTION master.trg_validate_counterparty_catalog();
CREATE OR REPLACE FUNCTION master.trg_guard_business_partner_alias_cache() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master AS $$BEGIN IF NEW.aliases IS DISTINCT FROM OLD.aliases AND pg_trigger_depth()<2 THEN RAISE EXCEPTION 'business_partner.aliases is a derived cache; write master.business_partner_alias' USING ERRCODE='generated_always';END IF;RETURN NEW;END $$;
CREATE OR REPLACE FUNCTION master.trg_refresh_business_partner_alias_cache() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master AS $$DECLARE v_tenant uuid:=COALESCE(NEW.tenant_id,OLD.tenant_id);v_partner uuid:=COALESCE(NEW.business_partner_id,OLD.business_partner_id);BEGIN UPDATE master.business_partner bp SET aliases=COALESCE((SELECT array_agg(a.alias_name ORDER BY a.is_primary DESC,a.alias_name) FROM master.business_partner_alias a WHERE a.tenant_id=v_tenant AND a.business_partner_id=v_partner AND a.status='active' AND a.effective_from<=CURRENT_DATE AND(a.effective_until IS NULL OR a.effective_until>CURRENT_DATE)),'{}'::text[]) WHERE bp.tenant_id=v_tenant AND bp.id=v_partner;RETURN COALESCE(NEW,OLD);END $$;
CREATE TRIGGER trg_business_partner_alias_cache_guard BEFORE UPDATE OF aliases ON master.business_partner FOR EACH ROW EXECUTE FUNCTION master.trg_guard_business_partner_alias_cache();
CREATE TRIGGER trg_business_partner_alias_cache_refresh AFTER INSERT OR UPDATE OR DELETE ON master.business_partner_alias FOR EACH ROW EXECUTE FUNCTION master.trg_refresh_business_partner_alias_cache();
CREATE TRIGGER trg_zz_audit_row_change AFTER INSERT OR DELETE OR UPDATE ON master.business_partner_alias FOR EACH ROW EXECUTE FUNCTION audit.trg_capture_row_change();

CREATE OR REPLACE FUNCTION master.trg_guard_partner_relationship_cycle() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master AS $$
BEGIN IF NEW.status<>'active' OR NEW.relationship_type_code<>'parent' THEN RETURN NEW;END IF;
 IF EXISTS(WITH RECURSIVE ancestors(id) AS(SELECT NEW.target_business_partner_id UNION SELECT relation.target_business_partner_id FROM master.business_partner_relationship relation JOIN ancestors ON ancestors.id=relation.source_business_partner_id WHERE relation.tenant_id=NEW.tenant_id AND relation.relationship_type_code='parent' AND relation.status='active' AND relation.id IS DISTINCT FROM NEW.id) SELECT 1 FROM ancestors WHERE id=NEW.source_business_partner_id) THEN RAISE EXCEPTION 'Business Partner parent relationship would create a cycle' USING ERRCODE='integrity_constraint_violation';END IF;RETURN NEW;END $$;
CREATE TRIGGER trg_business_partner_relationship_cycle BEFORE INSERT OR UPDATE OF tenant_id,source_business_partner_id,target_business_partner_id,relationship_type_code,status ON master.business_partner_relationship FOR EACH ROW EXECUTE FUNCTION master.trg_guard_partner_relationship_cycle();

CREATE OR REPLACE FUNCTION master.trg_validate_partner_profile_references() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master AS $$
BEGIN IF NEW.status='active' THEN
 IF NOT EXISTS(SELECT 1 FROM master.company_code c WHERE c.tenant_id=NEW.tenant_id AND c.id=NEW.company_code_id AND c.is_active) THEN RAISE EXCEPTION 'Company code must be active' USING ERRCODE='foreign_key_violation';END IF;
 IF NEW.payment_term_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM master.payment_term p WHERE p.tenant_id=NEW.tenant_id AND p.id=NEW.payment_term_id AND p.is_active) THEN RAISE EXCEPTION 'Payment term must be active' USING ERRCODE='foreign_key_violation';END IF;
 IF NEW.default_accounting_profile_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM master.accounting_profile p WHERE p.tenant_id=NEW.tenant_id AND p.id=NEW.default_accounting_profile_id AND p.is_active) THEN RAISE EXCEPTION 'Accounting profile must be active' USING ERRCODE='foreign_key_violation';END IF;
 IF TG_TABLE_NAME='company_code_supplier_profile' AND NEW.preferred_remittance_bank_link_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM master.bank_account_link l WHERE l.tenant_id=NEW.tenant_id AND l.id=NEW.preferred_remittance_bank_link_id AND(l.company_code_id IS NULL OR l.company_code_id=NEW.company_code_id) AND l.effective_from<=CURRENT_DATE AND(l.effective_until IS NULL OR l.effective_until>CURRENT_DATE)) THEN RAISE EXCEPTION 'Remittance bank link must be effective for the company' USING ERRCODE='foreign_key_violation';END IF;END IF;RETURN NEW;END $$;
CREATE TRIGGER trg_supplier_profile_active_references BEFORE INSERT OR UPDATE OF tenant_id,company_code_id,payment_term_id,default_accounting_profile_id,preferred_remittance_bank_link_id,status ON master.company_code_supplier_profile FOR EACH ROW EXECUTE FUNCTION master.trg_validate_partner_profile_references();
CREATE TRIGGER trg_customer_profile_active_references BEFORE INSERT OR UPDATE OF tenant_id,company_code_id,payment_term_id,default_accounting_profile_id,status ON master.company_code_customer_profile FOR EACH ROW EXECUTE FUNCTION master.trg_validate_partner_profile_references();

CREATE OR REPLACE FUNCTION control.trg_validate_decision_scope() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,control,master AS $$
DECLARE v_count integer;BEGIN
 IF NEW.scope_kind='operating_organization' AND NOT EXISTS(SELECT 1 FROM master.operating_organization x WHERE x.tenant_id=NEW.tenant_id AND x.id=NEW.operating_organization_id AND x.is_active) THEN RAISE EXCEPTION 'Decision scope operating organization must be active' USING ERRCODE='foreign_key_violation';END IF;
 IF NEW.scope_kind='company_code' AND NOT EXISTS(SELECT 1 FROM master.company_code x WHERE x.tenant_id=NEW.tenant_id AND x.id=NEW.company_code_id AND x.is_active) THEN RAISE EXCEPTION 'Decision scope company code must be active' USING ERRCODE='foreign_key_violation';END IF;
 IF NEW.scope_kind='commodity_category' AND NOT EXISTS(SELECT 1 FROM master.commodity_category x WHERE x.tenant_id=NEW.tenant_id AND x.id=NEW.commodity_category_id AND x.is_active) THEN RAISE EXCEPTION 'Decision scope commodity category must be active' USING ERRCODE='foreign_key_violation';END IF;
 IF NEW.scope_kind='tax_jurisdiction' AND NOT EXISTS(SELECT 1 FROM master.tax_jurisdiction x WHERE x.tenant_id=NEW.tenant_id AND x.id=NEW.tax_jurisdiction_id AND x.is_active) THEN RAISE EXCEPTION 'Decision scope tax jurisdiction must be active' USING ERRCODE='foreign_key_violation';END IF;
 IF NEW.scope_kind='organization_unit' AND NOT EXISTS(SELECT 1 FROM master.org_unit x WHERE x.tenant_id=NEW.tenant_id AND x.id=NEW.organization_unit_id AND x.is_active) THEN RAISE EXCEPTION 'Decision scope organization unit must be active' USING ERRCODE='foreign_key_violation';END IF;
 IF NEW.scope_kind IN('operating_organization','organization_unit') THEN NEW.hierarchy_version:=COALESCE(NEW.hierarchy_version,1);NEW.resolution_fingerprint:=COALESCE(NEW.resolution_fingerprint,encode(public.digest(convert_to(concat_ws(':',NEW.tenant_id::text,NEW.scope_kind,COALESCE(NEW.operating_organization_id,NEW.organization_unit_id)::text,NEW.hierarchy_version::text),'UTF8'),'sha256'),'hex'));END IF;
 SELECT count(*) INTO v_count FROM control.business_partner_decision_scope s WHERE s.tenant_id=NEW.tenant_id AND s.id IS DISTINCT FROM NEW.id AND s.qualification_id IS NOT DISTINCT FROM NEW.qualification_id AND s.supplier_preference_id IS NOT DISTINCT FROM NEW.supplier_preference_id AND s.customer_designation_id IS NOT DISTINCT FROM NEW.customer_designation_id AND s.credit_review_id IS NOT DISTINCT FROM NEW.credit_review_id;
 IF v_count>=100 THEN RAISE EXCEPTION 'A decision authority may have at most 100 scope rows' USING ERRCODE='check_violation';END IF;RETURN NEW;END $$;
CREATE TRIGGER trg_business_partner_decision_scope_validate BEFORE INSERT OR UPDATE ON control.business_partner_decision_scope FOR EACH ROW EXECUTE FUNCTION control.trg_validate_decision_scope();

-- Parent workflows continue to create their normalized coordinates through a
-- single compatibility trigger until their API payloads are scope-native.
CREATE OR REPLACE FUNCTION control.trg_materialize_legacy_decision_scope() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,control,master AS $$
DECLARE v_commodity uuid;BEGIN
 IF TG_TABLE_NAME='business_partner_qualification' THEN IF NEW.commodity_capability_id IS NOT NULL THEN SELECT commodity_category_id INTO v_commodity FROM master.business_partner_commodity_capability WHERE tenant_id=NEW.tenant_id AND id=NEW.commodity_capability_id;END IF;
  INSERT INTO control.business_partner_decision_scope(tenant_id,qualification_id,scope_kind,operating_organization_id,company_code_id,commodity_category_id,effective_from,effective_until,created_by) SELECT NEW.tenant_id,NEW.id,x.kind,x.org_id,x.company_id,x.commodity_id,COALESCE(NEW.effective_from,CURRENT_DATE),NEW.effective_until,NEW.created_by FROM(VALUES('operating_organization',NEW.operating_organization_id,NULL::uuid,NULL::uuid),('company_code',NULL::uuid,NEW.company_code_id,NULL::uuid),('commodity_category',NULL::uuid,NULL::uuid,v_commodity))x(kind,org_id,company_id,commodity_id) WHERE COALESCE(x.org_id,x.company_id,x.commodity_id) IS NOT NULL;IF NOT FOUND THEN INSERT INTO control.business_partner_decision_scope(tenant_id,qualification_id,scope_kind,effective_from,effective_until,created_by) VALUES(NEW.tenant_id,NEW.id,'global',COALESCE(NEW.effective_from,CURRENT_DATE),NEW.effective_until,NEW.created_by);END IF;
 ELSIF TG_TABLE_NAME='supplier_preference_designation' THEN INSERT INTO control.business_partner_decision_scope(tenant_id,supplier_preference_id,scope_kind,operating_organization_id,company_code_id,commodity_category_id,effective_from,effective_until,created_by) SELECT NEW.tenant_id,NEW.id,x.kind,x.org_id,x.company_id,x.commodity_id,NEW.effective_from,NEW.effective_until,NEW.created_by FROM(VALUES('operating_organization',NEW.operating_organization_id,NULL::uuid,NULL::uuid),('company_code',NULL::uuid,NEW.company_code_id,NULL::uuid),('commodity_category',NULL::uuid,NULL::uuid,NEW.commodity_category_id))x(kind,org_id,company_id,commodity_id) WHERE COALESCE(x.org_id,x.company_id,x.commodity_id) IS NOT NULL;
 ELSIF TG_TABLE_NAME='customer_account_designation' THEN INSERT INTO control.business_partner_decision_scope(tenant_id,customer_designation_id,scope_kind,operating_organization_id,company_code_id,effective_from,effective_until,created_by) SELECT NEW.tenant_id,NEW.id,x.kind,x.org_id,x.company_id,NEW.effective_from,NEW.effective_until,NEW.created_by FROM(VALUES('operating_organization',NEW.operating_organization_id,NULL::uuid),('company_code',NULL::uuid,NEW.company_code_id))x(kind,org_id,company_id) WHERE COALESCE(x.org_id,x.company_id) IS NOT NULL;
 ELSE INSERT INTO control.business_partner_decision_scope(tenant_id,credit_review_id,scope_kind,operating_organization_id,company_code_id,effective_from,effective_until,created_by) VALUES(NEW.tenant_id,NEW.id,'operating_organization',NEW.operating_organization_id,NULL,NEW.effective_from,NEW.effective_until,NEW.created_by),(NEW.tenant_id,NEW.id,'company_code',NULL,NEW.company_code_id,NEW.effective_from,NEW.effective_until,NEW.created_by);END IF;RETURN NEW;END $$;
CREATE TRIGGER trg_business_partner_qualification_scope_rows AFTER INSERT ON control.business_partner_qualification FOR EACH ROW EXECUTE FUNCTION control.trg_materialize_legacy_decision_scope();
CREATE TRIGGER trg_supplier_preference_scope_rows AFTER INSERT ON control.supplier_preference_designation FOR EACH ROW EXECUTE FUNCTION control.trg_materialize_legacy_decision_scope();
CREATE TRIGGER trg_customer_designation_scope_rows AFTER INSERT ON control.customer_account_designation FOR EACH ROW EXECUTE FUNCTION control.trg_materialize_legacy_decision_scope();
CREATE TRIGGER trg_customer_credit_review_scope_rows AFTER INSERT ON control.customer_credit_review FOR EACH ROW EXECUTE FUNCTION control.trg_materialize_legacy_decision_scope();

COMMIT;
