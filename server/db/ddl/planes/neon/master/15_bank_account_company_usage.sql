-- Additive rollout: NULL legacy company scope never implies universal eligibility.
CREATE TABLE IF NOT EXISTS master.bank_account_usage (
 tenant_id uuid NOT NULL,
 bank_account_link_id uuid NOT NULL,
 usage_scope text NOT NULL DEFAULT 'selected_companies'
   CHECK (usage_scope IN ('selected_companies','all_authorized_companies')),
 PRIMARY KEY (tenant_id, bank_account_link_id),
 FOREIGN KEY (tenant_id,bank_account_link_id) REFERENCES master.bank_account_link(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS master.bank_account_company_usage (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 bank_account_link_id uuid NOT NULL,
 company_code_id uuid NOT NULL,
 purpose text NOT NULL DEFAULT 'default',
 effective_from date NOT NULL DEFAULT CURRENT_DATE,
 effective_until date,
 is_primary boolean NOT NULL DEFAULT false,
 accepted_at timestamptz,
 accepted_by uuid,
 source_tenant_id uuid,
 source_account_id uuid,
 accepted_disclosure_id uuid,
 accepted_disclosure_version integer CHECK (accepted_disclosure_version > 0),
 accepted_account_fingerprint text,
 CHECK (effective_until IS NULL OR effective_until > effective_from),
 CHECK ((accepted_at IS NULL) = (accepted_by IS NULL)),
 CHECK ((source_account_id IS NULL AND source_tenant_id IS NULL AND accepted_disclosure_id IS NULL AND accepted_disclosure_version IS NULL AND accepted_account_fingerprint IS NULL)
     OR (source_account_id IS NOT NULL AND source_tenant_id IS NOT NULL AND accepted_disclosure_id IS NOT NULL AND accepted_disclosure_version IS NOT NULL AND accepted_account_fingerprint ~ '^[a-f0-9]{64}$')),
 FOREIGN KEY (tenant_id,accepted_by) REFERENCES master.principal(tenant_id,id),
 FOREIGN KEY (tenant_id,bank_account_link_id) REFERENCES master.bank_account_usage(tenant_id,bank_account_link_id),
 FOREIGN KEY (tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id),
 EXCLUDE USING gist (tenant_id WITH =, bank_account_link_id WITH =, company_code_id WITH =, purpose WITH =,
   daterange(effective_from,effective_until,'[)') WITH &&)
);
INSERT INTO master.bank_account_usage(tenant_id,bank_account_link_id)
 SELECT tenant_id,id FROM master.bank_account_link WHERE owner_type='business_partner' ON CONFLICT DO NOTHING;
INSERT INTO master.bank_account_company_usage(tenant_id,bank_account_link_id,company_code_id,purpose,effective_from,effective_until,is_primary)
 SELECT tenant_id,id,company_code_id,purpose,effective_from,effective_until,is_primary
 FROM master.bank_account_link l WHERE owner_type='business_partner' AND company_code_id IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM master.bank_account_company_usage u WHERE u.tenant_id=l.tenant_id AND u.bank_account_link_id=l.id);
-- Preserve assignment, not inferred acceptance. Existing unscoped links receive no assignments.
CREATE OR REPLACE FUNCTION master.initialize_bank_account_usage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.owner_type='business_partner' THEN
  INSERT INTO master.bank_account_usage(tenant_id,bank_account_link_id) VALUES(NEW.tenant_id,NEW.id);
  IF NEW.company_code_id IS NOT NULL THEN
   INSERT INTO master.bank_account_company_usage(tenant_id,bank_account_link_id,company_code_id,purpose,effective_from,effective_until,is_primary)
   VALUES(NEW.tenant_id,NEW.id,NEW.company_code_id,NEW.purpose,NEW.effective_from,NEW.effective_until,NEW.is_primary);
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bank_account_usage_initialize ON master.bank_account_link;
CREATE TRIGGER bank_account_usage_initialize AFTER INSERT ON master.bank_account_link FOR EACH ROW EXECUTE FUNCTION master.initialize_bank_account_usage();
CREATE OR REPLACE FUNCTION master.bank_account_company_eligible(p_tenant uuid,p_link uuid,p_company uuid,p_date date)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM master.bank_account_usage u JOIN master.bank_account_link l ON l.tenant_id=u.tenant_id AND l.id=u.bank_account_link_id
 WHERE u.tenant_id=p_tenant AND u.bank_account_link_id=p_link
 AND l.effective_from<=p_date AND (l.effective_until IS NULL OR l.effective_until>p_date)
 AND (l.company_code_id IS NULL OR l.company_code_id=p_company)
 AND (u.usage_scope='all_authorized_companies' OR EXISTS(SELECT 1 FROM master.bank_account_company_usage c
 WHERE c.tenant_id=u.tenant_id AND c.bank_account_link_id=u.bank_account_link_id AND c.company_code_id=p_company
 AND c.effective_from<=p_date AND (c.effective_until IS NULL OR c.effective_until>p_date))))
$$;
ALTER TABLE document.business_partner_bank_verification ADD COLUMN IF NOT EXISTS expected_disclosure_id uuid;
ALTER TABLE document.business_partner_bank_verification ADD COLUMN IF NOT EXISTS expected_disclosure_version integer;
-- Pin at creation for both service and governed entity-case entry points. Legacy open
-- verifications remain unpinned and must restart; do not guess their reviewed version.
CREATE OR REPLACE FUNCTION master.pin_bank_disclosure_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 SELECT current_disclosure_id,current_disclosure_version INTO NEW.expected_disclosure_id,NEW.expected_disclosure_version
 FROM control.mesh_bank_account_projection WHERE tenant_id=NEW.tenant_id AND id=NEW.bank_projection_id FOR SHARE;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pin_bank_disclosure_review ON document.business_partner_bank_verification;
