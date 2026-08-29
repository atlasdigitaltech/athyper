DO $guard$
BEGIN
  IF current_database() <> 'athyper_neon' THEN
    RAISE EXCEPTION 'Business Partner qualification readiness migration requires athyper_neon';
  END IF;
  IF current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'Business Partner qualification readiness migration requires app.database_plane=neon';
  END IF;
END
$guard$;

ALTER TABLE control.business_partner_qualification
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS decision_idempotency_key text,
  ADD COLUMN IF NOT EXISTS decision_fingerprint text,
  ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;

UPDATE control.business_partner_qualification
   SET idempotency_key = 'legacy:' || id::text
 WHERE idempotency_key IS NULL;

-- Preserve pre-migration terminal decisions as immutable legacy evidence.  The
-- two md5 values form the same 64-lowercase-hex shape required of new SHA-256
-- fingerprints without adding an extension dependency to the migration.
UPDATE control.business_partner_qualification
   SET decision_idempotency_key = COALESCE(decision_idempotency_key, 'legacy-decision:' || id::text),
       decision_fingerprint = COALESCE(
         decision_fingerprint,
         md5('business-partner-qualification:' || id::text) || md5('legacy-decision:' || id::text)
       )
 WHERE decision <> 'pending'
   AND (decision_idempotency_key IS NULL OR decision_fingerprint IS NULL);

ALTER TABLE control.business_partner_qualification
  ALTER COLUMN idempotency_key SET NOT NULL;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='control.business_partner_qualification'::regclass AND conname='business_partner_qualification_idempotency_chk') THEN
    ALTER TABLE control.business_partner_qualification ADD CONSTRAINT business_partner_qualification_idempotency_chk CHECK (btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='control.business_partner_qualification'::regclass AND conname='business_partner_qualification_decision_key_chk') THEN
    ALTER TABLE control.business_partner_qualification ADD CONSTRAINT business_partner_qualification_decision_key_chk CHECK (decision_idempotency_key IS NULL OR (btrim(decision_idempotency_key)=decision_idempotency_key AND length(decision_idempotency_key) BETWEEN 8 AND 200));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='control.business_partner_qualification'::regclass AND conname='business_partner_qualification_fingerprint_chk') THEN
    ALTER TABLE control.business_partner_qualification ADD CONSTRAINT business_partner_qualification_fingerprint_chk CHECK (decision_fingerprint IS NULL OR decision_fingerprint ~ '^[a-f0-9]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='control.business_partner_qualification'::regclass AND conname='business_partner_qualification_decision_evidence_chk') THEN
    ALTER TABLE control.business_partner_qualification ADD CONSTRAINT business_partner_qualification_decision_evidence_chk CHECK ((decision='pending')=(decision_idempotency_key IS NULL AND decision_fingerprint IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='control.business_partner_qualification'::regclass AND conname='business_partner_qualification_row_version_chk') THEN
    ALTER TABLE control.business_partner_qualification ADD CONSTRAINT business_partner_qualification_row_version_chk CHECK (row_version>=1);
  END IF;
END
$constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS business_partner_qualification_idempotency_uq
  ON control.business_partner_qualification(tenant_id,idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS business_partner_qualification_decision_idempotency_uq
  ON control.business_partner_qualification(tenant_id,decision_idempotency_key)
  WHERE decision_idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS business_partner_qualification_readiness_idx
  ON control.business_partner_qualification(tenant_id,business_partner_id,partner_role,operating_organization_id,company_code_id,qualification_type_code,decision,effective_from,effective_until);

CREATE OR REPLACE FUNCTION control.trg_guard_business_partner_qualification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.business_partner_id IS DISTINCT FROM OLD.business_partner_id OR NEW.partner_role IS DISTINCT FROM OLD.partner_role OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN
    RAISE EXCEPTION 'Qualification identity and creation evidence are immutable' USING ERRCODE='check_violation';
  END IF;
  IF TG_OP='UPDATE' AND OLD.decision<>'pending' AND (NEW.decision IS DISTINCT FROM OLD.decision OR NEW.decision_idempotency_key IS DISTINCT FROM OLD.decision_idempotency_key OR NEW.decision_fingerprint IS DISTINCT FROM OLD.decision_fingerprint OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.approved_by IS DISTINCT FROM OLD.approved_by) THEN
    RAISE EXCEPTION 'Qualification decision evidence is immutable' USING ERRCODE='check_violation';
  END IF;
  IF TG_OP='UPDATE' AND NEW.row_version<>OLD.row_version+1 THEN
    RAISE EXCEPTION 'Qualification row version must advance exactly once' USING ERRCODE='check_violation';
  END IF;
  IF NEW.decision='pending' AND (NEW.reviewed_at IS NOT NULL OR NEW.approved_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Pending qualification cannot contain decision evidence' USING ERRCODE='check_violation';
  END IF;
  IF NEW.decision IN ('approved','conditional') AND NEW.reviewed_at IS NULL THEN
    RAISE EXCEPTION 'Approved qualification requires review evidence' USING ERRCODE='check_violation';
  END IF;
  IF NEW.decision IN ('rejected','suspended') AND NEW.reviewed_at IS NULL THEN
    RAISE EXCEPTION '% qualification requires review evidence',NEW.decision USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION control.trg_guard_business_partner_qualification() FROM PUBLIC;

DO $assertions$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='control' AND table_name='business_partner_qualification' AND column_name='row_version' AND is_nullable='NO') THEN
    RAISE EXCEPTION 'Qualification row-version contract is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='control' AND indexname='business_partner_qualification_readiness_idx') THEN
    RAISE EXCEPTION 'Qualification readiness index is missing';
  END IF;
END
$assertions$;
