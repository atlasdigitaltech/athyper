\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
  IF current_database() <> 'athyper_neon' OR current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'Customer authority convergence migration requires the NEON plane';
  END IF;
END $$;

-- A tenant-wide legacy flag can only be converted safely when a governed sales
-- organization scope and an independent migration reviewer both exist.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM master.customer customer
     WHERE customer.is_key_account
       AND NOT EXISTS (
         SELECT 1 FROM master.business_partner_operating_organization_assignment assignment
          WHERE assignment.tenant_id=customer.tenant_id
            AND assignment.business_partner_id=customer.business_partner_id
            AND assignment.partner_role='customer' AND assignment.status='active'))
  THEN RAISE EXCEPTION 'S3 preflight: key-account customer has no active Customer organization assignment';
  END IF;
  IF EXISTS (
    SELECT 1 FROM master.customer customer
     WHERE customer.is_key_account
       AND NOT EXISTS (
         SELECT 1 FROM master.principal reviewer
          WHERE reviewer.tenant_id=customer.tenant_id AND reviewer.id<>customer.created_by))
  THEN RAISE EXCEPTION 'S3 preflight: key-account migration requires an independent tenant principal';
  END IF;
  IF EXISTS (
    SELECT 1 FROM master.company_code_customer_profile profile
     JOIN master.customer customer ON customer.tenant_id=profile.tenant_id AND customer.id=profile.customer_id
     WHERE profile.credit_limit IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM master.business_partner_operating_organization_assignment assignment
           JOIN master.operating_organization_company_assignment company_scope
             ON company_scope.tenant_id=assignment.tenant_id
            AND company_scope.operating_organization_id=assignment.operating_organization_id
            AND company_scope.company_code_id=profile.company_code_id
            AND company_scope.status='active'
          WHERE assignment.tenant_id=customer.tenant_id
            AND assignment.business_partner_id=customer.business_partner_id
            AND assignment.partner_role='customer' AND assignment.status='active'))
  THEN RAISE EXCEPTION 'S3 preflight: legacy company credit limit has no active Customer organization/company scope';
  END IF;
END $$;

INSERT INTO control.customer_account_designation(
  tenant_id,business_partner_id,customer_id,operating_organization_id,
  designation_type,effective_from,effective_until,rationale,status,
  idempotency_key,decision_reason,reviewed_at,reviewed_by,approved_at,approved_by,
  decision_idempotency_key,decision_fingerprint,metadata,created_at,created_by)
SELECT customer.tenant_id,customer.business_partner_id,customer.id,assignment.operating_organization_id,
       'key_account',GREATEST(assignment.effective_from,customer.created_at::date),assignment.effective_until,
       'Migrated from the retired tenant-wide Customer key-account flag','approved',
       's3-key-account-'||customer.id::text||'-'||assignment.id::text,
       'MIGRATED_FROM_CUSTOMER_IS_KEY_ACCOUNT',customer.created_at,reviewer.id,customer.created_at,reviewer.id,
       's3-key-account-decision-'||customer.id::text||'-'||assignment.id::text,
       encode(public.digest(convert_to('s3:key-account:'||customer.id::text||':'||assignment.id::text,'UTF8'),'sha256'),'hex'),
       jsonb_build_object('authorityMigration','master.customer.is_key_account','legacyValue',true),
       customer.created_at,customer.created_by
  FROM master.customer customer
  JOIN master.business_partner_operating_organization_assignment assignment
    ON assignment.tenant_id=customer.tenant_id
   AND assignment.business_partner_id=customer.business_partner_id
   AND assignment.partner_role='customer' AND assignment.status='active'
  CROSS JOIN LATERAL (
    SELECT principal.id FROM master.principal principal
     WHERE principal.tenant_id=customer.tenant_id AND principal.id<>customer.created_by
     ORDER BY principal.id LIMIT 1) reviewer
 WHERE customer.is_key_account
ON CONFLICT (tenant_id,idempotency_key) DO NOTHING;

-- Preserve the two legacy read contracts for one release, but sever their
-- dependency on the retired role column and resolve the compatibility boolean
-- from governed designations.
DO $$
DECLARE v_name text; v_definition text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['v_business_partner_app_index','v_business_partner_role_summary'] LOOP
    v_definition:=pg_get_viewdef(format('master.%I',v_name)::regclass,true);
    v_definition:=replace(v_definition,'COALESCE(c.is_key_account, false)',
      '(EXISTS (SELECT 1 FROM control.customer_account_designation designation WHERE designation.tenant_id=c.tenant_id AND designation.customer_id=c.id AND designation.designation_type=''key_account'' AND designation.status=''approved'' AND designation.effective_from<=CURRENT_DATE AND(designation.effective_until IS NULL OR designation.effective_until>CURRENT_DATE)))');
    v_definition:=replace(v_definition,', c.is_key_account', '');
    IF position('c.is_key_account' in v_definition)>0 THEN
      RAISE EXCEPTION 'S3 could not detach %.% from customer.is_key_account', 'master',v_name;
    END IF;
    EXECUTE format('CREATE OR REPLACE VIEW master.%I WITH(security_invoker=true,security_barrier=true) AS %s',v_name,v_definition);
  END LOOP;