CREATE TRIGGER pin_bank_disclosure_review BEFORE INSERT ON document.business_partner_bank_verification FOR EACH ROW EXECUTE FUNCTION master.pin_bank_disclosure_review();
ALTER TABLE master.bank_account_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.bank_account_usage FORCE ROW LEVEL SECURITY;
ALTER TABLE master.bank_account_company_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.bank_account_company_usage FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON master.bank_account_usage;
CREATE POLICY tenant_isolation ON master.bank_account_usage USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON master.bank_account_company_usage;
CREATE POLICY tenant_isolation ON master.bank_account_company_usage USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
 GRANT SELECT,INSERT,UPDATE ON master.bank_account_usage,master.bank_account_company_usage TO athyperapp;
END IF; END $$;

-- Callers must authorize the company separately. Availability never implies readiness.
CREATE OR REPLACE FUNCTION master.bank_account_company_ready(p_tenant uuid,p_link uuid,p_company uuid,p_purpose text,p_date date)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT master.bank_account_company_eligible(p_tenant,p_link,p_company,p_date) AND EXISTS(
 SELECT 1 FROM master.bank_account_company_usage u
 JOIN master.bank_account_link l ON l.tenant_id=u.tenant_id AND l.id=u.bank_account_link_id
 JOIN master.bank_account a ON a.tenant_id=l.tenant_id AND a.id=l.bank_account_id
 WHERE u.tenant_id=p_tenant AND u.bank_account_link_id=p_link AND u.company_code_id=p_company AND u.purpose=p_purpose
 AND u.accepted_at IS NOT NULL AND a.is_verified AND a.status='active'
 AND u.effective_from<=p_date AND(u.effective_until IS NULL OR u.effective_until>p_date)
 AND (u.source_account_id IS NULL OR EXISTS(
 SELECT 1 FROM control.mesh_bank_account_projection p
 JOIN snapshot.mesh_bank_account_disclosure_received s ON s.tenant_id=p.tenant_id AND s.id=p.current_snapshot_id
 JOIN control.mesh_business_partner_account_link m ON m.tenant_id=p.tenant_id AND m.id=p.account_link_id AND m.status='active'
 WHERE p.tenant_id=u.tenant_id AND p.source_tenant_id=u.source_tenant_id
 AND m.business_partner_id=l.owner_id AND s.payload_json->'bankAccount'->>'sourceAccountId'=u.source_account_id::text
 AND p.current_disclosure_id=u.accepted_disclosure_id AND p.current_disclosure_version=u.accepted_disclosure_version
 AND p.account_fingerprint=u.accepted_account_fingerprint AND p.projection_status IN('available','linked')
 AND (s.payload_json->>'expiresAt' IS NULL OR (s.payload_json->>'expiresAt')::timestamptz>clock_timestamp()))))
$$;

CREATE OR REPLACE FUNCTION master.guard_bank_usage_primary() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE partner_id uuid;
BEGIN
 IF NEW.is_primary THEN
  SELECT owner_id INTO partner_id FROM master.bank_account_link WHERE tenant_id=NEW.tenant_id AND id=NEW.bank_account_link_id;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||partner_id::text||NEW.company_code_id::text||NEW.purpose,0));
  IF EXISTS(SELECT 1 FROM master.bank_account_company_usage u JOIN master.bank_account_link l ON l.tenant_id=u.tenant_id AND l.id=u.bank_account_link_id
    WHERE u.tenant_id=NEW.tenant_id AND l.owner_id=partner_id AND u.company_code_id=NEW.company_code_id AND u.purpose=NEW.purpose
      AND u.id<>NEW.id AND u.is_primary AND daterange(u.effective_from,u.effective_until,'[)') && daterange(NEW.effective_from,NEW.effective_until,'[)')) THEN
    RAISE EXCEPTION 'Another account is primary for this company, purpose and effective period' USING ERRCODE='23P01';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_bank_usage_primary ON master.bank_account_company_usage;
CREATE TRIGGER guard_bank_usage_primary BEFORE INSERT OR UPDATE ON master.bank_account_company_usage FOR EACH ROW EXECUTE FUNCTION master.guard_bank_usage_primary();

CREATE OR REPLACE FUNCTION master.guard_company_bank_acceptance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.preferred_remittance_bank_link_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.preferred_remittance_bank_link_id IS NOT DISTINCT FROM OLD.preferred_remittance_bank_link_id THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM master.bank_account_company_usage u JOIN master.bank_account_link l ON l.tenant_id=u.tenant_id AND l.id=u.bank_account_link_id
 JOIN master.supplier s ON s.tenant_id=l.tenant_id AND s.business_partner_id=l.owner_id AND s.id=NEW.supplier_id
 WHERE u.tenant_id=NEW.tenant_id AND u.bank_account_link_id=NEW.preferred_remittance_bank_link_id AND u.company_code_id=NEW.company_code_id
 AND master.bank_account_company_ready(u.tenant_id,u.bank_account_link_id,u.company_code_id,u.purpose,CURRENT_DATE)) THEN
  RAISE EXCEPTION 'Preferred remittance requires company acceptance of a current account' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_company_bank_acceptance ON master.company_code_supplier_profile;
CREATE TRIGGER guard_company_bank_acceptance BEFORE INSERT OR UPDATE OF preferred_remittance_bank_link_id ON master.company_code_supplier_profile
 FOR EACH ROW EXECUTE FUNCTION master.guard_company_bank_acceptance();
