-- WP13: independent supplier/customer role extension materialization.
BEGIN;

DO $$
BEGIN
  IF current_database() <> 'athyper_neon' THEN
    RAISE EXCEPTION 'Business Partner role extensions must target athyper_neon';
  END IF;
END $$;

ALTER TABLE document.business_partner_request
  ADD COLUMN materialized_customer_id uuid;

ALTER TABLE document.business_partner_request
  ADD CONSTRAINT business_partner_request_materialized_customer_fk
    FOREIGN KEY (tenant_id, materialized_customer_id)
    REFERENCES master.customer (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.business_partner_request
  DROP CONSTRAINT business_partner_request_materialization_evidence_chk,
  ADD CONSTRAINT business_partner_request_materialization_evidence_chk CHECK (
    (status = 'applied') = (
      materialized_business_partner_id IS NOT NULL
      AND num_nonnulls(materialized_supplier_id, materialized_customer_id) = 1
      AND materialized_operating_organization_assignment_id IS NOT NULL
      AND materialization_snapshot_id IS NOT NULL
      AND application_idempotency_key IS NOT NULL
      AND application_fingerprint IS NOT NULL
      AND applied_at IS NOT NULL AND applied_by IS NOT NULL
    )
  );

CREATE UNIQUE INDEX business_partner_request_open_role_extension_uq
  ON document.business_partner_request (tenant_id, target_business_partner_id, requested_role)
  WHERE request_kind IN ('add_supplier', 'add_customer')
    AND status IN ('draft', 'validating', 'validation_failed', 'pending_approval', 'returned', 'approved', 'applying', 'failed');

CREATE OR REPLACE FUNCTION document.trg_guard_business_partner_request_materialization()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND (
    NEW.materialized_supplier_id IS NOT NULL
    OR NEW.materialized_customer_id IS NOT NULL
    OR NEW.materialized_operating_organization_assignment_id IS NOT NULL
    OR NEW.materialization_snapshot_id IS NOT NULL
    OR NEW.application_idempotency_key IS NOT NULL
    OR NEW.application_fingerprint IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'New Business Partner requests cannot contain materialization evidence'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.applied_at IS NOT NULL AND (
    NEW.materialized_supplier_id IS DISTINCT FROM OLD.materialized_supplier_id
    OR NEW.materialized_customer_id IS DISTINCT FROM OLD.materialized_customer_id
    OR NEW.materialized_operating_organization_assignment_id IS DISTINCT FROM OLD.materialized_operating_organization_assignment_id
    OR NEW.materialization_snapshot_id IS DISTINCT FROM OLD.materialization_snapshot_id
    OR NEW.application_idempotency_key IS DISTINCT FROM OLD.application_idempotency_key
    OR NEW.application_fingerprint IS DISTINCT FROM OLD.application_fingerprint
  ) THEN
    RAISE EXCEPTION 'Business Partner request materialization evidence is immutable once recorded'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'applied' AND (
    num_nonnulls(NEW.materialized_supplier_id, NEW.materialized_customer_id) <> 1
    OR NEW.materialized_operating_organization_assignment_id IS NULL
    OR NEW.materialization_snapshot_id IS NULL
    OR NEW.application_idempotency_key IS NULL
    OR NEW.application_fingerprint IS NULL
  ) THEN
    RAISE EXCEPTION 'Applied Business Partner request requires one role and complete materialization coordinates'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON COLUMN document.business_partner_request.materialized_customer_id IS
  'Customer role created by this independently approved request; mutually exclusive with materialized_supplier_id.';
COMMENT ON INDEX document.business_partner_request_open_role_extension_uq IS
  'Prevents parallel open requests from independently approving the same role on one Business Partner.';

COMMIT;