END $$;

DROP INDEX IF EXISTS master.customer_key_account_idx;
ALTER TABLE master.customer DROP COLUMN is_key_account;
COMMENT ON COLUMN master.customer.metadata IS
  'Non-authoritative integration metadata only. Designations, credit limits, credit rating, qualification, block state, payment behavior, and ledger analytics are prohibited.';

ALTER TABLE control.customer_credit_review RENAME COLUMN currency_code TO requested_currency_code;
ALTER TABLE control.customer_credit_review
  ADD COLUMN approved_credit_limit numeric(20,4),
  ADD COLUMN approved_currency_code character(3),
  ADD COLUMN authority_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ALTER COLUMN effective_from SET DEFAULT CURRENT_DATE;

UPDATE control.customer_credit_review review
   SET effective_from=COALESCE(review.effective_from,review.approved_at::date,review.created_at::date),
       approved_credit_limit=CASE WHEN review.decision IN('approved','conditional') THEN review.requested_credit_limit END,
       approved_currency_code=CASE WHEN review.decision IN('approved','conditional') THEN review.requested_currency_code END,
       authority_evidence=jsonb_build_object('authorityMigration','control.customer_credit_review.requested_credit_limit')
                         || COALESCE((
                              SELECT jsonb_build_object(
                                'legacyCompanyProfileId',profile.id,
                                'legacyCompanyProfileLimit',profile.credit_limit,
                                'legacyCompanyProfileCurrency',profile.credit_limit_currency_code)
                                FROM master.company_code_customer_profile profile
                               WHERE profile.tenant_id=review.tenant_id
                                 AND profile.customer_id=review.customer_id
                                 AND profile.company_code_id=review.company_code_id
                                 AND profile.credit_limit IS NOT NULL
                               LIMIT 1),'{}'::jsonb)
 WHERE review.decision IN('approved','conditional');

-- Preserve profiles that had a limit but no governed outcome as explicit,
-- scoped legacy reviews. From this point onward the review row is authoritative.
INSERT INTO control.customer_credit_review(
  tenant_id,business_partner_id,customer_id,operating_organization_id,company_code_id,
  review_type_code,requested_credit_limit,requested_currency_code,
  approved_credit_limit,approved_currency_code,risk_class_code,decision,decision_reason,
  conditions,authority_evidence,effective_from,effective_until,idempotency_key,
  decision_idempotency_key,decision_fingerprint,reviewed_at,reviewed_by,
  approved_at,approved_by,created_at,created_by)
SELECT profile.tenant_id,customer.business_partner_id,customer.id,assignment.operating_organization_id,
       profile.company_code_id,'legacy_limit_migration',profile.credit_limit,
       profile.credit_limit_currency_code,profile.credit_limit,profile.credit_limit_currency_code,
       NULL,'approved','MIGRATED_FROM_COMPANY_CODE_CUSTOMER_PROFILE','[]'::jsonb,
       jsonb_build_object('authorityMigration','master.company_code_customer_profile.credit_limit',
                          'legacyCompanyProfileId',profile.id),
       GREATEST(profile.created_at::date,assignment.effective_from,company_scope.effective_from),
       LEAST(assignment.effective_until,company_scope.effective_until),
       's3-credit-limit-'||profile.id::text||'-'||assignment.operating_organization_id::text,
       's3-credit-decision-'||profile.id::text||'-'||assignment.operating_organization_id::text,
       encode(public.digest(convert_to('s3:credit:'||profile.id::text||':'||assignment.operating_organization_id::text,'UTF8'),'sha256'),'hex'),
       COALESCE(profile.updated_at,profile.created_at),COALESCE(profile.updated_by,profile.created_by),
       COALESCE(profile.updated_at,profile.created_at),COALESCE(profile.updated_by,profile.created_by),
       profile.created_at,profile.created_by
  FROM master.company_code_customer_profile profile
  JOIN master.customer customer ON customer.tenant_id=profile.tenant_id AND customer.id=profile.customer_id
  JOIN master.business_partner_operating_organization_assignment assignment
    ON assignment.tenant_id=customer.tenant_id AND assignment.business_partner_id=customer.business_partner_id
   AND assignment.partner_role='customer' AND assignment.status='active'
  JOIN master.operating_organization_company_assignment company_scope
    ON company_scope.tenant_id=assignment.tenant_id
   AND company_scope.operating_organization_id=assignment.operating_organization_id
   AND company_scope.company_code_id=profile.company_code_id AND company_scope.status='active'
 WHERE profile.credit_limit IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM control.customer_credit_review existing
      WHERE existing.tenant_id=profile.tenant_id AND existing.customer_id=profile.customer_id
        AND existing.operating_organization_id=assignment.operating_organization_id
        AND existing.company_code_id=profile.company_code_id
        AND existing.decision IN('approved','conditional'))
