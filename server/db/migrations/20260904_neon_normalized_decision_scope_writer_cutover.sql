-- G6 non-destructive writer cutover. Legacy columns and materialization
-- triggers remain available for rollback, but canonical commands write the
-- normalized scope authority directly.
BEGIN;

DO $$
BEGIN
  IF current_database()<>'athyper_neon'
     OR current_setting('app.database_plane',true)<>'neon' THEN
    RAISE EXCEPTION 'Normalized decision-scope cutover requires the NEON plane';
  END IF;
  IF EXISTS(
    SELECT 1 FROM control.business_partner_decision_scope scope
    LEFT JOIN control.business_partner_qualification qualification
      ON qualification.tenant_id=scope.tenant_id AND qualification.id=scope.qualification_id
    LEFT JOIN control.supplier_preference_designation preference
      ON preference.tenant_id=scope.tenant_id AND preference.id=scope.supplier_preference_id
    LEFT JOIN control.customer_account_designation designation
      ON designation.tenant_id=scope.tenant_id AND designation.id=scope.customer_designation_id
    LEFT JOIN control.customer_credit_review review
      ON review.tenant_id=scope.tenant_id AND review.id=scope.credit_review_id
    WHERE qualification.id IS NULL AND preference.id IS NULL
      AND designation.id IS NULL AND review.id IS NULL
  ) THEN
    RAISE EXCEPTION 'G6 preflight: orphan normalized decision scope exists';
  END IF;
END $$;

ALTER TABLE control.supplier_preference_designation
  ALTER COLUMN operating_organization_id DROP NOT NULL;
ALTER TABLE control.customer_account_designation
  ALTER COLUMN operating_organization_id DROP NOT NULL;
ALTER TABLE control.customer_credit_review
  ALTER COLUMN operating_organization_id DROP NOT NULL,
  ALTER COLUMN company_code_id DROP NOT NULL;

\ir ../ddl/planes/neon/control/07_functions.sql
\ir ../ddl/planes/neon/master/07_g5_business_partner_materializer.sql

REVOKE ALL ON FUNCTION control.command_create_business_partner_decision(
  uuid,text,uuid,text,uuid,uuid,uuid,uuid,jsonb,text,uuid
) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
   REVOKE INSERT,UPDATE,DELETE ON control.business_partner_decision_scope FROM athyperapp;
   REVOKE INSERT,UPDATE ON control.business_partner_qualification,control.supplier_preference_designation,
     control.customer_account_designation,control.customer_credit_review FROM athyperapp;
   GRANT EXECUTE ON FUNCTION control.command_create_business_partner_decision(
     uuid,text,uuid,text,uuid,uuid,uuid,uuid,jsonb,text,uuid
   ) TO athyperapp;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
   REVOKE INSERT,UPDATE,DELETE ON control.business_partner_decision_scope FROM athyperadmin;
   REVOKE INSERT,UPDATE ON control.business_partner_qualification,control.supplier_preference_designation,
     control.customer_account_designation,control.customer_credit_review FROM athyperadmin;
   GRANT EXECUTE ON FUNCTION control.command_create_business_partner_decision(
     uuid,text,uuid,text,uuid,uuid,uuid,uuid,jsonb,text,uuid
   ) TO athyperadmin;
 END IF;
END $$;

COMMIT;
