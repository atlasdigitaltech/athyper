-- Persist replay-safe Phase 1B Business Partner materialization evidence.
BEGIN;

DO $$
BEGIN
  IF current_database() <> 'athyper_neon' THEN
    RAISE EXCEPTION 'Business Partner request materializer must target athyper_neon';
  END IF;
END $$;

ALTER TABLE document.business_partner_request
  ADD COLUMN materialized_supplier_id uuid,
  ADD COLUMN materialized_operating_organization_assignment_id uuid,
  ADD COLUMN materialization_snapshot_id uuid,
  ADD COLUMN application_idempotency_key text,
  ADD COLUMN application_fingerprint text;

ALTER TABLE document.business_partner_request
  ADD CONSTRAINT business_partner_request_materialized_supplier_fk
    FOREIGN KEY (tenant_id, materialized_supplier_id)
    REFERENCES master.supplier (tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT business_partner_request_materialized_assignment_fk
    FOREIGN KEY (tenant_id, materialized_operating_organization_assignment_id)
    REFERENCES master.business_partner_operating_organization_assignment (tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT business_partner_request_materialization_snapshot_fk
    FOREIGN KEY (tenant_id, materialization_snapshot_id)
    REFERENCES snapshot.entity_snapshot_identity (tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT business_partner_request_application_key_chk CHECK (
    application_idempotency_key IS NULL OR (
      btrim(application_idempotency_key) = application_idempotency_key
      AND length(application_idempotency_key) BETWEEN 8 AND 200
    )
  ),
  ADD CONSTRAINT business_partner_request_application_fingerprint_chk CHECK (
    application_fingerprint IS NULL OR application_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  ADD CONSTRAINT business_partner_request_materialization_evidence_chk CHECK (
    (status = 'applied') = (
      materialized_business_partner_id IS NOT NULL
      AND materialized_supplier_id IS NOT NULL
      AND materialized_operating_organization_assignment_id IS NOT NULL
      AND materialization_snapshot_id IS NOT NULL
      AND application_idempotency_key IS NOT NULL
      AND application_fingerprint IS NOT NULL
      AND applied_at IS NOT NULL AND applied_by IS NOT NULL
    )
  );

CREATE UNIQUE INDEX business_partner_request_application_key_uq
  ON document.business_partner_request (tenant_id, application_idempotency_key)
  WHERE application_idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION document.trg_guard_business_partner_request_materialization()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND (
    NEW.materialized_supplier_id IS NOT NULL
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
    OR NEW.materialized_operating_organization_assignment_id IS DISTINCT FROM OLD.materialized_operating_organization_assignment_id
    OR NEW.materialization_snapshot_id IS DISTINCT FROM OLD.materialization_snapshot_id
    OR NEW.application_idempotency_key IS DISTINCT FROM OLD.application_idempotency_key
    OR NEW.application_fingerprint IS DISTINCT FROM OLD.application_fingerprint
  ) THEN
    RAISE EXCEPTION 'Business Partner request materialization evidence is immutable once recorded'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'applied' AND (
    NEW.materialized_supplier_id IS NULL
    OR NEW.materialized_operating_organization_assignment_id IS NULL
    OR NEW.materialization_snapshot_id IS NULL
    OR NEW.application_idempotency_key IS NULL
    OR NEW.application_fingerprint IS NULL
  ) THEN
    RAISE EXCEPTION 'Applied Business Partner request requires complete materialization coordinates'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_business_partner_request_15_materialization
BEFORE INSERT OR UPDATE ON document.business_partner_request
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_business_partner_request_materialization();

REVOKE ALL ON FUNCTION document.trg_guard_business_partner_request_materialization() FROM PUBLIC;

COMMIT;