ON CONFLICT (tenant_id,idempotency_key) DO NOTHING;

ALTER TABLE control.customer_credit_review ALTER COLUMN effective_from SET NOT NULL;
ALTER TABLE control.customer_credit_review
  DROP CONSTRAINT customer_credit_review_limit_chk,
  DROP CONSTRAINT customer_credit_review_currency_chk,
  DROP CONSTRAINT customer_credit_review_range_chk,
  ADD CONSTRAINT customer_credit_review_requested_limit_chk CHECK(requested_credit_limit IS NULL OR requested_credit_limit>=0),
  ADD CONSTRAINT customer_credit_review_requested_currency_chk CHECK((requested_credit_limit IS NULL)=(requested_currency_code IS NULL)),
  ADD CONSTRAINT customer_credit_review_approved_limit_chk CHECK(approved_credit_limit IS NULL OR approved_credit_limit>=0),
  ADD CONSTRAINT customer_credit_review_approved_currency_chk CHECK((approved_credit_limit IS NULL)=(approved_currency_code IS NULL)),
  ADD CONSTRAINT customer_credit_review_outcome_limit_chk CHECK(decision IN('approved','conditional') OR approved_credit_limit IS NULL),
  ADD CONSTRAINT customer_credit_review_authority_evidence_chk CHECK(jsonb_typeof(authority_evidence)='object'),
  ADD CONSTRAINT customer_credit_review_range_chk CHECK(effective_until IS NULL OR effective_until>effective_from),
  ADD CONSTRAINT customer_credit_review_requested_currency_fk FOREIGN KEY(requested_currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
  ADD CONSTRAINT customer_credit_review_approved_currency_fk FOREIGN KEY(approved_currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT;

ALTER TABLE master.company_code_customer_profile
  DROP CONSTRAINT company_code_customer_profile_credit_chk,
  DROP CONSTRAINT company_code_customer_profile_credit_currency_fk,
  DROP COLUMN credit_limit,
  DROP COLUMN credit_limit_currency_code;

CREATE INDEX customer_credit_review_effective_resolution_idx
  ON control.customer_credit_review(tenant_id,customer_id,operating_organization_id,company_code_id,effective_from,effective_until,approved_at DESC)
  WHERE decision IN('approved','conditional');

CREATE OR REPLACE FUNCTION control.trg_validate_customer_credit_review_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_effective_from date := COALESCE(NEW.effective_from, CURRENT_DATE);
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM master.customer customer
         WHERE customer.tenant_id = NEW.tenant_id
           AND customer.id = NEW.customer_id
           AND customer.business_partner_id = NEW.business_partner_id
           AND customer.status <> 'archived'
    ) THEN
        RAISE EXCEPTION 'Customer does not belong to the selected business partner'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM master.business_partner_operating_organization_assignment assignment
          JOIN master.operating_organization_company_assignment company_scope
            ON company_scope.tenant_id = assignment.tenant_id
           AND company_scope.operating_organization_id = assignment.operating_organization_id
           AND company_scope.company_code_id = NEW.company_code_id
           AND company_scope.status = 'active'
           AND company_scope.effective_from <= v_effective_from
           AND (company_scope.effective_until IS NULL OR company_scope.effective_until > v_effective_from)
         WHERE assignment.tenant_id = NEW.tenant_id
           AND assignment.business_partner_id = NEW.business_partner_id
           AND assignment.operating_organization_id = NEW.operating_organization_id
           AND assignment.partner_role = 'customer'
           AND assignment.status = 'active'
           AND assignment.effective_from <= v_effective_from
           AND (assignment.effective_until IS NULL OR assignment.effective_until > v_effective_from)
    ) THEN
        RAISE EXCEPTION 'Customer credit review is outside an active sales organization/company scope'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_customer_credit_review()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.business_partner_id IS DISTINCT FROM OLD.business_partner_id
        OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
        OR NEW.operating_organization_id IS DISTINCT FROM OLD.operating_organization_id
        OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
        OR NEW.review_type_code IS DISTINCT FROM OLD.review_type_code
        OR NEW.requested_credit_limit IS DISTINCT FROM OLD.requested_credit_limit
        OR NEW.requested_currency_code IS DISTINCT FROM OLD.requested_currency_code
        OR NEW.risk_class_code IS DISTINCT FROM OLD.risk_class_code
        OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
        OR NEW.effective_until IS DISTINCT FROM OLD.effective_until
        OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
        OR NEW.authority_evidence IS DISTINCT FROM OLD.authority_evidence
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Customer credit request scope, requested terms, and provenance are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.row_version <> OLD.row_version + 1 THEN
        RAISE EXCEPTION 'Customer credit review row version must advance exactly once'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.decision <> 'pending' THEN
        RAISE EXCEPTION 'Decided customer credit review is immutable; create a superseding review'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.decision IN ('approved','conditional') THEN
        IF NEW.effective_from IS NULL THEN
            RAISE EXCEPTION 'Approved customer credit outcome requires effective_from'
                USING ERRCODE = 'check_violation';
        END IF;
        IF EXISTS (
            SELECT 1
              FROM control.customer_credit_review existing
             WHERE existing.tenant_id = NEW.tenant_id
               AND existing.id <> NEW.id
               AND existing.customer_id = NEW.customer_id
               AND existing.operating_organization_id = NEW.operating_organization_id
               AND existing.company_code_id = NEW.company_code_id
               AND existing.decision IN ('approved','conditional')
               AND daterange(existing.effective_from, existing.effective_until, '[)')
                   && daterange(NEW.effective_from, NEW.effective_until, '[)')
        ) THEN
            RAISE EXCEPTION 'Overlapping approved customer credit outcome exists for this scope'
                USING ERRCODE = 'exclusion_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_customer_credit_review_10_scope BEFORE INSERT OR UPDATE OF tenant_id,business_partner_id,customer_id,operating_organization_id,company_code_id,effective_from,effective_until ON control.customer_credit_review FOR EACH ROW EXECUTE FUNCTION control.trg_validate_customer_credit_review_scope();
