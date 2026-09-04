-- G6 pre-retirement alignment for supported upgrades. This migration is
-- deliberately non-destructive: it makes retained compatibility surfaces and
-- their privilege boundaries identical to canonical clean construction.

DO $$ BEGIN
  IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true)<>'neon' THEN
    RAISE EXCEPTION 'G6 pre-retirement parity alignment requires the NEON plane';
  END IF;
END $$;

COMMENT ON COLUMN control.business_partner_qualification.role_id IS NULL;
COMMENT ON TABLE document.workforce_iam_projection IS
  'COMPATIBILITY; owner=People/IAM; disposition=retain for supported-upgrade parity then replace through governed-case IAM projection after measured zero legacy use. Employee-only saga intent; never Person, employee, or principal authority.';

DROP TRIGGER trg_business_partner_qualification_20_scope ON control.business_partner_qualification;
CREATE TRIGGER trg_business_partner_qualification_20_scope
BEFORE INSERT OR UPDATE OF tenant_id, business_partner_id, partner_role, role_id,
    operating_organization_id, company_code_id, commodity_capability_id,
    risk_assessment_id
ON control.business_partner_qualification
FOR EACH ROW
EXECUTE FUNCTION control.trg_validate_business_partner_control_scope();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='document' AND c.relname='workforce_iam_projection'
      AND t.tgname='trg_zz_audit_row_change' AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER trg_zz_audit_row_change
    AFTER INSERT OR UPDATE OR DELETE ON document.workforce_iam_projection
    FOR EACH ROW EXECUTE FUNCTION audit.trg_capture_row_change();
  END IF;
END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION master.trg_enforce_business_partner_governance_totals() FROM PUBLIC;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    REVOKE ALL ON control.business_partner_decision_scope,control.customer_credit_review,
      document.workforce_iam_projection FROM athyperadmin;
    GRANT SELECT ON control.business_partner_decision_scope,control.customer_credit_review TO athyperadmin;
    GRANT ALL ON document.workforce_iam_projection TO athyperadmin;
    GRANT EXECUTE ON FUNCTION master.trg_enforce_business_partner_governance_totals() TO athyperadmin;
  END IF;
END $$;

\ir 20260903_neon_internal_workforce_iam_projection_command.sql
\ir 20260903_neon_governed_internal_business_partner_materializer.sql