CREATE TRIGGER trg_customer_credit_review_20_guard BEFORE INSERT OR UPDATE ON control.customer_credit_review FOR EACH ROW EXECUTE FUNCTION control.trg_guard_customer_credit_review();
CREATE TRIGGER trg_customer_credit_review_30_updated BEFORE UPDATE ON control.customer_credit_review FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

ALTER TABLE control.customer_credit_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.customer_credit_review FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS migration_owner_access ON control.customer_credit_review;
DROP POLICY IF EXISTS tenant_access ON control.customer_credit_review;
DROP POLICY IF EXISTS seed_write ON control.customer_credit_review;
CREATE POLICY tenant_access ON control.customer_credit_review
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON control.customer_credit_review
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE VIEW control.current_customer_account_designation WITH(security_invoker=true,security_barrier=true) AS SELECT id designation_id,tenant_id,business_partner_id,customer_id,operating_organization_id,company_code_id,designation_type,priority_tier,effective_from,effective_until,rationale,approved_at,approved_by,row_version FROM control.customer_account_designation WHERE status='approved' AND effective_from<=CURRENT_DATE AND(effective_until IS NULL OR effective_until>CURRENT_DATE);
CREATE VIEW control.current_customer_credit_limit WITH(security_invoker=true,security_barrier=true) AS SELECT id credit_review_id,tenant_id,business_partner_id,customer_id,operating_organization_id,company_code_id,approved_credit_limit,approved_currency_code,decision,effective_from,effective_until,approved_at,approved_by,row_version FROM control.customer_credit_review WHERE decision IN('approved','conditional') AND approved_credit_limit IS NOT NULL AND effective_from<=CURRENT_DATE AND(effective_until IS NULL OR effective_until>CURRENT_DATE);
COMMENT ON VIEW control.current_customer_account_designation IS 'Read-only current governed Customer designations; replaces master.customer.is_key_account.';
COMMENT ON VIEW control.current_customer_credit_limit IS 'Read-only current credit-limit resolver. Every returned amount is the effective outcome of one approved or conditional credit review.';
COMMENT ON TABLE control.customer_credit_review IS 'Sole company-scoped authority for requested and approved customer credit limits. Registration approval cannot decide it, and customer/company master records cannot store a limit.';

REVOKE ALL ON control.current_customer_account_designation,control.current_customer_credit_limit FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT ON control.current_customer_account_designation,control.current_customer_credit_limit TO athyperapp; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT SELECT ON control.current_customer_account_designation,control.current_customer_credit_limit TO athyperadmin; END IF;
END $$;

COMMIT;
